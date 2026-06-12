import type { NextRequest } from "next/server";
import { type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import {
  riskFeedbackCreateInputSchema,
  riskFeedbackListInputSchema,
} from "@/lib/schemas";
import { createRiskFeedback, listRiskFeedback } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const query = riskFeedbackListInputSchema.safeParse({
    benchmarkJdId: request.nextUrl.searchParams.get("benchmarkJdId") ?? undefined,
    feedbackType: request.nextUrl.searchParams.get("feedbackType") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    reportId: request.nextUrl.searchParams.get("reportId") ?? undefined,
    riskRuleVersion:
      request.nextUrl.searchParams.get("riskRuleVersion") ?? undefined,
    userLabel: request.nextUrl.searchParams.get("userLabel") ?? undefined,
  });

  if (!query.success) {
    return apiError(
      {
        code: "INVALID_RISK_FEEDBACK_QUERY",
        message: "风险反馈查询参数不正确。",
        details: zodErrorDetails(query.error),
      },
      { status: 400 },
    );
  }

  try {
    const feedback = listRiskFeedback(query.data);

    return apiSuccess({
      count: feedback.length,
      feedback,
      limit: query.data.limit ?? 50,
    });
  } catch {
    return apiError(
      {
        code: "RISK_FEEDBACK_LIST_FAILED",
        message: "风险反馈读取失败，请稍后重试。",
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

  const input = riskFeedbackCreateInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_RISK_FEEDBACK_INPUT",
        message: "风险反馈参数不正确，请检查风险等级、反馈类型、用户标记和 JD 片段。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const feedback = createRiskFeedback(input.data);

    return apiSuccess(
      {
        feedback,
        feedbackId: feedback.id,
      },
      { status: 201 },
    );
  } catch {
    return apiError(
      {
        code: "RISK_FEEDBACK_CREATE_FAILED",
        message: "风险反馈保存失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
