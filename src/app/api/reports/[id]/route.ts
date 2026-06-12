import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { deleteReport, getReportById } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reportIdParamSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(Number.isSafeInteger);

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requireApiAuth(_request);
  if (!auth.ok) {
    return auth.response;
  }

  const params = await context.params;
  const parsedId = reportIdParamSchema.safeParse(params.id);

  if (!parsedId.success) {
    return apiError(
      {
        code: "INVALID_REPORT_ID",
        message: "报告 id 必须是正整数。",
        details: zodErrorDetails(parsedId.error),
      },
      { status: 400 },
    );
  }

  try {
    const report = getReportById(parsedId.data);

    if (!report) {
      return apiError(
        {
          code: "REPORT_NOT_FOUND",
          message: `未找到 id 为 ${parsedId.data} 的评估报告。`,
        },
        { status: 404 },
      );
    }

    return apiSuccess({ report });
  } catch {
    return apiError(
      {
        code: "REPORT_READ_FAILED",
        message: "评估报告读取失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const params = await context.params;
  const parsedId = reportIdParamSchema.safeParse(params.id);

  if (!parsedId.success) {
    return apiError(
      {
        code: "INVALID_REPORT_ID",
        message: "报告 id 必须是正整数。",
        details: zodErrorDetails(parsedId.error),
      },
      { status: 400 },
    );
  }

  try {
    const result = deleteReport(parsedId.data);

    if (!result) {
      return apiError(
        {
          code: "REPORT_NOT_FOUND",
          message: `未找到 id 为 ${parsedId.data} 的评估报告。`,
        },
        { status: 404 },
      );
    }

    return apiSuccess({
      deleted: true,
      detachedReferences: result.detachedReferences,
      report: result.report,
    });
  } catch {
    return apiError(
      {
        code: "REPORT_DELETE_FAILED",
        message: "评估报告删除失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
