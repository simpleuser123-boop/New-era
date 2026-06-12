import {
  buildSystemPromptForAgent,
  classifyAgentIntent,
  getAgentForRequest,
  type AgentDefinition,
  type AgentIntentClassification,
} from "../registry";
import {
  createAgentToolRegistry,
  queryToolNames,
  type ToolRegistry,
  type ToolResult,
  type ToolResultError,
} from "../tools";
import {
  callDeepSeekAgentStep,
  type DeepSeekClientError,
  type DeepSeekMessage,
} from "../../deepseek-client";
import { getDeepSeekFallbackMessage } from "../../deepseek-errors";
import type {
  AssistantAction,
  AssistantCitation,
  AssistantRequestContext,
  JsonValue,
} from "../../types";
import {
  agentLoopModelStepSchema,
  type AgentLoopEmit,
  type AgentLoopModelStep,
  type AgentLoopToolCall,
  type AgentRunInput,
  type AgentRunMemory,
  type AgentRunRequest,
} from "./types";

type AgentLoopLimits = {
  maxConsecutiveToolFailures: number;
  maxEmptyModelRetries: number;
  maxIterations: number;
  maxToolResultChars: number;
};

type AgentLoopOptions = {
  forceLocalFallback?: {
    fallbackCode: string;
    fallbackMessage: string;
    warning: string;
  };
  limits?: Partial<AgentLoopLimits>;
  modelTimeoutMs?: number;
  now?: string;
  signal?: AbortSignal;
  toolMode?: "all" | "query-only";
};

type ExecutedToolResult = {
  action?: AssistantAction;
  category: ToolResult["category"];
  citations: AssistantCitation[];
  data?: JsonValue;
  error?: ToolResultError;
  name: string;
  ok: boolean;
  summary: string;
};

type AgentLoopState = {
  citations: AssistantCitation[];
  consecutiveToolFailures: number;
  done: boolean;
  emptyModelResponses: number;
  iterations: number;
  toolResults: ExecutedToolResult[];
  warnings: string[];
};

const DEFAULT_LIMITS: AgentLoopLimits = {
  maxConsecutiveToolFailures: 2,
  maxEmptyModelRetries: 2,
  maxIterations: 5,
  maxToolResultChars: 4_000,
};

const AGENT_MODEL_TIMEOUT_MS = 24_000;
const AGENT_MODEL_MAX_TOKENS = 1_600;
const MAX_SUMMARY_LENGTH = 1_200;
const TEXT_STREAM_CHUNK_SIZE = 28;
const TEXT_STREAM_DELAY_MS = 12;
const QUERY_TOOL_NAME_SET = new Set<string>(queryToolNames);

export async function runAgentLoop(
  input: AgentRunInput,
  emit: AgentLoopEmit,
  options: AgentLoopOptions = {},
): Promise<void> {
  const limits = {
    ...DEFAULT_LIMITS,
    ...(options.limits ?? {}),
  };
  const request = normalizeRunRequest(input);
  const state = createInitialState();

  await emit({ phase: "routing", type: "phase" });

  const routing = classifyAgentIntent(request);
  const agent = getAgentForRequest(request, routing);
  const registry = createAgentToolRegistry(
    getActiveToolNamesForMode(agent, options.toolMode ?? "all"),
  );

  await emit({
    agentId: agent.id,
    confidence: routing.confidence,
    label: agent.name,
    reason: routing.reason,
    type: "agent_selected",
  });
  await emit({ phase: "understanding", type: "phase" });

  if (options.forceLocalFallback) {
    await emitForcedLocalFallback(options.forceLocalFallback, emit, state);
    await finalizeLocalResponse(request, agent, state, emit);
    return;
  }

  const requiredToolCall = pickRequiredToolCall(request, agent, {
    allowActionTools: options.toolMode !== "query-only",
  });

  if (requiredToolCall) {
    await emit({ phase: "executing", type: "phase" });
    await executeToolCall(requiredToolCall, {
      agent,
      emit,
      limits,
      now: options.now,
      registry,
      state,
    });

    if (state.consecutiveToolFailures >= limits.maxConsecutiveToolFailures) {
      await finalizeLocalResponse(request, agent, state, emit, [
        "连续工具失败达到上限，已停止 Agent Loop。",
      ]);
      return;
    }
  }

  while (!state.done && state.iterations < limits.maxIterations) {
    if (options.signal?.aborted) {
      await emit({
        error: {
          code: "AGENT_RUN_ABORTED",
          message: "Agent Loop 请求已取消。",
        },
        type: "error",
      });
      state.done = true;
      return;
    }

    await emit({ phase: "understanding", type: "phase" });

    const stepDone = await runModelStep({
      agent,
      emit,
      limits,
      now: options.now,
      modelTimeoutMs: options.modelTimeoutMs,
      registry,
      request,
      routing,
      signal: options.signal,
      state,
    });

    if (stepDone) {
      return;
    }
  }

  if (!state.done) {
    await finalizeLocalResponse(request, agent, state, emit, [
      `已达到最大迭代数 ${limits.maxIterations}，服务端已停止继续调用工具。`,
    ]);
  }
}

