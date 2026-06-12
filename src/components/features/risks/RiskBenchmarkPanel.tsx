"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import type {
  RiskBenchmarkMetric,
  RiskBenchmarkOverview,
} from "@/lib/types";

type RiskBenchmarkApiResponse = RiskBenchmarkOverview & { ok: true };

type BenchmarkState =
  | { status: "loading"; overview: null; error: null }
  | { status: "ready"; overview: RiskBenchmarkOverview; error: null }
  | { status: "error"; overview: null; error: string };

const metricLabels: Array<{
  key: keyof RiskBenchmarkOverview["metrics"];
  label: string;
  note: string;
}> = [
  {
    key: "decisionAccuracy",
    label: "判断准确率",
    note: "三类判断命中率",
  },
  {
    key: "fakeAiRecall",
    label: "假岗召回率",
    note: "假 AI 岗拦截覆盖",
  },
  {
    key: "fakeAiPrecision",
    label: "判假准确率",
    note: "判假样本命中率",
  },
  {
    key: "realAiFalsePositiveRate",
    label: "真岗误伤率",
    note: "真 AI 被误判高风险",
  },
  {
    key: "riskLevelAccuracy",
    label: "风险等级准确率",
    note: "风险等级命中率",
  },
  {
    key: "expectedRiskSignalHitRate",
    label: "风险信号命中率",
    note: "预期风险信号命中",
  },
];

const issueLabels: Array<{
  key: keyof RiskBenchmarkOverview["issues"];
  label: string;
}> = [
  { key: "correct", label: "判断准确" },
  { key: "falseNegative", label: "漏报" },
  { key: "falsePositive", label: "误报" },
  { key: "severityMismatch", label: "严重度不准" },
  { key: "borderlineFalsePositive", label: "边界岗误判假 AI" },
  { key: "missingExpectedSignal", label: "缺少预期信号" },
];

