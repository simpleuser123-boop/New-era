import {
  careerProfileSettingsSchema,
  proposeApplicationStatusUpdatePayloadSchema,
  proposeCareerProfilePatchPayloadSchema,
  proposeFollowUpEventPayloadSchema,
  proposeInterviewSessionStartPayloadSchema,
  proposeResumeJudgeFeedbackPayloadSchema,
} from "../schemas";
import {
  createApplicationEvent,
  createInterviewSession,
  createOptimizationFeedback,
  getReportById,
  getResumeById,
  getResumeOptimizationRunById,
  updateApplicationStatus,
} from "../server-db";
import {
  getCareerProfileSetting,
  saveCareerProfileSetting,
} from "../career-profile";
import type { AgentActionProposal, JsonObject } from "../types";

export class AgentActionProposalExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: JsonObject,
  ) {
    super(message);
    this.name = "AgentActionProposalExecutionError";
  }
}

export function executeAgentActionProposal(
  proposal: AgentActionProposal,
): JsonObject {
  switch (proposal.actionType) {
    case "propose_application_status_update":
      return executeApplicationStatusUpdate(proposal.payload);
    case "propose_follow_up_event":
      return executeFollowUpEvent(proposal.payload);
    case "propose_career_profile_patch":
      return executeCareerProfilePatch(proposal.payload);
    case "propose_resume_judge_feedback":
      return executeResumeJudgeFeedback(proposal.payload);
    case "propose_interview_session_start":
      return executeInterviewSessionStart(proposal.payload);
  }
}

function executeApplicationStatusUpdate(payload: JsonObject): JsonObject {
  const input = proposeApplicationStatusUpdatePayloadSchema.parse(payload);
  const application = updateApplicationStatus(input.applicationId, {
    status: input.status,
  });

  if (!application) {
    throw new AgentActionProposalExecutionError(
      "APPLICATION_NOT_FOUND",
      `未找到 id 为 ${input.applicationId} 的投递记录。`,
      404,
      { applicationId: input.applicationId },
    );
  }

  return {
    actionType: "propose_application_status_update",
    application,
    applicationId: application.id,
    entityType: "application",
  } as JsonObject;
}

function executeFollowUpEvent(payload: JsonObject): JsonObject {
  const input = proposeFollowUpEventPayloadSchema.parse(payload);
  const event = createApplicationEvent(input.applicationId, input.event);

  if (!event) {
    throw new AgentActionProposalExecutionError(
      "APPLICATION_NOT_FOUND",
      `未找到 id 为 ${input.applicationId} 的投递记录。`,
      404,
      { applicationId: input.applicationId },
    );
  }

  return {
    actionType: "propose_follow_up_event",
    applicationId: input.applicationId,
    entityType: "application_event",
    event,
    eventId: event.id,
  } as JsonObject;
}

function executeCareerProfilePatch(payload: JsonObject): JsonObject {
  const input = proposeCareerProfilePatchPayloadSchema.parse(payload);
  const { profile } = getCareerProfileSetting();
  const nextProfile = careerProfileSettingsSchema.parse({
    ...profile,
    ...input.patch,
    updatedAt: new Date().toISOString(),
  });
  const saved = saveCareerProfileSetting(nextProfile);
  const savedProfile = careerProfileSettingsSchema.parse(saved.value);

  return {
    actionType: "propose_career_profile_patch",
    entityType: "career_profile",
    profile: savedProfile,
    savedAt: saved.updatedAt,
    settingKey: "career_profile",
  } as JsonObject;
}

function executeResumeJudgeFeedback(payload: JsonObject): JsonObject {
  const input = proposeResumeJudgeFeedbackPayloadSchema.parse(payload);
  const run = getResumeOptimizationRunById(input.runId);

  if (!run) {
    throw new AgentActionProposalExecutionError(
      "RESUME_JUDGE_RUN_NOT_FOUND",
      `未找到 id 为 ${input.runId} 的 Resume Judge 记录。`,
      404,
      { runId: input.runId },
    );
  }

  const suggestionExists = run.result.suggestions.some(
    (suggestion) => suggestion.id === input.suggestionId,
  );

  if (!suggestionExists) {
    throw new AgentActionProposalExecutionError(
      "SUGGESTION_NOT_FOUND",
      "该建议不属于指定 Resume Judge 记录，无法保存反馈。",
      400,
      { runId: input.runId, suggestionId: input.suggestionId },
    );
  }

  const feedback = createOptimizationFeedback(input);

  if (!feedback) {
    throw new AgentActionProposalExecutionError(
      "RESUME_JUDGE_RUN_NOT_FOUND",
      `未找到 id 为 ${input.runId} 的 Resume Judge 记录。`,
      404,
      { runId: input.runId },
    );
  }

  return {
    actionType: "propose_resume_judge_feedback",
    entityType: "optimization_feedback",
    feedback,
    feedbackId: feedback.id,
    runId: run.id,
  } as JsonObject;
}

function executeInterviewSessionStart(payload: JsonObject): JsonObject {
  const input = proposeInterviewSessionStartPayloadSchema.parse(payload);
  const report = getReportById(input.reportId);

  if (!report) {
    throw new AgentActionProposalExecutionError(
      "REPORT_NOT_FOUND",
      `未找到 id 为 ${input.reportId} 的评估报告。`,
      404,
      { reportId: input.reportId },
    );
  }

  if (input.resumeId !== undefined) {
    const resume = getResumeById(input.resumeId);

    if (!resume || resume.archivedAt !== null) {
      throw new AgentActionProposalExecutionError(
        "RESUME_NOT_FOUND",
        "未找到可用简历，或该简历已归档。",
        404,
        { resumeId: input.resumeId },
      );
    }
  }

  const session = createInterviewSession(input);

  if (!session) {
    throw new AgentActionProposalExecutionError(
      "INTERVIEW_SESSION_CREATE_FAILED",
      "面试准备会话创建失败，请检查报告和简历是否仍然存在。",
      400,
      { reportId: input.reportId, resumeId: input.resumeId ?? null },
    );
  }

  return {
    actionType: "propose_interview_session_start",
    entityType: "interview_session",
    session,
    sessionId: session.id,
  } as JsonObject;
}
