import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { agentSessionUpdateInputSchema } from "@/lib/schemas";
import {
  deleteAgentSession,
  getAgentSessionById,
  updateAgentSession,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sessionIdParamSchema = z
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

async function parseSessionId(context: { params: Promise<{ id: string }> }) {
  const params = await context.params;

  return sessionIdParamSchema.safeParse(params.id);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsedId = await parseSessionId(context);

  if (!parsedId.success) {
    return apiError(
      {
        code: "INVALID_AGENT_SESSION_ID",
        message: "会话 id 必须是正整数。",
        details: zodErrorDetails(parsedId.error),
      },
      { status: 400 },
    );
  }

  try {
    const session = getAgentSessionById(parsedId.data);

    if (!session) {
      return apiError(
        {
          code: "AGENT_SESSION_NOT_FOUND",
          message: `未找到 id 为 ${parsedId.data} 的 Agent 会话。`,
        },
        { status: 404 },
      );
    }

    return apiSuccess({ session });
  } catch {
    return apiError(
      {
        code: "AGENT_SESSION_READ_FAILED",
        message: "会话读取失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsedId = await parseSessionId(context);

  if (!parsedId.success) {
    return apiError(
      {
        code: "INVALID_AGENT_SESSION_ID",
        message: "会话 id 必须是正整数。",
        details: zodErrorDetails(parsedId.error),
      },
      { status: 400 },
    );
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

  const input = agentSessionUpdateInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_AGENT_SESSION_INPUT",
        message: "会话更新参数不正确。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const session = updateAgentSession(parsedId.data, input.data);

    if (!session) {
      return apiError(
        {
          code: "AGENT_SESSION_NOT_FOUND",
          message: `未找到 id 为 ${parsedId.data} 的 Agent 会话。`,
        },
        { status: 404 },
      );
    }

    return apiSuccess({ session });
  } catch {
    return apiError(
      {
        code: "AGENT_SESSION_UPDATE_FAILED",
        message: "会话更新失败，请稍后重试。",
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

  const parsedId = await parseSessionId(context);

  if (!parsedId.success) {
    return apiError(
      {
        code: "INVALID_AGENT_SESSION_ID",
        message: "会话 id 必须是正整数。",
        details: zodErrorDetails(parsedId.error),
      },
      { status: 400 },
    );
  }

  try {
    const session = deleteAgentSession(parsedId.data);

    if (!session) {
      return apiError(
        {
          code: "AGENT_SESSION_NOT_FOUND",
          message: `未找到 id 为 ${parsedId.data} 的 Agent 会话。`,
        },
        { status: 404 },
      );
    }

    return apiSuccess({ deleted: true, session });
  } catch {
    return apiError(
      {
        code: "AGENT_SESSION_DELETE_FAILED",
        message: "会话删除失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
