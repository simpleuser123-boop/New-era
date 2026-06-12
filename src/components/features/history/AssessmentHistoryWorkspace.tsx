"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FileSearch,
  Landmark,
  RefreshCw,
  Rocket,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { AssessmentHistoryCard } from "@/components/features/history/AssessmentHistoryCard";
import { PageHeader } from "@/components/features/AppShell";
import {
  assessmentHistory,
  historyFilters,
  type AssessmentHistoryItem,
  type AssessmentStatus,
} from "@/components/features/history/historyData";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  ConfirmDialog,
  type ConfirmDialogStatus,
} from "@/components/ui/ConfirmDialog";
import { apiRequest, readErrorMessage } from "@/lib/api-client";

type HistoryFilter = AssessmentStatus | "all";
type LoadStatus = "loading" | "ready" | "fallback" | "error";
type RiskLevel = "critical" | "high" | "medium" | "low";

type ReportsResponse =
  {
    ok: true;
    reports: unknown[];
    count: number;
    limit: number;
  };
type ReportDeleteResponse = {
  deleted: true;
  detachedReferences: {
    applications: number;
    interviewSessions: number;
    resumeOptimizationRuns: number;
  };
  ok: true;
  report: {
    id: number;
  };
};

const historyIcons = [Cpu, Rocket, Landmark, Building2];