export function RiskBenchmarkPanel() {
  const [state, setState] = useState<BenchmarkState>({
    status: "loading",
    overview: null,
    error: null,
  });

  const loadBenchmark = useCallback(async () => {
    setState({ status: "loading", overview: null, error: null });

    try {
      const body = await requestRiskBenchmark();

      setState({ status: "ready", overview: body, error: null });
    } catch (error) {
      setState({
        status: "error",
        overview: null,
        error:
          error instanceof Error
            ? error.message
            : "识别质量读取失败，请稍后重试。",
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    requestRiskBenchmark()
      .then((body) => {
        if (!cancelled) {
          setState({ status: "ready", overview: body, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            overview: null,
            error:
              error instanceof Error
                ? error.message
                : "识别质量读取失败，请稍后重试。",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <RiskBenchmarkLoading />;
  }

  if (state.status === "error") {
    return <RiskBenchmarkError message={state.error} onRetry={loadBenchmark} />;
  }

  return (
    <RiskBenchmarkContent
      onRefresh={loadBenchmark}
      overview={state.overview}
    />
  );
}

async function requestRiskBenchmark() {
  return apiRequest<RiskBenchmarkApiResponse>("/api/risk-benchmark", {
    cache: "no-store",
    errorMessage: "识别质量读取失败，请稍后重试。",
    method: "GET",
  });
}

function RiskBenchmarkContent({
  onRefresh,
  overview,
}: {
  overview: RiskBenchmarkOverview;
  onRefresh: () => void;
}) {
  const maxIssueCount = useMemo(
    () => Math.max(1, ...issueLabels.map((item) => overview.issues[item.key])),
    [overview.issues],
  );

  return (
    <section
      aria-labelledby="risk-benchmark-title"
      className="rounded-[24px] border border-[var(--color-border-light)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-6"
      data-testid="risk-benchmark-panel"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#e8f0f5] text-[var(--color-blue)]">
              <BarChart3 aria-hidden="true" className="size-5" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <h2
                className="text-[20px] font-semibold leading-7 text-[var(--color-text)]"
                id="risk-benchmark-title"
              >
                识别质量
              </h2>
              <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
                持续校验真假 AI 岗识别稳定性。
              </p>
            </div>
          </div>
        </div>

        <button
          className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-xs font-bold text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] active:scale-[0.98]"
          onClick={onRefresh}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.8} />
          刷新
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStat label="样本总量" value={String(overview.dataset.total)} />
        <SummaryStat label="真 AI 岗" value={String(overview.dataset.realAi)} />
        <SummaryStat label="假 AI 岗" value={String(overview.dataset.fakeAi)} />
        <SummaryStat label="边界岗" value={String(overview.dataset.borderline)} />
      </div>

      <div className="mt-4 rounded-[16px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
            样本构成
          </h3>
        </div>
        <div className="space-y-3">
          <CompositionRow
            count={overview.dataset.realAi}
            label="真 AI 岗"
            total={overview.dataset.total}
            tone="green"
          />
          <CompositionRow
            count={overview.dataset.fakeAi}
            label="假 AI 岗"
            total={overview.dataset.total}
            tone="red"
          />
          <CompositionRow
            count={overview.dataset.borderline}
            label="边界岗"
            total={overview.dataset.total}
            tone="gold"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metricLabels.map((metric) => (
          <MetricCard
            key={metric.key}
            label={metric.label}
            metric={overview.metrics[metric.key]}
            note={metric.note}
            lowerIsBetter={metric.key === "realAiFalsePositiveRate"}
          />
        ))}
      </div>

      <div className="mt-4 rounded-[16px] border border-[var(--color-border-light)] bg-white p-4">
        <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
          误差分布
        </h3>
        <div className="mt-3 space-y-3">
          {issueLabels.map((item) => (
            <IssueRow
              count={overview.issues[item.key]}
              key={item.key}
              label={item.label}
              max={maxIssueCount}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <TopIssueList
          items={overview.topIssues.missedFakeAi}
          title="漏报假 AI 岗"
        />
        <TopIssueList
          items={overview.topIssues.falsePositiveRealAi}
          title="误报真 AI 岗"
        />
        <TopIssueList
          items={overview.topIssues.borderlineAnomalies}
          title="边界异常"
        />
      </div>

      <div className="mt-4 rounded-[16px] border border-[rgba(196,135,58,0.24)] bg-[#fffaf0] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <AlertCircle
                aria-hidden="true"
                className="size-4 shrink-0 text-[var(--color-primary)]"
                strokeWidth={1.8}
              />
              <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
                使用边界
              </h3>
            </div>
            <p className="break-words text-xs leading-5 text-[var(--color-text-secondary)]">
              {overview.disclaimer}
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-1 gap-2 text-xs leading-5 text-[var(--color-text-secondary)] sm:min-w-[260px]">
            <p className="break-all">
              <span className="font-bold text-[var(--color-text)]">规则版本：</span>
              {overview.ruleVersion}
            </p>
            <p className="break-all">
              <span className="font-bold text-[var(--color-text)]">生成时间：</span>
              {overview.generatedAt}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function RiskBenchmarkLoading() {
  return (
    <section className="rounded-[24px] border border-[var(--color-border-light)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-[12px] bg-[#e8f0f5] text-[var(--color-blue)]">
          <RefreshCw
            aria-hidden="true"
            className="size-5 animate-spin"
            strokeWidth={1.8}
          />
        </div>
        <div>
          <h2 className="text-[20px] font-semibold leading-7 text-[var(--color-text)]">
            识别质量
          </h2>
          <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
            正在读取识别质量结果。
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            className="h-20 animate-pulse rounded-[14px] bg-[var(--color-surface-hover)]"
            key={item}
          />
        ))}
      </div>
    </section>
  );
}

function RiskBenchmarkError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-[24px] border border-[rgba(196,102,90,0.32)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#f5e8e6] text-[var(--color-red)]">
            <AlertCircle aria-hidden="true" className="size-5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[20px] font-semibold leading-7 text-[var(--color-text)]">
              识别质量暂不可用
            </h2>
            <p className="mt-1 break-words text-xs leading-5 text-[var(--color-text-secondary)]">
              {message}
            </p>
          </div>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-4 py-2 text-xs font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
          onClick={onRetry}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.8} />
          重试
        </button>
      </div>
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4">
      <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold leading-8 text-[var(--color-text)]">
        {value}
      </p>
    </div>
  );
}

function CompositionRow({
  count,
  label,
  tone,
  total,
}: {
  count: number;
  label: string;
  total: number;
  tone: "green" | "red" | "gold";
}) {
  const width = total <= 0 ? 0 : Math.round((count / total) * 100);
  const toneClass = {
    gold: "bg-[var(--color-primary)]",
    green: "bg-[var(--color-green)]",
    red: "bg-[var(--color-red)]",
  }[tone];

  return (
    <div className="grid grid-cols-[72px_1fr_56px] items-center gap-3 text-xs">
      <span className="font-bold leading-5 text-[var(--color-text)]">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--color-border-light)]">
        <div
          aria-label={`${label}占比 ${width}%`}
          className={`h-full rounded-full ${toneClass}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-right font-bold leading-5 text-[var(--color-text-secondary)]">
        {count}
      </span>
    </div>
  );
}

function MetricCard({
  label,
  lowerIsBetter = false,
  metric,
  note,
}: {
  label: string;
  metric: RiskBenchmarkMetric;
  note: string;
  lowerIsBetter?: boolean;
}) {
  return (
    <article className="rounded-[14px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-bold leading-5 text-[var(--color-text)]">
            {label}
          </h3>
          <p className="mt-0.5 text-xs leading-5 text-[var(--color-text-secondary)]">
            {note}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold leading-4 text-[var(--color-text-secondary)]">
          {lowerIsBetter ? "越低越好" : "越高越好"}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-[28px] font-bold leading-8 text-[var(--color-text)]">
          {metric.percent}
        </p>
        <p className="text-xs leading-5 text-[var(--color-muted)]">
          {metric.numerator}/{metric.denominator}
        </p>
      </div>
    </article>
  );
}

function IssueRow({
  count,
  label,
  max,
}: {
  count: number;
  label: string;
  max: number;
}) {
  const width = count === 0 ? 0 : Math.max(4, Math.round((count / max) * 100));

  return (
    <div className="grid grid-cols-[112px_1fr_40px] items-center gap-3 text-xs sm:grid-cols-[144px_1fr_48px]">
      <span className="break-words font-bold leading-5 text-[var(--color-text)]">
        {label}
      </span>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--color-border-light)]">
        <div
          aria-label={`${label} ${count} 条`}
          className="h-full rounded-full bg-[var(--color-blue)]"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-right font-bold leading-5 text-[var(--color-text-secondary)]">
        {count}
      </span>
    </div>
  );
}

function TopIssueList({
  items,
  title,
}: {
  title: string;
  items: RiskBenchmarkOverview["topIssues"]["missedFakeAi"];
}) {
  return (
    <article className="rounded-[14px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4">
      <div className="mb-3 flex items-center gap-2">
        {items.length === 0 ? (
          <CheckCircle2
            aria-hidden="true"
            className="size-4 text-[var(--color-green)]"
            strokeWidth={1.8}
          />
        ) : (
          <AlertCircle
            aria-hidden="true"
            className="size-4 text-[var(--color-red)]"
            strokeWidth={1.8}
          />
        )}
        <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
          {title}
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
          当前暂无该类异常。
        </p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 3).map((item) => (
            <li
              className="min-w-0 rounded-[12px] bg-white px-3 py-2"
              key={item.id}
            >
              <p className="truncate text-xs font-bold leading-5 text-[var(--color-text)]">
                {item.company} · {item.role}
              </p>
              <p className="text-[11px] leading-4 text-[var(--color-muted)]">
                预期 {item.expectedRiskLevel} / 实际 {item.actualRiskLevel}
              </p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
