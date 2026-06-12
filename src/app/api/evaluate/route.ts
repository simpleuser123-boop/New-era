import type { NextRequest } from "next/server";
import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { getDeepSeekFallbackMessage } from "@/lib/deepseek-errors";
import { getOrStartSavedEvaluation } from "@/lib/evaluate-idempotency";
import { jdEvaluationInputSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const evaluateRequestSchema = jdEvaluationInputSchema.extend({
  clientRequestId: z.string().trim().min(8).max(120).optional(),
  demoId: z.string().trim().min(1).max(80).optional(),
});

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function isJdTextTooShort(error: ZodError): boolean {
  return error.issues.some(
    (issue) => issue.path.join(".") === "jdText" && issue.code === "too_small",
  );
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
          "请求体必须是合法 JSON，格式为 { jdText: string, resumeText?: string, demoId?: string }。",
      },
      { status: 400 },
    );
  }

  const input = evaluateRequestSchema.safeParse(requestBody);

  if (!input.success) {
    const textTooShort = isJdTextTooShort(input.error);

    return apiError(
      {
        code: textTooShort
          ? "JD_TEXT_TOO_SHORT"
          : "INVALID_EVALUATE_INPUT",
        message: textTooShort
          ? "JD 文本过短，至少需要 20 个字符。"
          : "请求体格式不正确，格式为 { jdText: string, resumeText?: string, demoId?: string }。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const saved = await getOrStartSavedEvaluation(
      input.data.clientRequestId,
      input.data.jdText,
      {
        company: input.data.company,
        role: input.data.role,
        sourceUrl: input.data.sourceUrl,
        resumeText: input.data.resumeText,
      },
    );

    return apiSuccess({
      reportId: saved.id,
      report: saved.report,
      risks: saved.report.risks,
      score: saved.report.score,
      saveStatus: saved.saveError ? "failed" : "saved",
      saveError: saved.saveError ?? null,
      provider: saved.deepSeekError ? "local_fallback" : "deepseek_enhanced",
      fallbackUsed: Boolean(saved.deepSeekError),
      fallbackCode: saved.deepSeekError?.code ?? null,
      fallbackReason: saved.deepSeekError
        ? "deepseek_unavailable"
        : null,
      fallbackMessage: saved.deepSeekError
        ? getDeepSeekFallbackMessage(saved.deepSeekError.code)
        : null,
    });
  } catch {
    return apiError(
      {
        code: "EVALUATE_FAILED",
        message: "岗位评估失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
