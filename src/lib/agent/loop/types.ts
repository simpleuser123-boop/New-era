import { z } from "zod";

import {
  assistantCitationSchema,
  jsonObjectSchema,
} from "../../schemas";
import type {
  AssistantCitation,
  AssistantRequestContext,
  JsonObject,
  JsonValue,
} from "../../types";
import type { AgentId } from "../registry";
import type { ToolCategory } from "../tools";

const positiveIdSchema = z.coerce.number().int().positive();
const shortTextSchema = z.string().trim().min(1).max(240);

export const agentRunRequestSchema = z.strictObject({
  context: z
    .strictObject({
      applicationId: positiveIdSchema.optional(),
      reportId: positiveIdSchema.optional(),
      resumeId: positiveIdSchema.optional(),
      sessionId: positiveIdSchema.optional(),
    })
    .optional(),
  message: z
    .string()
    .trim()
    .min(1, { message: "请输入问题。" })
    .max(4_000, { message: "问题不能超过 4000 个字符。" }),
  source: z.string().trim().max(120).optional(),
});

export const agentLoopToolCallSchema = z.strictObject({
  name: z.string().trim().min(1).max(64),
  params: jsonObjectSchema.default({}),
});

export const agentLoopModelStepSchema = z.strictObject({
  answer: z
    .preprocess((value) => (value === null ? undefined : value), z.string().trim().min(1).max(8_000).optional()),
  citations: z.array(assistantCitationSchema).max(20).default([]),
  toolCall: z.preprocess(
    (value) => (value === null ? undefined : value),
    agentLoopToolCallSchema.optional(),
  ),
  warnings: z.array(shortTextSchema).max(12).default([]),
});

export type AgentRunMemory = {
  id: number;
  memoryType: "working_digest" | "episodic_summary" | "user_preference";
  content: string;
  source: string;
  updatedAt: string;
};

export type AgentRunInput = z.infer<typeof agentRunRequestSchema> & {
  memory?: AgentRunMemory[];
};

export type AgentRunRequest = {
  message: string;
  context?: AssistantRequestContext;
  memory?: AgentRunMemory[];
  source?: string;
};

export type AgentLoopToolCall = z.infer<typeof agentLoopToolCallSchema>;

export type AgentLoopModelStep = z.infer<typeof agentLoopModelStepSchema>;

export type AgentLoopPhase =
  | "routing"
  | "understanding"
  | "executing"
  | "verifying"
  | "responding";

export type AgentSseEvent =
  | {
      type: "phase";
      phase: AgentLoopPhase;
    }
  | {
      type: "agent_selected";
      agentId: AgentId;
      label: string;
      confidence: number;
      reason: string;
    }
  | {
      type: "tool_call";
      name: string;
      params: JsonObject;
      category?: ToolCategory | null;
      iteration: number;
    }
  | {
      type: "tool_result";
      name: string;
      ok: boolean;
      summary: string;
      category?: ToolCategory | null;
      citations?: AssistantCitation[];
      error?: {
        code: string;
        message: string;
        recoverable: boolean;
        details?: JsonValue;
      };
      iteration: number;
    }
  | {
      type: "action_proposed";
      actionId: number;
      label: string;
    }
  | {
      type: "fallback";
      provider: "local_fallback";
      fallbackUsed: true;
      fallbackCode: string;
      fallbackMessage: string;
    }
  | {
      type: "text";
      content: string;
    }
  | {
      type: "text_reset";
      content: string;
    }
  | {
      type: "done";
      citations: AssistantCitation[];
      warnings: string[];
    }
  | {
      type: "error";
      error: {
        code: string;
        message: string;
        details?: JsonValue;
      };
    };

export type AgentLoopEmit = (event: AgentSseEvent) => void | Promise<void>;
