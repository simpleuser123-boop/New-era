"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardList,
  Columns3,
  ExternalLink,
  FileText,
  Flag,
  Gauge,
  History,
  List,
  Loader2,
  MessageSquarePlus,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Tag,
  Timer,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Textarea } from "@/components/ui/Textarea";
import { apiRequest, readErrorMessage } from "@/lib/api-client";
import {
  APPLICATION_EVENT_TYPES,
  APPLICATION_PRIORITIES,
  APPLICATION_STATUSES,
  type ApplicationDto,
  type ApplicationEventDto,
  type ApplicationEventType,
  type ApplicationPriority,
  type ApplicationStatus,
  type RiskLevel,
} from "@/lib/types";

type ApplicationsResponse = {
  ok: true;
  applications: ApplicationDto[];
  count: number;
  limit: number;
};

type ApplicationUpdateResponse = {
  ok: true;
  application: ApplicationDto;
  events?: ApplicationEventDto[];
};

type ApplicationEventsResponse = {
  ok: true;
  events: ApplicationEventDto[];
};

type ApplicationEventCreateResponse = {
  ok: true;
  event: ApplicationEventDto;
  events: ApplicationEventDto[];
};

type LoadStatus = "loading" | "ready" | "error";
type ApplicationStatusFilter = ApplicationStatus | "all";
type ApplicationPriorityFilter = ApplicationPriority | "all";
type ApplicationViewMode = "list" | "board";
type EventLoadStatus = "idle" | "loading" | "ready" | "error";
type FeedbackTone = "pending" | "success" | "error";
type FeedbackState = {
  message: string;
  tone: FeedbackTone;
};
type ApplicationDetailDraft = {
  abandonedAt: string;
  appliedAt: string;
  channel: string;
  interviewAt: string;
  notes: string;
  offerAt: string;
  priority: ApplicationPriority;
  rejectedAt: string;
  tagsText: string;
  sourceUrl: string;
  nextFollowUpAt: string;
};
type ApplicationEventDraft = {
  eventType: ApplicationEventType;
  happenedAt: string;
  note: string;
  title: string;
};

const APPLICATIONS_LIMIT = 100;
const STATUS_LABELS: Record<ApplicationStatus, string> = {
  abandoned: "已放弃",
  applied: "已投递",
  interviewing: "面试中",
  offer_received: "已获 Offer",
  rejected: "未通过",
  to_apply: "待投递",
};
const STATUS_STYLES: Record<ApplicationStatus, string> = {
  abandoned:
    "border-[var(--color-border)] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]",
  applied: "border-[#d7e7d2] bg-[#eef6eb] text-[#5f7f50]",
  interviewing: "border-[#cfe2f7] bg-[#f1f7ff] text-[#2f6aa3]",
  offer_received: "border-[#cfe8dc] bg-[#eef8f2] text-[#2e7d57]",
  rejected: "border-[#efd4d0] bg-[#fff0ee] text-[#b45c52]",
  to_apply: "border-[#eedaa6] bg-[#fff7df] text-[#875006]",
};
const STATUS_OPTIONS = APPLICATION_STATUSES.map((status) => ({
  label: STATUS_LABELS[status],
  value: status,
}));
const STATUS_FILTERS: Array<{
  label: string;
  value: ApplicationStatusFilter;
}> = [{ label: "全部", value: "all" }, ...STATUS_OPTIONS];
const PRIORITY_LABELS: Record<ApplicationPriority, string> = {
  high: "高优先级",
  low: "低优先级",
  medium: "中优先级",
};
const PRIORITY_STYLES: Record<ApplicationPriority, string> = {
  high: "border-[#efd4d0] bg-[#fff0ee] text-[#b45c52]",
  low: "border-[var(--color-border)] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]",
  medium: "border-[#eedaa6] bg-[#fff7df] text-[#875006]",
};
const PRIORITY_OPTIONS = APPLICATION_PRIORITIES.map((priority) => ({
  label: PRIORITY_LABELS[priority],
  value: priority,
}));
const PRIORITY_FILTERS: Array<{
  label: string;
  value: ApplicationPriorityFilter;
}> = [{ label: "全部优先级", value: "all" }, ...PRIORITY_OPTIONS];
const EVENT_TYPE_LABELS: Record<ApplicationEventType, string> = {
  abandoned: "已放弃",
  created: "加入清单",
  follow_up_scheduled: "跟进安排",
  interview_scheduled: "面试安排",
  note_added: "备注",
  offer_received: "Offer",
  rejected: "未通过",
  status_changed: "状态变化",
};
const EVENT_TYPE_OPTIONS = APPLICATION_EVENT_TYPES.filter(
  (eventType) => eventType !== "created",
).map((eventType) => ({
  label: EVENT_TYPE_LABELS[eventType],
  value: eventType,
}));
const MANUAL_STATUS_NOTE =
  "“已投递”表示你已在外部渠道手动完成投递，New Era 只记录本地进度。";
const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  critical: "极高风险",
  high: "高风险",
  low: "低风险",
  medium: "中风险",
};
const RISK_LEVEL_STYLES: Record<RiskLevel, string> = {
  critical: "border-[#e7beb8] bg-[#fff6f4] text-[var(--color-red)]",
  high: "border-[#efd4d0] bg-[#fff0ee] text-[#b45c52]",
  low: "border-[#d7e7d2] bg-[#eef6eb] text-[#5f7f50]",
  medium: "border-[#eedaa6] bg-[#fff7df] text-[#875006]",
};
const TERMINAL_APPLICATION_STATUSES = new Set<ApplicationStatus>([
  "abandoned",
  "offer_received",
  "rejected",
]);
const DEFAULT_EVENT_DRAFT: ApplicationEventDraft = {
  eventType: "note_added",
  happenedAt: "",
  note: "",
  title: "",
};

