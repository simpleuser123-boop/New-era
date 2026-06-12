"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  DatabaseZap,
  Gauge,
  Layers3,
  LineChart,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/features/AppShell";
import { CompanyHiringList } from "@/components/features/insights/CompanyHiringList";
import { DomainDistribution } from "@/components/features/insights/DomainDistribution";
import {
  fallbackInsights,
  hasRenderableInsights,
  normalizeInsights,
  normalizeWeeklyBrief,
  type IndustryInsights,
  type LatestNewsItem,
  type TrendTag,
  type WeeklyBrief as WeeklyBriefModel,
} from "@/components/features/insights/insightsModel";
import { MetricCard } from "@/components/features/insights/MetricCard";
import { SalaryBenchmarks } from "@/components/features/insights/SalaryBenchmarks";
import { TrendBarList } from "@/components/features/insights/TrendBarList";
import { WeeklyBrief } from "@/components/features/insights/WeeklyBrief";
import { EmptyState } from "@/components/ui/EmptyState";
import { apiRequest, readErrorMessage } from "@/lib/api-client";

type LoadStatus = "loading" | "ready" | "fallback" | "unavailable";
type BriefStatus = "idle" | "generating" | "fallback";
type RefreshStatus = "idle" | "refreshing";

type InsightsResponse =
  {
    ok: true;
    provider?: string;
    fallbackUsed?: boolean;
    fallbackReason?: string;
    fallbackCode?: string;
  } & Record<string, unknown>;

type BriefResponse =
  {
    ok: true;
    brief?: unknown;
    weeklyBrief?: unknown;
    provider?: string;
    fallbackUsed?: boolean;
    fallbackReason?: string;
    fallbackCode?: string;
  } & Record<string, unknown>;

type BriefFetchResult = {
  brief: WeeklyBriefModel;
  fallbackUsed: boolean;
  provider?: string;
  fallbackReason?: string;
  fallbackCode?: string;
};

