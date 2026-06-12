"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Brain,
  ClipboardList,
  Database,
  Download,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Target,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { apiRequest, readErrorMessage } from "@/lib/api-client";
import type {
  AgentMemoryItem,
  AgentSession,
  AgentSessionListItem,
  AnalyticsOverviewDto,
  ApplicationDto,
  AssistantCitation,
  CareerProfileSettings,
  ReportDto,
} from "@/lib/types";

type AnalyticsApiResponse = {
  ok: true;
} & AnalyticsOverviewDto;

type ReportsApiResponse = {
  ok: true;
  reports: ReportDto[];
  count: number;
  limit: number;
};

type ApplicationsApiResponse = {
  ok: true;
  applications: ApplicationDto[];
  count: number;
  limit: number;
};

type CareerProfileApiResponse = {
  ok: true;
  defaults: CareerProfileSettings;
  defaultsApplied: boolean;
  profile: CareerProfileSettings;
  updatedAt: string | null;
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
};

type AgentMemoryApiResponse = {
  ok: true;
  memoryItems: AgentMemoryItem[];
  count: number;
  limit: number;
};

type AgentMemoryMutationResponse = {
  ok: true;
  memoryItem: AgentMemoryItem;
  deleted?: boolean;
};

export type AssistantContextPanelData = {
  analytics: AnalyticsOverviewDto;
  applications: ApplicationDto[];
  careerProfile: CareerProfileSettings;
  careerProfileConfigured: boolean;
  reports: ReportDto[];
};

export type AssistantLoadStatus = "loading" | "ready" | "error";
export type AssistantMutationStatus = "idle" | "saving" | "error";

export type AssistantControlPanelState = {
  activeSession: AgentSession | null;
  activeSessionId?: number;
  contextData: AssistantContextPanelData | null;
  editingMemoryContent: string;
  editingMemoryId?: number;
  editingMemorySource: string;
  error?: string;
  latestCitations: AssistantCitation[];
  memoryError?: string;
  memoryItems: AgentMemoryItem[];
  memoryMutationError?: string;
  memoryMutationStatus: AssistantMutationStatus;
  memoryStatus: AssistantLoadStatus;
  onCancelMemoryEdit: () => void;
  onCreateSession: () => void;
  onDeleteMemory: (memoryId: number) => void;
  onEditMemory: (item: AgentMemoryItem) => void;
  onEditingMemoryContentChange: (value: string) => void;
  onEditingMemorySourceChange: (value: string) => void;
  onReload: () => void;
  onSaveMemory: () => void;
  onSelectSession: (sessionId: number) => void;
  pendingDeleteMemoryId?: number;
  sessionError?: string;
  sessionMutationStatus: AssistantMutationStatus;
  sessions: AgentSessionListItem[];
  sessionStatus: AssistantLoadStatus;
  status: AssistantLoadStatus;
};

type AssistantControlPanelsProps = AssistantControlPanelState & {
  className?: string;
  showSessionPicker?: boolean;
};

const APPLICATION_STATUS_LABELS: Record<ApplicationDto["status"], string> = {
  abandoned: "已放弃",
  applied: "已投递",
  interviewing: "面试中",
  offer_received: "已获 Offer",
  rejected: "未通过",
  to_apply: "待投递",
};

const AGENT_MEMORY_TYPE_LABELS: Record<AgentMemoryItem["memoryType"], string> = {
  episodic_summary: "阶段摘要",
  user_preference: "用户偏好",
  working_digest: "工作摘要",
};

