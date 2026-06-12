import type { NextRequest } from "next/server";
import type { ZodError } from "zod";

import { runLegacyAssistantResponse } from "@/lib/agent/legacy-assistant";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { assistantRequestSchema } from "@/lib/schemas";
import type { JsonObject } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ASSISTANT_MODEL_TIMEOUT_MS = 8_000;
const ASSISTANT_FALLBACK_HEADER = "x-new-era-assistant-fallback";
const ASSISTANT_PROVIDER_HEADER = "x-new-era-assistant-provider";
const ASSISTANT_FALLBACK_CODE_HEADER = "x-new-era-assistant-fallback-code";

// Legacy JSON endpoint. The visible /assistant workspace uses /api/agent/run.
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
        message: "请求体必须是合法 JSON，格式为 { message: string, context?: object }。",
      },
      { status: 400 },
    );
  }

  const input = assistantRequestSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_ASSISTANT_INPUT",
        details: zodErrorDetails(input.error),
        message: "Assistant 问题参数不正确，请输入 1 到 4000 个字符的问题。",
      },
      { status: 400 },
    );
  }

  try {
    const response = await runLegacyAssistantResponse(input.data, {
      forceLocalFallback: shouldForceLocalFallback(request),
      modelTimeoutMs: getAssistantModelTimeoutMs(),
    });

    return apiSuccess(response as unknown as JsonObject, {
      headers: buildAssistantResponseHeaders(response),
    });
  } catch {
    return apiError(
      {
        code: "ASSISTANT_CONTEXT_READ_FAILED",
        message: "Assistant legacy 兼容层读取本地上下文失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}

function shouldForceLocalFallback(request: NextRequest): boolean {
  return (
    request.headers.get("x-new-era-force-local-fallback") === "1" ||
    request.nextUrl.searchParams.get("fallbackMode") === "local"
  );
}

function getAssistantModelTimeoutMs(): number {
  const value = Number.parseInt(process.env.ASSISTANT_MODEL_TIMEOUT_MS ?? "", 10);

  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_ASSISTANT_MODEL_TIMEOUT_MS;
}

function buildAssistantResponseHeaders(response: {
  fallbackCode?: string | null;
  fallbackUsed?: boolean;
  provider?: string;
}): HeadersInit {
  return {
    [ASSISTANT_FALLBACK_HEADER]: response.fallbackUsed ? "1" : "0",
    [ASSISTANT_PROVIDER_HEADER]: response.provider ?? "unknown",
    ...(response.fallbackCode
      ? { [ASSISTANT_FALLBACK_CODE_HEADER]: response.fallbackCode }
      : {}),
  };
}