function createInitialState(): AgentLoopState {
  return {
    citations: [],
    consecutiveToolFailures: 0,
    done: false,
    emptyModelResponses: 0,
    iterations: 0,
    toolResults: [],
    warnings: [],
  };
}

function normalizeRunRequest(input: AgentRunInput): AgentRunRequest {
  const context = compactContext(input.context);

  return {
    ...(context ? { context } : {}),
    ...(Array.isArray(input.memory) && input.memory.length > 0
      ? { memory: input.memory }
      : {}),
    message: input.message,
    ...(input.source ? { source: input.source } : {}),
  };
}

function compactContext(
  context: AgentRunInput["context"],
): AssistantRequestContext | undefined {
  if (!context) {
    return undefined;
  }

  const compacted: AssistantRequestContext = {};

  if (context.applicationId) {
    compacted.applicationId = context.applicationId;
  }

  if (context.reportId) {
    compacted.reportId = context.reportId;
  }

  if (context.resumeId) {
    compacted.resumeId = context.resumeId;
  }

  if (context.sessionId) {
    compacted.sessionId = context.sessionId;
  }

  return Object.keys(compacted).length > 0 ? compacted : undefined;
}

async function runModelStep({
  agent,
  emit,
  limits,
  modelTimeoutMs,
  now,
  registry,
  request,
  routing,
  signal,
  state,
}: {
  agent: AgentDefinition;
  emit: AgentLoopEmit;
  limits: AgentLoopLimits;
  now?: string;
  modelTimeoutMs?: number;
  registry: ToolRegistry;
  request: AgentRunRequest;
  routing: AgentIntentClassification;
  signal?: AbortSignal;
  state: AgentLoopState;
}): Promise<boolean> {
  const answerStream = createAgentAnswerStream(emit);
  const modelResult = await callDeepSeekAgentStep(
    buildModelMessages(request, agent, routing, registry, state),
    {
      maxTokens: AGENT_MODEL_MAX_TOKENS,
      onContentDelta: (content) => answerStream.push(content),
      signal,
      temperature: 0.1,
      timeoutMs: modelTimeoutMs ?? AGENT_MODEL_TIMEOUT_MS,
    },
  );

  if (!modelResult.ok) {
    await answerStream.reset();
    await emitDeepSeekFallback(modelResult.error, emit, state);
    await finalizeLocalResponse(request, agent, state, emit);
    return true;
  }

  const parsedStep = parseModelStep(modelResult.data);

  if (!parsedStep) {
    await answerStream.reset();
    state.emptyModelResponses += 1;

    if (state.emptyModelResponses <= limits.maxEmptyModelRetries) {
      state.warnings.push(
        `模型第 ${state.emptyModelResponses} 次没有返回有效 answer 或 toolCall，已重试。`,
      );
      return false;
    }

    await finalizeLocalResponse(request, agent, state, emit, [
      "模型连续返回空结果，已停止 Agent Loop 并使用本地规则回退。",
    ]);
    return true;
  }

  state.emptyModelResponses = 0;

  if (parsedStep.toolCall) {
    await answerStream.reset();
    await emit({ phase: "executing", type: "phase" });
    await executeToolCall(parsedStep.toolCall, {
      agent,
      emit,
      limits,
      now,
      registry,
      state,
    });

    if (state.consecutiveToolFailures >= limits.maxConsecutiveToolFailures) {
      await finalizeLocalResponse(request, agent, state, emit, [
        "连续工具失败达到上限，已停止 Agent Loop。",
      ]);
      return true;
    }

    return false;
  }

  if (parsedStep.answer) {
    await finalizeModelResponse(parsedStep, state, emit, answerStream);
    return true;
  }

  await answerStream.reset();
  state.emptyModelResponses += 1;

  if (state.emptyModelResponses <= limits.maxEmptyModelRetries) {
    return false;
  }

  await finalizeLocalResponse(request, agent, state, emit, [
    "模型没有返回回答或工具调用，已使用本地规则回退。",
  ]);
  return true;
}