export function IndustryInsightsPage() {
  const [insights, setInsights] = useState<IndustryInsights>(fallbackInsights);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [loadNotice, setLoadNotice] = useState<string>();
  const [brief, setBrief] = useState<WeeklyBriefModel>(
    fallbackInsights.weeklyBrief,
  );
  const [briefStatus, setBriefStatus] = useState<BriefStatus>("idle");
  const [briefNotice, setBriefNotice] = useState<string>();
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>("idle");
  const [refreshNotice, setRefreshNotice] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInsights() {
      setLoadStatus("loading");
      setLoadNotice(undefined);

      try {
        const nextInsights = await fetchIndustryInsights(controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        if (!hasRenderableInsights(nextInsights)) {
          setInsights(nextInsights);
          setBrief(nextInsights.weeklyBrief);
          setLoadStatus("unavailable");
          setLoadNotice("行业洞察接口返回为空，当前暂无可展示数据。");
          return;
        }

        setInsights(nextInsights);
        setBrief(nextInsights.weeklyBrief);
        setLoadStatus(nextInsights.fallbackUsed ? "fallback" : "ready");
        setLoadNotice(
          nextInsights.fallbackUsed
            ? "部分趋势暂不可用，已保留当前可用内容。"
            : undefined,
        );
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setInsights(fallbackInsights);
        setBrief(fallbackInsights.weeklyBrief);
        setLoadStatus("fallback");
        setLoadNotice(
          `部分趋势暂不可用，已保留当前可用内容。 ${readErrorMessage(
            error,
            "行业趋势接口不可用。",
          )}`,
        );
      }
    }

    void loadInsights();

    return () => controller.abort();
  }, [reloadKey]);

  const isLoading = loadStatus === "loading";
  const isUnavailable =
    loadStatus === "unavailable" || (!isLoading && !hasRenderableInsights(insights));

  const briefGeneratingText =
    "正在生成周报摘要...";

  const marketSignals = useMemo(() => buildMarketSignals(insights), [insights]);

  async function handleRefreshInsights() {
    const controller = new AbortController();

    setRefreshStatus("refreshing");
    setRefreshNotice(undefined);
    setLoadNotice(undefined);

    try {
      const nextInsights = await fetchIndustryInsights(controller.signal, {
        refresh: true,
      });

      if (!hasRenderableInsights(nextInsights)) {
        setInsights(nextInsights);
        setBrief(nextInsights.weeklyBrief);
        setLoadStatus("unavailable");
        setLoadNotice("刷新返回为空，当前暂无可展示数据。");
        return;
      }

      setInsights(nextInsights);
      setBrief(nextInsights.weeklyBrief);
      setLoadStatus(nextInsights.fallbackUsed ? "fallback" : "ready");
      setLoadNotice(
        nextInsights.fallbackUsed
          ? getInsightsFallbackMessage(nextInsights)
          : undefined,
      );
      setRefreshNotice(
        nextInsights.fallbackUsed
          ? "刷新未生成新趋势，已保留当前可用内容。"
          : "已刷新行业趋势。",
      );
    } catch (error) {
      setLoadStatus("fallback");
      setLoadNotice(
        `部分趋势暂不可用，已保留当前可用内容。 ${readErrorMessage(
          error,
          "刷新失败。",
        )}`,
      );
      setRefreshNotice("刷新失败，已保留当前行业趋势。");
    } finally {
      setRefreshStatus("idle");
    }
  }

  async function handleRefreshBrief() {
    setBriefStatus("generating");
    setBriefNotice(undefined);

    try {
      const result = await fetchMarketBrief();

      setBrief(result.brief);
      setBriefStatus(result.fallbackUsed ? "fallback" : "idle");
      setBriefNotice(
        result.fallbackUsed
          ? "周报暂未生成新内容，已保留当前周报。"
          : undefined,
      );
    } catch (error) {
      setBrief(fallbackInsights.weeklyBrief);
      setBriefStatus("fallback");
      setBriefNotice(
        `${readErrorMessage(error, "市场周报接口不可用。")} 已保留当前周报。`,
      );
    }
  }

  function handleRetry() {
    setReloadKey((current) => current + 1);
  }

  return (
    <AppShell activeHref="/insights" contained={false}>
      <InsightsHeader
        isLoading={isLoading}
        isRefreshing={refreshStatus === "refreshing"}
        onRefresh={handleRefreshInsights}
        snapshotPeriod={insights.snapshotPeriod}
      />

      <div className="mx-auto max-w-[1200px] space-y-8 px-5 pb-12 sm:px-10">
        {isLoading ? (
          <InsightsLoading />
        ) : isUnavailable ? (
          <DataUnavailableState message={loadNotice} onRetry={handleRetry} />
        ) : (
          <>
            {refreshNotice ? <RefreshNotice message={refreshNotice} /> : null}

            <section className="space-y-4">
              <SectionHeading
                description="查看热门方向、薪资区间、竞争指数与岗位热度变化。"
                title="AI 招聘市场概览"
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 min-[1440px]:grid-cols-4">
                {insights.overviewMetrics.map((metric) => (
                  <MetricCard key={metric.id ?? metric.label} metric={metric} />
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              <TrendBarList trends={insights.techTrends} />
              <SalaryBenchmarks salaryBenchmarks={insights.salaryBenchmarks} />
            </section>

            <LatestNewsList items={insights.latestNews} />

            <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              <DomainDistribution slices={insights.domainDistribution} />
              <CompanyHiringList companies={insights.recommendedCompanies} />
            </section>

            <section className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              <div className="space-y-8 lg:col-span-7">
                <WeeklyBrief
                  brief={brief}
                  generatingText={briefGeneratingText}
                  isGenerating={briefStatus === "generating"}
                  notice={briefNotice}
                  onRefresh={handleRefreshBrief}
                />
                <TrendTags tags={insights.trendTags} />
              </div>
              <MarketSignals
                domainDistribution={insights.domainDistribution}
                signals={marketSignals}
              />
            </section>

          </>
        )}
      </div>
    </AppShell>
  );
}

function InsightsHeader({
  isLoading,
  isRefreshing,
  onRefresh,
  snapshotPeriod,
}: {
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  snapshotPeriod?: string;
}) {
  return (
    <PageHeader
      actions={
        <div className="flex w-full items-center gap-3 md:w-auto">
          <div className="relative w-full sm:w-72">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[var(--color-text-secondary)]"
              strokeWidth={1.8}
            />
            <input
              className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-hover)] py-2 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]"
              disabled={isLoading}
              placeholder="搜索行业洞察..."
              type="search"
            />
          </div>
          <button
            aria-busy={isRefreshing}
            aria-label="刷新行业趋势"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-bold text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isLoading || isRefreshing}
            onClick={onRefresh}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${isRefreshing ? "animate-spin" : ""}`}
              strokeWidth={1.8}
            />
            <span className="hidden whitespace-nowrap sm:inline">
              {isRefreshing ? "刷新中" : "刷新趋势"}
            </span>
          </button>
        </div>
      }
      description={
        isLoading
          ? "正在加载 AI 人才市场快照与周报。"
          : `${snapshotPeriod ?? "市场快照"}，追踪 AI 人才市场脉搏，辅助判断岗位含金量与求职窗口。`
      }
      icon={<TrendingUp aria-hidden="true" className="size-5" strokeWidth={1.8} />}
      title="行业趋势深挖"
    />
  );
}

function SectionHeading({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div>
      <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
        {title}
      </h2>
      <p className="mt-1 text-sm leading-5 text-[var(--color-text-secondary)]">
        {description}
      </p>
    </div>
  );
}

function RefreshNotice({ message }: { message: string }) {
  return (
    <section className="rounded-[18px] border border-[rgba(91,127,158,0.28)] bg-[#f4f8fa] px-5 py-4 shadow-[var(--shadow-sm)]">
      <div className="flex gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-white text-[var(--color-primary)]">
          <RefreshCw aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </div>
        <div>
          <h2 className="text-sm font-bold leading-5 text-[var(--color-text)]">
            刷新状态
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            {message}
          </p>
        </div>
      </div>
    </section>
  );
}

function DataUnavailableState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <EmptyState
      action={
        <button
          className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-5 py-2 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
          onClick={onRetry}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.8} />
          重新加载
        </button>
      }
      description={message ?? "行业趋势数据暂不可用，当前没有可展示内容。"}
      icon={<DatabaseZap aria-hidden="true" className="size-6" strokeWidth={1.8} />}
      title="行业洞察数据不可用"
    />
  );
}

function LatestNewsList({ items }: { items: LatestNewsItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
      <div className="mb-6">
        <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
          行业动态
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.slice(0, 6).map((item) => (
          <article
            className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4"
            key={item.id ?? item.url ?? item.title}
          >
            {item.publishedAt ? (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold leading-4 text-[var(--color-muted)]">
                <span>{item.publishedAt}</span>
              </div>
            ) : null}
            {item.url ? (
              <a
                className="text-sm font-bold leading-5 text-[var(--color-text)] transition-colors hover:text-[var(--color-primary)]"
                href={item.url}
                rel="noreferrer"
                target="_blank"
              >
                {item.title}
              </a>
            ) : (
              <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
                {item.title}
              </h3>
            )}
            {item.snippet ? (
              <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
                {item.snippet}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function InsightsLoading({ text }: { text?: string }) {
  return (
    <div className="space-y-8" aria-live="polite">
      <p className="text-sm font-medium leading-5 text-[var(--color-text-secondary)]">
        {text ?? "正在加载行业洞察..."}
      </p>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 min-[1440px]:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <MetricCardSkeleton key={index} />
        ))}
      </section>
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <ContentSkeleton className="lg:col-span-7" />
        <ContentSkeleton className="lg:col-span-5" />
      </section>
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <ContentSkeleton />
        <ContentSkeleton className="lg:col-span-2" />
      </section>
    </div>
  );
}

function MetricCardSkeleton() {
  return (
    <article className="flex min-h-40 flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="h-4 w-28 animate-pulse rounded-full bg-[var(--color-border-light)]" />
        <div className="size-10 animate-pulse rounded-[12px] bg-[var(--color-border-light)]" />
      </div>
      <div className="mt-auto">
        <div className="h-9 w-32 animate-pulse rounded-full bg-[var(--color-border-light)]" />
        <div className="mt-4 h-3 w-full animate-pulse rounded-full bg-[var(--color-border-light)]" />
        <div className="mt-2 h-3 w-4/5 animate-pulse rounded-full bg-[var(--color-border-light)]" />
      </div>
    </article>
  );
}

function ContentSkeleton({ className = "" }: { className?: string }) {
  return (
    <section
      className={`rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8 ${className}`}
    >
      <div className="h-6 w-40 animate-pulse rounded-full bg-[var(--color-border-light)]" />
      <div className="mt-6 space-y-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="space-y-2" key={index}>
            <div className="h-4 w-3/5 animate-pulse rounded-full bg-[var(--color-border-light)]" />
            <div className="h-2.5 w-full animate-pulse rounded-full bg-[var(--color-border-light)]" />
          </div>
        ))}
      </div>
    </section>
  );
}

function TrendTags({ tags }: { tags: TrendTag[] }) {
  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
      <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
        热门标签
      </h2>
      <div className="mt-5 flex flex-wrap gap-3">
        {tags.map((tag) => (
          <button
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-primary-light)] px-4 py-2 text-sm font-bold leading-5 text-[var(--color-primary)] transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white active:scale-[0.98]"
            key={tag.name}
            type="button"
          >
            {tag.name}
            <span className="text-[11px] leading-4">
              {formatTrendLabel(tag.trend)}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-4 text-[var(--color-muted)]">
        技术热度用于辅助判断方向变化。
      </p>
    </section>
  );
}

function MarketSignals({
  domainDistribution,
  signals,
}: {
  domainDistribution: IndustryInsights["domainDistribution"];
  signals: Array<{
    icon: LucideIcon;
    label: string;
    value: string;
  }>;
}) {
  return (
    <aside className="space-y-8 lg:col-span-5">
      <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
        <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
          市场信号
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {signals.map((signal) => {
            const Icon = signal.icon;

            return (
              <article
                className="rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4"
                key={signal.label}
              >
                <div className="mb-3 flex items-center gap-2 text-[var(--color-primary)]">
                  <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
                  <span className="text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
                    {signal.label}
                  </span>
                </div>
                <p className="text-xl font-semibold leading-7 text-[var(--color-text)]">
                  {signal.value}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
        <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
          方向占比速览
        </h2>
        <div className="mt-6 space-y-5">
          {domainDistribution.map((area) => (
            <article key={area.id ?? area.label}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BrainCircuit
                    aria-hidden="true"
                    className="size-4 text-[var(--color-primary)]"
                    strokeWidth={1.8}
                  />
                  <span className="text-sm font-bold leading-5 text-[var(--color-text)]">
                    {area.label}
                  </span>
                </div>
                <span className="text-sm font-bold leading-5 text-[var(--color-primary)]">
                  {area.percent}%
                </span>
              </div>
              <div
                aria-label={`${area.label} ${area.percent}%`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={area.percent}
                className="h-2 overflow-hidden rounded-full bg-[var(--color-border-light)]"
                role="progressbar"
              >
                <div
                  className="h-full rounded-full bg-[var(--color-primary)]"
                  style={{ width: `${clampPercent(area.percent)}%` }}
                />
              </div>
            </article>
          ))}
        </div>
      </section>
    </aside>
  );
}

async function fetchIndustryInsights(
  signal: AbortSignal,
  options: { refresh?: boolean } = {},
): Promise<IndustryInsights> {
  const body = await apiRequest<InsightsResponse>(
    options.refresh ? "/api/insights/trends?refresh=1" : "/api/insights/trends",
    {
      cache: "no-store",
      errorMessage: "行业趋势读取失败",
      signal,
      timeoutMs: options.refresh ? 80_000 : undefined,
    },
  );

  return normalizeInsights(body, {
    provider: typeof body.provider === "string" ? body.provider : undefined,
    fallbackUsed: Boolean(body.fallbackUsed),
    fallbackReason:
      typeof body.fallbackReason === "string" ? body.fallbackReason : undefined,
    fallbackCode: typeof body.fallbackCode === "string" ? body.fallbackCode : undefined,
  });
}

async function fetchMarketBrief(): Promise<BriefFetchResult> {
  const body = await apiRequest<BriefResponse>("/api/insights/brief", {
    cache: "no-store",
    errorMessage: "市场周报生成失败",
    json: { focus: "AI 招聘市场周报" },
    method: "POST",
  });

  return {
    brief: normalizeWeeklyBrief(body.brief ?? body.weeklyBrief),
    fallbackUsed: Boolean(body.fallbackUsed),
    provider: typeof body.provider === "string" ? body.provider : undefined,
    fallbackReason:
      typeof body.fallbackReason === "string" ? body.fallbackReason : undefined,
    fallbackCode: typeof body.fallbackCode === "string" ? body.fallbackCode : undefined,
  };
}

function getInsightsFallbackMessage(insights: IndustryInsights): string {
  if (insights.fallbackCode?.startsWith("web_search_")) {
    return "刷新暂不可用，已保留当前可用内容。";
  }

  if (insights.fallbackReason === "deepseek_unavailable") {
    return "刷新暂未生成新内容，已保留当前可用内容。";
  }

  if (insights.fallbackReason === "deepseek_invalid_response") {
    return "刷新结果暂不可用，已保留当前可用内容。";
  }

  return "部分趋势暂不可用，已保留当前可用内容。";
}

function buildMarketSignals(insights: IndustryInsights) {
  const topDomain = insights.domainDistribution[0];
  const topTrend = insights.techTrends[0];
  const competitionMetric = insights.overviewMetrics.find((metric) =>
    metric.label.includes("竞争"),
  );

  return [
    {
      label: "趋势快照",
      value: insights.snapshotPeriod ?? "市场快照",
      icon: LineChart,
    },
    {
      label: "核心方向",
      value: topDomain?.label ?? "LLM 应用层",
      icon: Layers3,
    },
    {
      label: "热门技术",
      value: topTrend?.name ?? "Agent / RAG",
      icon: Gauge,
    },
    {
      label: "竞争指数",
      value: competitionMetric?.value ?? "待更新",
      icon: ShieldCheck,
    },
  ];
}

function formatTrendLabel(trend?: string): string {
  if (trend === "up") {
    return "上升";
  }

  if (trend === "down") {
    return "下降";
  }

  if (trend === "new") {
    return "新";
  }

  return "持平";
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
