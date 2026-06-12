"use client";

import Link from "next/link";
import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  CheckCircle2,
  CircleStop,
  GripHorizontal,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";

import {
  fetchAssistantContextData,
  type AssistantContextPanelData,
} from "@/components/features/assistant/AssistantControlPanels";
import { PageHeader } from "@/components/features/AppShell";
import { Button } from "@/components/ui/Button";
import {
  apiRequest,
  fetchApi,
  readApiErrorFromResponse,
  readErrorMessage,
} from "@/lib/api-client";
import type { AgentLoopPhase, AgentSseEvent } from "@/lib/agent/loop";
import type {
  AgentActionProposal,
  AgentSession,
  AgentSessionListItem,
  AgentSessionMessage,
  AssistantAction,
  AssistantCitation,
  JsonObject,
} from "@/lib/types";

type AgentActionsApiResponse = {
  ok: true;
  proposals: AgentActionProposal[];
  count: number;
  limit: number;
};

type AgentActionMutationResponse = {
  ok: true;
  proposal: AgentActionProposal;
  result?: JsonObject;
};

type AgentSessionsApiResponse = {
  ok: true;
  sessions: AgentSessionListItem[];
  count: number;
  limit: number;
};

type AgentSessionApiResponse = {
  ok: true;
  session: AgentSession;
};

type AgentSessionMutationResponse = {
  ok: true;
  session: AgentSession;
  sessionId?: number;
  deleted?: boolean;
};

type AgentToolCategory = "action" | "query";

type AgentToolActivity = {
  id: string;
  category: AgentToolCategory | null;
  citations: AssistantCitation[];
  errorMessage?: string;
  iteration: number;
  name: string;
  params: JsonObject;
  status: "error" | "running" | "success";
  summary?: string;
};

type AgentActionProposalCard = {
  actionId: number;
  detailError?: string;
  detailStatus: "error" | "loading" | "ready";
  label: string;
  proposal?: AgentActionProposal;
  status: AgentActionProposal["status"] | "confirming" | "dismissing" | "error";
};

type AgentRunState = {
  actions: AgentActionProposalCard[];
  agent?: {
    confidence: number;
    id: string;
    label: string;
    reason: string;
  };
  citations: AssistantCitation[];
  errorMessage?: string;
  fallbackMessage?: string;
  phase?: AgentLoopPhase;
  status: "cancelled" | "completed" | "error" | "running";
  tools: AgentToolActivity[];
  warnings: string[];
};

type AssistantChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  actions?: AssistantAction[];
  citations?: AssistantCitation[];
  createdAt: string;
  isError?: boolean;
  run?: AgentRunState;
  warnings?: string[];
};

type ContextPanelData = AssistantContextPanelData;
type LoadStatus = "loading" | "ready" | "error";
type MutationStatus = "idle" | "saving" | "error";

const SESSION_PANEL_DEFAULT_HEIGHT = 640;
const SESSION_PANEL_MAX_HEIGHT = 920;
const SESSION_PANEL_MIN_HEIGHT = 320;
const SESSION_PANEL_VIEWPORT_GUTTER = 56;

const QUICK_QUESTIONS = [
  "我现在最该跟进哪几个岗位？",
  "哪些岗位最符合我的 Career DNA？",
  "帮我解释最近高风险报告为什么风险高。",
  "这周求职漏斗怎么样？",
  "帮我为最近一个岗位准备面试问题。",
];

const ACTION_TYPE_LABELS: Record<AssistantAction["type"], string> = {
  confirm_agent_action_proposal: "确认 Agent 动作",
  create_follow_up_event: "新增跟进事件",
  edit_career_profile: "编辑 Career DNA",
  update_application_status: "更新 Tracker 状态",
};

const AGENT_PHASE_LABELS: Record<AgentLoopPhase, string> = {
  executing: "执行工具",
  responding: "生成回答",
  routing: "选择子 Agent",
  understanding: "理解问题",
  verifying: "校验结果",
};

const AGENT_ACTION_TYPE_LABELS: Record<AgentActionProposal["actionType"], string> = {
  propose_application_status_update: "Tracker 状态",
  propose_career_profile_patch: "Career DNA",
  propose_follow_up_event: "跟进事件",
  propose_interview_session_start: "面试准备",
  propose_resume_judge_feedback: "简历反馈",
};

