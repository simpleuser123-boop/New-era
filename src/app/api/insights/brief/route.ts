import type { NextRequest } from "next/server";
import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { getMarketBrief } from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const briefRequestSchema = z.strictObject({
  focus: z.string().trim().min(1).max(240).optional(),
});

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

async function readOptionalJsonBody(request: NextRequest): Promise<unknown> {
  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return {};
  }

  return JSON.parse(rawBody) as unknown;
}

export async function POST(request: NextRequest) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let requestBody: unknown;

  try {
    requestBody = await readOptionalJsonBody(request);
  } catch {
    return apiError(
      {
        code: "INVALID_JSON",
        message: "请求体必须是合法 JSON，格式为 { focus?: string }。",
      },
      { status: 400 },
    );
  }

  const input = briefRequestSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_INSIGHTS_BRIEF_INPUT",
        message: "请求体格式不正确，格式为 { focus?: string }。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const result = await getMarketBrief({
      focus: input.data.focus,
      signal: request.signal,
    });

    return apiSuccess({
      brief: result.brief,
      weeklyBrief: result.brief,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
      fallbackReason: result.fallbackReason ?? null,
      fallbackCode: result.fallbackCode ?? null,
      model: result.model ?? null,
    });
  } catch {
    return apiError(
      {
        code: "INSIGHTS_BRIEF_FAILED",
        message: "市场简报生成失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