export function ApplicationWorkspace() {
  const [applications, setApplications] = useState<ApplicationDto[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string>();
  const [statusFeedbackById, setStatusFeedbackById] = useState<
    Record<number, FeedbackState | undefined>
  >({});
  const [pendingStatusById, setPendingStatusById] = useState<
    Partial<Record<number, ApplicationStatus>>
  >({});
  const [selectedApplicationId, setSelectedApplicationId] = useState<
    number | null
  >(null);
  const [detailDraft, setDetailDraft] = useState<ApplicationDetailDraft | null>(
    null,
  );
  const [detailFeedback, setDetailFeedback] = useState<FeedbackState>();
  const [savingDetailId, setSavingDetailId] = useState<number | null>(null);
  const [eventsByApplicationId, setEventsByApplicationId] = useState<
    Record<number, ApplicationEventDto[] | undefined>
  >({});
  const [eventLoadStatusById, setEventLoadStatusById] = useState<
    Record<number, EventLoadStatus | undefined>
  >({});
  const [eventErrorById, setEventErrorById] = useState<
    Record<number, string | undefined>
  >({});
  const [eventDraft, setEventDraft] =
    useState<ApplicationEventDraft>(DEFAULT_EVENT_DRAFT);
  const [eventFeedback, setEventFeedback] = useState<FeedbackState>();
  const [savingEventId, setSavingEventId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<ApplicationStatusFilter>("all");
  const [priorityFilter, setPriorityFilter] =
    useState<ApplicationPriorityFilter>("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ApplicationViewMode>("list");

  const sortedApplications = useMemo(
    () => [...applications].sort(compareApplicationsByUpdatedAtDesc),
    [applications],
  );
  const channelOptions = useMemo(() => {
    const channels = new Set<string>();

    for (const application of sortedApplications) {
      if (application.channel?.trim()) {
        channels.add(application.channel.trim());
      }
    }

    return [...channels].sort((first, second) =>
      first.localeCompare(second, "zh-CN"),
    );
  }, [sortedApplications]);
  const filteredApplications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sortedApplications.filter((application) => {
      const matchesStatus =
        statusFilter === "all" ? true : application.status === statusFilter;
      const matchesPriority =
        priorityFilter === "all" ? true : application.priority === priorityFilter;
      const matchesChannel =
        channelFilter === "all" ? true : application.channel === channelFilter;
      const matchesQuery = normalizedQuery
        ? `${application.company} ${application.role} ${application.channel ?? ""}`
            .toLowerCase()
            .includes(normalizedQuery)
        : true;

      return matchesStatus && matchesPriority && matchesChannel && matchesQuery;
    });
  }, [channelFilter, priorityFilter, query, sortedApplications, statusFilter]);
  const selectedApplication = useMemo(() => {
    if (selectedApplicationId === null) {
      return null;
    }

    return (
      filteredApplications.find(
        (application) => application.id === selectedApplicationId,
      ) ?? null
    );
  }, [filteredApplications, selectedApplicationId]);
  const overdueCount = useMemo(
    () => applications.filter(isApplicationOverdue).length,
    [applications],
  );
  const highPriorityCount = useMemo(
    () => applications.filter((application) => application.priority === "high").length,
    [applications],
  );
  const hasActiveFilters =
    query.trim().length > 0 ||
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    channelFilter !== "all";

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialApplications() {
      try {
        const body = await fetchApplications(controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setApplications(body.applications);
        setStatusFeedbackById({});
        setPendingStatusById({});
        setEventsByApplicationId({});
        setEventLoadStatusById({});
        setEventErrorById({});
        setLoadStatus("ready");
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }

        setApplications([]);
        setErrorMessage(readErrorMessage(error, "投递清单读取失败，请稍后重试。"));
        setLoadStatus("error");
      }
    }

    void loadInitialApplications();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (filteredApplications.length === 0) {
      setSelectedApplicationId(null);
      setDetailDraft(null);
      setDetailFeedback(undefined);
      setEventFeedback(undefined);
      return;
    }

    const selected = filteredApplications.find(
      (application) => application.id === selectedApplicationId,
    );

    if (selected) {
      setDetailDraft((current) => current ?? createDetailDraft(selected));
      return;
    }

    const nextSelected = filteredApplications[0];

    setSelectedApplicationId(nextSelected.id);
    setDetailDraft(createDetailDraft(nextSelected));
    setDetailFeedback(undefined);
    setEventFeedback(undefined);
  }, [filteredApplications, selectedApplicationId]);

  useEffect(() => {
    if (selectedApplicationId === null) {
      return;
    }

    const currentStatus = eventLoadStatusById[selectedApplicationId] ?? "idle";

    if (currentStatus === "loading" || currentStatus === "ready") {
      return;
    }

    const controller = new AbortController();

    setEventLoadStatusById((current) => ({
      ...current,
      [selectedApplicationId]: "loading",
    }));
    setEventErrorById((current) => ({
      ...current,
      [selectedApplicationId]: undefined,
    }));

    async function loadEvents(applicationId: number) {
      try {
        const body = await fetchApplicationEvents(applicationId, controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setEventsByApplicationId((current) => ({
          ...current,
          [applicationId]: body.events,
        }));
        setEventLoadStatusById((current) => ({
          ...current,
          [applicationId]: "ready",
        }));
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }

        setEventErrorById((current) => ({
          ...current,
          [applicationId]: readErrorMessage(
            error,
            "投递时间线读取失败，请稍后重试。",
          ),
        }));
        setEventLoadStatusById((current) => ({
          ...current,
          [applicationId]: "error",
        }));
      }
    }

    void loadEvents(selectedApplicationId);

    return () => controller.abort();
  }, [eventLoadStatusById, selectedApplicationId]);

  function resetFilters() {
    setQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setChannelFilter("all");
  }

  function handleSelectApplication(applicationId: number) {
    const application = applications.find((item) => item.id === applicationId);

    setSelectedApplicationId(applicationId);
    setDetailDraft(application ? createDetailDraft(application) : null);
    setDetailFeedback(undefined);
    setEventFeedback(undefined);
  }

  function handleRetryEvents(applicationId: number) {
    setEventLoadStatusById((current) => ({
      ...current,
      [applicationId]: "idle",
    }));
  }

  async function handleRetry() {
    setLoadStatus("loading");
    setErrorMessage(undefined);
    setSelectedApplicationId(null);
    setDetailDraft(null);
    setDetailFeedback(undefined);
    setEventFeedback(undefined);

    try {
      const body = await fetchApplications();

      setApplications(body.applications);
      setStatusFeedbackById({});
      setPendingStatusById({});
      setEventsByApplicationId({});
      setEventLoadStatusById({});
      setEventErrorById({});
      setLoadStatus("ready");
    } catch (error) {
      setApplications([]);
      setErrorMessage(readErrorMessage(error, "投递清单读取失败，请稍后重试。"));
      setLoadStatus("error");
    }
  }

  async function handleStatusChange(
    applicationId: number,
    nextStatus: ApplicationStatus,
  ) {
    const currentApplication = applications.find(
      (application) => application.id === applicationId,
    );

    if (
      !currentApplication ||
      currentApplication.status === nextStatus ||
      pendingStatusById[applicationId]
    ) {
      return;
    }

    setPendingStatusById((current) => ({
      ...current,
      [applicationId]: nextStatus,
    }));
    setStatusFeedbackById((current) => ({
      ...current,
      [applicationId]: {
        message: `正在更新为${STATUS_LABELS[nextStatus]}...`,
        tone: "pending",
      },
    }));

    try {
      const body = await apiRequest<ApplicationUpdateResponse>(
        `/api/applications/${applicationId}`,
        {
          errorMessage: "投递状态更新失败，请稍后重试。",
          json: { status: nextStatus },
          method: "PATCH",
        },
      );

      setApplications((current) =>
        current.map((application) =>
          application.id === applicationId ? body.application : application,
        ),
      );
      if (body.events) {
        setEventsByApplicationId((current) => ({
          ...current,
          [applicationId]: body.events,
        }));
        setEventLoadStatusById((current) => ({
          ...current,
          [applicationId]: "ready",
        }));
      }
      setStatusFeedbackById((current) => ({
        ...current,
        [applicationId]: {
          message: `状态已更新为${STATUS_LABELS[body.application.status]}。`,
          tone: "success",
        },
      }));
    } catch (error) {
      setStatusFeedbackById((current) => ({
        ...current,
        [applicationId]: {
          message: readErrorMessage(error, "投递状态更新失败，请稍后重试。"),
          tone: "error",
        },
      }));
    } finally {
      setPendingStatusById((current) => {
        const next = { ...current };
        delete next[applicationId];
        return next;
      });
    }
  }

  async function handleDetailSave() {
    if (!selectedApplication || !detailDraft || savingDetailId !== null) {
      return;
    }

    setSavingDetailId(selectedApplication.id);
    setDetailFeedback({
      message: "正在保存跟进详情...",
      tone: "pending",
    });

    try {
      const body = await apiRequest<ApplicationUpdateResponse>(
        `/api/applications/${selectedApplication.id}`,
        {
          errorMessage: "投递详情保存失败，请稍后重试。",
          json: {
            abandonedAt: normalizeOptionalText(detailDraft.abandonedAt),
            appliedAt: normalizeOptionalText(detailDraft.appliedAt),
            channel: normalizeOptionalText(detailDraft.channel),
            interviewAt: normalizeOptionalText(detailDraft.interviewAt),
            nextFollowUpAt: normalizeOptionalText(detailDraft.nextFollowUpAt),
            notes: detailDraft.notes,
            offerAt: normalizeOptionalText(detailDraft.offerAt),
            priority: detailDraft.priority,
            rejectedAt: normalizeOptionalText(detailDraft.rejectedAt),
            sourceUrl: normalizeOptionalText(detailDraft.sourceUrl),
            tags: parseTagsInput(detailDraft.tagsText),
          },
          method: "PATCH",
        },
      );

      setApplications((current) =>
        current.map((application) =>
          application.id === body.application.id ? body.application : application,
        ),
      );
      if (body.events) {
        setEventsByApplicationId((current) => ({
          ...current,
          [body.application.id]: body.events,
        }));
        setEventLoadStatusById((current) => ({
          ...current,
          [body.application.id]: "ready",
        }));
      }
      setDetailDraft(createDetailDraft(body.application));
      setDetailFeedback({
        message: "跟进详情已保存。",
        tone: "success",
      });
    } catch (error) {
      setDetailFeedback({
        message: readErrorMessage(error, "投递详情保存失败，请稍后重试。"),
        tone: "error",
      });
    } finally {
      setSavingDetailId(null);
    }
  }

  async function handleEventSave() {
    if (!selectedApplication || savingEventId !== null) {
      return;
    }

    setSavingEventId(selectedApplication.id);
    setEventFeedback({
      message: "正在新增时间线事件...",
      tone: "pending",
    });

    try {
      const body = await apiRequest<ApplicationEventCreateResponse>(
        `/api/applications/${selectedApplication.id}/events`,
        {
          errorMessage: "时间线事件新增失败，请稍后重试。",
          json: {
            eventType: eventDraft.eventType,
            happenedAt: normalizeOptionalText(eventDraft.happenedAt) ?? undefined,
            note: eventDraft.note,
            title: normalizeOptionalText(eventDraft.title) ?? undefined,
          },
          method: "POST",
        },
      );

      setEventsByApplicationId((current) => ({
        ...current,
        [selectedApplication.id]: body.events,
      }));
      setEventLoadStatusById((current) => ({
        ...current,
        [selectedApplication.id]: "ready",
      }));
      setEventDraft(DEFAULT_EVENT_DRAFT);
      setEventFeedback({
        message: "时间线事件已新增。",
        tone: "success",
      });
    } catch (error) {
      setEventFeedback({
        message: readErrorMessage(error, "时间线事件新增失败，请稍后重试。"),
        tone: "error",
      });
    } finally {
      setSavingEventId(null);
    }
  }

  if (loadStatus === "loading") {
    return <ApplicationLoadingState />;
  }

  if (loadStatus === "error") {
    return (
      <ErrorState
        action={
          <Button
            leftIcon={<RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.8} />}
            onClick={() => void handleRetry()}
            size="md"
            type="button"
          >
            重新加载
          </Button>
        }
        description={errorMessage}
        title="投递清单加载失败"
      />
    );
  }

  if (applications.length === 0) {
    return (
      <EmptyState
        action={
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-5 py-2 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
            href="/evaluate"
          >
            <BarChart3 aria-hidden="true" className="size-4" strokeWidth={1.8} />
            去评估岗位
          </Link>
        }
        description="完成 JD 评估后，可从报告页把岗位加入本地投递清单。"
        icon={
          <ClipboardList
            aria-hidden="true"
            className="size-6"
            strokeWidth={1.8}
          />
        }
        title="暂无投递记录"
      />
    );
  }

  return (
    <section
      aria-label="投递清单内容区"
      className="overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]"
    >
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            投递清单
          </h2>
          <p className="mt-1 text-sm leading-5 text-[var(--color-text-secondary)]">
            {hasActiveFilters
              ? `已从 ${applications.length} 条本地记录中筛出 ${filteredApplications.length} 条。`
              : `当前展示最近更新的 ${applications.length} 条本地记录。`}
          </p>
          <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
            {MANUAL_STATUS_NOTE}
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-3 py-2 text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
          <BriefcaseBusiness
            aria-hidden="true"
            className="size-4"
            strokeWidth={1.8}
          />
          本地清单
        </span>
      </div>

      <ApplicationFilters
        channelFilter={channelFilter}
        channelOptions={channelOptions}
        onQueryChange={setQuery}
        onChannelFilterChange={setChannelFilter}
        onPriorityFilterChange={setPriorityFilter}
        onReset={resetFilters}
        onStatusFilterChange={setStatusFilter}
        onViewModeChange={setViewMode}
        priorityFilter={priorityFilter}
        query={query}
        showReset={hasActiveFilters}
        statusFilter={statusFilter}
        viewMode={viewMode}
      />

      <TrackerSummary
        applications={applications}
        highPriorityCount={highPriorityCount}
        overdueCount={overdueCount}
      />

      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,420px)]">
        <div className="min-w-0 border-b border-[var(--color-border)] lg:border-b-0 lg:border-r">
          {filteredApplications.length > 0 ? (
            viewMode === "list" ? (
              <div className="divide-y divide-[var(--color-border)]">
                {filteredApplications.map((application) => (
                  <ApplicationListItem
                    application={application}
                    feedback={statusFeedbackById[application.id]}
                    isSelected={selectedApplicationId === application.id}
                    isUpdating={Boolean(pendingStatusById[application.id])}
                    key={application.id}
                    onSelect={handleSelectApplication}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            ) : (
              <ApplicationBoard
                applications={filteredApplications}
                selectedApplicationId={selectedApplicationId}
                onSelect={handleSelectApplication}
              />
            )
          ) : (
            <ApplicationNoMatchesState onReset={resetFilters} />
          )}
        </div>

        <ApplicationDetailPanel
          application={selectedApplication}
          draft={detailDraft}
          eventDraft={eventDraft}
          eventError={selectedApplication ? eventErrorById[selectedApplication.id] : undefined}
          eventFeedback={eventFeedback}
          eventLoadStatus={
            selectedApplication
              ? eventLoadStatusById[selectedApplication.id] ?? "idle"
              : "idle"
          }
          events={
            selectedApplication
              ? eventsByApplicationId[selectedApplication.id] ?? []
              : []
          }
          feedback={detailFeedback}
          isSavingEvent={
            selectedApplication !== null &&
            savingEventId === selectedApplication.id
          }
          isSaving={
            selectedApplication !== null &&
            savingDetailId === selectedApplication.id
          }
          onDraftChange={setDetailDraft}
          onEventDraftChange={setEventDraft}
          onEventSave={() => void handleEventSave()}
          onRetryEvents={handleRetryEvents}
          onSave={() => void handleDetailSave()}
        />
      </div>
    </section>
  );
}

async function fetchApplications(
  signal?: AbortSignal,
): Promise<ApplicationsResponse> {
  return apiRequest<ApplicationsResponse>(
    `/api/applications?limit=${APPLICATIONS_LIMIT}`,
    {
      cache: "no-store",
      errorMessage: "投递清单读取失败，请稍后重试。",
      signal,
    },
  );
}

async function fetchApplicationEvents(
  applicationId: number,
  signal?: AbortSignal,
): Promise<ApplicationEventsResponse> {
  return apiRequest<ApplicationEventsResponse>(
    `/api/applications/${applicationId}/events`,
    {
      cache: "no-store",
      errorMessage: "投递时间线读取失败，请稍后重试。",
      signal,
    },
  );
}

function ApplicationLoadingState() {
  return (
    <section
      aria-label="投递清单加载中"
      aria-live="polite"
      className="space-y-4"
    >
      <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-6">
        <div className="flex items-center gap-3 text-sm font-bold leading-5 text-[var(--color-text-secondary)]">
          <Loader2
            aria-hidden="true"
            className="size-5 animate-spin text-[var(--color-primary)]"
            strokeWidth={1.8}
          />
          正在加载投递清单
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,420px)]">
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, index) => (
            <article
              className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)] sm:p-6"
              key={index}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="h-5 w-56 max-w-full animate-pulse rounded-full bg-[var(--color-border-light)]" />
                  <div className="h-4 w-72 max-w-full animate-pulse rounded-full bg-[var(--color-border-light)]" />
                </div>
                <div className="h-8 w-20 animate-pulse rounded-[10px] bg-[var(--color-border-light)]" />
              </div>
            </article>
          ))}
        </div>

        <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
          <div className="h-6 w-28 animate-pulse rounded-full bg-[var(--color-border-light)]" />
          <div className="mt-6 h-32 animate-pulse rounded-[18px] bg-[var(--color-border-light)]" />
          <div className="mt-4 h-12 animate-pulse rounded-[14px] bg-[var(--color-border-light)]" />
          <div className="mt-4 h-12 animate-pulse rounded-[14px] bg-[var(--color-border-light)]" />
        </div>
      </div>
    </section>
  );
}

