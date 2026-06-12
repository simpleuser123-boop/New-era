import type { z } from "zod";

import type {
  AssistantAction,
  AssistantCitation,
  DateTimeString,
  JsonObject,
  JsonValue,
} from "../../types";

export type ToolCategory = "query" | "action";

export type ToolParameterType =
  | "array"
  | "boolean"
  | "integer"
  | "number"
  | "object"
  | "string";

export type ToolParameter = {
  type: ToolParameterType;
  description: string;
  required?: boolean;
  enum?: readonly string[];
};

export type AgentToolContext = {
  activeToolNames?: readonly string[];
  metadata?: JsonObject;
  now?: DateTimeString;
  requestId?: string;
};

export type ToolResultError = {
  code: string;
  message: string;
  recoverable: boolean;
  details?: JsonValue;
};

export type ToolHandlerSuccessResult<TData extends JsonValue = JsonValue> = {
  ok: true;
  data?: TData;
  llmSummary: string;
  citations?: AssistantCitation[];
  action?: AssistantAction;
};

export type ToolHandlerErrorResult = {
  ok: false;
  llmSummary: string;
  citations?: AssistantCitation[];
  error: ToolResultError;
};

export type ToolHandlerResult<TData extends JsonValue = JsonValue> =
  | ToolHandlerSuccessResult<TData>
  | ToolHandlerErrorResult;

export type ToolResult<TData extends JsonValue = JsonValue> =
  ToolHandlerResult<TData> & {
    toolName: string;
    category: ToolCategory | null;
  };

export type ToolHandler<
  TParams = unknown,
  TData extends JsonValue = JsonValue,
> = (
  params: TParams,
  context: AgentToolContext,
) => Promise<ToolHandlerResult<TData>> | ToolHandlerResult<TData>;

export type ToolDefinition<
  TParams = unknown,
  TData extends JsonValue = JsonValue,
> = {
  name: string;
  displayName: string;
  description: string;
  category: ToolCategory;
  parameters: Record<string, ToolParameter>;
  parametersSchema: z.ZodType<TParams>;
  handler: ToolHandler<TParams, TData>;
};

export type ToolListItem = Omit<
  ToolDefinition<unknown, JsonValue>,
  "handler" | "parametersSchema"
> & {
  active: boolean;
};

export type ToolListOptions = {
  category?: ToolCategory;
  activeOnly?: boolean;
};
