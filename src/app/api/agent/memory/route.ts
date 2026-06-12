import type { NextRequest } from "next/server";
import { type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { agentMemoryListInputSchema } from "@/lib/schemas";
import { listAgentMemoryItems } from "@/lib/server-db";

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

  const query = agentMemoryListInputSchema.safeParse({
    includeDeleted: request.nextUrl.searchParams.get("includeDeleted") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    sessionId: request.nextUrl.searchParams.get("sessionId") ?? undefined,
  });

  if (!query.success) {
    return apiError(
      {
        code: "INVALID_AGENT_MEMORY_QUERY",
        message: "记忆查询参数不正确。",
        details: zodErrorDetails(query.error),
      },
      { status: 400 },
    );
  }

  try {
    const memoryItems = listAgentMemoryItems(query.data);

    return apiSuccess({
      count: memoryItems.length,
      limit: query.data.limit ?? 20,
      memoryItems,
    });
  } catch {
    return apiError(
      {
        code: "AGENT_MEMORY_LIST_FAILED",
        message: "记忆读取失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
