import { z } from "zod";

import {
  applicationStatusSchema,
  careerProfilePatchInputSchema,
  interviewModeSchema,
  optimizationFeedbackDecisionSchema,
} from "../../../schemas";
import { createAgentActionProposal } from "../../../server-db";
import type {
  AgentActionProposal,
  AgentActionType,
  JsonObject,
  JsonValue,
} from "../../../types";
import { ToolRegistry } from "../registry";
import type {
  AgentToolContext,
  ToolDefinition,
  ToolHandlerSuccessResult,
} from "../types";

const positiveIdSchema = z.coerce.number().int().positive();
const titleSchema = z.string().trim().min(1).max(240);
const reasonSchema = z.string().trim().min(1).max(2_000);
const riskNoteSchema = z.string().trim().min(1).max(2_000).optional();
const eventTitleSchema = z.string().trim().min(1).max(240).optional();
const eventNoteSchema = z.string().trim().max(5_000).default("");
const dateTimeSchema = z
  .string()
  .trim()
  .max(64)
  .refine(
    (value) => {
      const normalized = value.includes("T") ? value : value.replace(" ", "T");
      const timestamp = new Date(normalized).getTime();

      return Number.isFinite(timestamp);
    },
    { message: "时间格式不正确。" },
  );

const proposalFields = {
  reason: reasonSchema,
  riskNote: riskNoteSchema,
  title: titleSchema,
} as const;

const proposeApplicationStatusUpdateParamsSchema = z.strictObject({
  ...proposalFields,
  applicationId: positiveIdSchema,
  status: applicationStatusSchema,
});

const proposeFollowUpEventParamsSchema = z.strictObject({
  ...proposalFields,
  applicationId: positiveIdSchema,
  eventTitle: eventTitleSchema,
  eventType: z.enum(["follow_up_scheduled", "note_added"]),
  happenedAt: dateTimeSchema.optional(),
  note: eventNoteSchema,
});

const proposeCareerProfilePatchParamsSchema = z.strictObject({
  ...proposalFields,
  patch: careerProfilePatchInputSchema,
});

const proposeResumeJudgeFeedbackParamsSchema = z.strictObject({
  ...proposalFields,
  decision: optimizationFeedbackDecisionSchema,
  feedbackReason: z.string().trim().max(1_000).default(""),
  runId: positiveIdSchema,
  suggestionId: z.string().trim().min(1).max(120),
});

const proposeInterviewSessionStartParamsSchema = z.strictObject({
  ...proposalFields,
  mode: interviewModeSchema.default("mixed"),
  reportId: positiveIdSchema,
  resumeId: positiveIdSchema.optional(),
  sessionTitle: z.string().trim().min(1).max(240).optional(),
});

type ProposeApplicationStatusUpdateParams = z.infer<
  typeof proposeApplicationStatusUpdateParamsSchema
>;
type ProposeFollowUpEventParams = z.infer<
  typeof proposeFollowUpEventParamsSchema
>;
type ProposeCareerProfilePatchParams = z.infer<
  typeof proposeCareerProfilePatchParamsSchema
>;
type ProposeResumeJudgeFeedbackParams = z.infer<
  typeof proposeResumeJudgeFeedbackParamsSchema
>;
type ProposeInterviewSessionStartParams = z.infer<
  typeof proposeInterviewSessionStartParamsSchema
>;

export const proposeApplicationStatusUpdateTool: ToolDefinition<
  ProposeApplicationStatusUpdateParams,
  JsonValue
> = {
  name: "propose_application_status_update",
  displayName: "Propose Application Status Update",
  description:
    "创建 Tracker 状态变更待确认动作；确认前不会修改 applications 表。",
  category: "action",
  parameters: {
    applicationId: {
      type: "integer",
      description: "要更新状态的 Tracker 记录 ID。",
      required: true,
    },
    reason: {
      type: "string",
      description: "生成该待确认动作的原因。",
      required: true,
    },
    riskNote: {
      type: "string",
      description: "给用户确认前查看的风险提示。",
    },
    status: {
      type: "string",
      description: "建议更新到的 Tracker 状态。",
      enum: [
        "to_apply",
        "applied",
        "interviewing",
        "offer_received",
        "rejected",
        "abandoned",
      ],
      required: true,
    },
    title: {
      type: "string",
      description: "待确认动作标题。",
      required: true,
    },
  },
  parametersSchema: proposeApplicationStatusUpdateParamsSchema,
  handler: ({ applicationId, reason, riskNote, status, title }, context) =>
    createProposalResult({
      actionType: "propose_application_status_update",
      context,
      payload: { applicationId, status },
      reason,
      riskNote,
      sourceToolName: "propose_application_status_update",
      title,
    }),
};

