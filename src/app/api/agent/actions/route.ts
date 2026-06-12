import type { NextRequest } from "next/server";
import { type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import {
  agentActionProposalCreateInputSchema,
  agentActionProposalListInputSchema,
} from "@/lib/schemas";
import {
  createAgentActionProposal,
  listAgentActionProposals,
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

  const query = agentActionProposalListInputSchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined,
  });

  if (!query.success) {
    return apiError(
      {
        code: "INVALID_AGENT_ACTIONS_QUERY",
        message: "Agent 待确认动作查询参数不正确。",
        details: zodErrorDetails(query.error),
      },
      { status: 400 },
    );
  }

  try {
    const proposals = listAgentActionProposals(query.data);

    return apiSuccess({
      count: proposals.length,
      limit: query.data.limit ?? 20,
      proposals,
    });
  } catch {
    return apiError(
      {
        code: "AGENT_ACTIONS_LIST_FAILED",
        message: "Agent 待确认动作读取失败，请稍后重试。",
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

  const input = agentActionProposalCreateInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_AGENT_ACTION_PROPOSAL_INPUT",
        message: "Agent 待确认动作参数不正确，请检查类型、说明和 payload。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const proposal = createAgentActionProposal(input.data);

    return apiSuccess(
      {
        proposal,
        proposalId: proposal.id,
      },
      { status: 201 },
    );
  } catch {
    return apiError(
      {
        code: "AGENT_ACTION_PROPOSAL_CREATE_FAILED",
        message: "Agent 待确认动作创建失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
