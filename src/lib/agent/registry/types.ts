import type { AssistantRequestContext } from "../../types";

export const AGENT_IDS = [
  "tracker-agent",
  "evaluate-agent",
  "resume-agent",
  "interview-agent",
  "career-agent",
  "general-agent",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export type AgentDefinition = {
  id: AgentId;
  name: string;
  responsibility: string;
  triggerConditions: readonly string[];
  toolNames: readonly string[];
  systemPromptFragment: string;
};

export type AgentIntentRequest = {
  message: string;
  context?: AssistantRequestContext;
  source?: string;
};

export type AgentIntentClassification = {
  agentId: AgentId;
  confidence: number;
  matchedRules: readonly string[];
  reason: string;
};