export function AssistantWorkspace() {
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string>();
  const [contextStatus, setContextStatus] = useState<LoadStatus>("loading");
  const [contextData, setContextData] =
    useState<AssistantContextPanelData | null>(null);
  const [sessions, setSessions] = useState<AgentSessionListItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number>();
  const [sessionStatus, setSessionStatus] = useState<LoadStatus>("loading");
  const [sessionError, setSessionError] = useState<string>();
  const [sessionMutationStatus, setSessionMutationStatus] =
    useState<MutationStatus>("idle");
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<number>();
  const [deletingSessionId, setDeletingSessionId] = useState<number>();
  const activeControllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const latestAssistant = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant"),
    [messages],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadContextPanel(controller.signal);
    void bootstrapAgentSessions(controller.signal);

    return () => controller.abort();
    // Initial local context/session bootstrap should run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const messageList = messageListRef.current;

    if (!messageList) {
      return;
    }

    messageList.scrollTo({
      behavior: "smooth",
      top: messageList.scrollHeight,
    });
  }, [messages, isSending]);

  useEffect(() => {
    return () => {
      activeControllerRef.current?.abort();
    };
  }, []);

  async function loadContextPanel(signal?: AbortSignal) {
    setContextStatus("loading");

    try {
      const nextContextData = await fetchAssistantContextData(signal);

      if (signal?.aborted) {
        return;
      }

      setContextData(nextContextData);
      setContextStatus("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setContextData(null);
      setContextStatus("error");
    }
  }

  async function bootstrapAgentSessions(signal?: AbortSignal) {
    const loadedSessions = await loadAgentSessions(signal);

    if (signal?.aborted) {
      return;
    }

    if (loadedSessions.length > 0) {
      await selectAgentSession(loadedSessions[0].id, signal);
      return;
    }

    setActiveSessionId(undefined);
    setMessages([]);
  }

  async function loadAgentSessions(signal?: AbortSignal) {
    setSessionStatus("loading");
    setSessionError(undefined);

    try {
      const body = await apiRequest<AgentSessionsApiResponse>(
        "/api/agent/sessions?limit=30",
        {
          cache: "no-store",
          errorMessage: "Agent 会话列表读取失败，请稍后重试。",
          signal,
        },
      );

      if (signal?.aborted) {
        return [];
      }

      setSessions(body.sessions);
      setSessionStatus("ready");

      return body.sessions;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return [];
      }

      setSessions([]);
      setSessionError(readErrorMessage(error, "Agent 会话列表读取失败，请稍后重试。"));
      setSessionStatus("error");

      return [];
    }
  }

  async function selectAgentSession(sessionId: number, signal?: AbortSignal) {
    if (isSending) {
      return;
    }

    setActiveSessionId(sessionId);
    setSessionError(undefined);
    setPendingDeleteSessionId(undefined);

    try {
      const body = await apiRequest<AgentSessionApiResponse>(
        `/api/agent/sessions/${sessionId}`,
        {
          cache: "no-store",
          errorMessage: "Agent 会话读取失败，请稍后重试。",
          signal,
        },
      );

      if (signal?.aborted) {
        return;
      }

      setMessages(body.session.messages.map(mapSessionMessageToChatMessage));
      updateSessionListItem(body.session);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setSessionError(readErrorMessage(error, "Agent 会话读取失败，请稍后重试。"));
    }
  }

  async function createAgentSessionForQuestion(question?: string) {
    setSessionMutationStatus("saving");
    setSessionError(undefined);
    setPendingDeleteSessionId(undefined);

    try {
      const body = await apiRequest<AgentSessionMutationResponse>(
        "/api/agent/sessions",
        {
          errorMessage: "Agent 会话创建失败，请稍后重试。",
          json: {
            title: buildSessionTitle(question),
          },
          method: "POST",
        },
      );

      setActiveSessionId(body.session.id);
      setMessages(body.session.messages.map(mapSessionMessageToChatMessage));
      updateSessionListItem(body.session);
      setSessionMutationStatus("idle");

      return body.session;
    } catch (error) {
      const message = readErrorMessage(error, "Agent 会话创建失败，请稍后重试。");

      setSessionError(message);
      setSessionMutationStatus("error");
      throw new Error(message);
    }
  }

  async function deleteAgentSessionById(sessionId: number) {
    if (isSending || deletingSessionId !== undefined) {
      return;
    }

    if (pendingDeleteSessionId !== sessionId) {
      setPendingDeleteSessionId(sessionId);
      setSessionError(undefined);
      return;
    }

    setDeletingSessionId(sessionId);
    setSessionError(undefined);

    try {
      const body = await apiRequest<AgentSessionMutationResponse>(
        `/api/agent/sessions/${sessionId}`,
        {
          errorMessage: "Agent 会话删除失败，请稍后重试。",
          method: "DELETE",
        },
      );
      const deletedSessionId = body.session.id;
      const remainingSessions = sessions.filter(
        (session) => session.id !== deletedSessionId,
      );

      setSessions(remainingSessions);
      setPendingDeleteSessionId(undefined);

      if (activeSessionId === deletedSessionId) {
        const nextSession = remainingSessions[0];

        if (nextSession) {
          await selectAgentSession(nextSession.id);
        } else {
          setActiveSessionId(undefined);
          setMessages([]);
        }
      }

      void loadContextPanel();
    } catch (error) {
      setSessionError(readErrorMessage(error, "Agent 会话删除失败，请稍后重试。"));
    } finally {
      setDeletingSessionId(undefined);
    }
  }

  async function ensureActiveAgentSession(question: string) {
    if (activeSessionId) {
      return activeSessionId;
    }

    const session = await createAgentSessionForQuestion(question);

    return session.id;
  }

  async function refreshActiveAgentSession(sessionId: number) {
    try {
      const body = await apiRequest<AgentSessionApiResponse>(
        `/api/agent/sessions/${sessionId}`,
        {
          cache: "no-store",
          errorMessage: "Agent 会话刷新失败，请稍后重试。",
        },
      );

      setMessages(body.session.messages.map(mapSessionMessageToChatMessage));
      updateSessionListItem(body.session);
    } catch {
      void loadAgentSessions();
    }
  }

  async function handleCreateNewSession() {
    if (isSending) {
      return;
    }

    setErrorMessage(undefined);
    setLastFailedQuestion(undefined);

    try {
      await createAgentSessionForQuestion();
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Agent 会话创建失败，请稍后重试。"));
    }
  }

  function updateSessionListItem(session: AgentSession) {
    const listItem = toSessionListItem(session);

    setSessions((current) => {
      const withoutCurrent = current.filter((item) => item.id !== session.id);

      return [listItem, ...withoutCurrent].sort((a, b) => {
        const bTime = Date.parse(b.updatedAt);
        const aTime = Date.parse(a.updatedAt);

        return bTime - aTime || b.id - a.id;
      });
    });
  }

  async function sendQuestion(question: string) {
    const normalized = question.trim();

    if (!normalized || isSending) {
      return;
    }

    let sessionId: number;

    try {
      sessionId = await ensureActiveAgentSession(normalized);
    } catch (error) {
      const message = readErrorMessage(error, "Agent 会话创建失败，请稍后重试。");

      setInput(normalized);
      setLastFailedQuestion(normalized);
      setErrorMessage(message);
      return;
    }

    const userMessage: AssistantChatMessage = {
      id: createMessageId("user"),
      role: "user",
      content: normalized,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage: AssistantChatMessage = {
      id: createMessageId("assistant-agent"),
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      run: createInitialAgentRun(),
    };
    const runId = runIdRef.current + 1;
    const controller = new AbortController();

    runIdRef.current = runId;
    activeControllerRef.current?.abort();
    activeControllerRef.current = controller;
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");
    setErrorMessage(undefined);
    setLastFailedQuestion(undefined);
    setIsSending(true);

    try {
      await runAgentStream(
        normalized,
        sessionId,
        assistantMessage.id,
        runId,
        controller.signal,
      );

      if (controller.signal.aborted) {
        markAgentRunCancelled(assistantMessage.id, normalized);
        return;
      }

      if (runIdRef.current !== runId) {
        return;
      }

      void loadContextPanel();
      void refreshActiveAgentSession(sessionId);
    } catch (error) {
      if (controller.signal.aborted || isAbortLikeError(error)) {
        markAgentRunCancelled(assistantMessage.id, normalized);
        return;
      }

      const message = readErrorMessage(error, "AI 助手回答失败，请稍后重试。");

      setInput(normalized);
      setLastFailedQuestion(normalized);
      setErrorMessage(message);
      updateAssistantMessage(assistantMessage.id, (current) => ({
        ...current,
        content: current.content.trim()
          ? current.content
          : `${message}\n\n问题已保留，可以直接重试。`,
        isError: true,
        run: {
          ...(current.run ?? createInitialAgentRun()),
          errorMessage: message,
          status: "error",
          warnings: uniqueStrings([
            ...(current.run?.warnings ?? []),
            "这次请求没有写入任何本地数据。",
          ]),
        },
        warnings: uniqueStrings([
          ...(current.warnings ?? []),
          "这次请求没有写入任何本地数据。",
        ]),
      }));
    } finally {
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }

      if (runIdRef.current === runId) {
        setIsSending(false);
      }
    }
  }

  function markAgentRunCancelled(messageId: string, question: string) {
    setInput(question);
    setLastFailedQuestion(question);
    setErrorMessage(undefined);
    updateAssistantMessage(messageId, (message) => ({
      ...message,
      content: message.content.trim()
        ? message.content
        : "已取消当前 Agent 请求。",
      run: {
        ...(message.run ?? createInitialAgentRun()),
        status: "cancelled",
        warnings: uniqueStrings([
          ...(message.run?.warnings ?? []),
          "请求已取消；取消后不会继续追加流式内容。",
          "这次请求没有写入任何本地数据。",
        ]),
      },
      warnings: uniqueStrings([
        ...(message.warnings ?? []),
        "这次请求没有写入任何本地数据。",
      ]),
    }));
  }

  async function runAgentStream(
    question: string,
    sessionId: number,
    assistantMessageId: string,
    runId: number,
    signal: AbortSignal,
  ) {
    const response = await fetchApi("/api/agent/run", {
      errorMessage: "Agent 流式接口暂不可用。",
      headers: {
        Accept: "text/event-stream",
      },
      json: {
        context: buildAgentRunContext(question, contextData, sessionId),
        message: question,
        source: "assistant",
      },
      method: "POST",
      signal,
      timeoutMs: 0,
    });
    const isSse = response.headers
      .get("Content-Type")
      ?.includes("text/event-stream");

    if (!response.ok && !isSse) {
      throw new Error(
        await readApiErrorFromResponse(response, "Agent 流式接口暂不可用。"),
      );
    }

    if (!response.body) {
      throw new Error("Agent 流式接口暂不可用。");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let receivedDone = false;
    const cancelReaderOnAbort = () => {
      void reader.cancel().catch(() => undefined);
    };

    if (signal.aborted) {
      await reader.cancel();
      reader.releaseLock();
      return;
    }

    signal.addEventListener("abort", cancelReaderOnAbort, { once: true });

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (signal.aborted || runIdRef.current !== runId) {
            return;
          }

          break;
        }

        if (runIdRef.current !== runId) {
          await reader.cancel();
          return;
        }

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        const events = buffer.split(/\n\n/);
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          const event = parseAgentSseEvent(rawEvent);

          if (!event) {
            continue;
          }

          if (handleAgentSseEvent(event, assistantMessageId, runId)) {
            receivedDone = true;
          }

          if (event.type === "error") {
            throw new Error(readAgentStreamErrorMessage(event));
          }
        }
      }

      const finalEvent = parseAgentSseEvent(buffer);

      if (finalEvent) {
        if (handleAgentSseEvent(finalEvent, assistantMessageId, runId)) {
          receivedDone = true;
        }

        if (finalEvent.type === "error") {
          throw new Error(readAgentStreamErrorMessage(finalEvent));
        }
      }

      if (!receivedDone) {
        throw new Error("Agent 流式响应未返回完成事件。");
      }
    } finally {
      signal.removeEventListener("abort", cancelReaderOnAbort);
      reader.releaseLock();
    }
  }

  function handleAgentSseEvent(
    event: AgentSseEvent,
    assistantMessageId: string,
    runId: number,
  ): boolean {
    if (runIdRef.current !== runId) {
      return false;
    }

    if (event.type === "phase") {
      updateAssistantMessage(assistantMessageId, (message) => ({
        ...message,
        run: {
          ...(message.run ?? createInitialAgentRun()),
          phase: event.phase,
          status: "running",
        },
      }));
      return false;
    }

    if (event.type === "agent_selected") {
      updateAssistantMessage(assistantMessageId, (message) => ({
        ...message,
        run: {
          ...(message.run ?? createInitialAgentRun()),
          agent: {
            confidence: event.confidence,
            id: event.agentId,
            label: event.label,
            reason: event.reason,
          },
        },
      }));
      return false;
    }

    if (event.type === "tool_call") {
      updateAssistantMessage(assistantMessageId, (message) => {
        const run = message.run ?? createInitialAgentRun();

        return {
          ...message,
          run: {
            ...run,
            tools: upsertToolCall(run.tools, event),
          },
        };
      });
      return false;
    }

    if (event.type === "tool_result") {
      updateAssistantMessage(assistantMessageId, (message) => {
        const run = message.run ?? createInitialAgentRun();
        const citations = mergeCitations(message.citations ?? [], event.citations ?? []);

        return {
          ...message,
          citations,
          run: {
            ...run,
            citations: mergeCitations(run.citations, event.citations ?? []),
            tools: upsertToolResult(run.tools, event),
          },
        };
      });
      return false;
    }

    if (event.type === "action_proposed") {
      updateAssistantMessage(assistantMessageId, (message) => {
        const run = message.run ?? createInitialAgentRun();

        return {
          ...message,
          run: {
            ...run,
            actions: upsertActionProposal(run.actions, {
              actionId: event.actionId,
              detailStatus: "loading",
              label: event.label,
              status: "pending",
            }),
          },
        };
      });
      void loadActionProposalDetail(assistantMessageId, event.actionId);
      return false;
    }

    if (event.type === "fallback") {
      updateAssistantMessage(assistantMessageId, (message) => {
        const run = message.run ?? createInitialAgentRun();
        const warning = "服务暂不可用，已生成可继续使用的回答。";

        return {
          ...message,
          run: {
            ...run,
            fallbackMessage: event.fallbackMessage,
            warnings: uniqueStrings([...run.warnings, warning]),
          },
          warnings: uniqueStrings([...(message.warnings ?? []), warning]),
        };
      });
      return false;
    }

    if (event.type === "text") {
      updateAssistantMessage(assistantMessageId, (message) => ({
        ...message,
        content: `${message.content}${event.content}`,
      }));
      return false;
    }

    if (event.type === "text_reset") {
      updateAssistantMessage(assistantMessageId, (message) => ({
        ...message,
        content: event.content,
      }));
      return false;
    }

    if (event.type === "done") {
      updateAssistantMessage(assistantMessageId, (message) => {
        const run = message.run ?? createInitialAgentRun();
        const citations = mergeCitations(message.citations ?? [], event.citations);
        const warnings = uniqueStrings([...(message.warnings ?? []), ...event.warnings]);

        return {
          ...message,
          citations,
          run: {
            ...run,
            citations: mergeCitations(run.citations, event.citations),
            status: "completed",
            warnings,
          },
          warnings,
        };
      });
      return true;
    }

    return false;
  }

  async function loadActionProposalDetail(messageId: string, actionId: number) {
    try {
      const body = await apiRequest<AgentActionsApiResponse>(
        "/api/agent/actions?limit=100",
        {
          cache: "no-store",
          errorMessage: "Agent 待确认动作读取失败，请稍后重试。",
        },
      );
      const proposal = body.proposals.find((item) => item.id === actionId);

      updateActionProposalCard(messageId, actionId, (current) => ({
        ...current,
        ...(proposal ? { proposal, status: proposal.status } : {}),
        detailError: proposal ? undefined : "未在待确认动作列表中找到该动作。",
        detailStatus: proposal ? "ready" : "error",
      }));
    } catch (error) {
      updateActionProposalCard(messageId, actionId, (current) => ({
        ...current,
        detailError: readErrorMessage(error, "Agent 待确认动作读取失败，请稍后重试。"),
        detailStatus: "error",
        status: "error",
      }));
    }
  }

  async function handleActionDecision(
    messageId: string,
    actionId: number,
    decision: "confirm" | "dismiss",
  ) {
    updateActionProposalCard(messageId, actionId, (current) => ({
      ...current,
      detailError: undefined,
      status: decision === "confirm" ? "confirming" : "dismissing",
    }));

    try {
      const body = await apiRequest<AgentActionMutationResponse>(
        `/api/agent/actions/${actionId}/${decision}`,
        {
          errorMessage:
            decision === "confirm"
              ? "Agent 待确认动作确认失败，请稍后重试。"
              : "Agent 待确认动作忽略失败，请稍后重试。",
          json:
            decision === "dismiss"
              ? { reason: "用户在 Assistant 工作台忽略。" }
              : undefined,
          method: "POST",
        },
      );

      updateActionProposalCard(messageId, actionId, (current) => ({
        ...current,
        detailStatus: "ready",
        proposal: body.proposal,
        status: body.proposal.status,
      }));
      void loadContextPanel();
    } catch (error) {
      updateActionProposalCard(messageId, actionId, (current) => ({
        ...current,
        detailError: readErrorMessage(
          error,
          decision === "confirm"
            ? "Agent 待确认动作确认失败，请稍后重试。"
            : "Agent 待确认动作忽略失败，请稍后重试。",
        ),
        status: "error",
      }));
    }
  }

  function updateAssistantMessage(
    messageId: string,
    updater: (message: AssistantChatMessage) => AssistantChatMessage,
  ) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId && message.role === "assistant"
          ? updater(message)
          : message,
      ),
    );
  }

  function updateActionProposalCard(
    messageId: string,
    actionId: number,
    updater: (card: AgentActionProposalCard) => AgentActionProposalCard,
  ) {
    updateAssistantMessage(messageId, (message) => {
      const run = message.run ?? createInitialAgentRun();

      return {
        ...message,
        run: {
          ...run,
          actions: run.actions.map((action) =>
            action.actionId === actionId ? updater(action) : action,
          ),
        },
      };
    });
  }

  function cancelCurrentRequest() {
    activeControllerRef.current?.abort();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendQuestion(input);
  }

  const isEmpty = messages.length === 0;

  return (
    <section className="relative flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(196,135,58,0.08)_1px,transparent_1px),linear-gradient(180deg,rgba(196,135,58,0.06)_1px,transparent_1px)] bg-[size:56px_56px] opacity-40" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(196,135,58,0.14),transparent)]" />

      <AssistantStatusBar
        activeRun={latestAssistant?.run}
        contextData={contextData}
        isSending={isSending}
        onCancel={cancelCurrentRequest}
        status={contextStatus}
      />

      <div className="relative mx-auto flex min-h-0 w-full max-w-[1280px] flex-1 flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="grid min-h-0 flex-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-6">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="mb-4 shrink-0 xl:hidden">
              <CompactSessionPanel
                activeSessionId={activeSessionId}
                deletingSessionId={deletingSessionId}
                isSending={isSending}
                onCreateSession={() => void handleCreateNewSession()}
                onDeleteSession={(sessionId) => void deleteAgentSessionById(sessionId)}
                onSelectSession={(sessionId) => void selectAgentSession(sessionId)}
                pendingDeleteSessionId={pendingDeleteSessionId}
                sessionError={sessionError}
                sessionMutationStatus={sessionMutationStatus}
                sessions={sessions}
                sessionStatus={sessionStatus}
              />
            </div>
            <div
              ref={messageListRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1"
            >
              {isEmpty ? (
                <div className="flex min-h-full flex-col justify-center py-6">
                  <AssistantEmptyState onAsk={(question) => void sendQuestion(question)} />
                </div>
              ) : (
                <div className="mx-auto flex w-full max-w-[920px] flex-col gap-6 py-2 pb-4">
                  {messages.map((message) => (
                    <ChatMessageCard
                      key={message.id}
                      message={message}
                      onConfirmAction={(actionId) =>
                        void handleActionDecision(message.id, actionId, "confirm")
                      }
                      onDismissAction={(actionId) =>
                        void handleActionDecision(message.id, actionId, "dismiss")
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="shrink-0">
              {errorMessage ? (
                <div className="mx-auto mt-4 w-full max-w-[980px]">
                  <ErrorBanner
                    message={errorMessage}
                    onRetry={
                      lastFailedQuestion
                        ? () => void sendQuestion(lastFailedQuestion)
                        : undefined
                    }
                  />
                </div>
              ) : null}

              <div className="mx-auto mt-4 w-full max-w-[980px]">
                <AssistantComposer
                  input={input}
                  isSending={isSending}
                  onCancel={cancelCurrentRequest}
                  onInputChange={setInput}
                  onQuickQuestion={(question) => void sendQuestion(question)}
                  onSubmit={handleSubmit}
                />
              </div>
            </div>
          </div>

          <div className="hidden min-h-0 xl:block">
            <SessionPanel
              activeSessionId={activeSessionId}
              deletingSessionId={deletingSessionId}
              isSending={isSending}
              onCreateSession={() => void handleCreateNewSession()}
              onDeleteSession={(sessionId) => void deleteAgentSessionById(sessionId)}
              onSelectSession={(sessionId) => void selectAgentSession(sessionId)}
              pendingDeleteSessionId={pendingDeleteSessionId}
              sessionError={sessionError}
              sessionMutationStatus={sessionMutationStatus}
              sessions={sessions}
              sessionStatus={sessionStatus}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function AssistantStatusBar({
  activeRun,
  contextData,
  isSending,
  onCancel,
  status,
}: {
  activeRun?: AgentRunState;
  contextData: ContextPanelData | null;
  isSending: boolean;
  onCancel: () => void;
  status: LoadStatus;
}) {
  const stats = contextData?.analytics.sampleSize;
  const activePhase = activeRun?.phase
    ? AGENT_PHASE_LABELS[activeRun.phase]
    : undefined;

  return (
    <PageHeader
      actions={
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
          {isSending ? (
            <>
              <StatusPill
                icon={
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                }
                label="流式运行"
                tone="amber"
              />
              <Button
                leftIcon={<CircleStop aria-hidden="true" className="size-4" />}
                onClick={onCancel}
                size="sm"
                variant="outline"
              >
                取消
              </Button>
            </>
          ) : null}
        </div>
      }
      description={
        isSending && activeRun?.agent
          ? `${activeRun.agent.label} · ${activePhase ?? "运行中"}`
          : status === "ready" && stats
            ? `${stats.reports} 份报告 · ${stats.applications} 条 Tracker · ${stats.resumes} 份简历`
            : status === "loading"
              ? "正在准备上下文"
              : "上下文暂不可用"
      }
      eyebrow="New Era Assistant"
      icon={<Bot aria-hidden="true" className="size-5" strokeWidth={1.8} />}
      title="AI 助手"
    />
  );
}

function AssistantEmptyState({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col items-center text-center">
      <div className="mb-6 flex size-16 items-center justify-center rounded-[24px] border border-[var(--color-border)] bg-[var(--color-primary-light)] text-[var(--color-primary)] shadow-[var(--shadow-sm)]">
        <Bot aria-hidden="true" className="size-8" strokeWidth={1.8} />
      </div>
      <h2 className="text-[30px] font-semibold leading-[1.15] text-[var(--color-text)] sm:text-[48px]">
        今天想推进哪一步？
      </h2>
      <p className="mt-4 max-w-[760px] text-base leading-7 text-[var(--color-text-secondary)] sm:text-lg">
        直接问我简历、Tracker、Career DNA 或评估报告的问题；所有状态修改都会先生成待确认动作。
      </p>
      <QuickQuestionGrid onAsk={onAsk} />
    </div>
  );
}

function QuickQuestionGrid({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <div className="mt-8 grid w-full max-w-[860px] grid-cols-1 gap-3 md:grid-cols-2">
      {QUICK_QUESTIONS.map((question) => (
        <button
          className="min-h-16 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 text-left text-sm font-semibold leading-6 text-[var(--color-text)] shadow-[var(--shadow-sm)] transition-all duration-200 hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)] active:scale-[0.99]"
          key={question}
          onClick={() => onAsk(question)}
          type="button"
        >
          {question}
        </button>
      ))}
    </div>
  );
}

function ChatMessageCard({
  message,
  onConfirmAction,
  onDismissAction,
}: {
  message: AssistantChatMessage;
  onConfirmAction: (actionId: number) => void;
  onDismissAction: (actionId: number) => void;
}) {
  const isUser = message.role === "user";
  const isThinking =
    !isUser &&
    message.run?.status === "running" &&
    message.content.trim().length === 0;
  const displayContent =
    message.content.trim().length > 0
      ? message.content
      : message.run?.status === "running"
        ? "正在思考"
        : "本次没有返回文字内容。";

  return (
    <article className={`flex gap-4 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? <Avatar icon={<Bot aria-hidden="true" className="size-5" />} /> : null}
      <div className={`max-w-[780px] min-w-0 ${isUser ? "order-1" : ""}`}>
        <div
          className={`rounded-[24px] px-5 py-4 shadow-[var(--shadow-sm)] ${
            isUser
              ? "bg-[var(--color-primary)] text-white"
              : message.isError
                ? "border border-[#efd4d0] bg-[#fff0ee] text-[var(--color-text)]"
                : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
          }`}
        >
          <div
            className={`mb-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] ${
              isUser ? "text-white/80" : "text-[var(--color-text-secondary)]"
            }`}
          >
            {isUser ? "You" : "Assistant"}
          </div>
          {isThinking ? (
            <ThinkingContent />
          ) : (
            <p className="whitespace-pre-wrap break-words text-[15px] leading-7">
              {displayContent}
            </p>
          )}
        </div>

        {!isUser ? (
          <div className="mt-3 space-y-3">
            {message.run ? (
              <AgentRunDetails
                onConfirmAction={onConfirmAction}
                onDismissAction={onDismissAction}
                run={message.run}
              />
            ) : null}
            {message.warnings?.length ? (
              <WarningList warnings={message.warnings} />
            ) : null}
            {message.actions?.length ? (
              <ActionCards actions={message.actions} />
            ) : null}
          </div>
        ) : null}
      </div>
      {isUser ? <Avatar icon={<UserRound aria-hidden="true" className="size-5" />} /> : null}
    </article>
  );
}

function ThinkingContent() {
  return (
    <div className="inline-flex items-center gap-2 text-[15px] font-semibold leading-7 text-[var(--color-text-secondary)]">
      <Loader2
        aria-hidden="true"
        className="size-4 animate-spin text-[var(--color-primary)]"
        strokeWidth={1.8}
      />
      <span>正在思考</span>
    </div>
  );
}

function AgentRunDetails({
  onConfirmAction,
  onDismissAction,
  run,
}: {
  onConfirmAction: (actionId: number) => void;
  onDismissAction: (actionId: number) => void;
  run: AgentRunState;
}) {
  const showActions = run.status !== "running" && run.actions.length > 0;

  if (!showActions && !run.errorMessage) {
    return null;
  }

  return (
    <div className="space-y-3">
      {run.actions.length > 0 ? (
        <ActionProposalCards
          actions={run.actions}
          onConfirmAction={onConfirmAction}
          onDismissAction={onDismissAction}
        />
      ) : null}
      {run.errorMessage ? (
        <p className="flex gap-2 rounded-[16px] border border-[#efd4d0] bg-[#fff0ee] px-3 py-2 text-xs leading-5 text-[#b45c52]">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
            strokeWidth={1.8}
          />
          {run.errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function ActionProposalCards({
  actions,
  onConfirmAction,
  onDismissAction,
}: {
  actions: AgentActionProposalCard[];
  onConfirmAction: (actionId: number) => void;
  onDismissAction: (actionId: number) => void;
}) {
  return (
    <div className="space-y-3">
      {actions.map((action) => (
        <ActionProposalCard
          action={action}
          key={action.actionId}
          onConfirmAction={onConfirmAction}
          onDismissAction={onDismissAction}
        />
      ))}
    </div>
  );
}

function ActionProposalCard({
  action,
  onConfirmAction,
  onDismissAction,
}: {
  action: AgentActionProposalCard;
  onConfirmAction: (actionId: number) => void;
  onDismissAction: (actionId: number) => void;
}) {
  const proposal = action.proposal;
  const isBusy = action.status === "confirming" || action.status === "dismissing";
  const isPending = action.status === "pending" && proposal?.status !== "confirmed";

  return (
    <article className="rounded-[18px] border border-[#eedaa6] bg-[#fffaf0] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            <StatusPill
              icon={
                isBusy ? (
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                ) : action.status === "error" ? (
                  <XCircle aria-hidden="true" className="size-3.5" />
                ) : (
                  <CheckCircle2 aria-hidden="true" className="size-3.5" />
                )
              }
              label={getActionProposalStatusLabel(action.status)}
              tone={action.status === "error" ? "amber" : "blue"}
            />
            {proposal ? (
              <span className="rounded-full border border-[#eedaa6] bg-[var(--color-primary-light)] px-2.5 py-1 text-[11px] font-semibold leading-4 text-[var(--color-primary)]">
                {AGENT_ACTION_TYPE_LABELS[proposal.actionType]}
              </span>
            ) : null}
          </div>
          <h3 className="break-words text-sm font-semibold leading-5 text-[var(--color-text)]">
            {proposal?.title ?? action.label}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            待确认动作，用户确认前不会写入业务表。
          </p>
        </div>
        {isPending ? (
          <div className="flex shrink-0 gap-2">
            <Button
              disabled={isBusy || action.detailStatus !== "ready"}
              onClick={() => onDismissAction(action.actionId)}
              size="sm"
              variant="outline"
            >
              忽略
            </Button>
            <Button
              disabled={isBusy || action.detailStatus !== "ready"}
              onClick={() => onConfirmAction(action.actionId)}
              size="sm"
            >
              确认
            </Button>
          </div>
        ) : null}
      </div>

      {action.detailStatus === "loading" ? (
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold leading-5 text-[var(--color-primary)]">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          正在读取动作详情
        </p>
      ) : null}
      {proposal ? (
        <div className="mt-3 space-y-3">
          <p className="rounded-[14px] border border-[var(--color-border-light)] bg-[var(--color-surface)] px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]">
            {proposal.reason}
          </p>
          <p className="rounded-[14px] border border-[#eedaa6] bg-[#fff7df] px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]">
            {proposal.riskNote}
          </p>
          <div className="flex flex-wrap gap-2 text-[11px] font-semibold leading-4 text-[var(--color-text-secondary)]">
            <span className="max-w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-2.5 py-1">
              待确认动作：{AGENT_ACTION_TYPE_LABELS[proposal.actionType]}
            </span>
          </div>
        </div>
      ) : null}
      {action.detailError ? (
        <p className="mt-3 flex gap-2 rounded-[14px] border border-[#efd4d0] bg-[#fff0ee] px-3 py-2 text-xs leading-5 text-[#b45c52]">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
            strokeWidth={1.8}
          />
          {action.detailError}
        </p>
      ) : null}
    </article>
  );
}

function AssistantComposer({
  input,
  isSending,
  onCancel,
  onInputChange,
  onQuickQuestion,
  onSubmit,
}: {
  input: string;
  isSending: boolean;
  onCancel: () => void;
  onInputChange: (value: string) => void;
  onQuickQuestion: (question: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className="rounded-[30px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-lg)]"
      onSubmit={onSubmit}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK_QUESTIONS.slice(0, 3).map((question) => (
          <button
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-3 py-1.5 text-xs font-semibold leading-4 text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]"
            disabled={isSending}
            key={question}
            onClick={() => onQuickQuestion(question)}
            type="button"
          >
            {question}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface-hover)]">
        <textarea
          aria-label="提问"
          className="min-h-[124px] w-full resize-none border-0 bg-transparent px-5 py-4 text-[17px] leading-7 text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
          disabled={isSending}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="向 New Era 提问，例如：把 Tracker #3 改成已投递，或者解释最近高风险报告。"
          value={input}
        />
        <div className="flex flex-col gap-3 border-t border-[var(--color-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label="Shift + Enter 换行" tone="neutral" />
          </div>
          <div className="flex items-center justify-end gap-2">
            {isSending ? (
              <button
                aria-label="取消"
                className="inline-flex size-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)] active:scale-[0.98]"
                onClick={onCancel}
                type="button"
              >
                <CircleStop
                  aria-hidden="true"
                  className="size-[18px]"
                  strokeWidth={1.8}
                />
              </button>
            ) : null}
            <button
              aria-label={isSending ? "生成中" : "发送"}
              className="inline-flex size-12 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-[var(--shadow-md)] transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSending || input.trim().length === 0}
              type="submit"
            >
              {isSending ? (
                <Loader2 aria-hidden="true" className="size-5 animate-spin" />
              ) : (
                <ArrowUp aria-hidden="true" className="size-5" strokeWidth={2.1} />
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mb-4 rounded-[20px] border border-[#efd4d0] bg-[#fff0ee] px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold leading-5 text-[#b45c52]">
          <AlertTriangle aria-hidden="true" className="size-4" strokeWidth={1.8} />
          {message}
        </p>
        {onRetry ? (
          <Button
            leftIcon={<RefreshCw aria-hidden="true" className="size-4" />}
            onClick={onRetry}
            size="sm"
            variant="outline"
          >
            重试
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function WarningList({ warnings }: { warnings: string[] }) {
  return (
    <div className="space-y-2">
      {warnings.map((warning) => (
        <p
          className="flex gap-2 rounded-[14px] border border-[#eedaa6] bg-[#fff7df] px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]"
          key={warning}
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-[#9a6d20]"
            strokeWidth={1.8}
          />
          {warning}
        </p>
      ))}
    </div>
  );
}

function ActionCards({ actions }: { actions: AssistantAction[] }) {
  return (
    <div className="space-y-3">
      {actions.map((action) => (
        <article
          className="rounded-[18px] border border-[#eedaa6] bg-[#fffaf0] p-4 shadow-[var(--shadow-sm)]"
          key={action.id}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap gap-2">
                <StatusPill
                  icon={<CheckCircle2 aria-hidden="true" className="size-3.5" />}
                  label="待确认"
                  tone="blue"
                />
                <span className="rounded-full border border-[#eedaa6] bg-[var(--color-primary-light)] px-2.5 py-1 text-[11px] font-semibold leading-4 text-[var(--color-primary)]">
                  {ACTION_TYPE_LABELS[action.type]}
                </span>
              </div>
              <h3 className="break-words text-sm font-semibold leading-5 text-[var(--color-text)]">
                {action.label}
              </h3>
              <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                确认后才会执行。
              </p>
            </div>
            <LinkButton href={getActionHref(action)} label="去确认" />
          </div>
        </article>
      ))}
    </div>
  );
}

type SessionPanelBaseProps = {
  activeSessionId?: number;
  deletingSessionId?: number;
  isSending: boolean;
  onCreateSession: () => void;
  onDeleteSession: (sessionId: number) => void;
  onSelectSession: (sessionId: number) => void;
  pendingDeleteSessionId?: number;
  sessionError?: string;
  sessionMutationStatus: MutationStatus;
  sessions: AgentSessionListItem[];
  sessionStatus: LoadStatus;
};

function CompactSessionPanel({
  activeSessionId,
  deletingSessionId,
  isSending,
  onCreateSession,
  onDeleteSession,
  onSelectSession,
  pendingDeleteSessionId,
  sessionError,
  sessionMutationStatus,
  sessions,
  sessionStatus,
}: SessionPanelBaseProps) {
  return (
    <section className="flex min-h-0 flex-col rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
      <PanelHeader
        icon={<MessageSquare aria-hidden="true" className="size-5" strokeWidth={1.8} />}
        title="Agent 会话"
        action={
          <Button
            disabled={
              sessionMutationStatus === "saving" ||
              isSending ||
              deletingSessionId !== undefined
            }
            leftIcon={
              sessionMutationStatus === "saving" ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Plus aria-hidden="true" className="size-4" />
              )
            }
            onClick={onCreateSession}
            size="sm"
            variant="outline"
          >
            新建
          </Button>
        }
      />
      {sessionError ? <PanelNotice message={sessionError} tone="error" /> : null}
      <div className="mt-3 max-h-[220px] overflow-y-auto rounded-[16px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-2">
        <AgentSessionList
          activeSessionId={activeSessionId}
          deletingSessionId={deletingSessionId}
          isSending={isSending}
          onDeleteSession={onDeleteSession}
          onSelectSession={onSelectSession}
          pendingDeleteSessionId={pendingDeleteSessionId}
          sessions={sessions}
          sessionStatus={sessionStatus}
          skeletonRows={3}
        />
      </div>
    </section>
  );
}

function AgentSessionList({
  activeSessionId,
  deletingSessionId,
  isSending,
  onDeleteSession,
  onSelectSession,
  pendingDeleteSessionId,
  sessions,
  sessionStatus,
  skeletonRows,
}: {
  activeSessionId?: number;
  deletingSessionId?: number;
  isSending: boolean;
  onDeleteSession: (sessionId: number) => void;
  onSelectSession: (sessionId: number) => void;
  pendingDeleteSessionId?: number;
  sessions: AgentSessionListItem[];
  sessionStatus: LoadStatus;
  skeletonRows: number;
}) {
  if (sessionStatus === "loading" && sessions.length === 0) {
    return <PanelListSkeleton rows={skeletonRows} />;
  }

  if (sessions.length === 0) {
    return (
      <p className="rounded-[16px] border border-dashed border-[var(--color-border)] px-4 py-5 text-xs leading-5 text-[var(--color-text-secondary)]">
        这里会保留本地 Agent 会话。选中会话后，后续提问会继续沿用可见记忆摘要。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        const isDeleting = session.id === deletingSessionId;
        const isPendingDelete = session.id === pendingDeleteSessionId;
        const preview =
          session.lastMessagePreview ??
          session.memoryDigest ??
          "新会话，还没有消息。";

        return (
          <article
            className={`rounded-[16px] border p-3 text-left transition-all ${
              isActive
                ? "border-[var(--color-primary)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]"
                : "border-transparent bg-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-surface)]"
            }`}
            key={session.id}
          >
            <div className="flex items-start gap-2">
              <button
                className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSending || isDeleting}
                onClick={() => onSelectSession(session.id)}
                type="button"
              >
                <span className="block truncate text-sm font-semibold leading-5 text-[var(--color-text)]">
                  {session.title}
                </span>
                <span className="mt-1 block text-[11px] leading-4 text-[var(--color-text-secondary)]">
                  {session.messageCount} 条消息 / 更新 {formatPanelTime(session.updatedAt)}
                </span>
              </button>
              <Button
                aria-label={`删除 Agent 会话 ${session.title}`}
                className={
                  isPendingDelete
                    ? "h-8 rounded-[10px] px-2.5 text-[11px]"
                    : "size-8 rounded-[10px] p-0"
                }
                disabled={
                  isSending ||
                  (deletingSessionId !== undefined && !isDeleting)
                }
                leftIcon={
                  isDeleting ? (
                    <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                  ) : isPendingDelete ? undefined : (
                    <Trash2 aria-hidden="true" className="size-3.5" />
                  )
                }
                onClick={() => onDeleteSession(session.id)}
                title={isPendingDelete ? "再次点击确认删除" : "删除会话"}
                variant={isPendingDelete ? "danger" : "outline"}
              >
                {isPendingDelete ? (isDeleting ? "删除中" : "确认") : null}
              </Button>
            </div>
            <button
              className="mt-2 block w-full text-left text-xs leading-5 text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSending || isDeleting}
              onClick={() => onSelectSession(session.id)}
              type="button"
            >
              {preview}
            </button>
          </article>
        );
      })}
    </div>
  );
}

function SessionPanel({
  activeSessionId,
  deletingSessionId,
  isSending,
  onCreateSession,
  onDeleteSession,
  onSelectSession,
  pendingDeleteSessionId,
  sessionError,
  sessionMutationStatus,
  sessions,
  sessionStatus,
}: SessionPanelBaseProps) {
  const [panelHeight, setPanelHeight] = useState(SESSION_PANEL_DEFAULT_HEIGHT);
  const [panelMaxHeight, setPanelMaxHeight] = useState(SESSION_PANEL_MAX_HEIGHT);
  const hasUserResizedRef = useRef(false);
  const listFrameRef = useRef<HTMLDivElement | null>(null);
  const panelHeightRef = useRef(SESSION_PANEL_DEFAULT_HEIGHT);
  const resizeStateRef = useRef<{ startHeight: number; startY: number } | null>(
    null,
  );
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  const syncPanelHeightToViewport = useCallback(() => {
    const availableHeight = getAvailableSessionPanelHeight(listFrameRef.current);
    const targetHeight = hasUserResizedRef.current
      ? Math.min(panelHeightRef.current, availableHeight)
      : Math.min(SESSION_PANEL_DEFAULT_HEIGHT, availableHeight);
    const clampedHeight = clampSessionPanelHeight(targetHeight, availableHeight);

    panelHeightRef.current = clampedHeight;
    setPanelMaxHeight(availableHeight);
    setPanelHeight(clampedHeight);
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(syncPanelHeightToViewport);

    return () => window.cancelAnimationFrame(frameId);
  });

  useEffect(() => {
    window.addEventListener("resize", syncPanelHeightToViewport);

    return () => {
      window.removeEventListener("resize", syncPanelHeightToViewport);
      resizeCleanupRef.current?.();
    };
  }, [syncPanelHeightToViewport]);

  function updatePanelHeight(nextHeight: number) {
    const availableHeight = getAvailableSessionPanelHeight(listFrameRef.current);
    const clampedHeight = clampSessionPanelHeight(
      nextHeight,
      availableHeight,
    );

    panelHeightRef.current = clampedHeight;
    setPanelMaxHeight(availableHeight);
    setPanelHeight(clampedHeight);
  }

  function handleResizePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    event.preventDefault();

    hasUserResizedRef.current = true;
    resizeCleanupRef.current?.();
    resizeStateRef.current = {
      startHeight: panelHeightRef.current,
      startY: event.clientY,
    };

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const resizeState = resizeStateRef.current;

      if (!resizeState) {
        return;
      }

      updatePanelHeight(
        resizeState.startHeight + moveEvent.clientY - resizeState.startY,
      );
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      resizeStateRef.current = null;
      resizeCleanupRef.current = null;
    };

    resizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  }

  function handleResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 80 : 40;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      hasUserResizedRef.current = true;
      updatePanelHeight(panelHeight + step);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      hasUserResizedRef.current = true;
      updatePanelHeight(panelHeight - step);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      hasUserResizedRef.current = true;
      updatePanelHeight(SESSION_PANEL_MIN_HEIGHT);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      hasUserResizedRef.current = true;
      updatePanelHeight(SESSION_PANEL_MAX_HEIGHT);
    }
  }

  return (
    <aside className="min-h-0 space-y-4 xl:sticky xl:top-6 xl:self-start">
      <section className="flex min-h-0 flex-col rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)]">
        <PanelHeader
          icon={<MessageSquare aria-hidden="true" className="size-5" strokeWidth={1.8} />}
          title="Agent 会话"
          action={
            <Button
              disabled={
                sessionMutationStatus === "saving" ||
                isSending ||
                deletingSessionId !== undefined
              }
              leftIcon={
                sessionMutationStatus === "saving" ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Plus aria-hidden="true" className="size-4" />
                )
              }
              onClick={onCreateSession}
              size="sm"
              variant="outline"
            >
              新建
            </Button>
          }
        />
        {sessionError ? <PanelNotice message={sessionError} tone="error" /> : null}
        <div
          className="mt-4 min-h-0 overflow-hidden rounded-[18px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)]"
          ref={listFrameRef}
          style={{ height: panelHeight }}
        >
          <div className="h-full overflow-y-auto p-2">
            <AgentSessionList
              activeSessionId={activeSessionId}
              deletingSessionId={deletingSessionId}
              isSending={isSending}
              onDeleteSession={onDeleteSession}
              onSelectSession={onSelectSession}
              pendingDeleteSessionId={pendingDeleteSessionId}
              sessions={sessions}
              sessionStatus={sessionStatus}
              skeletonRows={7}
            />
          </div>
        </div>
        <div
          aria-label="调整 Agent 会话列表高度"
          aria-valuemax={panelMaxHeight}
          aria-valuemin={SESSION_PANEL_MIN_HEIGHT}
          aria-valuenow={panelHeight}
          className="mt-3 flex h-8 w-full cursor-row-resize items-center justify-center rounded-[14px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[rgba(196,135,58,0.2)] active:scale-[0.99]"
          onKeyDown={handleResizeKeyDown}
          onPointerDown={handleResizePointerDown}
          role="slider"
          tabIndex={0}
          title="上下拖动调整 Agent 会话列表高度"
        >
          <GripHorizontal aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </div>
      </section>
    </aside>
  );
}

function PanelNotice({
  message,
  tone,
}: {
  message: string;
  tone: "error" | "neutral";
}) {
  return (
    <p
      className={`mt-4 rounded-[14px] px-3 py-2 text-xs leading-5 ${
        tone === "error"
          ? "border border-[#efd4d0] bg-[#fff0ee] text-[#b45c52]"
          : "border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]"
      }`}
    >
      {message}
    </p>
  );
}

function PanelListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="mt-4 space-y-2">
      {Array.from({ length: rows }, (_, index) => (
        <div
          className="h-20 animate-pulse rounded-[16px] bg-[var(--color-border-light)]"
          key={index}
        />
      ))}
    </div>
  );
}

function PanelHeader({
  action,
  icon,
  title,
}: {
  action?: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-[var(--color-border)] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
          {icon}
        </div>
        <h2 className="text-base font-semibold leading-6 text-[var(--color-text)]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function Avatar({ icon }: { icon: ReactNode }) {
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-primary)]">
      {icon}
    </div>
  );
}

function StatusPill({
  icon,
  label,
  tone,
}: {
  icon?: ReactNode;
  label: string;
  tone: "amber" | "blue" | "green" | "neutral";
}) {
  const className = {
    amber: "border-[#eedaa6] bg-[#fff7df] text-[#875006]",
    blue: "border-[#cfe2f7] bg-[#f1f7ff] text-[var(--color-blue)]",
    green: "border-[#d7e7d2] bg-[#eef6eb] text-[var(--color-green)]",
    neutral:
      "border-[var(--color-border)] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]",
  }[tone];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-4 ${className}`}>
      {icon}
      {label}
    </span>
  );
}

function LinkButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="inline-flex h-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--color-primary)] px-3 text-xs font-semibold leading-4 text-white shadow-[var(--shadow-sm)] transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
      href={href}
    >
      {label}
    </Link>
  );
}

function getActionHref(action: AssistantAction): string {
  if (action.type === "edit_career_profile") {
    return "/career";
  }

  return "/applications";
}

function createInitialAgentRun(): AgentRunState {
  return {
    actions: [],
    citations: [],
    status: "running",
    tools: [],
    warnings: [],
  };
}

function mapSessionMessageToChatMessage(
  message: AgentSessionMessage,
): AssistantChatMessage {
  return {
    ...(message.citations?.length ? { citations: message.citations } : {}),
    content: message.content,
    createdAt: message.createdAt,
    id: message.id,
    ...(message.isError ? { isError: true } : {}),
    role: message.role,
    ...(message.warnings?.length ? { warnings: message.warnings } : {}),
  };
}

function toSessionListItem(session: AgentSession): AgentSessionListItem {
  const lastMessage = session.messages.at(-1);

  return {
    createdAt: session.createdAt,
    id: session.id,
    lastMessageAt: lastMessage?.createdAt ?? null,
    lastMessagePreview: lastMessage
      ? truncatePanelText(lastMessage.content, 140)
      : null,
    memoryDigest: session.memoryDigest,
    messageCount: session.messages.length,
    title: session.title,
    updatedAt: session.updatedAt,
  };
}

function buildSessionTitle(question?: string): string {
  const normalized = question?.trim();

  return normalized ? truncatePanelText(normalized, 36) : "新会话";
}

function buildAgentRunContext(
  question: string,
  contextData: ContextPanelData | null,
  sessionId?: number,
):
  | {
      applicationId?: number;
      reportId?: number;
      resumeId?: number;
      sessionId?: number;
    }
  | undefined {
  const applicationId = extractContextId(question, [
    "tracker",
    "application",
    "投递",
    "岗位",
    "跟进",
    "状态",
  ]);
  const reportId = extractContextId(question, [
    "report",
    "jd",
    "报告",
    "风险",
    "评估",
  ]);
  const resumeId = extractContextId(question, ["resume", "简历"]);
  const baseContext = {
    ...(sessionId ? { sessionId } : {}),
  };
  const context = {
    ...baseContext,
    ...(applicationId ? { applicationId } : {}),
    ...(reportId ? { reportId } : {}),
    ...(resumeId ? { resumeId } : {}),
  };

  if (applicationId || reportId || resumeId) {
    return context;
  }

  if (
    contextData?.applications.length === 1 &&
    includesAnyText(question, ["改成", "改为", "更新为", "标记为", "新增跟进"])
  ) {
    return {
      ...baseContext,
      applicationId: contextData.applications[0].id,
    };
  }

  return Object.keys(baseContext).length > 0 ? baseContext : undefined;
}

function extractContextId(question: string, keywords: string[]): number | undefined {
  if (!includesAnyText(question, keywords)) {
    return undefined;
  }

  const hashMatch = question.match(/#\s*(\d{1,10})/);

  if (!hashMatch) {
    return undefined;
  }

  const id = Number(hashMatch[1]);

  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function parseAgentSseEvent(rawEvent: string): AgentSseEvent | null {
  const dataLine = rawEvent
    .split(/\r?\n/)
    .find((line) => line.startsWith("data:"));

  if (!dataLine) {
    return null;
  }

  try {
    return JSON.parse(dataLine.slice(5).trim()) as AgentSseEvent;
  } catch {
    return null;
  }
}

function readAgentStreamErrorMessage(event: AgentSseEvent): string {
  if (
    event.type === "error" &&
    isRecord(event.error) &&
    typeof event.error.message === "string" &&
    event.error.message.trim().length > 0
  ) {
    return event.error.message.trim();
  }

  return "Agent 流式响应失败，本次没有写入任何本地数据。";
}

function upsertToolCall(
  tools: AgentToolActivity[],
  event: Extract<AgentSseEvent, { type: "tool_call" }>,
): AgentToolActivity[] {
  const id = getToolActivityId(event.name, event.iteration);
  const nextTool: AgentToolActivity = {
    category: readToolCategory(event.category),
    citations: [],
    id,
    iteration: event.iteration,
    name: event.name,
    params: event.params,
    status: "running",
  };
  const found = tools.some((tool) => tool.id === id);

  if (!found) {
    return [...tools, nextTool];
  }

  return tools.map((tool) =>
    tool.id === id
      ? {
          ...tool,
          category: nextTool.category,
          params: nextTool.params,
          status: tool.status === "success" ? "success" : "running",
        }
      : tool,
  );
}

function upsertToolResult(
  tools: AgentToolActivity[],
  event: Extract<AgentSseEvent, { type: "tool_result" }>,
): AgentToolActivity[] {
  const id = getToolActivityId(event.name, event.iteration);
  const found = tools.some((tool) => tool.id === id);
  const resultPatch = {
    category: readToolCategory(event.category),
    citations: event.citations ?? [],
    errorMessage: event.error?.message,
    id,
    iteration: event.iteration,
    name: event.name,
    status: event.ok ? "success" : "error",
    summary: event.summary,
  } satisfies Omit<AgentToolActivity, "params">;

  if (!found) {
    return [
      ...tools,
      {
        ...resultPatch,
        params: {},
      },
    ];
  }

  return tools.map((tool) =>
    tool.id === id
      ? {
          ...tool,
          ...resultPatch,
        }
      : tool,
  );
}

function upsertActionProposal(
  actions: AgentActionProposalCard[],
  action: AgentActionProposalCard,
): AgentActionProposalCard[] {
  const found = actions.some((item) => item.actionId === action.actionId);

  if (!found) {
    return [...actions, action];
  }

  return actions.map((item) =>
    item.actionId === action.actionId
      ? {
          ...item,
          ...action,
          proposal: action.proposal ?? item.proposal,
        }
      : item,
  );
}

function getToolActivityId(name: string, iteration: number): string {
  return `${iteration}:${name}`;
}

function readToolCategory(value: unknown): AgentToolCategory | null {
  return value === "action" || value === "query" ? value : null;
}

function getAvailableSessionPanelHeight(frame: HTMLDivElement | null): number {
  if (!frame || typeof window === "undefined") {
    return SESSION_PANEL_MAX_HEIGHT;
  }

  const top = frame.getBoundingClientRect().top;
  const availableHeight = window.innerHeight - top - SESSION_PANEL_VIEWPORT_GUTTER;

  return Math.max(
    SESSION_PANEL_MIN_HEIGHT,
    Math.min(SESSION_PANEL_MAX_HEIGHT, Math.round(availableHeight)),
  );
}

function clampSessionPanelHeight(
  value: number,
  maxHeight = SESSION_PANEL_MAX_HEIGHT,
): number {
  const normalizedMaxHeight = Math.max(
    SESSION_PANEL_MIN_HEIGHT,
    Math.min(SESSION_PANEL_MAX_HEIGHT, Math.round(maxHeight)),
  );

  return Math.max(
    SESSION_PANEL_MIN_HEIGHT,
    Math.min(normalizedMaxHeight, Math.round(value)),
  );
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

function getActionProposalStatusLabel(
  status: AgentActionProposalCard["status"],
): string {
  const labels: Record<AgentActionProposalCard["status"], string> = {
    confirmed: "已确认",
    confirming: "确认中",
    dismissed: "已忽略",
    dismissing: "忽略中",
    error: "处理失败",
    pending: "待确认",
  };

  return labels[status];
}

function truncatePanelText(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function formatPanelTime(value: string): string {
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));

  if (!Number.isFinite(date.getTime())) {
    return "时间未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
  }).format(date);
}

function includesAnyText(value: string, keywords: readonly string[]): boolean {
  const normalized = value.trim().toLocaleLowerCase();

  return keywords.some((keyword) =>
    normalized.includes(keyword.trim().toLocaleLowerCase()),
  );
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createMessageId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