function ApplicationListItem({
  application,
  feedback,
  isSelected,
  isUpdating,
  onSelect,
  onStatusChange,
}: {
  application: ApplicationDto;
  feedback?: FeedbackState;
  isSelected: boolean;
  isUpdating: boolean;
  onSelect: (applicationId: number) => void;
  onStatusChange: (applicationId: number, nextStatus: ApplicationStatus) => void;
}) {
  const statusClassName = STATUS_STYLES[application.status];
  const priorityClassName = PRIORITY_STYLES[application.priority];
  const risk = getRiskPresentation(application.riskLevel);
  const selectId = `application-status-${application.id}`;
  const tags = application.tags.slice(0, 3);
  const extraTagCount = application.tags.length - tags.length;
  const isOverdue = isApplicationOverdue(application);

  return (
    <article
      className={`px-5 py-5 transition-colors sm:px-6 ${
        isSelected
          ? "bg-[rgba(196,135,58,0.08)]"
          : "hover:bg-[var(--color-surface-hover)]"
      }`}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start">
        <button
          className="min-w-0 text-left outline-none"
          onClick={() => onSelect(application.id)}
          type="button"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--color-primary-light)] text-sm font-bold text-[var(--color-primary)]">
              {buildInitials(application.company)}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-bold leading-4 ${statusClassName}`}
            >
              {STATUS_LABELS[application.status]}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-bold leading-4 ${risk.className}`}
            >
              {risk.label}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-bold leading-4 ${priorityClassName}`}
            >
              {PRIORITY_LABELS[application.priority]}
            </span>
            {application.channel ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
                <Tag aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                {application.channel}
              </span>
            ) : null}
            {application.nextFollowUpAt ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold leading-4 ${
                  isOverdue
                    ? "border-[#efd4d0] bg-[#fff0ee] text-[#b45c52]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]"
                }`}
              >
                <Timer aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                跟进 {formatShortDateTime(application.nextFollowUpAt)}
              </span>
            ) : null}
          </div>
          <h3 className="break-words text-lg font-semibold leading-7 text-[var(--color-text)]">
            {application.role}
          </h3>
          <p className="mt-1 break-words text-sm leading-5 text-[var(--color-text-secondary)]">
            {application.company}
          </p>

          {tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium leading-4 text-[var(--color-text-secondary)]"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
              {extraTagCount > 0 ? (
                <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium leading-4 text-[var(--color-text-secondary)]">
                  +{extraTagCount}
                </span>
              ) : null}
            </div>
          ) : null}

          {application.notes.trim() ? (
            <p className="mt-3 break-words text-sm leading-6 text-[var(--color-text-secondary)]">
              {application.notes.trim()}
            </p>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
              暂无备注，点击右侧详情区补充跟进判断和下一步动作。
            </p>
          )}
        </button>

        <div className="min-w-0 space-y-4">
          <div className="rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label
                className="text-xs font-bold leading-4 text-[var(--color-text-secondary)]"
                htmlFor={selectId}
              >
                手动更新状态
              </label>
              {isUpdating ? (
                <span className="inline-flex items-center gap-2 text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
                  <Loader2
                    aria-hidden="true"
                    className="size-4 animate-spin text-[var(--color-primary)]"
                    strokeWidth={1.8}
                  />
                  更新中
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                className="h-10 w-full min-w-0 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.18)] disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isUpdating}
                id={selectId}
                onChange={(event) =>
                  void onStatusChange(
                    application.id,
                    event.target.value as ApplicationStatus,
                  )
                }
                value={application.status}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
            {feedback ? (
              <p
                className={`mt-2 text-xs leading-5 ${feedbackToneClassName(
                  feedback.tone,
                )}`}
                role="status"
              >
                {feedback.message}
              </p>
            ) : null}
          </div>

          <dl className="grid min-w-0 gap-x-5 gap-y-4 text-sm sm:grid-cols-2">
            <ApplicationFact
              icon={
                <Gauge aria-hidden="true" className="size-4" strokeWidth={1.8} />
              }
              label="综合评分"
              value={formatScore(application.scoreOverall)}
            />
            <ApplicationFact
              icon={
                <ShieldAlert
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.8}
                />
              }
              label="风险等级"
              value={risk.label}
            />
            <ApplicationFact
              icon={
                <FileText
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.8}
                />
              }
              label="推荐简历"
              value={formatRecommendedResumeName(
                application.recommendedResumeName,
              )}
            />
            <ApplicationFact
              icon={
                <Flag aria-hidden="true" className="size-4" strokeWidth={1.8} />
              }
              label="优先级"
              value={PRIORITY_LABELS[application.priority]}
            />
            <ApplicationFact
              icon={
                <Tag aria-hidden="true" className="size-4" strokeWidth={1.8} />
              }
              label="渠道"
              value={application.channel ?? "未填写"}
            />
            <ApplicationFact
              icon={
                <CalendarClock
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.8}
                />
              }
              label="最近更新"
              value={formatDate(application.updatedAt)}
            />
          </dl>
        </div>
      </div>
    </article>
  );
}

