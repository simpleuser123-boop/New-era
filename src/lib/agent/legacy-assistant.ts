import {
  buildAssistantLocalContext,
  buildLocalAssistantResponse,
  type AssistantLocalContext,
} from "../assistant-tools";
import { assistantResponseSchema } from "../schemas";
import type {
  AssistantAction,
  AssistantCitation,
  AssistantRequest,
  AssistantResponse,
} from "../types";
import {
  runAgentLoop,
  type AgentSseEvent,
} from "./loop";

type LegacyAssistantRunOptions = {
  forceLocalFallback?: boolean;
  modelTimeoutMs?: number;
};

type AgentRunCollectedEvents = {
  actions: AssistantAction[];
  answer: string;
  citations: AssistantCitation[];
  errors: string[];
  fallbackCode: string | null;
  fallbackMessage: string | null;
  warnings: string[];
};

const LEGACY_ASSISTANT_FALLBACK = {
  fallbackCode: "forced_local_fallback",
  fallbackMessage: "本次请求已使用基础回答模式。",
  fallbackReason: "smoke_forced_local_fallback",
  warning: "本次请求已使用基础回答模式。",
} as const;

export async function runLegacyAssistantResponse(
  request: AssistantRequest,
  options: LegacyAssistantRunOptions = {},
): Promise<AssistantResponse> {
  const localContext = buildAssistantLocalContext(request);

  if (options.forceLocalFallback) {
    return buildLocalAssistantResponse(
      localContext,
      [LEGACY_ASSISTANT_FALLBACK.warning],
      LEGACY_ASSISTANT_FALLBACK,
    );
  }

  const collected = createCollectedEvents(localContext);

  await runAgentLoop(
    {
      context: request.context,
      message: request.message,
      source: "legacy-assistant-json",
    },
    (event) => collectAgentEvent(event, collected),
    {
      modelTimeoutMs: options.modelTimeoutMs,
      toolMode: "query-only",
    },
  );

  return toLegacyAssistantResponse(collected, localContext);
}

function createCollectedEvents(
  localContext: AssistantLocalContext,
): AgentRunCollectedEvents {
  return {
    actions: localContext.suggestedActions,
    answer: "",
    citations: [],
    errors: [],
    fallbackCode: null,
    fallbackMessage: null,
    warnings: [],
  };
}

function collectAgentEvent(
  event: AgentSseEvent,
  collected: AgentRunCollectedEvents,
) {
  if (event.type === "text") {
    collected.answer += event.content;
    return;
  }

  if (event.type === "text_reset") {
    collected.answer = event.content;
    return;
  }

  if (event.type === "tool_result") {
    collected.citations = mergeCitations(
      collected.citations,
      event.citations ?? [],
    );
    return;
  }

  if (event.type === "fallback") {
    collected.fallbackCode = event.fallbackCode;
    collected.fallbackMessage = event.fallbackMessage;
    collected.warnings = uniqueStrings([
      ...collected.warnings,
      "AI 助手暂时无法完成增强回答，已根据当前可用信息给出保守建议。",
    ]);
    return;
  }

  if (event.type === "done") {
    collected.citations = mergeCitations(collected.citations, event.citations);
    collected.warnings = uniqueStrings([...collected.warnings, ...event.warnings]);
    return;
  }

  if (event.type === "error") {
    collected.errors.push(event.error.message);
  }
}

function toLegacyAssistantResponse(
  collected: AgentRunCollectedEvents,
  localContext: AssistantLocalContext,
): AssistantResponse {
  const fallbackCode = collected.fallbackCode;
  const fallbackMessage = collected.fallbackMessage;
  const fallbackUsed = Boolean(fallbackCode);
  const answer = collected.answer.trim() || buildLocalAssistantResponse(localContext).answer;
  const warnings = uniqueStrings([
    ...localContext.warnings,
    ...collected.warnings,
    ...collected.errors.map((error) => `Agent JSON 兼容层错误：${error}`),
    "Legacy /api/assistant 仅用于旧 JSON 兼容；/assistant 页面主链路是 /api/agent/run。",
  ]).slice(0, 12);

  return assistantResponseSchema.parse({
    actions: collected.actions,
    answer,
    citations: mergeCitations(collected.citations, localContext.citations),
    fallbackCode,
    fallbackMessage,
    fallbackReason: fallbackUsed ? "deepseek_unavailable" : null,
    fallbackUsed,
    provider: fallbackUsed ? "local_fallback" : "deepseek_enhanced",
    warnings,
  });
}

function mergeCitations(
  primary: AssistantCitation[],
  secondary: AssistantCitation[],
): AssistantCitation[] {
  const seen = new Set<string>();
  const result: AssistantCitation[] = [];

  for (const citation of [...primary, ...secondary, createLegacyFallbackCitation()]) {
    const key = `${citation.type}:${citation.id ?? citation.label}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(citation);
  }

  return result.slice(0, 20);
}

function createLegacyFallbackCitation(): AssistantCitation {
  return {
    id: "legacy-assistant-json",
    label: "Legacy Assistant JSON 兼容层",
    type: "analytics",
  };
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLocaleLowerCase();

    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}