export async function fetchAssistantContextData(
  signal?: AbortSignal,
): Promise<AssistantContextPanelData> {
  const [analytics, reports, applications, careerProfile] = await Promise.all([
    apiRequest<AnalyticsApiResponse>("/api/analytics", {
      cache: "no-store",
      errorMessage: "上下文读取失败，请稍后重试。",
      signal,
    }),
    apiRequest<ReportsApiResponse>("/api/reports?limit=5", {
      cache: "no-store",
      errorMessage: "上下文读取失败，请稍后重试。",
      signal,
    }),
    apiRequest<ApplicationsApiResponse>("/api/applications?limit=8", {
      cache: "no-store",
      errorMessage: "上下文读取失败，请稍后重试。",
      signal,
    }),
    apiRequest<CareerProfileApiResponse>("/api/career-profile", {
      cache: "no-store",
      errorMessage: "上下文读取失败，请稍后重试。",
      signal,
    }),
  ]);

  return {
    analytics,
    applications: applications.applications,
    careerProfile: careerProfile.profile,
    careerProfileConfigured:
      !careerProfile.defaultsApplied && !isCareerProfileEmpty(careerProfile.profile),
    reports: reports.reports,
  };
}

export function useAssistantControlPanelState(): AssistantControlPanelState {
  const [contextStatus, setContextStatus] =
    useState<AssistantLoadStatus>("loading");
  const [contextError, setContextError] = useState<string>();
  const [contextData, setContextData] =
    useState<AssistantContextPanelData | null>(null);
  const [sessions, setSessions] = useState<AgentSessionListItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number>();
  const [activeSession, setActiveSession] = useState<AgentSession | null>(null);
  const [sessionStatus, setSessionStatus] =
    useState<AssistantLoadStatus>("loading");
  const [sessionError, setSessionError] = useState<string>();
  const [sessionMutationStatus, setSessionMutationStatus] =
    useState<AssistantMutationStatus>("idle");
  const [memoryItems, setMemoryItems] = useState<AgentMemoryItem[]>([]);
  const [memoryStatus, setMemoryStatus] =
    useState<AssistantLoadStatus>("ready");
  const [memoryError, setMemoryError] = useState<string>();
  const [memoryMutationStatus, setMemoryMutationStatus] =
    useState<AssistantMutationStatus>("idle");
  const [memoryMutationError, setMemoryMutationError] = useState<string>();
  const [editingMemoryId, setEditingMemoryId] = useState<number>();
  const [editingMemoryContent, setEditingMemoryContent] = useState("");
  const [editingMemorySource, setEditingMemorySource] = useState("");
  const [pendingDeleteMemoryId, setPendingDeleteMemoryId] = useState<number>();

  const latestCitations = useMemo(
    () => getLatestAssistantCitations(activeSession),
    [activeSession],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadContextPanel(controller.signal);
    void bootstrapAgentSessions(controller.signal);

    return () => controller.abort();
    // Initial settings-side assistant control bootstrap should run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadContextPanel(signal?: AbortSignal) {
    setContextStatus("loading");
    setContextError(undefined);

    try {
      const nextContextData = await fetchAssistantContextData(signal);

      if (signal?.aborted) {
        return;
      }

      setContextData(nextContextData);
      setContextStatus("ready");
    } catch (error) {
      if (isAbortLikeError(error)) {
        return;
      }

      setContextData(null);
      setContextError(readErrorMessage(error, "上下文读取失败，请稍后重试。"));
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
    setActiveSession(null);
    setMemoryItems([]);
    setMemoryStatus("ready");
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
      if (isAbortLikeError(error)) {
        return [];
      }

      setSessions([]);
      setSessionError(readErrorMessage(error, "Agent 会话列表读取失败，请稍后重试。"));
      setSessionStatus("error");

      return [];
    }
  }

  async function selectAgentSession(sessionId: number, signal?: AbortSignal) {
    setActiveSessionId(sessionId);
    setSessionError(undefined);
    setMemoryMutationError(undefined);
    resetMemoryEditing();

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

      setActiveSession(body.session);
      updateSessionListItem(body.session);
      await loadAgentMemoryItems(body.session.id, signal);
    } catch (error) {
      if (isAbortLikeError(error)) {
        return;
      }

      setSessionError(readErrorMessage(error, "Agent 会话读取失败，请稍后重试。"));
    }
  }

  async function loadAgentMemoryItems(sessionId?: number, signal?: AbortSignal) {
    if (!sessionId) {
      setMemoryItems([]);
      setMemoryStatus("ready");
      setMemoryError(undefined);
      return;
    }

    setMemoryStatus("loading");
    setMemoryError(undefined);

    try {
      const body = await apiRequest<AgentMemoryApiResponse>(
        `/api/agent/memory?sessionId=${sessionId}&limit=20`,
        {
          cache: "no-store",
          errorMessage: "Agent 记忆读取失败，请稍后重试。",
          signal,
        },
      );

      if (signal?.aborted) {
        return;
      }

      setMemoryItems(body.memoryItems);
      setMemoryStatus("ready");
    } catch (error) {
      if (isAbortLikeError(error)) {
        return;
      }

      setMemoryItems([]);
      setMemoryError(readErrorMessage(error, "Agent 记忆读取失败，请稍后重试。"));
      setMemoryStatus("error");
    }
  }

  async function createAgentSession() {
    setSessionMutationStatus("saving");
    setSessionError(undefined);
    resetMemoryEditing();

    try {
      const body = await apiRequest<AgentSessionMutationResponse>(
        "/api/agent/sessions",
        {
          errorMessage: "Agent 会话创建失败，请稍后重试。",
          json: {
            title: "新会话",
          },
          method: "POST",
        },
      );

      setActiveSessionId(body.session.id);
      setActiveSession(body.session);
      setMemoryItems([]);
      setMemoryStatus("ready");
      updateSessionListItem(body.session);
      setSessionMutationStatus("idle");
    } catch (error) {
      setSessionError(readErrorMessage(error, "Agent 会话创建失败，请稍后重试。"));
      setSessionMutationStatus("error");
    }
  }

  function resetMemoryEditing() {
    setEditingMemoryId(undefined);
    setEditingMemoryContent("");
    setEditingMemorySource("");
    setPendingDeleteMemoryId(undefined);
  }

  function startEditingMemory(item: AgentMemoryItem) {
    setEditingMemoryId(item.id);
    setEditingMemoryContent(item.content);
    setEditingMemorySource(item.source);
    setPendingDeleteMemoryId(undefined);
    setMemoryMutationError(undefined);
  }

  async function saveEditingMemory() {
    if (!editingMemoryId) {
      return;
    }

    setMemoryMutationStatus("saving");
    setMemoryMutationError(undefined);

    try {
      const body = await apiRequest<AgentMemoryMutationResponse>(
        `/api/agent/memory/${editingMemoryId}`,
        {
          errorMessage: "Agent 记忆保存失败，请稍后重试。",
          json: {
            content: editingMemoryContent,
            source: editingMemorySource,
          },
          method: "PATCH",
        },
      );

      setMemoryItems((current) =>
        current.map((item) =>
          item.id === body.memoryItem.id ? body.memoryItem : item,
        ),
      );

      if (body.memoryItem.memoryType === "working_digest" && body.memoryItem.sessionId) {
        setActiveSession((current) =>
          current && current.id === body.memoryItem.sessionId
            ? {
                ...current,
                memoryDigest: body.memoryItem.content,
                updatedAt: body.memoryItem.updatedAt,
              }
            : current,
        );
        setSessions((current) =>
          current.map((session) =>
            session.id === body.memoryItem.sessionId
              ? {
                  ...session,
                  memoryDigest: body.memoryItem.content,
                  updatedAt: body.memoryItem.updatedAt,
                }
              : session,
          ),
        );
      }

      resetMemoryEditing();
      setMemoryMutationStatus("idle");
    } catch (error) {
      setMemoryMutationError(
        readErrorMessage(error, "Agent 记忆保存失败，请稍后重试。"),
      );
      setMemoryMutationStatus("error");
    }
  }

  async function deleteMemoryItem(memoryId: number) {
    if (pendingDeleteMemoryId !== memoryId) {
      setPendingDeleteMemoryId(memoryId);
      setEditingMemoryId(undefined);
      setMemoryMutationError(undefined);
      return;
    }

    setMemoryMutationStatus("saving");
    setMemoryMutationError(undefined);

    try {
      const body = await apiRequest<AgentMemoryMutationResponse>(
        `/api/agent/memory/${memoryId}`,
        {
          errorMessage: "Agent 记忆删除失败，请稍后重试。",
          method: "DELETE",
        },
      );

      setMemoryItems((current) =>
        current.filter((item) => item.id !== body.memoryItem.id),
      );

      if (body.memoryItem.memoryType === "working_digest" && body.memoryItem.sessionId) {
        setActiveSession((current) =>
          current && current.id === body.memoryItem.sessionId
            ? {
                ...current,
                memoryDigest: null,
                updatedAt: body.memoryItem.updatedAt,
              }
            : current,
        );
        setSessions((current) =>
          current.map((session) =>
            session.id === body.memoryItem.sessionId
              ? {
                  ...session,
                  memoryDigest: null,
                  updatedAt: body.memoryItem.updatedAt,
                }
              : session,
          ),
        );
      }

      resetMemoryEditing();
      setMemoryMutationStatus("idle");
    } catch (error) {
      setMemoryMutationError(
        readErrorMessage(error, "Agent 记忆删除失败，请稍后重试。"),
      );
      setMemoryMutationStatus("error");
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

  return {
    activeSession,
    ...(activeSessionId ? { activeSessionId } : {}),
    contextData,
    editingMemoryContent,
    ...(editingMemoryId ? { editingMemoryId } : {}),
    editingMemorySource,
    ...(contextError ? { error: contextError } : {}),
    latestCitations,
    ...(memoryError ? { memoryError } : {}),
    memoryItems,
    ...(memoryMutationError ? { memoryMutationError } : {}),
    memoryMutationStatus,
    memoryStatus,
    onCancelMemoryEdit: resetMemoryEditing,
    onCreateSession: () => void createAgentSession(),
    onDeleteMemory: (memoryId) => void deleteMemoryItem(memoryId),
    onEditMemory: startEditingMemory,
    onEditingMemoryContentChange: setEditingMemoryContent,
    onEditingMemorySourceChange: setEditingMemorySource,
    onReload: () => void loadContextPanel(),
    onSaveMemory: () => void saveEditingMemory(),
    onSelectSession: (sessionId) => void selectAgentSession(sessionId),
    ...(pendingDeleteMemoryId ? { pendingDeleteMemoryId } : {}),
    ...(sessionError ? { sessionError } : {}),
    sessionMutationStatus,
    sessions,
    sessionStatus,
    status: contextStatus,
  };
}

export function AssistantControlPanels({
  activeSession,
  activeSessionId,
  className = "space-y-4",
  contextData,
  editingMemoryContent,
  editingMemoryId,
  editingMemorySource,
  error,
  memoryError,
  memoryItems,
  memoryMutationError,
  memoryMutationStatus,
  memoryStatus,
  onCancelMemoryEdit,
  onCreateSession,
  onDeleteMemory,
  onEditMemory,
  onEditingMemoryContentChange,
  onEditingMemorySourceChange,
  onReload,
  onSaveMemory,
  onSelectSession,
  pendingDeleteMemoryId,
  sessionError,
  sessionMutationStatus,
  sessions,
  sessionStatus,
  showSessionPicker = false,
  status,
}: AssistantControlPanelsProps) {
  return (
    <div className={className}>
      <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)]">
        <PanelHeader
          icon={<Brain aria-hidden="true" className="size-5" strokeWidth={1.8} />}
          title="可控记忆"
          action={
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                disabled={sessionMutationStatus === "saving"}
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
              <a
                className="inline-flex h-9 items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-bold leading-4 text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)]"
                href="/api/export"
                rel="noreferrer"
                target="_blank"
              >
                <Download aria-hidden="true" className="size-4" />
                导出
              </a>
            </div>
          }
        />
        {showSessionPicker ? (
          <SessionPicker
            activeSessionId={activeSessionId}
            onSelectSession={onSelectSession}
            sessions={sessions}
            sessionStatus={sessionStatus}
          />
        ) : null}
        {sessionError ? <PanelNotice message={sessionError} tone="error" /> : null}
        {memoryMutationError ? (
          <PanelNotice message={memoryMutationError} tone="error" />
        ) : null}
        {activeSession ? (
          <p className="mt-4 rounded-[14px] border border-[#eedaa6] bg-[#fffaf0] px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]">
            当前会话：{activeSession.title}。删除后的记忆不会再注入到后续回答。
          </p>
        ) : (
          <p className="mt-4 rounded-[16px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-hover)] px-4 py-5 text-sm leading-6 text-[var(--color-text-secondary)]">
            先新建或选择一个会话，再查看和管理它的可见记忆。
          </p>
        )}
        {activeSession ? (
          <>
            {memoryStatus === "loading" ? <PanelListSkeleton rows={3} /> : null}
            {memoryError ? <PanelNotice message={memoryError} tone="error" /> : null}
            {memoryStatus !== "loading" && !memoryError && memoryItems.length === 0 ? (
              <p className="mt-4 rounded-[16px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-hover)] px-4 py-5 text-sm leading-6 text-[var(--color-text-secondary)]">
                这个会话还没有可见记忆。完成一轮问答后，会自动生成可查看的工作摘要。
              </p>
            ) : null}
            {memoryItems.length > 0 ? (
              <div className="mt-4 space-y-3">
                {memoryItems.map((item) => {
                  const isEditing = editingMemoryId === item.id;
                  const isSaving = memoryMutationStatus === "saving";
                  const isPendingDelete = pendingDeleteMemoryId === item.id;

                  return (
                    <article
                      className="rounded-[18px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4"
                      key={item.id}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap gap-2">
                            <StatusPill
                              label={AGENT_MEMORY_TYPE_LABELS[item.memoryType]}
                              tone={item.memoryType === "user_preference" ? "blue" : "neutral"}
                            />
                          </div>
                          <p className="text-[11px] leading-4 text-[var(--color-text-secondary)]">
                            更新于 {formatPanelTime(item.updatedAt)}
                          </p>
                        </div>
                        {!isEditing ? (
                          <div className="flex shrink-0 gap-2">
                            <Button
                              disabled={isSaving}
                              leftIcon={<Pencil aria-hidden="true" className="size-4" />}
                              onClick={() => onEditMemory(item)}
                              size="sm"
                              variant="outline"
                            >
                              编辑
                            </Button>
                            <Button
                              disabled={isSaving}
                              leftIcon={<Trash2 aria-hidden="true" className="size-4" />}
                              onClick={() => onDeleteMemory(item.id)}
                              size="sm"
                              variant={isPendingDelete ? "danger" : "outline"}
                            >
                              {isPendingDelete ? "确认删除" : "删除"}
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      {isEditing ? (
                        <div className="mt-3 space-y-3">
                          <Textarea
                            className="min-h-[120px] resize-y rounded-[14px] border-[var(--color-border)] bg-[var(--color-surface)] text-sm leading-6 text-[var(--color-text)]"
                            onChange={(event) =>
                              onEditingMemoryContentChange(event.target.value)
                            }
                            value={editingMemoryContent}
                          />
                          <label className="block space-y-2">
                            <span className="text-xs font-semibold leading-4 text-[var(--color-text-secondary)]">
                              分类
                            </span>
                            <input
                              className="h-11 w-full rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]"
                              onChange={(event) =>
                                onEditingMemorySourceChange(event.target.value)
                              }
                              value={editingMemorySource}
                            />
                          </label>
                          <div className="flex justify-end gap-2">
                            <Button
                              disabled={isSaving}
                              onClick={onCancelMemoryEdit}
                              size="sm"
                              variant="outline"
                            >
                              取消
                            </Button>
                            <Button
                              disabled={
                                isSaving ||
                                editingMemoryContent.trim().length === 0 ||
                                editingMemorySource.trim().length === 0
                              }
                              leftIcon={
                                isSaving ? (
                                  <Loader2
                                    aria-hidden="true"
                                    className="size-4 animate-spin"
                                  />
                                ) : (
                                  <Save aria-hidden="true" className="size-4" />
                                )
                              }
                              onClick={onSaveMemory}
                              size="sm"
                            >
                              保存
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 whitespace-pre-wrap break-words rounded-[14px] border border-[var(--color-border-light)] bg-[var(--color-surface)] px-3 py-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                          {item.content}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)]">
        <PanelHeader
          icon={<Database aria-hidden="true" className="size-5" strokeWidth={1.8} />}
          title="上下文"
          action={
            <button
              aria-label="刷新上下文"
              className="inline-flex size-9 items-center justify-center rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)]"
              onClick={onReload}
              type="button"
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-4 ${status === "loading" ? "animate-spin" : ""}`}
                strokeWidth={1.8}
              />
            </button>
          }
        />

        {status === "loading" ? <ContextSkeleton /> : null}
        {status === "error" ? (
          <div className="rounded-[18px] border border-[#efd4d0] bg-[#fff0ee] p-4">
            <p className="text-sm font-semibold leading-5 text-[#b45c52]">
              {error ?? "上下文读取失败。"}
            </p>
            <Button
              className="mt-4"
              leftIcon={<RefreshCw aria-hidden="true" className="size-4" />}
              onClick={onReload}
              size="sm"
              variant="outline"
            >
              重新读取
            </Button>
          </div>
        ) : null}
        {status === "ready" && contextData ? (
          <ContextContent contextData={contextData} />
        ) : null}
      </section>

    </div>
  );
}

function SessionPicker({
  activeSessionId,
  onSelectSession,
  sessions,
  sessionStatus,
}: {
  activeSessionId?: number;
  onSelectSession: (sessionId: number) => void;
  sessions: AgentSessionListItem[];
  sessionStatus: AssistantLoadStatus;
}) {
  return (
    <label className="mt-5 block space-y-2">
      <span className="text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
        Agent 会话
      </span>
      <select
        className="w-full cursor-pointer rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-4 py-2.5 text-sm leading-5 text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]"
        disabled={sessionStatus === "loading" || sessions.length === 0}
        onChange={(event) => {
          const nextId = Number(event.target.value);

          if (Number.isSafeInteger(nextId) && nextId > 0) {
            onSelectSession(nextId);
          }
        }}
        value={activeSessionId ?? ""}
      >
        {sessions.length === 0 ? (
          <option value="">暂无会话</option>
        ) : (
          sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.title} · #{session.id}
            </option>
          ))
        )}
      </select>
    </label>
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

function ContextContent({
  contextData,
}: {
  contextData: AssistantContextPanelData;
}) {
  const { analytics, applications, careerProfile, careerProfileConfigured, reports } =
    contextData;
  const isEmpty =
    analytics.sampleSize.reports === 0 &&
    analytics.sampleSize.applications === 0 &&
    analytics.sampleSize.resumes === 0 &&
    !careerProfileConfigured;

  if (isEmpty) {
    return (
      <div className="mt-4 rounded-[18px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4 text-sm leading-6 text-[var(--color-text-secondary)]">
        暂无报告、简历、Tracker 或 Career DNA。Assistant 仍可回答边界问题，但行动建议需要先补充求职记录。
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <ContextMetric label="报告" value={analytics.sampleSize.reports} />
        <ContextMetric label="Tracker" value={analytics.sampleSize.applications} />
        <ContextMetric label="简历" value={analytics.sampleSize.resumes} />
        <ContextMetric label="逾期" value={analytics.tracker.overdueFollowUps} tone="amber" />
      </div>

      <ContextBlock
        icon={<Target aria-hidden="true" className="size-4" strokeWidth={1.8} />}
        title="Career DNA"
      >
        <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
          {careerProfileConfigured
            ? [
                careerProfile.targetRoles.slice(0, 3).join("、") || "目标岗位未填写",
                careerProfile.targetCities.slice(0, 3).join("、") || "城市未填写",
              ].join(" · ")
            : "尚未完整配置"}
        </p>
      </ContextBlock>

      <ContextBlock
        icon={<ClipboardList aria-hidden="true" className="size-4" strokeWidth={1.8} />}
        title="Tracker 重点"
      >
        <div className="space-y-2">
          {applications.slice(0, 4).map((application) => (
            <SmallSourceRow
              href="/applications"
              key={application.id}
              meta={`#${application.id} · ${APPLICATION_STATUS_LABELS[application.status]}`}
              title={`${application.company} · ${application.role}`}
            />
          ))}
          {applications.length === 0 ? (
            <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
              暂无 Tracker 记录。
            </p>
          ) : null}
        </div>
      </ContextBlock>

      <ContextBlock
        icon={<FileText aria-hidden="true" className="size-4" strokeWidth={1.8} />}
        title="最近报告"
      >
        <div className="space-y-2">
          {reports.slice(0, 4).map((report) => (
            <SmallSourceRow
              href="/reports"
              key={report.id}
              meta={`#${report.id} · ${report.score.overall.toFixed(1)} / 5`}
              title={`${report.company} · ${report.role}`}
            />
          ))}
          {reports.length === 0 ? (
            <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
              暂无报告。
            </p>
          ) : null}
        </div>
      </ContextBlock>
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

function ContextBlock({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold leading-5 text-[var(--color-text)]">
        <span className="text-[var(--color-primary)]">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function ContextMetric({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "amber" | "neutral";
  value: number;
}) {
  return (
    <div className="rounded-[16px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] px-4 py-3">
      <p
        className={`text-xl font-semibold leading-7 ${
          tone === "amber" && value > 0
            ? "text-[var(--color-primary)]"
            : "text-[var(--color-text)]"
        }`}
      >
        {value}
      </p>
      <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
        {label}
      </p>
    </div>
  );
}

function SmallSourceRow({
  href,
  meta,
  title,
}: {
  href: string;
  meta: string;
  title: string;
}) {
  return (
    <Link
      className="block rounded-[12px] border border-[var(--color-border-light)] bg-[var(--color-surface)] px-3 py-2 transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)]"
      href={href}
    >
      <p className="truncate text-xs font-bold leading-4 text-[var(--color-text)]">
        {title}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-[var(--color-text-secondary)]">
        {meta}
      </p>
    </Link>
  );
}

function ContextSkeleton() {
  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="h-20 animate-pulse rounded-[16px] bg-[var(--color-border-light)]"
            key={index}
          />
        ))}
      </div>
      <div className="h-28 animate-pulse rounded-[18px] bg-[var(--color-border-light)]" />
      <div className="h-36 animate-pulse rounded-[18px] bg-[var(--color-border-light)]" />
    </div>
  );
}

function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "blue" | "green" | "neutral" | "red";
}) {
  const toneClass = {
    blue: "border-[#b8d8ef] bg-[#edf7ff] text-[var(--color-blue)]",
    green: "border-[#d7e7d2] bg-[#eef6eb] text-[#5f7f50]",
    neutral:
      "border-[var(--color-border)] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]",
    red: "border-[#efd4d0] bg-[#fff0ee] text-[var(--color-red)]",
  }[tone];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-4 ${toneClass}`}
    >
      {label}
    </span>
  );
}

function getLatestAssistantCitations(
  session: AgentSession | null,
): AssistantCitation[] {
  const latestAssistantMessage = [...(session?.messages ?? [])]
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" &&
        Array.isArray(message.citations) &&
        message.citations.length > 0,
    );

  return latestAssistantMessage?.citations ?? [];
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

function isCareerProfileEmpty(profile: CareerProfileSettings): boolean {
  return (
    profile.targetDirections.length === 0 &&
    profile.targetRoles.length === 0 &&
    profile.targetCities.length === 0 &&
    profile.preferredWorkModes.length === 0 &&
    profile.strengths.length === 0 &&
    profile.weaknesses.length === 0 &&
    profile.dealBreakers.length === 0 &&
    profile.preferredCompanyStages.length === 0 &&
    !profile.currentStrategy?.trim()
  );
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
