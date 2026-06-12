import type { NextRequest } from "next/server";
import type { ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { optimizationFeedbackCreateInputSchema } from "@/lib/schemas";
import {
  createOptimizationFeedback,
  getResumeOptimizationRunById,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
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
        message:
          "请求体必须是合法 JSON，格式为 { runId, suggestionId, decision, reason }。",
      },
      { status: 400 },
    );
  }

  const input = optimizationFeedbackCreateInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_OPTIMIZATION_FEEDBACK_INPUT",
        message: "反馈参数不正确，decision 只能是 accepted 或 rejected。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const run = getResumeOptimizationRunById(input.data.runId);

    if (!run) {
      return apiError(
        {
          code: "RESUME_JUDGE_RUN_NOT_FOUND",
          message: `未找到 id 为 ${input.data.runId} 的 Resume Judge 记录。`,
        },
        { status: 404 },
      );
    }

    const suggestionExists = run.result.suggestions.some(
      (suggestion) => suggestion.id === input.data.suggestionId,
    );

    if (!suggestionExists) {
      return apiError(
        {
          code: "SUGGESTION_NOT_FOUND",
          message: "该建议不属于指定 Resume Judge 记录，无法保存反馈。",
        },
        { status: 400 },
      );
    }

    const feedback = createOptimizationFeedback(input.data);

    if (!feedback) {
      return apiError(
        {
          code: "RESUME_JUDGE_RUN_NOT_FOUND",
          message: `未找到 id 为 ${input.data.runId} 的 Resume Judge 记录。`,
        },
        { status: 404 },
      );
    }

    return apiSuccess({
      feedback,
      runId: run.id,
    });
  } catch {
    return apiError(
      {
        code: "OPTIMIZATION_FEEDBACK_FAILED",
        message: "反馈保存失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
