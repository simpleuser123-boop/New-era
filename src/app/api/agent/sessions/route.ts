import type { NextRequest } from "next/server";
import { type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import {
  agentSessionCreateInputSchema,
} from "@/lib/schemas";
import {
  createAgentSession,
  listAgentSessions,
} from "@/lib/server-db";

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

  const rawLimit = request.nextUrl.searchParams.get("limit");
  const limit =
    rawLimit === null || rawLimit.trim().length === 0
      ? undefined
      : Number(rawLimit);

  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0 || limit > 100)) {
    return apiError(
      {
        code: "INVALID_AGENT_SESSIONS_QUERY",
        message: "会话查询参数不正确。",
        details: [{ path: "limit", message: "limit 必须是 1 到 100 的整数。" }],
      },
      { status: 400 },
    );
  }

  try {
    const sessions = listAgentSessions(limit);

    return apiSuccess({
      count: sessions.length,
      limit: limit ?? 20,
      sessions,
    });
  } catch {
    return apiError(
      {
        code: "AGENT_SESSIONS_LIST_FAILED",
        message: "会话列表读取失败，请稍后重试。",
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

  const input = agentSessionCreateInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_AGENT_SESSION_INPUT",
        message: "会话创建参数不正确。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const session = createAgentSession(input.data);

    return apiSuccess(
      {
        session,
        sessionId: session.id,
      },
      { status: 201 },
    );
  } catch {
    return apiError(
      {
        code: "AGENT_SESSION_CREATE_FAILED",
        message: "会话创建失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