function ApplicationDetailPanel({
  application,
  draft,
  eventDraft,
  eventError,
  eventFeedback,
  eventLoadStatus,
  events,
  feedback,
  isSavingEvent,
  isSaving,
  onDraftChange,
  onEventDraftChange,
  onEventSave,
  onRetryEvents,
  onSave,
}: {
  application: ApplicationDto | null;
  draft: ApplicationDetailDraft | null;
  eventDraft: ApplicationEventDraft;
  eventError?: string;
  eventFeedback?: FeedbackState;
  eventLoadStatus: EventLoadStatus;
  events: ApplicationEventDto[];
  feedback?: FeedbackState;
  isSavingEvent: boolean;
  isSaving: boolean;
  onDraftChange: (
    nextDraft:
      | ApplicationDetailDraft
      | ((current: ApplicationDetailDraft | null) => ApplicationDetailDraft | null),
  ) => void;
  onEventDraftChange: (
    nextDraft:
      | ApplicationEventDraft
      | ((current: ApplicationEventDraft) => ApplicationEventDraft),
  ) => void;
  onEventSave: () => void;
  onRetryEvents: (applicationId: number) => void;
  onSave: () => void;
}) {
  if (!application || !draft) {
    return (
      <aside className="grid min-h-[320px] place-items-center px-6 py-12 text-center">
        <div className="max-w-sm">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-[18px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
            <PencilLine
              aria-hidden="true"
              className="size-6"
              strokeWidth={1.8}
            />
          </div>
          <h3 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            选择一条投递记录
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
            在右侧补充优先级、渠道、关键日期、备注和时间线事件。
          </p>
        </div>
      </aside>
    );
  }

  const risk = getRiskPresentation(application.riskLevel);
  const isDirty = isDetailDraftDirty(application, draft);
  const parsedTags = parseTagsInput(draft.tagsText);
  const linkToOpen =
    readOpenableHttpUrl(draft.sourceUrl) ??
    readOpenableHttpUrl(application.sourceUrl ?? "");
  const isOverdue = isApplicationOverdue(application);

  return (
    <aside className="min-w-0 bg-[var(--color-surface)]">
      <div className="flex h-full flex-col">
        <div className="border-b border-[var(--color-border)] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
                <PencilLine
                  aria-hidden="true"
                  className="size-4 text-[var(--color-primary)]"
                  strokeWidth={1.8}
                />
                详情与跟进
              </div>
              <h3 className="mt-3 break-words text-xl font-semibold leading-8 text-[var(--color-text)]">
                {application.role}
              </h3>
              <p className="mt-1 break-words text-sm leading-5 text-[var(--color-text-secondary)]">
                {application.company}
              </p>
            </div>

            {linkToOpen ? (
              <a
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-bold leading-5 text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)] active:scale-[0.98]"
                href={linkToOpen}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.8}
                />
                打开原岗位链接
              </a>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-bold leading-4 ${STATUS_STYLES[application.status]}`}
            >
              {STATUS_LABELS[application.status]}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-bold leading-4 ${risk.className}`}
            >
              {risk.label}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-bold leading-4 ${PRIORITY_STYLES[application.priority]}`}
            >
              {PRIORITY_LABELS[application.priority]}
            </span>
            {application.channel ? (
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-2.5 py-1 text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
                {application.channel}
              </span>
            ) : null}
            {isOverdue ? (
              <span className="rounded-full border border-[#efd4d0] bg-[#fff0ee] px-2.5 py-1 text-xs font-bold leading-4 text-[#b45c52]">
                逾期跟进
              </span>
            ) : null}
            <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-2.5 py-1 text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
              最近更新 {formatDate(application.updatedAt)}
            </span>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBlock label="优先级">
              <select
                className="h-11 w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)] disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isSaving}
                onChange={(event) =>
                  onDraftChange((current) =>
                    current
                      ? {
                          ...current,
                          priority: event.target.value as ApplicationPriority,
                        }
                      : current,
                  )
                }
                value={draft.priority}
              >
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </select>
            </FieldBlock>

            <FieldBlock
              helperText="例如：官网、BOSS、猎头、内推。"
              label="投递渠道"
            >
              <input
                className="h-11 w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)] disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isSaving}
                onChange={(event) =>
                  onDraftChange((current) =>
                    current
                      ? {
                          ...current,
                          channel: event.target.value,
                        }
                      : current,
                  )
                }
                placeholder="官网 / 内推 / 猎头"
                type="text"
                value={draft.channel}
              />
            </FieldBlock>
          </div>

          <Textarea
            disabled={isSaving}
            helperText="记录你的判断、沟通反馈或下一步准备事项。"
            label="备注"
            onChange={(event) =>
              onDraftChange((current) =>
                current
                  ? {
                      ...current,
                      notes: event.target.value,
                    }
                  : current,
              )
            }
            placeholder="例如：已通过官网投递，等待 HR 回复；需准备系统设计案例。"
            value={draft.notes}
          />

          <FieldBlock
            helperText="使用逗号分隔本地标签，例如：内推、优先跟进、二面准备。"
            label="本地标签"
          >
            <input
              className="h-11 w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSaving}
              onChange={(event) =>
                onDraftChange((current) =>
                  current
                    ? {
                        ...current,
                        tagsText: event.target.value,
                      }
                    : current,
                )
              }
              placeholder="内推，重点准备，谈薪中"
              type="text"
              value={draft.tagsText}
            />
            {parsedTags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {parsedTags.map((tag) => (
                  <span
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-2.5 py-1 text-xs font-medium leading-4 text-[var(--color-text-secondary)]"
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </FieldBlock>

          <FieldBlock
            helperText="只在你主动点击时打开，不会自动跳转或抓取外部内容。"
            label="原岗位链接"
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className="h-11 w-full min-w-0 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)] disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isSaving}
                onChange={(event) =>
                  onDraftChange((current) =>
                    current
                      ? {
                          ...current,
                          sourceUrl: event.target.value,
                        }
                      : current,
                  )
                }
                placeholder="https://example.com/job/123"
                type="url"
                value={draft.sourceUrl}
              />
              {linkToOpen ? (
                <a
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-bold leading-5 text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)] active:scale-[0.98]"
                  href={linkToOpen}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink
                    aria-hidden="true"
                    className="size-4"
                    strokeWidth={1.8}
                  />
                  打开
                </a>
              ) : null}
            </div>
          </FieldBlock>

          <FieldBlock
            helperText="可留空；建议格式为 2026-06-03 09:30。"
            label="下次跟进时间"
          >
            <input
              className="h-11 w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSaving}
              onChange={(event) =>
                onDraftChange((current) =>
                  current
                    ? {
                        ...current,
                        nextFollowUpAt: event.target.value,
                      }
                    : current,
                )
              }
              placeholder="2026-06-03 09:30"
              type="text"
              value={draft.nextFollowUpAt}
            />
          </FieldBlock>

          <FieldBlock
            helperText="状态变化会自动补对应日期；这里可手动修正或清空。"
            label="关键日期"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <KeyDateInput
                disabled={isSaving}
                label="投递日期"
                onChange={(value) =>
                  onDraftChange((current) =>
                    current ? { ...current, appliedAt: value } : current,
                  )
                }
                value={draft.appliedAt}
              />
              <KeyDateInput
                disabled={isSaving}
                label="面试日期"
                onChange={(value) =>
                  onDraftChange((current) =>
                    current ? { ...current, interviewAt: value } : current,
                  )
                }
                value={draft.interviewAt}
              />
              <KeyDateInput
                disabled={isSaving}
                label="Offer 日期"
                onChange={(value) =>
                  onDraftChange((current) =>
                    current ? { ...current, offerAt: value } : current,
                  )
                }
                value={draft.offerAt}
              />
              <KeyDateInput
                disabled={isSaving}
                label="未通过日期"
                onChange={(value) =>
                  onDraftChange((current) =>
                    current ? { ...current, rejectedAt: value } : current,
                  )
                }
                value={draft.rejectedAt}
              />
              <KeyDateInput
                disabled={isSaving}
                label="放弃日期"
                onChange={(value) =>
                  onDraftChange((current) =>
                    current ? { ...current, abandonedAt: value } : current,
                  )
                }
                value={draft.abandonedAt}
              />
            </div>
          </FieldBlock>

          {feedback ? (
            <p
              className={`text-sm leading-6 ${feedbackToneClassName(feedback.tone)}`}
              role="status"
            >
              {feedback.message}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
              留空字段也可以保存；保存后刷新页面仍会保留。
            </p>
            <Button
              disabled={isSaving || !isDirty}
              leftIcon={
                isSaving ? (
                  <Loader2
                    aria-hidden="true"
                    className="size-4 animate-spin"
                    strokeWidth={1.8}
                  />
                ) : (
                  <Save aria-hidden="true" className="size-4" strokeWidth={1.8} />
                )
              }
              onClick={onSave}
              size="md"
              type="button"
            >
              {isSaving ? "保存中" : "保存详情"}
            </Button>
          </div>

          <ApplicationTimeline
            applicationId={application.id}
            errorMessage={eventError}
            events={events}
            loadStatus={eventLoadStatus}
            onRetry={onRetryEvents}
          />

          <ApplicationEventForm
            draft={eventDraft}
            feedback={eventFeedback}
            isSaving={isSavingEvent}
            onDraftChange={onEventDraftChange}
            onSave={onEventSave}
          />
        </div>
      </div>
    </aside>
  );
}

function TrackerSummary({
  applications,
  highPriorityCount,
  overdueCount,
}: {
  applications: ApplicationDto[];
  highPriorityCount: number;
  overdueCount: number;
}) {
  const activeCount = applications.filter(
    (application) => !TERMINAL_APPLICATION_STATUSES.has(application.status),
  ).length;

  return (
    <div className="grid gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 sm:grid-cols-3 sm:px-6">
      <TrackerSummaryItem
        icon={<BriefcaseBusiness aria-hidden="true" className="size-4" strokeWidth={1.8} />}
        label="推进中"
        value={`${activeCount}`}
      />
      <TrackerSummaryItem
        icon={<Timer aria-hidden="true" className="size-4" strokeWidth={1.8} />}
        label="逾期跟进"
        tone={overdueCount > 0 ? "warning" : "normal"}
        value={`${overdueCount}`}
      />
      <TrackerSummaryItem
        icon={<Flag aria-hidden="true" className="size-4" strokeWidth={1.8} />}
        label="高优先级"
        value={`${highPriorityCount}`}
      />
    </div>
  );
}

function TrackerSummaryItem({
  icon,
  label,
  tone = "normal",
  value,
}: {
  icon: ReactNode;
  label: string;
  tone?: "normal" | "warning";
  value: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-[16px] border px-4 py-3 ${
        tone === "warning"
          ? "border-[#efd4d0] bg-[#fff0ee]"
          : "border-[var(--color-border)] bg-[var(--color-surface-hover)]"
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
        <span className={tone === "warning" ? "text-[#b45c52]" : "text-[var(--color-primary)]"}>
          {icon}
        </span>
        {label}
      </div>
      <span
        className={`text-lg font-semibold leading-7 ${
          tone === "warning" ? "text-[#b45c52]" : "text-[var(--color-text)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function ApplicationBoard({
  applications,
  onSelect,
  selectedApplicationId,
}: {
  applications: ApplicationDto[];
  onSelect: (applicationId: number) => void;
  selectedApplicationId: number | null;
}) {
  const grouped = new Map<ApplicationStatus, ApplicationDto[]>();

  for (const status of APPLICATION_STATUSES) {
    grouped.set(status, []);
  }

  for (const application of applications) {
    grouped.get(application.status)?.push(application);
  }

  return (
    <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-2">
      {APPLICATION_STATUSES.map((status) => {
        const items = grouped.get(status) ?? [];

        return (
          <section
            className="min-h-40 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-hover)]"
            key={status}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
              <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
                {STATUS_LABELS[status]}
              </h3>
              <span className="rounded-full bg-[var(--color-surface)] px-2.5 py-1 text-xs font-bold text-[var(--color-text-secondary)]">
                {items.length}
              </span>
            </div>
            <div className="space-y-3 p-3">
              {items.length > 0 ? (
                items.map((application) => (
                  <button
                    className={`w-full rounded-[14px] border bg-[var(--color-surface)] p-4 text-left transition-all hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-sm)] active:scale-[0.99] ${
                      selectedApplicationId === application.id
                        ? "border-[var(--color-primary)]"
                        : "border-[var(--color-border)]"
                    }`}
                    key={application.id}
                    onClick={() => onSelect(application.id)}
                    type="button"
                  >
                    <div className="mb-2 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${PRIORITY_STYLES[application.priority]}`}
                      >
                        {PRIORITY_LABELS[application.priority]}
                      </span>
                      {isApplicationOverdue(application) ? (
                        <span className="rounded-full border border-[#efd4d0] bg-[#fff0ee] px-2 py-0.5 text-[11px] font-bold text-[#b45c52]">
                          逾期跟进
                        </span>
                      ) : null}
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold leading-5 text-[var(--color-text)]">
                      {application.role}
                    </p>
                    <p className="mt-1 line-clamp-1 text-xs leading-4 text-[var(--color-text-secondary)]">
                      {application.company}
                      {application.channel ? ` · ${application.channel}` : ""}
                    </p>
                    {application.nextFollowUpAt ? (
                      <p className="mt-2 text-[11px] font-medium leading-4 text-[var(--color-text-secondary)]">
                        跟进 {formatShortDateTime(application.nextFollowUpAt)}
                      </p>
                    ) : null}
                  </button>
                ))
              ) : (
                <p className="rounded-[14px] border border-dashed border-[var(--color-border)] px-4 py-6 text-center text-xs leading-5 text-[var(--color-text-secondary)]">
                  当前状态暂无记录
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function KeyDateInput({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
        {label}
      </span>
      <input
        className="h-10 w-full rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.18)] disabled:cursor-not-allowed disabled:opacity-70"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="2026-06-03 09:30"
        type="text"
        value={value}
      />
    </label>
  );
}

function ApplicationTimeline({
  applicationId,
  errorMessage,
  events,
  loadStatus,
  onRetry,
}: {
  applicationId: number;
  errorMessage?: string;
  events: ApplicationEventDto[];
  loadStatus: EventLoadStatus;
  onRetry: (applicationId: number) => void;
}) {
  return (
    <section className="border-t border-[var(--color-border)] pt-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-bold leading-5 text-[var(--color-text)]">
            <History aria-hidden="true" className="size-4 text-[var(--color-primary)]" strokeWidth={1.8} />
            时间线
          </h4>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            记录加入清单、状态变化和手动跟进事件。
          </p>
        </div>
        {loadStatus === "error" ? (
          <button
            className="inline-flex items-center gap-1 text-xs font-bold text-[var(--color-primary)] hover:underline"
            onClick={() => onRetry(applicationId)}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
            重试
          </button>
        ) : null}
      </div>

      {loadStatus === "loading" || loadStatus === "idle" ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              className="h-16 animate-pulse rounded-[14px] bg-[var(--color-border-light)]"
              key={index}
            />
          ))}
        </div>
      ) : loadStatus === "error" ? (
        <div className="rounded-[14px] border border-[#eedaa6] bg-[#fffaf0] px-4 py-3 text-xs leading-5 text-[var(--color-text-secondary)]">
          {errorMessage ?? "时间线读取失败，请稍后重试。"}
        </div>
      ) : events.length > 0 ? (
        <ol className="space-y-3">
          {events.map((event) => (
            <li
              className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-4 py-3"
              key={event.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-primary)]">
                  {EVENT_TYPE_LABELS[event.eventType]}
                </span>
                <time className="text-[11px] font-medium leading-4 text-[var(--color-text-secondary)]">
                  {formatShortDateTime(event.happenedAt)}
                </time>
              </div>
              <p className="mt-2 text-sm font-semibold leading-5 text-[var(--color-text)]">
                {event.title}
              </p>
              {event.note.trim() ? (
                <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--color-text-secondary)]">
                  {event.note}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <div className="rounded-[14px] border border-dashed border-[var(--color-border)] px-4 py-6 text-center text-xs leading-5 text-[var(--color-text-secondary)]">
          暂无时间线事件。保存状态、跟进详情或手动新增事件后会显示在这里。
        </div>
      )}
    </section>
  );
}

function ApplicationEventForm({
  draft,
  feedback,
  isSaving,
  onDraftChange,
  onSave,
}: {
  draft: ApplicationEventDraft;
  feedback?: FeedbackState;
  isSaving: boolean;
  onDraftChange: (
    nextDraft:
      | ApplicationEventDraft
      | ((current: ApplicationEventDraft) => ApplicationEventDraft),
  ) => void;
  onSave: () => void;
}) {
  const canSave =
    !isSaving &&
    (draft.title.trim().length > 0 || draft.note.trim().length > 0);

  return (
    <section className="border-t border-[var(--color-border)] pt-5">
      <h4 className="flex items-center gap-2 text-sm font-bold leading-5 text-[var(--color-text)]">
        <MessageSquarePlus
          aria-hidden="true"
          className="size-4 text-[var(--color-primary)]"
          strokeWidth={1.8}
        />
        手动新增事件
      </h4>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <FieldBlock label="事件类型">
          <select
            className="h-10 w-full rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.18)] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSaving}
            onChange={(event) =>
              onDraftChange((current) => ({
                ...current,
                eventType: event.target.value as ApplicationEventType,
              }))
            }
            value={draft.eventType}
          >
            {EVENT_TYPE_OPTIONS.map((eventType) => (
              <option key={eventType.value} value={eventType.value}>
                {eventType.label}
              </option>
            ))}
          </select>
        </FieldBlock>
        <FieldBlock label="发生时间">
          <input
            className="h-10 w-full rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.18)] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSaving}
            onChange={(event) =>
              onDraftChange((current) => ({
                ...current,
                happenedAt: event.target.value,
              }))
            }
            placeholder="留空则使用当前时间"
            type="text"
            value={draft.happenedAt}
          />
        </FieldBlock>
      </div>
      <div className="mt-3 space-y-3">
        <FieldBlock label="标题">
          <input
            className="h-10 w-full rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.18)] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSaving}
            onChange={(event) =>
              onDraftChange((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            placeholder="例如：已完成一轮 HR 沟通"
            type="text"
            value={draft.title}
          />
        </FieldBlock>
        <Textarea
          className="min-h-24 text-sm leading-6"
          disabled={isSaving}
          label="备注"
          onChange={(event) =>
            onDraftChange((current) => ({
              ...current,
              note: event.target.value,
            }))
          }
          placeholder="记录跟进内容、沟通反馈或下一步准备事项。"
          value={draft.note}
        />
      </div>
      {feedback ? (
        <p
          className={`mt-3 text-sm leading-6 ${feedbackToneClassName(feedback.tone)}`}
          role="status"
        >
          {feedback.message}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end">
        <Button
          disabled={!canSave}
          leftIcon={
            isSaving ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.8} />
            ) : (
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.8} />
            )
          }
          onClick={onSave}
          size="md"
          type="button"
        >
          {isSaving ? "新增中" : "新增事件"}
        </Button>
      </div>
    </section>
  );
}

function ApplicationFilters({
  channelFilter,
  channelOptions,
  onChannelFilterChange,
  onPriorityFilterChange,
  onQueryChange,
  onReset,
  onStatusFilterChange,
  onViewModeChange,
  priorityFilter,
  query,
  showReset,
  statusFilter,
  viewMode,
}: {
  channelFilter: string;
  channelOptions: string[];
  onChannelFilterChange: (channel: string) => void;
  onPriorityFilterChange: (priority: ApplicationPriorityFilter) => void;
  onQueryChange: (query: string) => void;
  onReset: () => void;
  onStatusFilterChange: (status: ApplicationStatusFilter) => void;
  onViewModeChange: (viewMode: ApplicationViewMode) => void;
  priorityFilter: ApplicationPriorityFilter;
  query: string;
  showReset: boolean;
  statusFilter: ApplicationStatusFilter;
  viewMode: ApplicationViewMode;
}) {
  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-hover)] px-5 py-4 sm:px-6">
      <div className="flex flex-col gap-4">
        <label className="relative block w-full xl:max-w-sm">
          <span className="sr-only">搜索公司或岗位</span>
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[var(--color-text-secondary)]"
            strokeWidth={1.8}
          />
          <input
            className="h-11 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] pl-10 pr-4 text-sm outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索公司或岗位..."
            type="search"
            value={query}
          />
        </label>

        <div className="flex flex-wrap gap-2" role="group" aria-label="投递状态筛选">
          {STATUS_FILTERS.map((filter) => (
            <FilterButton
              isActive={statusFilter === filter.value}
              key={filter.value}
              label={filter.label}
              onClick={() => onStatusFilterChange(filter.value)}
            />
          ))}
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="优先级筛选">
            {PRIORITY_FILTERS.map((filter) => (
              <FilterButton
                isActive={priorityFilter === filter.value}
                key={filter.value}
                label={filter.label}
                onClick={() => onPriorityFilterChange(filter.value)}
              />
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <label className="flex min-w-0 flex-col gap-1 text-xs font-bold leading-4 text-[var(--color-text-secondary)] sm:w-44">
              渠道筛选
              <select
                className="h-10 w-full rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.18)]"
                onChange={(event) => onChannelFilterChange(event.target.value)}
                value={channelFilter}
              >
                <option value="all">全部渠道</option>
                {channelOptions.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </select>
            </label>

            <div className="inline-flex w-fit rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
              <button
                aria-pressed={viewMode === "list"}
                className={`inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-xs font-bold transition-all ${
                  viewMode === "list"
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)]"
                }`}
                onClick={() => onViewModeChange("list")}
                type="button"
              >
                <List aria-hidden="true" className="size-4" strokeWidth={1.8} />
                列表
              </button>
              <button
                aria-pressed={viewMode === "board"}
                className={`inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-xs font-bold transition-all ${
                  viewMode === "board"
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)]"
                }`}
                onClick={() => onViewModeChange("board")}
                type="button"
              >
                <Columns3
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.8}
                />
                看板
              </button>
            </div>

            {showReset ? (
              <button
                className="inline-flex w-fit items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-bold leading-5 text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)] active:scale-[0.98]"
                onClick={onReset}
                type="button"
              >
                <RotateCcw
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.8}
                />
                重置筛选
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterButton({
  isActive,
  label,
  onClick,
}: {
  isActive: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={isActive}
      className={`rounded-full px-4 py-2 text-sm font-bold leading-5 transition-all active:scale-[0.98] ${
        isActive
          ? "bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)]"
          : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function ApplicationFact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
        <span className="text-[var(--color-primary)]">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold leading-5 text-[var(--color-text)]">
        {value}
      </dd>
    </div>
  );
}

function ApplicationNoMatchesState({ onReset }: { onReset: () => void }) {
  return (
    <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-[18px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
          <ClipboardList
            aria-hidden="true"
            className="size-6"
            strokeWidth={1.8}
          />
        </div>
        <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
          没有匹配的投递记录
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
          调整公司、岗位关键词、状态、优先级或渠道筛选后，再查看本地投递清单。
        </p>
        <button
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-5 py-2 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
          onClick={onReset}
          type="button"
        >
          <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.8} />
          重置筛选
        </button>
      </div>
    </div>
  );
}

function FieldBlock({
  children,
  helperText,
  label,
}: {
  children: ReactNode;
  helperText?: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <span className="block text-sm font-bold leading-5 text-[var(--color-text-secondary)]">
        {label}
      </span>
      {children}
      {helperText ? (
        <span className="block text-xs leading-5 text-[var(--color-text-secondary)]">
          {helperText}
        </span>
      ) : null}
    </div>
  );
}

function createDetailDraft(application: ApplicationDto): ApplicationDetailDraft {
  return {
    abandonedAt: formatFollowUpInputValue(application.abandonedAt),
    appliedAt: formatFollowUpInputValue(application.appliedAt),
    channel: application.channel ?? "",
    interviewAt: formatFollowUpInputValue(application.interviewAt),
    notes: application.notes,
    offerAt: formatFollowUpInputValue(application.offerAt),
    priority: application.priority,
    rejectedAt: formatFollowUpInputValue(application.rejectedAt),
    tagsText: application.tags.join(", "),
    sourceUrl: application.sourceUrl ?? "",
    nextFollowUpAt: formatFollowUpInputValue(application.nextFollowUpAt),
  };
}

function isDetailDraftDirty(
  application: ApplicationDto,
  draft: ApplicationDetailDraft,
): boolean {
  const baseline = createDetailDraft(application);

  return (
    baseline.abandonedAt !== draft.abandonedAt ||
    baseline.appliedAt !== draft.appliedAt ||
    baseline.channel !== draft.channel ||
    baseline.interviewAt !== draft.interviewAt ||
    baseline.notes !== draft.notes ||
    baseline.offerAt !== draft.offerAt ||
    baseline.priority !== draft.priority ||
    baseline.rejectedAt !== draft.rejectedAt ||
    baseline.tagsText !== draft.tagsText ||
    baseline.sourceUrl !== draft.sourceUrl ||
    baseline.nextFollowUpAt !== draft.nextFollowUpAt
  );
}

function parseTagsInput(value: string): string[] {
  const uniqueTags = new Set<string>();

  for (const part of value.split(/[\n,，]/)) {
    const normalized = part.trim();

    if (normalized) {
      uniqueTags.add(normalized);
    }
  }

  return [...uniqueTags];
}

function normalizeOptionalText(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isApplicationOverdue(application: ApplicationDto): boolean {
  if (
    !application.nextFollowUpAt ||
    TERMINAL_APPLICATION_STATUSES.has(application.status)
  ) {
    return false;
  }

  const timestamp = parseDateTime(application.nextFollowUpAt);

  return timestamp > 0 && timestamp < Date.now();
}

function readOpenableHttpUrl(value: string): string | null {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);

    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function buildInitials(company: string): string {
  const ascii = company.match(/[A-Za-z0-9]+/g)?.join("");

  if (ascii && ascii.length >= 2) {
    return ascii.slice(0, 2).toUpperCase();
  }

  return company.replace(/\s/g, "").slice(0, 2) || "JD";
}

function compareApplicationsByUpdatedAtDesc(
  first: ApplicationDto,
  second: ApplicationDto,
): number {
  const dateDelta =
    parseDateTime(second.updatedAt) - parseDateTime(first.updatedAt);

  if (dateDelta !== 0) {
    return dateDelta;
  }

  return second.id - first.id;
}

function parseDateTime(value: string): number {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const timestamp = new Date(normalized).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatFollowUpInputValue(value: string | null): string {
  if (!value) {
    return "";
  }

  const normalized = value.trim().replace(" ", "T");

  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(normalized)) {
    const date = new Date(normalized);
    return Number.isFinite(date.getTime())
      ? formatDateForFollowUpInput(date)
      : "";
  }

  const directMatch = normalized.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  if (directMatch) {
    return directMatch[1].replace("T", " ");
  }

  const date = new Date(normalized);
  return Number.isFinite(date.getTime())
    ? formatDateForFollowUpInput(date)
    : "";
}

function formatDateForFollowUpInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatScore(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "未评分";
  }

  return `${value.toFixed(1)} / 5.0`;
}

function formatRecommendedResumeName(value: string | null): string {
  return value?.trim() ? value.trim() : "暂无推荐";
}

function getRiskPresentation(riskLevel: RiskLevel | null): {
  className: string;
  label: string;
} {
  if (!riskLevel) {
    return {
      className:
        "border-[var(--color-border)] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]",
      label: "未识别",
    };
  }

  return {
    className: RISK_LEVEL_STYLES[riskLevel],
    label: RISK_LEVEL_LABELS[riskLevel],
  };
}

function formatDate(value: string): string {
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));

  if (!Number.isFinite(date.getTime())) {
    return "更新时间未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatShortDateTime(value: string): string {
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));

  if (!Number.isFinite(date.getTime())) {
    return "时间待定";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
  }).format(date);
}

function feedbackToneClassName(tone: FeedbackTone): string {
  if (tone === "error") {
    return "text-[var(--color-red)]";
  }

  if (tone === "success") {
    return "text-[var(--color-green)]";
  }

  return "text-[var(--color-text-secondary)]";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
