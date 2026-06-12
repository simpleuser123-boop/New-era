import type { NextRequest } from "next/server";
import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import {
  applicationCreateInputSchema,
  applicationPrioritySchema,
  applicationStatusSchema,
} from "@/lib/schemas";
import {
  createApplication,
  getApplicationByReportId,
  listApplications,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_APPLICATION_LIMIT = 20;
const MAX_APPLICATION_LIMIT = 100;

const optionalApplicationsTextQuerySchema = (maxLength: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0
        ? undefined
        : value,
    z.string().trim().min(1).max(maxLength).optional(),
  );
const optionalApplicationPriorityQuerySchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0
      ? undefined
      : value,
  applicationPrioritySchema.optional(),
);
const optionalApplicationStatusQuerySchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0
      ? undefined
      : value,
  applicationStatusSchema.optional(),
);

const applicationsQuerySchema = z.strictObject({
  channel: optionalApplicationsTextQuerySchema(120),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_APPLICATION_LIMIT)
    .default(DEFAULT_APPLICATION_LIMIT),
  priority: optionalApplicationPriorityQuerySchema,
  q: optionalApplicationsTextQuerySchema(240),
  status: optionalApplicationStatusQuerySchema,
});

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export function GET(request: NextRequest) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const query = applicationsQuerySchema.safeParse({
    channel: request.nextUrl.searchParams.get("channel") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    priority: request.nextUrl.searchParams.get("priority") ?? undefined,
    q: request.nextUrl.searchParams.get("q") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined,
  });

  if (!query.success) {
    return apiError(
      {
        code: "INVALID_APPLICATIONS_QUERY",
        message: `查询参数不正确：limit 必须是 1 到 ${MAX_APPLICATION_LIMIT} 之间的整数，状态、优先级或渠道筛选需使用有效值。`,
        details: zodErrorDetails(query.error),
      },
      { status: 400 },
    );
  }

  try {
    const applications = listApplications(query.data);

    return apiSuccess({
      applications,
      count: applications.length,
      limit: query.data.limit,
    });
  } catch {
    return apiError(
      {
        code: "APPLICATIONS_LIST_FAILED",
        message: "投递记录读取失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return apiError(
      {
        code: "INVALID_JSON",
        message: "请求体必须是合法 JSON。",
      },
      { status: 400 },
    );
  }

  const input = applicationCreateInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_APPLICATION_CREATE_INPUT",
        message: "投递记录参数不正确，请检查公司、岗位和可选字段。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    if (input.data.reportId !== undefined) {
      const existingApplication = getApplicationByReportId(input.data.reportId);

      if (existingApplication) {
        return apiError(
          {
            code: "APPLICATION_ALREADY_EXISTS",
            message: "该报告已在投递清单中。",
            details: {
              applicationId: existingApplication.id,
              reportId: input.data.reportId,
            },
          },
          { status: 409 },
        );
      }
    }

    const application = createApplication(input.data);

    return apiSuccess(
      {
        applicationId: application.id,
        application,
      },
      { status: 201 },
    );
  } catch {
    return apiError(
      {
        code: "APPLICATION_CREATE_FAILED",
        message: "投递记录创建失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