function parseModelStep(data: JsonValue): AgentLoopModelStep | null {
  const parsed = agentLoopModelStepSchema.safeParse(data);

  if (!parsed.success) {
    return null;
  }

  if (!parsed.data.answer && !parsed.data.toolCall) {
    return null;
  }

  return parsed.data;
}

async function executeToolCall(
  toolCall: AgentLoopToolCall,
  {
    agent,
    emit,
    limits,
    now,
    registry,
    state,
  }: {
    agent: AgentDefinition;
    emit: AgentLoopEmit;
    limits: AgentLoopLimits;
    now?: string;
    registry: ToolRegistry;
    state: AgentLoopState;
  },
): Promise<void> {
  if (state.iterations >= limits.maxIterations) {
    state.warnings.push(
      `工具 ${toolCall.name} 未执行：已达到最大迭代数 ${limits.maxIterations}。`,
    );
    return;
  }

  state.iterations += 1;

  const definition = registry.get(toolCall.name);

  await emit({
    category: definition?.category ?? null,
    iteration: state.iterations,
    name: toolCall.name,
    params: toolCall.params,
    type: "tool_call",
  });

  const result = await registry.execute(toolCall.name, toolCall.params, {
    metadata: {
      agentId: agent.id,
      agentName: agent.name,
    },
    now,
    requestId: `agent-loop-${Date.now()}-${state.iterations}`,
  });
  const executed = normalizeExecutedToolResult(result, limits.maxToolResultChars);

  state.toolResults.push(executed);

  if (result.ok) {
    state.consecutiveToolFailures = 0;
    state.citations = mergeCitations(state.citations, result.citations ?? []);
  } else {
    state.consecutiveToolFailures += 1;
    state.warnings.push(
      `工具 ${result.toolName} 执行失败：${result.error.message}`,
    );
  }

  await emit({
    category: result.category,
    citations: result.citations,
    error: result.ok ? undefined : result.error,
    iteration: state.iterations,
    name: result.toolName,
    ok: result.ok,
    summary: executed.summary,
    type: "tool_result",
  });

  const proposal = result.ok && result.action ? getActionProposal(result.action) : null;

  if (proposal) {
    await emit({
      actionId: proposal.actionId,
      label: proposal.label,
      type: "action_proposed",
    });
  }
}

function normalizeExecutedToolResult(
  result: ToolResult,
  maxToolResultChars: number,
): ExecutedToolResult {
  return {
    ...(result.ok && result.action ? { action: result.action } : {}),
    category: result.category,
    citations: result.citations ?? [],
    ...(result.ok && result.data !== undefined
      ? { data: truncateJsonValue(result.data, maxToolResultChars) }
      : {}),
    ...(!result.ok ? { error: result.error } : {}),
    name: result.toolName,
    ok: result.ok,
    summary: truncateText(result.llmSummary, MAX_SUMMARY_LENGTH),
  };
}

async function finalizeModelResponse(
  step: AgentLoopModelStep,
  state: AgentLoopState,
  emit: AgentLoopEmit,
  answerStream: AgentAnswerStream,
): Promise<void> {
  const citations = mergeCitations(step.citations, state.citations);
  const warnings = uniqueStrings([...state.warnings, ...step.warnings]).slice(0, 12);
  const answer = truncateText(step.answer ?? "", 8_000);
  const streamed = await answerStream.finish(answer);

  if (!streamed) {
    await emit({ phase: "verifying", type: "phase" });
    await emit({ phase: "responding", type: "phase" });
    await emitTextStream(answer, emit);
  }

  await emit({
    citations,
    type: "done",
    warnings,
  });

  state.done = true;
}

