import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { agentMemoryUpdateInputSchema } from "@/lib/schemas";
import {
  deleteAgentMemoryItem,
  getAgentMemoryItemById,
  updateAgentMemoryItem,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const memoryIdParamSchema = z
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

async function parseMemoryId(context: { params: Promise<{ id: string }> }) {
  const params = await context.params;

  return memoryIdParamSchema.safeParse(params.id);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsedId = await parseMemoryId(context);

  if (!parsedId.success) {
    return apiError(
      {
        code: "INVALID_AGENT_MEMORY_ID",
        message: "记忆 id 必须是正整数。",
        details: zodErrorDetails(parsedId.error),
      },
      { status: 400 },
    );
  }

  try {
    const memoryItem = getAgentMemoryItemById(parsedId.data);

    if (!memoryItem) {
      return apiError(
        {
          code: "AGENT_MEMORY_NOT_FOUND",
          message: `未找到 id 为 ${parsedId.data} 的记忆条目。`,
        },
        { status: 404 },
      );
    }

    return apiSuccess({ memoryItem });
  } catch {
    return apiError(
      {
        code: "AGENT_MEMORY_READ_FAILED",
        message: "记忆读取失败，请稍后重试。",
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

  const parsedId = await parseMemoryId(context);

  if (!parsedId.success) {
    return apiError(
      {
        code: "INVALID_AGENT_MEMORY_ID",
        message: "记忆 id 必须是正整数。",
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

  const input = agentMemoryUpdateInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_AGENT_MEMORY_INPUT",
        message: "记忆更新参数不正确。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const memoryItem = updateAgentMemoryItem(parsedId.data, input.data);

    if (!memoryItem) {
      return apiError(
        {
          code: "AGENT_MEMORY_NOT_FOUND",
          message: `未找到 id 为 ${parsedId.data} 的记忆条目。`,
        },
        { status: 404 },
      );
    }

    return apiSuccess({ memoryItem });
  } catch {
    return apiError(
      {
        code: "AGENT_MEMORY_UPDATE_FAILED",
        message: "记忆更新失败，请稍后重试。",
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

  const parsedId = await parseMemoryId(context);

  if (!parsedId.success) {
    return apiError(
      {
        code: "INVALID_AGENT_MEMORY_ID",
        message: "记忆 id 必须是正整数。",
        details: zodErrorDetails(parsedId.error),
      },
      { status: 400 },
    );
  }

  try {
    const memoryItem = deleteAgentMemoryItem(parsedId.data);

    if (!memoryItem) {
      return apiError(
        {
          code: "AGENT_MEMORY_NOT_FOUND",
          message: `未找到 id 为 ${parsedId.data} 的记忆条目。`,
        },
        { status: 404 },
      );
    }

    return apiSuccess({ deleted: true, memoryItem });
  } catch {
    return apiError(
      {
        code: "AGENT_MEMORY_DELETE_FAILED",
        message: "记忆删除失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