export function AssessmentHistoryWorkspace() {
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>("all");
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<AssessmentHistoryItem[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string>();
  const [deletingReportId, setDeletingReportId] = useState<number>();
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [deleteCandidate, setDeleteCandidate] =
    useState<AssessmentHistoryItem | null>(null);
  const [deleteDialogStatus, setDeleteDialogStatus] =
    useState<ConfirmDialogStatus>("idle");
  const [deleteDialogMessage, setDeleteDialogMessage] = useState<string>();
  const deleteDialogTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialReports() {
      try {
        const reports = await fetchReportItems(controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setHistory(reports);
        setLoadStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setHistory(assessmentHistory);
        setErrorMessage(
          error instanceof Error ? error.message : "评估历史读取失败，请稍后重试。",
        );
        setLoadStatus("fallback");
      }
    }

    void loadInitialReports();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    return () => {
      if (deleteDialogTimerRef.current !== undefined) {
        window.clearTimeout(deleteDialogTimerRef.current);
      }
    };
  }, []);

  async function reloadReports() {
    setLoadStatus("loading");
    setErrorMessage(undefined);

    try {
      const reports = await fetchReportItems();

      setHistory(reports);
      setLoadStatus("ready");
    } catch (error) {
      setHistory(assessmentHistory);
      setErrorMessage(
        error instanceof Error ? error.message : "评估历史读取失败，请稍后重试。",
      );
      setLoadStatus("fallback");
    }
  }

  function requestDeleteReport(item: AssessmentHistoryItem) {
    if (item.reportId === undefined || deletingReportId !== undefined) {
      return;
    }

    if (deleteDialogTimerRef.current !== undefined) {
      window.clearTimeout(deleteDialogTimerRef.current);
      deleteDialogTimerRef.current = undefined;
    }

    setDeleteCandidate(item);
    setDeleteDialogStatus("idle");
    setDeleteDialogMessage(undefined);
  }

  function closeDeleteDialog() {
    if (deletingReportId !== undefined) {
      return;
    }

    if (deleteDialogTimerRef.current !== undefined) {
      window.clearTimeout(deleteDialogTimerRef.current);
      deleteDialogTimerRef.current = undefined;
    }

    setDeleteCandidate(null);
    setDeleteDialogStatus("idle");
    setDeleteDialogMessage(undefined);
  }

  async function confirmDeleteReport() {
    const item = deleteCandidate;

    if (
      !item ||
      item.reportId === undefined ||
      deletingReportId !== undefined ||
      deleteDialogStatus === "success"
    ) {
      return;
    }

    setDeletingReportId(item.reportId);
    setDeleteDialogStatus("loading");
    setDeleteDialogMessage("正在删除本地评估报告，关联记录会保留。");
    setDeleteErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });

    try {
      const body = await apiRequest<ReportDeleteResponse>(`/api/reports/${item.reportId}`, {
        errorMessage: "评估报告删除失败，请稍后重试。",
        method: "DELETE",
      });

      setHistory((current) =>
        current.filter((historyItem) => historyItem.id !== item.id),
      );
      setDeleteDialogStatus("success");
      setDeleteDialogMessage(buildReportDeleteSuccessMessage(body));
      deleteDialogTimerRef.current = window.setTimeout(() => {
        setDeleteCandidate(null);
        setDeleteDialogStatus("idle");
        setDeleteDialogMessage(undefined);
        deleteDialogTimerRef.current = undefined;
      }, 900);
    } catch (error) {
      const message = readErrorMessage(error, "评估报告删除失败，请稍后重试。");

      setDeleteErrors((current) => ({
        ...current,
        [item.id]: message,
      }));
      setDeleteDialogStatus("error");
      setDeleteDialogMessage(`${message} 列表仍保留这份报告，可稍后重试。`);
    } finally {
      setDeletingReportId(undefined);
    }
  }

  const filteredHistory = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return history.filter((item) => {
      const matchesStatus =
        activeFilter === "all" ? true : item.status === activeFilter;
      const matchesQuery = normalizedQuery
        ? `${item.title} ${item.company}`.toLowerCase().includes(normalizedQuery)
        : true;

      return matchesStatus && matchesQuery;
    });
  }, [activeFilter, history, query]);
  const isInteractive = loadStatus === "ready" || loadStatus === "fallback";

  return (
    <>
      <HistoryHeader
        disabled={!isInteractive}
        query={query}
        onQueryChange={setQuery}
      />

      <div className="mx-auto max-w-[1200px] px-5 pb-12 pt-6 sm:px-10">
        <section aria-label="评估状态筛选" className="mb-8 flex flex-wrap gap-2">
          {historyFilters.map((filter) => {
            const isActive = activeFilter === filter.value;

            return (
              <button
                className={`rounded-full px-5 py-2 text-sm font-bold leading-5 transition-all active:scale-[0.98] ${
                  isActive
                    ? "bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)]"
                    : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]"
                } disabled:cursor-not-allowed disabled:opacity-55`}
                disabled={!isInteractive}
                key={filter.value}
                onClick={() => setActiveFilter(filter.value)}
                type="button"
              >
                {filter.label}
              </button>
            );
          })}
        </section>

        {loadStatus === "loading" ? (
          <HistorySkeletonList />
        ) : loadStatus === "error" ? (
          <ErrorState
            action={
              <button
                className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-5 py-2 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
                onClick={() => {
                  setLoadStatus("loading");
                  setErrorMessage(undefined);
                  void reloadReports();
                }}
                type="button"
              >
                <RefreshCw
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.8}
                />
                重新加载
              </button>
            }
            description={errorMessage}
            title="评估历史加载失败"
          />
        ) : loadStatus === "fallback" ? (
          <>
            {filteredHistory.length > 0 ? (
              <section className="space-y-4" aria-label="评估历史列表">
                {filteredHistory.map((item) => (
                  <AssessmentHistoryCard
                    deleteError={deleteErrors[item.id]}
                    isDeleting={item.reportId === deletingReportId}
                    item={item}
                    key={item.id}
                  />
                ))}
              </section>
            ) : (
              <HistoryEmptyState onReset={() => {
                setActiveFilter("all");
                setQuery("");
              }} />
            )}
          </>
        ) : history.length === 0 ? (
          <EmptyState
            action={
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-5 py-2 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
                href="/evaluate"
              >
                <BarChart3
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.8}
                />
                新建评估
              </Link>
            }
            description="完成一次 JD 评估后，报告会自动保存到这里。"
            icon={<FileSearch aria-hidden="true" className="size-6" strokeWidth={1.8} />}
            title="暂无评估历史"
          />
        ) : filteredHistory.length > 0 ? (
          <section className="space-y-4" aria-label="评估历史列表">
            {filteredHistory.map((item) => (
              <AssessmentHistoryCard
                deleteError={deleteErrors[item.id]}
                isDeleting={item.reportId === deletingReportId}
                item={item}
                key={item.id}
                onDelete={requestDeleteReport}
              />
            ))}
          </section>
        ) : (
          <HistoryEmptyState onReset={() => {
            setActiveFilter("all");
            setQuery("");
          }} />
        )}

        {isInteractive ? <HistoryFooter count={filteredHistory.length} /> : null}
      </div>

      {deleteCandidate ? (
        <ConfirmDialog
          cancelLabel="取消，保留报告"
          confirmLabel="确认删除报告"
          description="删除报告属于高风险本地数据操作，请先确认对象、影响范围和可恢复性。"
          impact={
            <>
              将删除这份评估报告；关联的投递、面试和简历优化记录会保留，但会解除对该报告的引用。
            </>
          }
          isDanger
          objectLabel={
            <>
              {deleteCandidate.company} · {deleteCandidate.title}
              {deleteCandidate.reportId ? `（报告 ID ${deleteCandidate.reportId}）` : null}
            </>
          }
          onCancel={closeDeleteDialog}
          onConfirm={() => void confirmDeleteReport()}
          recovery={
            <>
              不可恢复。删除后历史列表和报告详情页将不再读取到这份报告；建议需要留档时先到 Settings 导出 JSON。
            </>
          }
          status={deleteDialogStatus}
          statusMessage={deleteDialogMessage}
          title="删除这份评估报告？"
        />
      ) : null}
    </>
  );
}