export const proposeFollowUpEventTool: ToolDefinition<
  ProposeFollowUpEventParams,
  JsonValue
> = {
  name: "propose_follow_up_event",
  displayName: "Propose Follow-up Event",
  description:
    "创建 Tracker 跟进时间线事件待确认动作；确认前不会修改 application_events 表。",
  category: "action",
  parameters: {
    applicationId: {
      type: "integer",
      description: "要追加时间线事件的 Tracker 记录 ID。",
      required: true,
    },
    eventTitle: {
      type: "string",
      description: "时间线事件标题。",
    },
    eventType: {
      type: "string",
      description: "时间线事件类型，仅限跟进或备注。",
      enum: ["follow_up_scheduled", "note_added"],
      required: true,
    },
    happenedAt: {
      type: "string",
      description: "事件发生时间，ISO 字符串或可解析日期时间。",
    },
    note: {
      type: "string",
      description: "时间线事件备注。",
    },
    reason: {
      type: "string",
      description: "生成该待确认动作的原因。",
      required: true,
    },
    riskNote: {
      type: "string",
      description: "给用户确认前查看的风险提示。",
    },
    title: {
      type: "string",
      description: "待确认动作标题。",
      required: true,
    },
  },
  parametersSchema: proposeFollowUpEventParamsSchema,
  handler: (
    { applicationId, eventTitle, eventType, happenedAt, note, reason, riskNote, title },
    context,
  ) =>
    createProposalResult({
      actionType: "propose_follow_up_event",
      context,
      payload: {
        applicationId,
        event: {
          eventType,
          ...(eventTitle ? { title: eventTitle } : {}),
          ...(happenedAt ? { happenedAt } : {}),
          note,
        },
      },
      reason,
      riskNote,
      sourceToolName: "propose_follow_up_event",
      title,
    }),
};

export const proposeCareerProfilePatchTool: ToolDefinition<
  ProposeCareerProfilePatchParams,
  JsonValue
> = {
  name: "propose_career_profile_patch",
  displayName: "Propose Career Profile Patch",
  description:
    "创建 Career DNA patch 待确认动作；确认前不会修改 settings 表。",
  category: "action",
  parameters: {
    patch: {
      type: "object",
      description: "Career DNA 明确字段 patch，不接受自由文本模糊写入。",
      required: true,
    },
    reason: {
      type: "string",
      description: "生成该待确认动作的原因。",
      required: true,
    },
    riskNote: {
      type: "string",
      description: "给用户确认前查看的风险提示。",
    },
    title: {
      type: "string",
      description: "待确认动作标题。",
      required: true,
    },
  },
  parametersSchema: proposeCareerProfilePatchParamsSchema,
  handler: ({ patch, reason, riskNote, title }, context) =>
    createProposalResult({
      actionType: "propose_career_profile_patch",
      context,
      payload: { patch },
      reason,
      riskNote,
      sourceToolName: "propose_career_profile_patch",
      title,
    }),
};

export const proposeResumeJudgeFeedbackTool: ToolDefinition<
  ProposeResumeJudgeFeedbackParams,
  JsonValue
> = {
  name: "propose_resume_judge_feedback",
  displayName: "Propose Resume Judge Feedback",
  description:
    "创建 Resume Judge 建议反馈待确认动作；确认前不会修改 optimization_feedback 表。",
  category: "action",
  parameters: {
    decision: {
      type: "string",
      description: "对建议的反馈决策。",
      enum: ["accepted", "rejected"],
      required: true,
    },
    feedbackReason: {
      type: "string",
      description: "保存到反馈记录中的原因。",
    },
    reason: {
      type: "string",
      description: "生成该待确认动作的原因。",
      required: true,
    },
    riskNote: {
      type: "string",
      description: "给用户确认前查看的风险提示。",
    },
    runId: {
      type: "integer",
      description: "Resume Judge run ID。",
      required: true,
    },
    suggestionId: {
      type: "string",
      description: "Resume Judge 建议 ID。",
      required: true,
    },
    title: {
      type: "string",
      description: "待确认动作标题。",
      required: true,
    },
  },
  parametersSchema: proposeResumeJudgeFeedbackParamsSchema,
  handler: (
    { decision, feedbackReason, reason, riskNote, runId, suggestionId, title },
    context,
  ) =>
    createProposalResult({
      actionType: "propose_resume_judge_feedback",
      context,
      payload: {
        decision,
        reason: feedbackReason,
        runId,
        suggestionId,
      },
      reason,
      riskNote,
      sourceToolName: "propose_resume_judge_feedback",
      title,
    }),
};

