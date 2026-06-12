import type { ZodError } from "zod";

import type { JsonValue } from "../../types";
import type {
  AgentToolContext,
  ToolCategory,
  ToolDefinition,
  ToolHandlerResult,
  ToolListItem,
  ToolListOptions,
  ToolResult,
  ToolResultError,
} from "./types";

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

type StoredToolDefinition = ToolDefinition<unknown, JsonValue>;

export class ToolRegistry {
  private readonly definitions = new Map<string, StoredToolDefinition>();
  private activeToolNames: Set<string> | null = null;

  constructor(definitions: readonly ToolDefinition[] = []) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register<TParams, TData extends JsonValue = JsonValue>(
    definition: ToolDefinition<TParams, TData>,
  ): ToolDefinition<TParams, TData> {
    assertValidDefinition(definition);

    if (this.definitions.has(definition.name)) {
      throw new Error(`Tool "${definition.name}" is already registered.`);
    }

    this.definitions.set(definition.name, definition as StoredToolDefinition);
    return definition;
  }

  get<TParams = unknown, TData extends JsonValue = JsonValue>(
    name: string,
  ): ToolDefinition<TParams, TData> | undefined {
    const normalizedName = safeNormalizeToolName(name);

    if (!normalizedName) {
      return undefined;
    }

    return this.definitions.get(normalizedName) as
      | ToolDefinition<TParams, TData>
      | undefined;
  }

  list(options: ToolListOptions = {}): ToolListItem[] {
    const items = [...this.definitions.values()]
      .filter((definition) => {
        if (options.category && definition.category !== options.category) {
          return false;
        }

        if (options.activeOnly && !this.isToolActive(definition.name)) {
          return false;
        }

        return true;
      })
      .map((definition) => toListItem(definition, this.isToolActive(definition.name)));

    return items.sort((left, right) => left.name.localeCompare(right.name));
  }

  setActiveToolNames(names: Iterable<string>): void {
    this.activeToolNames = new Set([...names].map(normalizeToolName));
  }

  clearActiveToolNames(): void {
    this.activeToolNames = null;
  }

  getActiveToolNames(): string[] | null {
    if (!this.activeToolNames) {
      return null;
    }

    return [...this.activeToolNames].sort();
  }

  async execute(
    name: string,
    rawParams: unknown = {},
    context: AgentToolContext = {},
  ): Promise<ToolResult> {
    const normalizedName = safeNormalizeToolName(name);

    if (!normalizedName) {
      return createErrorResult(name.trim() || "(empty)", null, {
        code: "invalid_tool_name",
        message: "工具名称格式无效。",
        recoverable: false,
      });
    }

    const definition = this.definitions.get(normalizedName);

    if (!definition) {
      return createErrorResult(normalizedName, null, {
        code: "tool_not_found",
        message: `工具 ${normalizedName} 未注册。`,
        recoverable: false,
      });
    }

    if (!this.isToolActive(normalizedName)) {
      return createErrorResult(normalizedName, definition.category, {
        code: "tool_not_allowed",
        message: `工具 ${normalizedName} 未在当前 Agent 白名单中。`,
        recoverable: false,
      });
    }

    const parsedParams = definition.parametersSchema.safeParse(rawParams);

    if (!parsedParams.success) {
      return createErrorResult(normalizedName, definition.category, {
        code: "invalid_tool_params",
        message: "工具参数校验失败。",
        recoverable: true,
        details: formatZodError(parsedParams.error),
      });
    }

    try {
      const result = await definition.handler(parsedParams.data, {
        ...context,
        activeToolNames: this.getActiveToolNames() ?? undefined,
        now: context.now ?? new Date().toISOString(),
      });

      return normalizeHandlerResult(definition, result);
    } catch {
      return createErrorResult(normalizedName, definition.category, {
        code: "tool_execution_failed",
        message: "工具执行失败，请稍后重试。",
        recoverable: false,
      });
    }
  }

  private isToolActive(name: string): boolean {
    return !this.activeToolNames || this.activeToolNames.has(name);
  }
}

function assertValidDefinition<TParams, TData extends JsonValue>(
  definition: ToolDefinition<TParams, TData>,
): void {
  normalizeToolName(definition.name);

  if (!definition.displayName.trim()) {
    throw new Error(`Tool "${definition.name}" must include a displayName.`);
  }

  if (!definition.description.trim()) {
    throw new Error(`Tool "${definition.name}" must include a description.`);
  }

  if (definition.category !== "query" && definition.category !== "action") {
    throw new Error(`Tool "${definition.name}" has an invalid category.`);
  }

  if (!isZodLikeSchema(definition.parametersSchema)) {
    throw new Error(`Tool "${definition.name}" must include a Zod schema.`);
  }

  if (typeof definition.handler !== "function") {
    throw new Error(`Tool "${definition.name}" must include a handler.`);
  }
}

function normalizeToolName(name: string): string {
  const normalizedName = name.trim();

  if (!TOOL_NAME_PATTERN.test(normalizedName)) {
    throw new Error(
      `Tool name "${name}" must match ${TOOL_NAME_PATTERN.toString()}.`,
    );
  }

  return normalizedName;
}

function safeNormalizeToolName(name: string): string | null {
  try {
    return normalizeToolName(name);
  } catch {
    return null;
  }
}

function isZodLikeSchema(
  schema: ToolDefinition["parametersSchema"],
): boolean {
  return Boolean(schema && typeof schema.safeParse === "function");
}

function normalizeHandlerResult(
  definition: StoredToolDefinition,
  result: ToolHandlerResult,
): ToolResult {
  if (!result.ok) {
    return {
      ...result,
      toolName: definition.name,
      category: definition.category,
    };
  }

  if (definition.category === "query" && result.action) {
    return createErrorResult(definition.name, definition.category, {
      code: "query_action_not_allowed",
      message: "Query 工具不能返回待确认动作。",
      recoverable: false,
    });
  }

  if (definition.category === "action" && !result.action?.requiresConfirmation) {
    return createErrorResult(definition.name, definition.category, {
      code: "action_confirmation_required",
      message: "Action 工具只能返回 requiresConfirmation=true 的待确认动作。",
      recoverable: false,
    });
  }

  return {
    ...result,
    toolName: definition.name,
    category: definition.category,
  };
}

function createErrorResult(
  toolName: string,
  category: ToolCategory | null,
  error: ToolResultError,
): ToolResult {
  return {
    ok: false,
    toolName,
    category,
    llmSummary: error.message,
    error,
  };
}

function formatZodError(error: ZodError): JsonValue {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    code: issue.code,
    message: issue.message,
  }));
}

function toListItem(
  definition: StoredToolDefinition,
  active: boolean,
): ToolListItem {
  return {
    name: definition.name,
    displayName: definition.displayName,
    description: definition.description,
    category: definition.category,
    parameters: definition.parameters,
    active,
  };
}