function buildReportDeleteSuccessMessage(response: ReportDeleteResponse): string {
  const { applications, interviewSessions, resumeOptimizationRuns } =
    response.detachedReferences;

  return `评估报告已删除。已保留 ${applications} 条投递、${interviewSessions} 个面试会话、${resumeOptimizationRuns} 条简历优化记录，并解除它们的报告引用。`;
}

type HistoryHeaderProps = {
  disabled: boolean;
  query: string;
  onQueryChange: (query: string) => void;
};

function HistoryHeader({ disabled, query, onQueryChange }: HistoryHeaderProps) {
  return (
    <PageHeader
      actions={
        <div className="flex w-full items-center gap-3 md:w-auto">
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">搜索职位或公司</span>
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[var(--color-text-secondary)]"
              strokeWidth={1.8}
            />
            <input
              className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]"
              disabled={disabled}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索职位、公司..."
              type="search"
              value={query}
            />
          </label>
          <button
            aria-label="筛选设置"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={disabled}
            type="button"
          >
            <SlidersHorizontal
              aria-hidden="true"
              className="size-5"
              strokeWidth={1.8}
            />
          </button>
        </div>
      }
      description="回顾并追踪过往 JD 匹配评估、风险判断与简历优化动作。"
      icon={
        <FileSearch aria-hidden="true" className="size-5" strokeWidth={1.8} />
      }
      title="评估历史"
    />
  );
}

function HistorySkeletonList() {
  return (
    <section className="space-y-4" aria-label="评估历史加载中">
      {Array.from({ length: 4 }, (_, index) => (
        <article
          className="grid gap-5 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-6 lg:grid-cols-[auto_1fr_auto] lg:items-center"
          key={index}
        >
          <div className="size-16 animate-pulse rounded-[18px] bg-[var(--color-border-light)]" />
          <div className="space-y-3">
            <div className="h-6 w-64 max-w-full animate-pulse rounded-full bg-[var(--color-border-light)]" />
            <div className="h-4 w-80 max-w-full animate-pulse rounded-full bg-[var(--color-border-light)]" />
          </div>
          <div className="space-y-3 lg:min-w-[260px] lg:border-l lg:border-[var(--color-border)] lg:pl-6">
            <div className="h-8 w-24 animate-pulse rounded-full bg-[var(--color-border-light)] lg:mx-auto" />
            <div className="h-10 animate-pulse rounded-[12px] bg-[var(--color-border-light)]" />
          </div>
        </article>
      ))}
    </section>
  );
}

function HistoryEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <section className="grid min-h-72 place-items-center rounded-[24px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-[18px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
          <FileSearch aria-hidden="true" className="size-6" strokeWidth={1.8} />
        </div>
        <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
          没有匹配的评估记录
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
          调整关键词或状态筛选后，再查看历史评估结果。
        </p>
        <button
          className="mt-5 rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-bold leading-5 text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
          onClick={onReset}
          type="button"
        >
          重置筛选
        </button>
      </div>
    </section>
  );
}