type AgentAnswerStream = {
  finish: (answer: string) => Promise<boolean>;
  push: (content: string) => Promise<void>;
  reset: () => Promise<void>;
};

function createAgentAnswerStream(emit: AgentLoopEmit): AgentAnswerStream {
  let rawContent = "";
  let emittedContent = "";

  return {
    async finish(answer) {
      if (!emittedContent) {
        return false;
      }

      if (!answer.startsWith(emittedContent)) {
        await emit({
          content: "",
          type: "text_reset",
        });
        rawContent = "";
        emittedContent = "";
        return false;
      }

      const remaining = answer.slice(emittedContent.length);

      if (remaining) {
        await emit({
          content: remaining,
          type: "text",
        });
        emittedContent = answer;
      }

      return true;
    },
    async push(content) {
      rawContent += content;

      const answer = extractStreamingAnswer(rawContent);

      if (!answer || !answer.startsWith(emittedContent)) {
        return;
      }

      const safeValue = trimDanglingHighSurrogate(answer);
      const nextContent = safeValue.slice(emittedContent.length);

      if (!nextContent) {
        return;
      }

      if (!emittedContent) {
        await emit({ phase: "verifying", type: "phase" });
        await emit({ phase: "responding", type: "phase" });
      }

      await emit({
        content: nextContent,
        type: "text",
      });
      emittedContent = safeValue;
    },
    async reset() {
      if (!emittedContent) {
        return;
      }

      await emit({
        content: "",
        type: "text_reset",
      });
      rawContent = "";
      emittedContent = "";
    },
  };
}

function extractStreamingAnswer(content: string): string | null {
  const match = content.match(/^\s*\{\s*"answer"\s*:\s*"/u);

  if (!match) {
    return null;
  }

  return readJsonStringPrefix(content, match[0].length);
}

function readJsonStringPrefix(
  content: string,
  start: number,
): string {
  let value = "";

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];

    if (char === '"') {
      return value;
    }

    if (char !== "\\") {
      value += char;
      continue;
    }

    const escaped = content[index + 1];

    if (escaped === undefined) {
      break;
    }

    if (escaped === "u") {
      const hex = content.slice(index + 2, index + 6);

      if (!/^[\da-f]{4}$/iu.test(hex)) {
        break;
      }

      value += String.fromCharCode(Number.parseInt(hex, 16));
      index += 5;
      continue;
    }

    const escapeValues: Record<string, string> = {
      '"': '"',
      "\\": "\\",
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
    };
    const decoded = escapeValues[escaped];

    if (decoded === undefined) {
      break;
    }

    value += decoded;
    index += 1;
  }

  return value;
}

function trimDanglingHighSurrogate(value: string): string {
  const lastCodeUnit = value.charCodeAt(value.length - 1);

  return lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff
    ? value.slice(0, -1)
    : value;
}

async function finalizeLocalResponse(
  request: AgentRunRequest,
  agent: AgentDefinition,
  state: AgentLoopState,
  emit: AgentLoopEmit,
  extraWarnings: string[] = [],
): Promise<void> {
  await emit({ phase: "verifying", type: "phase" });

  const warnings = uniqueStrings([
    ...state.warnings,
    ...extraWarnings,
    ...(state.toolResults.some((result) => result.action)
      ? ["待确认动作需要用户手动确认；确认前不会修改业务表。"]
      : []),
  ]).slice(0, 12);

  await emit({ phase: "responding", type: "phase" });
  await emitTextStream(buildLocalAnswer(request, agent, state), emit);
  await emit({
    citations: state.citations,
    type: "done",
    warnings,
  });

  state.done = true;
}

async function emitTextStream(
  content: string,
  emit: AgentLoopEmit,
): Promise<void> {
  const chunks = splitTextForStreaming(content);

  for (const chunk of chunks) {
    await emit({
      content: chunk,
      type: "text",
    });

    await delay(TEXT_STREAM_DELAY_MS);
  }
}

