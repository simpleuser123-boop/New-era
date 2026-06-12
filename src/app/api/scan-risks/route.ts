import type { NextRequest } from "next/server";
import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { scanRisks } from "@/lib/risk-engine";
import { riskScanInputSchema, riskScanResultSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_JD_TEXT_LENGTH = 30;
const MAX_JD_TEXT_LENGTH = 50_000;

const scanRisksRequestSchema = riskScanInputSchema.extend({
  jdText: z
    .string()
    .trim()
    .min(MIN_JD_TEXT_LENGTH, {
      message: `JD 文本过短，至少需要 ${MIN_JD_TEXT_LENGTH} 个字符。`,
    })
    .max(MAX_JD_TEXT_LENGTH),
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

function normalizeSignals(result: ReturnType<typeof scanRisks>) {
  return result.signals.map((signal) => ({
    id: signal.id ?? null,
    signal: signal.signal,
    excerpt: signal.excerpt,
    severity: signal.severity,
    source: signal.source,
    category: signal.category ?? null,
    explanation: signal.explanation ?? null,
    advice: signal.advice ?? null,
    weight: signal.weight ?? null,
    matchTerms: signal.matchTerms ?? [],
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
        message: "请求体必须是合法 JSON，格式为 { jdText: string }。",
      },
      { status: 400 },
    );
  }

  const input = scanRisksRequestSchema.safeParse(requestBody);

  if (!input.success) {
    const textTooShort = isJdTextTooShort(input.error);

    return apiError(
      {
        code: textTooShort
          ? "JD_TEXT_TOO_SHORT"
          : "INVALID_SCAN_RISKS_INPUT",
        message: textTooShort
          ? `JD 文本过短，至少需要 ${MIN_JD_TEXT_LENGTH} 个字符。`
          : "请求体格式不正确，格式为 { jdText: string }。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const result = riskScanResultSchema.parse(
      scanRisks(input.data.jdText, {
        company: input.data.company,
        role: input.data.role,
        sourceUrl: input.data.sourceUrl,
      }),
    );

    return apiSuccess({
      riskLevel: result.level,
      riskScore: result.totalWeight,
      scoreCap: result.scoreCap ?? null,
      ruleVersion: result.ruleVersion ?? null,
      ruleVersionNotes: result.ruleVersionNotes ?? [],
      signals: normalizeSignals(result),
      summary: result.summary,
      recommendation: result.recommendation,
    });
  } catch {
    return apiError(
      {
        code: "RISK_SCAN_FAILED",
        message: "风险扫描失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