export const proposeInterviewSessionStartTool: ToolDefinition<
  ProposeInterviewSessionStartParams,
  JsonValue
> = {
  name: "propose_interview_session_start",
  displayName: "Propose Interview Session Start",
  description:
    "创建面试准备会话待确认动作；确认前不会修改 interview_sessions 表。",
  category: "action",
  parameters: {
    mode: {
      type: "string",
      description: "面试准备模式。",
      enum: ["mixed", "technical", "product", "behavioral", "project"],
    },
    reason: {
      type: "string",
      description: "生成该待确认动作的原因。",
      required: true,
    },
    reportId: {
      type: "integer",
      description: "评估报告 ID。",
      required: true,
    },
    resumeId: {
      type: "integer",
      description: "可选简历 ID。",
    },
    riskNote: {
      type: "string",
      description: "给用户确认前查看的风险提示。",
    },
    sessionTitle: {
      type: "string",
      description: "可选面试准备会话标题。",
    },
    title: {
      type: "string",
      description: "待确认动作标题。",
      required: true,
    },
  },
  parametersSchema: proposeInterviewSessionStartParamsSchema,
  handler: ({ mode, reason, reportId, resumeId, riskNote, sessionTitle, title }, context) =>
    createProposalResult({
      actionType: "propose_interview_session_start",
      context,
      payload: {
        mode,
        reportId,
        ...(resumeId ? { resumeId } : {}),
        ...(sessionTitle ? { title: sessionTitle } : {}),
      },
      reason,
      riskNote,
      sourceToolName: "propose_interview_session_start",
      title,
    }),
};

export const actionToolDefinitions = [
  proposeApplicationStatusUpdateTool,
  proposeFollowUpEventTool,
  proposeCareerProfilePatchTool,
  proposeResumeJudgeFeedbackTool,
  proposeInterviewSessionStartTool,
] as const;

export const actionToolNames = actionToolDefinitions.map((tool) => tool.name);

export function registerActionTools(registry: ToolRegistry): ToolRegistry {
  for (const definition of actionToolDefinitions) {
    registry.register(definition as unknown as ToolDefinition);
  }

  return registry;
}

export function createActionToolRegistry(
  activeToolNames?: readonly string[],
): ToolRegistry {
  const registry = registerActionTools(new ToolRegistry());

  if (activeToolNames) {
    registry.setActiveToolNames(activeToolNames);
  }

  return registry;
}

function createProposalResult({
  actionType,
  context,
  payload,
  reason,
  riskNote,
  sourceToolName,
  title,
}: {
  actionType: AgentActionType;
  context: AgentToolContext;
  payload: JsonObject;
  reason: string;
  riskNote?: string;
  sourceToolName: string;
  title: string;
}): ToolHandlerSuccessResult<JsonValue> {
  const proposal = createAgentActionProposal({
    actionType,
    payload,
    reason,
    riskNote,
    sourceAgentId: readContextString(context, "agentId"),
    sourceToolName,
    title,
  });

  return {
    ok: true,
    action: toAssistantAction(proposal),
    data: proposal as unknown as JsonValue,
    llmSummary: `已创建待确认动作 #${proposal.id}：${proposal.title}。用户确认前不会修改业务表。`,
  };
}

function toAssistantAction(proposal: AgentActionProposal) {
  return {
    id: `agent-action-proposal:${proposal.id}`,
    label: proposal.title,
    payload: {
      actionType: proposal.actionType,
      confirmPath: `/api/agent/actions/${proposal.id}/confirm`,
      proposalId: proposal.id,
    },
    requiresConfirmation: true,
    type: "confirm_agent_action_proposal",
  } as const;
}

function readContextString(
  context: AgentToolContext,
  key: string,
): string | null {
  const value = context.metadata?.[key];

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}
