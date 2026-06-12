import { ToolRegistry } from "./registry";
import {
  actionToolDefinitions,
  actionToolNames,
  registerActionTools,
} from "./action";
import {
  queryToolDefinitions,
  queryToolNames,
  registerQueryTools,
} from "./query";

export * from "./action";
export * from "./query";
export * from "./registry";
export * from "./types";

export const agentToolDefinitions = [
  ...queryToolDefinitions,
  ...actionToolDefinitions,
] as const;

export const agentToolNames = [...queryToolNames, ...actionToolNames] as const;

export function registerAgentTools(registry: ToolRegistry): ToolRegistry {
  registerQueryTools(registry);
  registerActionTools(registry);

  return registry;
}

export function createAgentToolRegistry(
  activeToolNames?: readonly string[],
): ToolRegistry {
  const registry = registerAgentTools(new ToolRegistry());

  if (activeToolNames) {
    registry.setActiveToolNames(activeToolNames);
  }

  return registry;
}
