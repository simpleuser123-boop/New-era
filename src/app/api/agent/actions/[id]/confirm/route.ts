import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import {
  AgentActionProposalExecutionError,
  executeAgentActionProposal,
} from "@/lib/agent/action-proposals";
import { requireApiAuth } from "@/lib/auth/api";
import {
  AgentActionProposalNotPendingError,
  confirmAgentActionProposal,
  getAgentActionProposalById,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proposalIdParamSchema = z
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

async function parseProposalId(context: { params: Promise<{ id: string }> }) {
  const params = await context.params;

  return proposalIdParamSchema.safeParse(params.id);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsedId = await parseProposalId(context);

  if (!parsedId.success) {
    return apiError(
      {
        code: "INVALID_AGENT_ACTION_PROPOSAL_ID",
        message: "Agent 待确认动作 id 必须是正整数。",
        details: zodErrorDetails(parsedId.error),
      },
      { status: 400 },
    );
  }

  try {
    const proposal = getAgentActionProposalById(parsedId.data);

    if (!proposal) {
      return apiError(
        {
          code: "AGENT_ACTION_PROPOSAL_NOT_FOUND",
          message: `未找到 id 为 ${parsedId.data} 的 Agent 待确认动作。`,
        },
        { status: 404 },
      );
    }

    if (proposal.status !== "pending") {
      return apiError(
        {
          code: "AGENT_ACTION_PROPOSAL_NOT_PENDING",
          message: "该 Agent 待确认动作已经处理，不能重复确认。",
          details: {
            proposalId: proposal.id,
            status: proposal.status,
          },
        },
        { status: 409 },
      );
    }

    const result = executeAgentActionProposal(proposal);
    const confirmed = confirmAgentActionProposal(proposal.id, result);

    if (!confirmed) {
      return apiError(
        {
          code: "AGENT_ACTION_PROPOSAL_NOT_FOUND",
          message: `未找到 id 为 ${proposal.id} 的 Agent 待确认动作。`,
        },
        { status: 404 },
      );
    }

    return apiSuccess({
      proposal: confirmed,
      result,
    });
  } catch (error) {
    if (error instanceof AgentActionProposalExecutionError) {
      return apiError(
        {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        { status: error.status },
      );
    }

    if (error instanceof AgentActionProposalNotPendingError) {
      return apiError(
        {
          code: "AGENT_ACTION_PROPOSAL_NOT_PENDING",
          message: "该 Agent 待确认动作已经处理，不能重复确认。",
          details: {
            proposalId: error.id,
            status: error.status,
          },
        },
        { status: 409 },
      );
    }

    if (error instanceof z.ZodError) {
      return apiError(
        {
          code: "INVALID_AGENT_ACTION_PROPOSAL_PAYLOAD",
          message: "Agent 待确认动作 payload 已重新校验失败，未执行写入。",
          details: zodErrorDetails(error),
        },
        { status: 400 },
      );
    }

    return apiError(
      {
        code: "AGENT_ACTION_PROPOSAL_CONFIRM_FAILED",
        message: "Agent 待确认动作确认失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
