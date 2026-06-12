import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import {
  AgentActionProposalNotPendingError,
  dismissAgentActionProposal,
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

const dismissRequestSchema = z.strictObject({
  reason: z.string().trim().max(1_000).optional(),
});

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

async function readOptionalJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();

  if (text.trim().length === 0) {
    return {};
  }

  return JSON.parse(text) as unknown;
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

  let requestBody: unknown;

  try {
    requestBody = await readOptionalJsonBody(request);
  } catch {
    return apiError(
      {
        code: "INVALID_JSON",
        message: "请求体必须是合法 JSON。",
      },
      { status: 400 },
    );
  }

  const input = dismissRequestSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_AGENT_ACTION_DISMISS_INPUT",
        message: "忽略原因格式不正确。",
        details: zodErrorDetails(input.error),
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
          message: "该 Agent 待确认动作已经处理，不能重复忽略。",
          details: {
            proposalId: proposal.id,
            status: proposal.status,
          },
        },
        { status: 409 },
      );
    }

    const dismissed = dismissAgentActionProposal(proposal.id, {
      dismissedBy: "user",
      reason: input.data.reason ?? "",
    });

    if (!dismissed) {
      return apiError(
        {
          code: "AGENT_ACTION_PROPOSAL_NOT_FOUND",
          message: `未找到 id 为 ${proposal.id} 的 Agent 待确认动作。`,
        },
        { status: 404 },
      );
    }

    return apiSuccess({
      proposal: dismissed,
    });
  } catch (error) {
    if (error instanceof AgentActionProposalNotPendingError) {
      return apiError(
        {
          code: "AGENT_ACTION_PROPOSAL_NOT_PENDING",
          message: "该 Agent 待确认动作已经处理，不能重复忽略。",
          details: {
            proposalId: error.id,
            status: error.status,
          },
        },
        { status: 409 },
      );
    }

    return apiError(
      {
        code: "AGENT_ACTION_PROPOSAL_DISMISS_FAILED",
        message: "Agent 待确认动作忽略失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
