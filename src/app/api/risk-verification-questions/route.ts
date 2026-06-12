import type { NextRequest } from "next/server";
import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { scanRisks } from "@/lib/risk-engine";
import { createRiskVerificationQuestionResult } from "@/lib/risk-verification-questions";
import {
  riskScanResultSchema,
  riskVerificationQuestionInputSchema,
  riskVerificationQuestionResultSchema,
} from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_JD_TEXT_LENGTH = 30;
const MAX_JD_TEXT_LENGTH = 50_000;

const riskVerificationQuestionsRequestSchema =
  riskVerificationQuestionInputSchema.extend({
    jdText: z
      .string()
      .trim()
      .min(MIN_JD_TEXT_LENGTH, {
        message: `JD 文本过短，至少需要 ${MIN_JD_TEXT_LENGTH} 个字符。`,
      })
      .max(MAX_JD_TEXT_LENGTH, {
        message: `JD 文本过长，最多支持 ${MAX_JD_TEXT_LENGTH} 个字符。`,
      }),
  });

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function readJdTextErrorCode(error: ZodError): string {
  const jdTextIssue = error.issues.find(
    (issue) => issue.path.join(".") === "jdText",
  );

  if (jdTextIssue?.code === "too_small") {
    return "JD_TEXT_TOO_SHORT";
  }

  if (jdTextIssue?.code === "too_big") {
    return "JD_TEXT_TOO_LONG";
  }

  return "INVALID_RISK_VERIFICATION_QUESTION_INPUT";
}

function readInputErrorMessage(errorCode: string): string {
  if (errorCode === "JD_TEXT_TOO_SHORT") {
    return `JD 文本过短，至少需要 ${MIN_JD_TEXT_LENGTH} 个字符。`;
  }

  if (errorCode === "JD_TEXT_TOO_LONG") {
    return `JD 文本过长，最多支持 ${MAX_JD_TEXT_LENGTH} 个字符。`;
  }

  return "请求体格式不正确，格式为 { jdText: string, company?: string, role?: string }。";
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
          "请求体必须是合法 JSON，格式为 { jdText: string, company?: string, role?: string }。",
      },
      { status: 400 },
    );
  }

  const input = riskVerificationQuestionsRequestSchema.safeParse(requestBody);

  if (!input.success) {
    const errorCode = readJdTextErrorCode(input.error);

    return apiError(
      {
        code: errorCode,
        message: readInputErrorMessage(errorCode),
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const riskScan = riskScanResultSchema.parse(
      scanRisks(input.data.jdText, {
        company: input.data.company,
        role: input.data.role,
      }),
    );
    const result = riskVerificationQuestionResultSchema.parse(
      createRiskVerificationQuestionResult({
        jdText: input.data.jdText,
        company: input.data.company,
        role: input.data.role,
        riskScan,
      }),
    );

    return apiSuccess(result);
  } catch {
    return apiError(
      {
        code: "RISK_VERIFICATION_QUESTIONS_FAILED",
        message: "核实问题生成失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
