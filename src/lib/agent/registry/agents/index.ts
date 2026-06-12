import { agentToolNames } from "../../tools";
import { careerAgent } from "./career";
import { evaluateAgent } from "./evaluate";
import { generalAgent } from "./general";
import { interviewAgent } from "./interview";
import { resumeAgent } from "./resume";
import { trackerAgent } from "./tracker";
import { AGENT_IDS, type AgentDefinition, type AgentId } from "../types";

export const agentDefinitions = validateAgentDefinitions([
  trackerAgent,
  evaluateAgent,
  resumeAgent,
  interviewAgent,
  careerAgent,
  generalAgent,
] as const);

const agentDefinitionById = new Map<AgentId, AgentDefinition>(
  agentDefinitions.map((agent) => [agent.id, agent]),
);

export function listAgentDefinitions(): AgentDefinition[] {
  return [...agentDefinitions];
}

export function getAgentDefinition(agentId: AgentId): AgentDefinition {
  return agentDefinitionById.get(agentId) ?? generalAgent;
}

function validateAgentDefinitions(
  definitions: readonly AgentDefinition[],
): readonly AgentDefinition[] {
  const expectedIds = new Set<AgentId>(AGENT_IDS);
  const seenIds = new Set<AgentId>();
  const validToolNames = new Set(agentToolNames);

  for (const definition of definitions) {
    if (!expectedIds.has(definition.id)) {
      throw new Error(`Unknown agent id: ${definition.id}`);
    }

    if (seenIds.has(definition.id)) {
      throw new Error(`Duplicate agent id: ${definition.id}`);
    }

    seenIds.add(definition.id);

    if (!definition.name.trim()) {
      throw new Error(`Agent ${definition.id} must include a name.`);
    }

    if (!definition.responsibility.trim()) {
      throw new Error(`Agent ${definition.id} must include a responsibility.`);
    }

    if (definition.triggerConditions.length === 0) {
      throw new Error(`Agent ${definition.id} must include trigger conditions.`);
    }

    if (definition.toolNames.length === 0) {
      throw new Error(`Agent ${definition.id} must include toolNames.`);
    }

    for (const toolName of definition.toolNames) {
      if (!validToolNames.has(toolName)) {
        throw new Error(
          `Agent ${definition.id} references unregistered tool: ${toolName}`,
        );
      }
    }

    if (!definition.systemPromptFragment.trim()) {
      throw new Error(`Agent ${definition.id} must include a prompt fragment.`);
    }
  }

  for (const agentId of expectedIds) {
    if (!seenIds.has(agentId)) {
      throw new Error(`Missing agent definition: ${agentId}`);
    }
  }

  return definitions;
}