function splitTextForStreaming(content: string): string[] {
  const chunks: string[] = [];
  let buffer = "";

  for (const char of content) {
    buffer += char;

    if (buffer.length >= TEXT_STREAM_CHUNK_SIZE || /[。！？；\n]/u.test(char)) {
      chunks.push(buffer);
      buffer = "";
    }
  }

  if (buffer.length > 0) {
    chunks.push(buffer);
  }

  return chunks;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function emitDeepSeekFallback(
  error: DeepSeekClientError,
  emit: AgentLoopEmit,
  state: AgentLoopState,
): Promise<void> {
  const fallbackMessage = getDeepSeekFallbackMessage(error.code);

  state.warnings.push(
    "AI 助手暂时无法完成增强回答，已根据当前可用信息给出保守建议。",
  );

  await emit({
    fallbackCode: error.code,
    fallbackMessage,
    fallbackUsed: true,
    provider: "local_fallback",
    type: "fallback",
  });
}

async function emitForcedLocalFallback(
  fallback: NonNullable<AgentLoopOptions["forceLocalFallback"]>,
  emit: AgentLoopEmit,
  state: AgentLoopState,
): Promise<void> {
  state.warnings.push(fallback.warning);

  await emit({
    fallbackCode: fallback.fallbackCode,
    fallbackMessage: fallback.fallbackMessage,
    fallbackUsed: true,
    provider: "local_fallback",
    type: "fallback",
  });
}

function buildModelMessages(
  request: AgentRunRequest,
  agent: AgentDefinition,
  routing: AgentIntentClassification,
  registry: ToolRegistry,
  state: AgentLoopState,
): DeepSeekMessage[] {
  return [
    {
      content: [
        buildSystemPromptForAgent(agent),
        "你在服务端 Agent ReAct Loop 中工作。每一轮只能返回一个严格 JSON object。",
        "如果需要读取数据或创建待确认动作，返回 {\"toolCall\":{\"name\":\"工具名\",\"params\":{...}},\"warnings\":[]}。",
        "如果已有足够信息，返回 {\"answer\":\"中文回答\",\"citations\":[...],\"warnings\":[...]}。",
        "回答时 answer 必须是 JSON 对象的第一个字段；工具调用时 toolCall 必须是第一个字段；answer 和 toolCall 只能二选一。",
        "不要返回 Markdown 代码块，不要返回自然语言包裹 JSON。",
        "只能调用工具白名单中的工具；Action 工具只能创建待确认动作，不能说成已经写入业务表。",
        "web_search 是只读联网搜索工具，只能用于获取公开网页摘要和 URL，不能写入本地数据，也不能声称已访问招聘平台账号。",
        "不要声称已自动投递、已联系 HR、已访问招聘平台或已保存用户长期数据。",
      ].join("\n"),
      role: "system",
    },
    {
      content: [
        `用户问题：${request.message}`,
        "请求上下文：",
        JSON.stringify(request.context ?? {}, null, 2),
        "路由结果：",
        JSON.stringify(routing, null, 2),
        "可用工具：",
        JSON.stringify(registry.list({ activeOnly: true }), null, 2),
        "可见记忆：",
        JSON.stringify(request.memory ?? [], null, 2),
        "已执行工具结果：",
        JSON.stringify(state.toolResults, null, 2),
      ].join("\n"),
      role: "user",
    },
  ];
}

function pickRequiredToolCall(
  request: AgentRunRequest,
  agent: AgentDefinition,
  options: {
    allowActionTools: boolean;
  } = { allowActionTools: true },
): AgentLoopToolCall | null {
  const message = normalizeText(request.message);

  if (hasNoToolIntent(message)) {
    return null;
  }

  if (includesAny(message, ["不存在的工具", "未注册工具", "工具失败", "tool failure"])) {
    return {
      name: "missing_agent_tool",
      params: {},
    };
  }

  const actionToolCall = options.allowActionTools
    ? pickActionToolCall(request, message)
    : null;

  if (actionToolCall) {
    return actionToolCall;
  }

  if (hasWebSearchIntent(message)) {
    return {
      name: "web_search",
      params: {
        limit: 5,
        query: request.message,
      },
    };
  }

  if (request.context?.applicationId) {
    return {
      name: "get_application_detail",
      params: {
        applicationId: request.context.applicationId,
      },
    };
  }

  if (
    request.context?.reportId &&
    agent.id === "interview-agent" &&
    includesAny(message, ["面试", "star", "追问", "自我介绍"])
  ) {
    return {
      name: "build_interview_prep_context",
      params: {
        query: request.message,
        reportId: request.context.reportId,
        ...(request.context.resumeId ? { resumeId: request.context.resumeId } : {}),
      },
    };
  }

  if (request.context?.reportId) {
    return {
      name: "get_report_detail",
      params: {
        reportId: request.context.reportId,
      },
    };
  }

  if (request.context?.resumeId) {
    return {
      name: "list_resumes",
      params: {
        limit: 10,
      },
    };
  }

  switch (agent.id) {
    case "career-agent":
      return {
        name: "get_career_profile",
        params: {},
      };
    case "evaluate-agent":
      return {
        name: "search_reports",
        params: {
          limit: 8,
          query: request.message,
        },
      };
    case "interview-agent":
      return {
        name: "build_interview_prep_context",
        params: {
          query: request.message,
        },
      };
    case "resume-agent":
      return {
        name: "get_default_resume",
        params: {},
      };
    case "tracker-agent":
      return {
        name: "list_applications",
        params: {
          limit: 8,
          query: request.message,
        },
      };
    case "general-agent":
      if (includesAny(message, ["概览", "复盘", "统计", "本地数据"])) {
        return {
          name: "get_analytics_overview",
          params: {},
        };
      }
      return null;
  }
}

function pickActionToolCall(
  request: AgentRunRequest,
  message: string,
): AgentLoopToolCall | null {
  const applicationId = request.context?.applicationId;

  if (
    applicationId &&
    includesAny(message, ["改成", "改为", "更新为", "标记为", "设置为", "变成", "已投递"])
  ) {
    const status = pickApplicationStatus(message);

    return {
      name: "propose_application_status_update",
      params: {
        applicationId,
        reason: `用户请求将 Tracker #${applicationId} 状态调整为 ${status}。`,
        riskNote: "确认后会更新本地 Tracker 状态并写入状态变更时间线。",
        status,
        title: "更新 Tracker 状态",
      },
    };
  }

  if (
    applicationId &&
    includesAny(message, ["新增跟进", "记录跟进", "安排跟进", "添加备注"])
  ) {
    return {
      name: "propose_follow_up_event",
      params: {
        applicationId,
        eventTitle: "跟进记录",
        eventType: includesAny(message, ["备注", "note"]) ? "note_added" : "follow_up_scheduled",
        note: request.message,
        reason: `用户请求为 Tracker #${applicationId} 创建跟进时间线事件。`,
        riskNote: "确认后会在本地 Tracker 时间线新增一条事件。",
        title: "新增 Tracker 跟进事件",
      },
    };
  }

  if (
    request.context?.reportId &&
    includesAny(message, ["开始面试准备", "创建面试准备", "新建面试准备"])
  ) {
    return {
      name: "propose_interview_session_start",
      params: {
        mode: "mixed",
        reason: `用户请求基于报告 #${request.context.reportId} 创建面试准备会话。`,
        reportId: request.context.reportId,
        ...(request.context.resumeId ? { resumeId: request.context.resumeId } : {}),
        riskNote: "确认后才会创建本地面试准备会话。",
        title: "创建面试准备会话",
      },
    };
  }

  return null;
}

function pickApplicationStatus(message: string) {
  if (includesAny(message, ["面试中", "interviewing", "面试"])) {
    return "interviewing";
  }

  if (includesAny(message, ["offer", "录用", "收到 offer"])) {
    return "offer_received";
  }

  if (includesAny(message, ["拒绝", "rejected"])) {
    return "rejected";
  }

  if (includesAny(message, ["放弃", "abandoned"])) {
    return "abandoned";
  }

  if (includesAny(message, ["待投递", "to_apply"])) {
    return "to_apply";
  }

  return "applied";
}

function buildLocalAnswer(
  request: AgentRunRequest,
  agent: AgentDefinition,
  state: AgentLoopState,
): string {
  const successfulResults = state.toolResults.filter((result) => result.ok);
  const failedResults = state.toolResults.filter((result) => !result.ok);
  const proposedActions = successfulResults.flatMap((result) =>
    result.action ? [result.action] : [],
  );

  if (proposedActions.length > 0) {
    return [
      `已由 ${agent.name} 创建待确认动作：`,
      ...proposedActions.map((action) => `- ${action.label}`),
      "这些动作仍处于待确认状态，用户确认前不会修改 applications、settings、resumes 或 interview_sessions 等业务表。",
    ].join("\n");
  }

  if (successfulResults.length > 0) {
    return [
      `${agent.name} 已读取允许的上下文，并基于工具结果给出保守总结：`,
      ...formatInjectedMemoryNotes(request.memory),
      ...successfulResults.map((result) => `- ${result.summary}`),
      "建议下一步先确认内容，再决定是否创建待确认动作。",
    ].join("\n");
  }

  if (failedResults.length > 0) {
    return [
      `${agent.name} 没有成功完成工具调用，本次没有写入任何业务数据。`,
      ...formatInjectedMemoryNotes(request.memory),
      ...failedResults.map((result) => `- ${result.name}: ${result.summary}`),
      "可以换一个更具体的问题，或补充 reportId、applicationId、resumeId 后重试。",
    ].join("\n");
  }

  return [
    `已由 ${agent.name} 处理。当前只给出基础建议。`,
    `你的问题是：${request.message}`,
    ...formatInjectedMemoryNotes(request.memory),
    "当前没有必要读取具体本地数据；如果需要报告、Tracker、简历或 Career DNA 分析，请补充对应上下文或直接说明要分析的对象。",
  ].join("\n");
}

function hasWebSearchIntent(message: string): boolean {
  return includesAny(message, [
    "联网",
    "网页",
    "外部",
    "公开信息",
    "公开资料",
    "官网",
    "新闻",
    "全网",
    "最新",
    "实时",
    "搜索一下",
    "搜一下",
    "web search",
    "internet",
    "online",
    "latest",
    "news",
  ]);
}

function formatInjectedMemoryNotes(memory: AgentRunMemory[] | undefined): string[] {
  if (!memory || memory.length === 0) {
    return [];
  }

  return [
    "本次已注入未删除的可见记忆：",
    ...memory.map(
      (item) =>
        `- [${item.memoryType}] ${truncateText(item.content, 220)}`,
    ),
  ];
}

function getActionProposal(
  action: AssistantAction,
): { actionId: number; label: string } | null {
  const proposalId = action.payload.proposalId;

  if (typeof proposalId !== "number" || !Number.isSafeInteger(proposalId)) {
    return null;
  }

  return {
    actionId: proposalId,
    label: action.label,
  };
}

function truncateJsonValue(value: JsonValue, maxChars: number): JsonValue {
  const serialized = JSON.stringify(value);

  if (serialized.length <= maxChars) {
    return value;
  }

  return {
    preview: serialized.slice(0, maxChars),
    truncated: true,
    originalLength: serialized.length,
  };
}

function mergeCitations(
  primary: AssistantCitation[],
  secondary: AssistantCitation[],
): AssistantCitation[] {
  const seen = new Set<string>();
  const result: AssistantCitation[] = [];

  for (const citation of [...primary, ...secondary]) {
    const key = `${citation.type}:${citation.id ?? citation.label}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(citation);
  }

  return result.slice(0, 20);
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

function hasNoToolIntent(message: string): boolean {
  return includesAny(message, ["不需要读取", "不用工具", "不要调用工具", "无需工具"]);
}

function includesAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(normalizeText(needle)));
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

function getActiveToolNamesForMode(
  agent: AgentDefinition,
  mode: NonNullable<AgentLoopOptions["toolMode"]>,
): readonly string[] {
  if (mode === "all") {
    return agent.toolNames;
  }

  return agent.toolNames.filter((toolName) => QUERY_TOOL_NAME_SET.has(toolName));
}
