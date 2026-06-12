import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import type { ZodError } from "zod";

import {
  agentRunRequestSchema,
  runAgentLoop,
  type AgentSseEvent,
} from "@/lib/agent/loop";
import { requireApiAuth } from "@/lib/auth/api";
import {
  appendAgentSessionMessages,
  getAgentSessionById,
  listVisibleAgentMemoriesForPrompt,
} from "@/lib/server-db";
import type {
  AgentMemoryItem,
  AgentSessionMessage,
  JsonValue,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const AGENT_FORCE_LOCAL_FALLBACK_HEADER = "x-new-era-force-local-fallback";
const AGENT_FORCE_LOCAL_FALLBACK = {
  fallbackCode: "forced_local_fallback",
  fallbackMessage: "本次请求已使用基础回答模式。",
  warning: "本次请求已使用基础回答模式。",
} as const;

function zodErrorDetails(error: ZodError): JsonValue {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function formatSseEvent(event: AgentSseEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

function enqueueEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: AgentSseEvent,
) {
  controller.enqueue(formatSseEvent(event));
}

function createSseResponse(
  start: (controller: ReadableStreamDefaultController<Uint8Array>) => Promise<void>,
  init?: ResponseInit,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await start(controller);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    ...init,
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
      ...init?.headers,
    },
  });
}

function createErrorSseResponse(
  error: Extract<AgentSseEvent, { type: "error" }>["error"],
  init?: ResponseInit,
): Response {
  return createSseResponse(async (controller) => {
    enqueueEvent(controller, {
      error,
      type: "error",
    });
  }, init);
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
    return createErrorSseResponse(
      {
        code: "INVALID_JSON",
        message: "请求体必须是合法 JSON，格式为 { message: string, context?: object }。",
      },
      { status: 400 },
    );
  }

  const input = agentRunRequestSchema.safeParse(requestBody);

  if (!input.success) {
    return createErrorSseResponse(
      {
        code: "INVALID_AGENT_RUN_INPUT",
        details: zodErrorDetails(input.error),
        message: "Agent 运行参数不正确，请输入 1 到 4000 个字符的问题。",
      },
      { status: 400 },
    );
  }

  const sessionId = input.data.context?.sessionId;

  if (sessionId !== undefined && !getAgentSessionById(sessionId)) {
    return createErrorSseResponse(
      {
        code: "AGENT_SESSION_NOT_FOUND",
        message: `未找到 id 为 ${sessionId} 的 Agent 会话。`,
      },
      { status: 404 },
    );
  }

  const visibleMemory = listVisibleAgentMemoriesForPrompt(sessionId).map(
    toAgentRunMemory,
  );
  const forceLocalFallback =
    request.headers.get(AGENT_FORCE_LOCAL_FALLBACK_HEADER) === "1" ||
    request.nextUrl.searchParams.get("fallbackMode") === "local";

  return createSseResponse(async (controller) => {
    let assistantContent = "";
    let finalCitations: AgentSessionMessage["citations"] = [];
    let finalWarnings: string[] = [];
    let errorMessage: string | undefined;

    try {
      await runAgentLoop({
        ...input.data,
        memory: visibleMemory,
      }, (event) => {
        if (event.type === "text") {
          assistantContent += event.content;
        }

        if (event.type === "text_reset") {
          assistantContent = event.content;
        }

        if (event.type === "done") {
          finalCitations = event.citations;
          finalWarnings = event.warnings;
        }

        if (event.type === "error") {
          errorMessage = event.error.message;
        }

        enqueueEvent(controller, event);
      }, {
        ...(forceLocalFallback
          ? { forceLocalFallback: AGENT_FORCE_LOCAL_FALLBACK }
          : {}),
        signal: request.signal,
      });
    } catch {
      errorMessage = "Agent Loop 运行失败，本次没有写入业务表。";
      enqueueEvent(controller, {
        error: {
          code: "AGENT_RUN_FAILED",
          message: errorMessage,
        },
        type: "error",
      });
    } finally {
      if (sessionId !== undefined && !request.signal.aborted) {
        appendAgentSessionMessages(sessionId, [
          createPersistedSessionMessage("user", input.data.message),
          createPersistedSessionMessage(
            "assistant",
            assistantContent.trim() || errorMessage || "Agent 本次没有返回内容。",
            {
              citations: finalCitations,
              isError: Boolean(errorMessage),
              warnings: finalWarnings,
            },
          ),
        ]);
      }
    }
  });
}

function toAgentRunMemory(item: AgentMemoryItem) {
  return {
    content: item.content,
    id: item.id,
    memoryType: item.memoryType,
    source: item.source,
    updatedAt: item.updatedAt,
  };
}

function createPersistedSessionMessage(
  role: AgentSessionMessage["role"],
  content: string,
  options: {
    citations?: AgentSessionMessage["citations"];
    isError?: boolean;
    warnings?: string[];
  } = {},
): AgentSessionMessage {
  return {
    ...(options.citations?.length ? { citations: options.citations } : {}),
    content,
    createdAt: new Date().toISOString(),
    id: `agent-message-${randomUUID()}`,
    ...(options.isError ? { isError: true } : {}),
    role,
    ...(options.warnings?.length ? { warnings: options.warnings } : {}),
  };
}
