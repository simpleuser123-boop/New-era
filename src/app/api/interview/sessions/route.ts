import type { NextRequest } from "next/server";
import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { interviewSessionCreateInputSchema } from "@/lib/schemas";
import {
  createInterviewSession,
  getReportById,
  getResumeById,
  listInterviewSessions,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SESSION_LIMIT = 20;
const MAX_SESSION_LIMIT = 100;

const sessionsQuerySchema = z.strictObject({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_SESSION_LIMIT)
    .default(DEFAULT_SESSION_LIMIT),
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

  const query = sessionsQuerySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });

  if (!query.success) {
    return apiError(
      {
        code: "INVALID_INTERVIEW_SESSIONS_QUERY",
        message: `limit 必须是 1 到 ${MAX_SESSION_LIMIT} 之间的整数。`,
        details: zodErrorDetails(query.error),
      },
      { status: 400 },
    );
  }

  try {
    const sessions = listInterviewSessions(query.data.limit);

    return apiSuccess({
      count: sessions.length,
      limit: query.data.limit,
      sessions,
    });
  } catch {
    return apiError(
      {
        code: "INTERVIEW_SESSIONS_LIST_FAILED",
        message: "面试准备会话读取失败，请稍后重试。",
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

  const input = interviewSessionCreateInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_INTERVIEW_SESSION_INPUT",
        message: "面试准备会话参数不正确，请选择报告和有效简历。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const report = getReportById(input.data.reportId);

    if (!report) {
      return apiError(
        {
          code: "REPORT_NOT_FOUND",
          message: `未找到 id 为 ${input.data.reportId} 的评估报告。`,
        },
        { status: 404 },
      );
    }

    if (input.data.resumeId !== undefined) {
      const resume = getResumeById(input.data.resumeId);

      if (!resume || resume.archivedAt !== null) {
        return apiError(
          {
            code: "RESUME_NOT_FOUND",
            message: "未找到可用简历，或该简历已归档。",
          },
          { status: 404 },
        );
      }
    }

    const session = createInterviewSession(input.data);

    if (!session) {
      return apiError(
        {
          code: "INTERVIEW_SESSION_CREATE_FAILED",
          message: "面试准备会话创建失败，请检查报告和简历是否仍然存在。",
        },
        { status: 400 },
      );
    }

    return apiSuccess({ session }, { status: 201 });
  } catch {
    return apiError(
      {
        code: "INTERVIEW_SESSION_CREATE_FAILED",
        message: "面试准备会话创建失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