function HistoryFooter({ count }: { count: number }) {
  return (
    <footer className="mt-8 flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs leading-4 text-[var(--color-text-secondary)]">
        共显示 {count} 个评估记录
      </p>

      <div className="flex items-center gap-2">
        <button
          aria-label="上一页"
          className="flex size-10 items-center justify-center rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          disabled
          type="button"
        >
          <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </button>
        <button
          aria-label="第 1 页"
          className="flex size-10 items-center justify-center rounded-[12px] bg-[var(--color-primary)] text-sm font-bold text-white"
          type="button"
        >
          1
        </button>
        <button
          aria-label="第 2 页"
          className="flex size-10 items-center justify-center rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-bold text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          disabled
          type="button"
        >
          2
        </button>
        <button
          aria-label="下一页"
          className="flex size-10 items-center justify-center rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          disabled
          type="button"
        >
          <ChevronRight
            aria-hidden="true"
            className="size-5"
            strokeWidth={1.8}
          />
        </button>
      </div>
    </footer>
  );
}

function normalizeReports(rawReports: unknown[]): AssessmentHistoryItem[] {
  if (!Array.isArray(rawReports)) {
    return [];
  }

  return rawReports
    .map((item, index) => {
      const reportRecord = toRecord(item);

      if (!reportRecord) {
        return null;
      }

      const reportId = readPositiveInteger(reportRecord.id);
      const reportPayload = toRecord(reportRecord.report);
      const job = toRecord(reportPayload?.job);
      const score = toRecord(reportRecord.score);
      const reportScore = toRecord(reportPayload?.score);
      const risks = toRecord(reportPayload?.risks);
      const riskSignals = Array.isArray(reportRecord.risks)
        ? reportRecord.risks
        : [];
      const company =
        readString(reportRecord.company) ?? readString(job?.company) ?? "未识别公司";
      const role =
        readString(reportRecord.role) ?? readString(job?.role) ?? "未识别岗位";
      const overall =
        readNumber(score?.overall) ?? readNumber(reportScore?.overall) ?? 0;
      const riskLevel =
        readRiskLevel(risks?.level) ?? deriveRiskLevelFromSignals(riskSignals);
      const status: AssessmentStatus =
        overall < 3.5 || riskLevel === "high" || riskLevel === "critical"
          ? "needsOptimization"
          : "completed";

      return {
        id: reportId ? `report-${reportId}` : `report-${index}`,
        href: reportId
          ? `/evaluate/report?reportId=${encodeURIComponent(reportId)}`
          : undefined,
        ...(reportId ? { reportId } : {}),
        title: role,
        company,
        date: formatDate(
          readString(reportRecord.createdAt) ?? readString(reportPayload?.generatedAt),
        ),
        status,
        score: clampScore(overall),
        logoText: buildLogoText(company),
        logoTone: getLogoTone(status, riskLevel),
        icon: historyIcons[index % historyIcons.length],
        sourceKind: "local" as const,
      };
    })
    .filter(isPresent);
}

async function fetchReportItems(
  signal?: AbortSignal,
): Promise<AssessmentHistoryItem[]> {
  const body = await apiRequest<ReportsResponse>("/api/reports?limit=100", {
    cache: "no-store",
    errorMessage: "评估历史读取失败，请稍后重试。",
    signal,
  });

  return normalizeReports(body.reports);
}

function buildLogoText(company: string): string {
  const ascii = company.match(/[A-Za-z0-9]+/g)?.join("");

  if (ascii && ascii.length >= 2) {
    return ascii.slice(0, 3).toUpperCase();
  }

  return company.replace(/\s/g, "").slice(0, 2) || "JD";
}

function getLogoTone(status: AssessmentStatus, riskLevel: RiskLevel): string {
  if (status === "needsOptimization") {
    return "bg-[#f7eded] text-[#a3554d] border-[#ecd2d0]";
  }

  if (riskLevel === "medium") {
    return "bg-[#fff3df] text-[#875006] border-[#f1d6ab]";
  }

  return "bg-[#eef3ed] text-[#617e54] border-[#d8e4d2]";
}

function formatDate(value: string | undefined): string {
  if (!value) {
    return "时间未知";
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);

  if (!Number.isFinite(date.getTime())) {
    return "时间未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function deriveRiskLevelFromSignals(signals: unknown[]): RiskLevel {
  const levels = signals
    .map((item) => readRiskLevel(toRecord(item)?.severity))
    .filter((level): level is RiskLevel => Boolean(level));

  if (levels.includes("critical")) {
    return "critical";
  }

  if (levels.includes("high")) {
    return "high";
  }

  if (levels.includes("medium")) {
    return "medium";
  }

  return "low";
}

function readRiskLevel(value: unknown): RiskLevel | undefined {
  if (
    value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low"
  ) {
    return value;
  }

  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(5, value));
}

function readPositiveInteger(value: unknown): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
