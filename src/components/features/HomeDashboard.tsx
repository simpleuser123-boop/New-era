"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  Clock3,
  Compass,
  DatabaseZap,
  FileSearch,
  FileStack,
  Gauge,
  History,
  Lightbulb,
  Search,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import presetInsights from "../../../demo-data/insights.json";
import presetJds from "../../../demo-data/preset-jds.json";
import { AppShell, PageHeader } from "@/components/features/AppShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { apiRequest, readErrorMessage } from "@/lib/api-client";

type RiskLevel = "critical" | "high" | "medium" | "low";
type DataSource = "api" | "demo";

type DashboardReport = {
  id: string;
  company: string;
  role: string;
  score: number;
  riskLevel: RiskLevel;
  createdAt: string;
  href: string;
  source: DataSource;
};

type PresetJd = {
  id: string;
  title: string;
  company: string;
  role: string;
  type: "real_ai" | "fake_ai" | "borderline";
  aiDirection: string;
  salaryRange: string;
  location: string;
  experienceLevel: string;
  demoPurpose: string;
  jdText: string;
  expectedScore: number;
  expectedRiskLevel: RiskLevel;
};

type OverviewMetric = {
  id?: string;
  label: string;
  value: string;
  numericValue?: number;
  description?: string;
  comparisonLabel?: string;
  progress?: number;
  trend?: string;
};

type TechTrend = {
  id?: string;
  rank?: number;
  name: string;
  heatScore: number;
  demandSharePercent?: number;
  growthPercentEstimate?: number;
  trendLabel?: string;
  displayChange?: string;
  note?: string;
  relatedSkills?: string[];
};

type TrendTag = {
  name: string;
  heatScore: number;
  trend?: string;
};

type DomainSlice = {
  id?: string;
  label: string;
  percent: number;
  detail?: string;
  color?: string;
};

type WeeklyBrief = {
  title?: string;
  summary: string;
  highlights: Array<{
    id?: string;
    title: string;
    detail?: string;
    impact?: string;
  }>;
  recommendedActions: string[];
  disclaimer?: string;
};

type DashboardInsights = {
  snapshotPeriod?: string;
  overviewMetrics: OverviewMetric[];
  techTrends: TechTrend[];
  trendTags: TrendTag[];
  domainDistribution: DomainSlice[];
  weeklyBrief: WeeklyBrief;
  dataSourceText?: string;
  provider?: string;
  fallbackUsed?: boolean;
};

type LoadStatus = "loading" | "ready" | "fallback";
type StatsLoadStatus = "loading" | "ready" | "error";

type ReportsResponse =
  {
    ok: true;
    reports: unknown[];
    count: number;
    limit: number;
  };

type ApplicationStats = {
  evaluated: number;
  highMatch: number;
  toApply: number;
  applied: number;
  interviewing: number;
  offerReceived: number;
  rejected: number;
  abandoned: number;
  highMatchThreshold: number;
};

type ApplicationStatsResponse =
  {
    ok: true;
  } & ApplicationStats;

type InsightsResponse =
  {
    ok: true;
    provider?: string;
    fallbackUsed?: boolean;
  } & Record<string, unknown>;

type MetricItem = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  accent: string;
  trendTone: "positive" | "negative" | "neutral";
  progress?: number;
};

const typedPresetJds = presetJds as PresetJd[];
const fallbackInsights = normalizeInsights(presetInsights, {
  provider: "preset_demo_data",
  fallbackUsed: true,
});
const demoReports = createDemoReports();
const EMPTY_APPLICATION_STATS: ApplicationStats = {
  abandoned: 0,
  applied: 0,
  evaluated: 0,
  highMatch: 0,
  highMatchThreshold: 4,
  interviewing: 0,
  offerReceived: 0,
  rejected: 0,
  toApply: 0,
};

const quickActions = [
  {
    title: "评估岗位",
    description: "粘贴 JD，生成 6 维岗位价值报告",
    href: "/evaluate",
    icon: BarChart3,
  },
  {
    title: "风险扫描",
    description: "识别培训贷、外包包装和伪 AI 岗",
    href: "/risks",
    icon: ShieldCheck,
  },
  {
    title: "简历匹配",
    description: "对照目标岗位补齐技能缺口",
    href: "/resume",
    icon: FileStack,
  },
  {
    title: "行业洞察",
    description: "查看 AI 方向、薪资和技术热度",
    href: "/insights",
    icon: Lightbulb,
  },
];

const dailyNotes = [
  "先判断岗位含金量，再投入投递时间。",
  "优先选择能沉淀工程经验和业务指标的 AI 岗。",
  "JD 中没有模型、数据、评测链路时，要进一步核实。",
  "把 RAG、Agent、评测和可观测性讲清楚，会显著提高面试质量。",
  "高薪承诺和低门槛组合出现时，先做风险扫描。",
  "投递前记录判断依据，复盘会更准确。",
  "简历项目要对应真实 AI 生态位，而不是只堆关键词。",
];

const riskLevelLabels: Record<RiskLevel, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
  critical: "极高风险",
};

const riskBadgeClass: Record<RiskLevel, string> = {
  low: "border-[#d7e7d2] bg-[#eef6eb] text-[#5f7f50]",
  medium: "border-[#eedaa6] bg-[#fff7df] text-[#9a6d20]",
  high: "border-[#efd4d0] bg-[#fff0ee] text-[#b45c52]",
  critical: "border-[#e7beb8] bg-[#fff6f4] text-[var(--color-red)]",
};

const scoreBadgeClass = {
  high: "bg-[#eef6eb] text-[#5f7f50]",
  medium: "bg-[#fff7df] text-[#9a6d20]",
  low: "bg-[#fff0ee] text-[#b45c52]",
};

export function HomeDashboard() {
  const [reports, setReports] = useState<DashboardReport[]>([]);
  const [insights, setInsights] = useState<DashboardInsights>(fallbackInsights);
  const [applicationStats, setApplicationStats] =
    useState<ApplicationStats>(EMPTY_APPLICATION_STATS);
  const [reportsStatus, setReportsStatus] = useState<LoadStatus>("loading");
  const [insightsStatus, setInsightsStatus] = useState<LoadStatus>("loading");
  const [applicationStatsStatus, setApplicationStatsStatus] =
    useState<StatsLoadStatus>("loading");
  const [applicationStatsError, setApplicationStatsError] = useState<string>();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadReports() {
      try {
        const nextReports = await fetchReports(controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setReports(nextReports);
        setReportsStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setReports(demoReports);
        setReportsStatus("fallback");
      }
    }

    async function loadApplicationStats() {
      try {
        const nextStats = await fetchApplicationStats(controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setApplicationStats(nextStats);
        setApplicationStatsError(undefined);
        setApplicationStatsStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setApplicationStats(EMPTY_APPLICATION_STATS);
        setApplicationStatsError(
          readErrorMessage(error, "投递统计暂不可用。"),
        );
        setApplicationStatsStatus("error");
      }
    }

    async function loadInsights() {
      try {
        const nextInsights = await fetchInsights(controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setInsights(nextInsights);
        setInsightsStatus(nextInsights.fallbackUsed ? "fallback" : "ready");
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setInsights(fallbackInsights);
        setInsightsStatus("fallback");
      }
    }

    void loadReports();
    void loadApplicationStats();
    void loadInsights();

    return () => controller.abort();
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleReports = useMemo(() => {
    const recentReports = reports.slice(0, 4);

    if (!normalizedQuery) {
      return recentReports;
    }

    return recentReports.filter((report) =>
      `${report.company} ${report.role}`.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, reports]);

  const metrics = useMemo(
    () => buildMetrics(applicationStats, applicationStatsStatus),
    [applicationStats, applicationStatsStatus],
  );

  const isLoading =
    reportsStatus === "loading" ||
    insightsStatus === "loading" ||
    applicationStatsStatus === "loading";

  return (
    <AppShell contained={false}>
      <TopBar
        isLoading={isLoading}
        applicationStats={applicationStats}
        applicationStatsStatus={applicationStatsStatus}
        onQueryChange={setQuery}
        query={query}
        reportCount={reports.length}
        reportsStatus={reportsStatus}
      />

      <div className="mx-auto max-w-[1200px] space-y-8 px-5 pb-10 sm:px-10">
        <MetricsGrid isLoading={isLoading} metrics={metrics} />
        <QuickActions />

        <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <AssessmentList
            isLoading={reportsStatus === "loading"}
            query={query}
            reports={visibleReports}
            totalCount={reports.length}
          />
          <IndustryTrendSummary
            insights={insights}
            isLoading={insightsStatus === "loading"}
          />
        </section>

        <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <DemoDataShortcuts />
          <ApplicationStatsFunnel
            errorMessage={applicationStatsError}
            stats={applicationStats}
            statsStatus={applicationStatsStatus}
          />
        </section>

        <section className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <SkillCloud
            insights={insights}
            isLoading={insightsStatus === "loading"}
          />
          <DomainSnapshot
            insights={insights}
            isLoading={insightsStatus === "loading"}
          />
        </section>
      </div>
    </AppShell>
  );
}

type TopBarProps = {
  isLoading: boolean;
  applicationStats: ApplicationStats;
  applicationStatsStatus: StatsLoadStatus;
  query: string;
  reportCount: number;
  reportsStatus: LoadStatus;
  onQueryChange: (query: string) => void;
};

function TopBar({
  applicationStats,
  applicationStatsStatus,
  isLoading,
  onQueryChange,
  query,
  reportCount,
  reportsStatus,
}: TopBarProps) {
  const now = new Date();
  const note = dailyNotes[now.getDay()] ?? dailyNotes[0];
  const countText =
    applicationStatsStatus === "loading" || reportsStatus === "loading"
      ? "正在加载本地评估记录"
      : applicationStatsStatus === "ready" && applicationStats.evaluated > 0
        ? `当前沉淀 ${applicationStats.evaluated} 份岗位判断记录`
        : applicationStatsStatus === "error"
          ? reportCount > 0
            ? "最近评估列表已加载，统计暂不可用"
            : "统计暂不可用，可以继续评估岗位"
          : reportsStatus === "fallback"
            ? "评估历史暂不可用，可以先体验评估流程"
            : "还没有本地评估记录，可以从典型 JD 开始体验";

  return (
    <PageHeader
      actions={
        <label className="relative group w-full md:w-80">
          <span className="sr-only">搜索岗位、公司或报告</span>
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[var(--color-text-secondary)] transition-colors group-focus-within:text-[var(--color-primary)]"
            strokeWidth={1.8}
          />
          <input
            className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-hover)] py-2.5 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]"
            disabled={isLoading}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索岗位、公司或报告..."
            type="search"
            value={query}
          />
        </label>
      }
      description={`${countText}。${note}`}
      eyebrow={getGreeting()}
      icon={<Gauge aria-hidden="true" className="size-5" strokeWidth={1.8} />}
      title="产品仪表盘"
    />
  );
}

function MetricsGrid({
  isLoading,
  metrics,
}: {
  isLoading: boolean;
  metrics: MetricItem[];
}) {
  if (isLoading) {
    return (
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <MetricSkeleton key={index} />
        ))}
      </section>
    );
  }

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {metrics.map((metric) => {
        const Icon = metric.icon;

        return (
          <article
            className="flex min-h-36 flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)]"
            key={metric.label}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <span className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-[var(--color-text-secondary)]">
                {metric.label}
              </span>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
              </span>
            </div>
            <div className="mt-auto flex items-end justify-between gap-4">
              <div>
                <p className={`text-[40px] font-bold leading-none ${metric.accent}`}>
                  {metric.value}
                </p>
                <p
                  className={`mt-3 text-xs font-bold leading-4 ${
                    metric.trendTone === "negative"
                      ? "text-[var(--color-red)]"
                      : metric.trendTone === "positive"
                        ? "text-[var(--color-green)]"
                        : "text-[var(--color-text-secondary)]"
                  }`}
                >
                  {metric.detail}
                </p>
              </div>
              {typeof metric.progress === "number" ? (
                <div className="h-2 w-20 overflow-hidden rounded-full bg-[var(--color-primary-light)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-primary)]"
                    style={{ width: `${metric.progress}%` }}
                  />
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function MetricSkeleton() {
  return (
    <article className="min-h-36 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)]">
      <div className="mb-8 flex items-center justify-between">
        <div className="h-4 w-24 animate-pulse rounded-full bg-[var(--color-border-light)]" />
        <div className="size-10 animate-pulse rounded-[12px] bg-[var(--color-border-light)]" />
      </div>
      <div className="mt-8 h-10 w-20 animate-pulse rounded-[10px] bg-[var(--color-border-light)]" />
      <div className="mt-4 h-3 w-32 animate-pulse rounded-full bg-[var(--color-border-light)]" />
    </article>
  );
}

function QuickActions() {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {quickActions.map((action) => {
        const Icon = action.icon;

        return (
          <Link
            className="group flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-left transition-all hover:-translate-y-px hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-lg)] active:scale-[0.99]"
            href={action.href}
            key={action.title}
          >
            <div className="flex size-10 items-center justify-center rounded-[12px] bg-[var(--color-primary-light)] text-[var(--color-primary)] transition-colors group-hover:bg-[var(--color-primary)] group-hover:text-white">
              <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
            </div>
            <div>
              <h2 className="text-lg font-medium leading-7 text-[var(--color-text)]">
                {action.title}
              </h2>
              <p className="text-xs leading-4 text-[var(--color-text-secondary)]">
                {action.description}
              </p>
            </div>
          </Link>
        );
      })}
    </section>
  );
}

function AssessmentList({
  isLoading,
  query,
  reports,
  totalCount,
}: {
  isLoading: boolean;
  query: string;
  reports: DashboardReport[];
  totalCount: number;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)] lg:col-span-2">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5">
        <div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            最近评估记录
          </h2>
          <p className="mt-1 text-xs leading-4 text-[var(--color-text-secondary)]">
            {totalCount > 0 ? `最近 ${Math.min(totalCount, 4)} 条岗位判断` : "评估完成后会沉淀到这里"}
          </p>
        </div>
        <Link
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary)] hover:underline"
          href="/reports"
        >
          查看全部
          <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </Link>
      </div>

      {isLoading ? (
        <div className="divide-y divide-[var(--color-border)]">
          {Array.from({ length: 4 }, (_, index) => (
            <AssessmentSkeleton key={index} />
          ))}
        </div>
      ) : reports.length > 0 ? (
        <div className="divide-y divide-[var(--color-border)]">
          {reports.map((item) => (
            <AssessmentRow item={item} key={item.id} />
          ))}
        </div>
      ) : (
        <div className="p-6">
          <EmptyState
            action={
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-5 py-2 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
                href="/evaluate"
              >
                <BarChart3 aria-hidden="true" className="size-4" strokeWidth={1.8} />
                新建评估
              </Link>
            }
            className="min-h-64 rounded-[18px]"
            description={
              query.trim()
                ? "当前搜索没有命中最近评估记录，可清空关键词或查看全部历史。"
                : "粘贴一个 JD 或使用下方快捷入口完成第一份岗位评估。"
            }
            icon={<History aria-hidden="true" className="size-6" strokeWidth={1.8} />}
            title={query.trim() ? "没有匹配的评估记录" : "暂无评估记录"}
          />
        </div>
      )}
    </section>
  );
}

function AssessmentSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div className="size-12 animate-pulse rounded-[12px] bg-[var(--color-border-light)]" />
        <div>
          <div className="h-5 w-36 animate-pulse rounded-full bg-[var(--color-border-light)]" />
          <div className="mt-3 h-3 w-52 animate-pulse rounded-full bg-[var(--color-border-light)]" />
        </div>
      </div>
      <div className="flex items-center gap-5">
        <div className="h-8 w-14 animate-pulse rounded-[10px] bg-[var(--color-border-light)]" />
        <div className="h-7 w-20 animate-pulse rounded-full bg-[var(--color-border-light)]" />
      </div>
    </div>
  );
}

function AssessmentRow({ item }: { item: DashboardReport }) {
  const scoreTone =
    item.score >= 4 ? scoreBadgeClass.high : item.score >= 3 ? scoreBadgeClass.medium : scoreBadgeClass.low;
  const scoreText = item.score.toFixed(1);
  const rowHref = item.source === "api" ? item.href : "/evaluate";

  return (
    <Link
      className="group flex flex-col gap-4 p-6 transition-colors hover:bg-[var(--color-surface-hover)] sm:flex-row sm:items-center sm:justify-between"
      href={rowHref}
    >
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-hover)]">
          <Building2
            aria-hidden="true"
            className="size-5 text-[var(--color-text-secondary)]"
            strokeWidth={1.8}
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-medium leading-7 text-[var(--color-text)]">
            {item.company}
          </p>
          <p className="line-clamp-2 text-xs leading-4 text-[var(--color-text-secondary)]">
            {item.role}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] leading-4 text-[var(--color-muted)]">
            <Clock3 aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
            {formatRelativeTime(item.createdAt)}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 sm:gap-6">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${scoreTone}`}>
          {scoreText} / 5
        </span>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-bold ${riskBadgeClass[item.riskLevel]}`}
        >
          {riskLevelLabels[item.riskLevel]}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-5 text-[var(--color-border)] transition-colors group-hover:text-[var(--color-primary)]"
          strokeWidth={1.8}
        />
      </div>
    </Link>
  );
}

function IndustryTrendSummary({
  insights,
  isLoading,
}: {
  insights: DashboardInsights;
  isLoading: boolean;
}) {
  const topTrends = insights.techTrends.slice(0, 3);
  const highlight = insights.weeklyBrief.highlights[0];

  return (
    <section className="flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-5">
        <div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            行业趋势摘要
          </h2>
          <p className="mt-1 text-xs leading-4 text-[var(--color-text-secondary)]">
            {insights.snapshotPeriod ?? "市场快照"}
          </p>
        </div>
        <Link
          aria-label="查看行业洞察"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] transition-all hover:bg-[var(--color-primary)] hover:text-white active:scale-[0.98]"
          href="/insights"
        >
          <TrendingUp aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </Link>
      </div>

      <div className="flex-grow space-y-5 p-6">
        {isLoading ? (
          <TrendSummarySkeleton />
        ) : topTrends.length > 0 ? (
          <>
            <p className="line-clamp-3 text-sm leading-6 text-[var(--color-text-secondary)]">
              {insights.weeklyBrief.summary}
            </p>
            <div className="space-y-4">
              {topTrends.map((trend) => (
                <article key={trend.id ?? trend.name}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold leading-5 text-[var(--color-text)]">
                        {trend.rank ? `${trend.rank}. ` : null}
                        {trend.name}
                      </p>
                      <p className="text-xs leading-4 text-[var(--color-text-secondary)]">
                        {trend.trendLabel ?? "趋势"} · 热度 {trend.heatScore}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--color-primary-light)] px-2.5 py-1 text-[11px] font-bold text-[#6b4716]">
                      {trend.displayChange ?? `+${trend.growthPercentEstimate ?? 0}%`}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--color-border-light)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-primary)]"
                      style={{ width: `${clampPercent(trend.heatScore)}%` }}
                    />
                  </div>
                </article>
              ))}
            </div>
            {highlight ? (
              <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4">
                <p className="text-xs font-bold leading-4 text-[var(--color-primary)]">
                  本周信号
                </p>
                <p className="mt-2 text-sm font-semibold leading-5 text-[var(--color-text)]">
                  {highlight.title}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-secondary)]">
                  {highlight.impact ?? highlight.detail}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            className="min-h-72 rounded-[18px]"
            description="行业趋势接口暂无可展示数据，稍后可在洞察页查看完整市场快照。"
            icon={<TrendingUp aria-hidden="true" className="size-6" strokeWidth={1.8} />}
            title="暂无趋势摘要"
          />
        )}
      </div>
    </section>
  );
}

function TrendSummarySkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="h-3 w-full animate-pulse rounded-full bg-[var(--color-border-light)]" />
        <div className="h-3 w-11/12 animate-pulse rounded-full bg-[var(--color-border-light)]" />
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-[var(--color-border-light)]" />
      </div>
      {Array.from({ length: 3 }, (_, index) => (
        <div className="space-y-3" key={index}>
          <div className="flex items-center justify-between">
            <div className="h-4 w-32 animate-pulse rounded-full bg-[var(--color-border-light)]" />
            <div className="h-5 w-14 animate-pulse rounded-full bg-[var(--color-border-light)]" />
          </div>
          <div className="h-2 w-full animate-pulse rounded-full bg-[var(--color-border-light)]" />
        </div>
      ))}
    </div>
  );
}

function DemoDataShortcuts() {
  const demoItems = typedPresetJds.slice(0, 4);

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] lg:col-span-2">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[var(--color-primary)]">
            <Compass aria-hidden="true" className="size-5" strokeWidth={1.8} />
            <span className="text-xs font-bold uppercase tracking-[0.08em]">
              快捷入口
            </span>
          </div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            从典型 JD 场景开始体验
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
            覆盖高分真 AI 岗、AI Infra、算法研究和培训贷风险场景。
          </p>
        </div>
        <Link
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-4 py-2 text-sm font-bold text-[var(--color-primary)] transition-all hover:border-[var(--color-primary)] active:scale-[0.98]"
          href="/evaluate"
        >
          全部场景
          <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {demoItems.map((job) => (
          <DemoShortcutCard job={job} key={job.id} />
        ))}
      </div>
    </section>
  );
}

function DemoShortcutCard({ job }: { job: PresetJd }) {
  const config = getDemoConfig(job.type);
  const Icon = config.icon;
  const href = job.type === "fake_ai" ? "/risks" : "/evaluate";

  return (
    <Link
      className="group rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4 transition-all hover:-translate-y-px hover:border-[var(--color-primary)] hover:bg-white hover:shadow-[var(--shadow-lg)] active:scale-[0.99]"
      href={href}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-[12px] ${config.iconTone}`}>
          <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[var(--color-text-secondary)]">
          {job.expectedScore.toFixed(1)} / 5
        </span>
      </div>
      <h3 className="line-clamp-1 text-base font-semibold leading-6 text-[var(--color-text)]">
        {job.title}
      </h3>
      <p className="mt-1 line-clamp-1 text-xs leading-5 text-[var(--color-text-secondary)]">
        {job.company} · {job.location} · {job.aiDirection}
      </p>
      <p className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--color-text-secondary)]">
        {job.demoPurpose}
      </p>
      <div className="mt-4 flex items-center justify-between">
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${riskBadgeClass[job.expectedRiskLevel]}`}>
          {riskLevelLabels[job.expectedRiskLevel]}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--color-primary)] transition-transform group-hover:translate-x-1">
          {job.type === "fake_ai" ? "去扫描" : "去评估"}
          <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </span>
      </div>
    </Link>
  );
}

function ApplicationStatsFunnel({
  errorMessage,
  stats,
  statsStatus,
}: {
  errorMessage?: string;
  stats: ApplicationStats;
  statsStatus: StatsLoadStatus;
}) {
  const steps = [
    {
      label: "已评估",
      count: stats.evaluated,
      detail: "reports 总数",
      tone: "rgba(196,135,58,0.36)",
    },
    {
      label: "高匹配",
      count: stats.highMatch,
      detail: `综合分 ${stats.highMatchThreshold.toFixed(1)}+`,
      tone: "rgba(196,135,58,0.54)",
    },
    {
      label: "待投递",
      count: stats.toApply,
      detail: "本地清单待处理",
      tone: "rgba(196,135,58,0.68)",
    },
    {
      label: "已投递",
      count: stats.applied,
      detail: "用户手动确认",
      tone: "#86a675",
    },
    {
      label: "面试中",
      count: stats.interviewing,
      detail: "正在推进",
      tone: "#6d95bf",
    },
    {
      label: "已获 Offer",
      count: stats.offerReceived,
      detail: "已收到 Offer",
      tone: "#4f9a6d",
    },
  ];
  const maxCount = Math.max(...steps.map((step) => step.count), 1);

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)]">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            投递漏斗
          </h2>
          <p className="mt-1 text-xs leading-4 text-[var(--color-text-secondary)]">
            评估与投递记录汇总
          </p>
        </div>
        <Link
          aria-label="查看投递管理"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] transition-all hover:bg-[var(--color-primary)] hover:text-white active:scale-[0.98]"
          href="/applications"
        >
          <BriefcaseBusiness aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </Link>
      </div>

      {statsStatus === "loading" ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="space-y-2" key={index}>
              <div className="h-3 w-28 animate-pulse rounded-full bg-[var(--color-border-light)]" />
              <div className="h-8 animate-pulse rounded-[8px] bg-[var(--color-border-light)]" />
            </div>
          ))}
        </div>
      ) : statsStatus === "error" ? (
        <div className="rounded-[18px] border border-[#eedaa6] bg-[#fffaf0] p-4">
          <div className="flex gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
              <DatabaseZap aria-hidden="true" className="size-5" strokeWidth={1.8} />
            </div>
            <div>
              <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
                统计暂不可用
              </h3>
              <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                {errorMessage ?? "统计接口读取失败，首页其他区域仍可继续使用。"}
              </p>
              <Link
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
                href="/applications"
              >
                查看投递管理
                <ChevronRight
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.8}
                />
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {steps.map((item) => {
            const percent =
              item.count > 0 ? Math.max((item.count / maxCount) * 100, 12) : 0;

            return (
              <div className="space-y-2" key={item.label}>
                <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-text-secondary)]">
                  <span className="font-bold text-[var(--color-text)]">
                    {item.label}
                  </span>
                  <span>{item.detail}</span>
                </div>
                <div className="relative h-8 w-full overflow-hidden rounded-[8px] bg-[var(--color-surface-hover)]">
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{ background: item.tone, width: `${clampPercent(percent)}%` }}
                  />
                  <span className="absolute inset-0 flex items-center px-4 text-sm font-bold text-[#422600]">
                    {item.count}
                  </span>
                </div>
              </div>
            );
          })}
          {stats.evaluated === 0 &&
          stats.toApply === 0 &&
          stats.applied === 0 &&
          stats.interviewing === 0 &&
          stats.offerReceived === 0 ? (
            <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-4 py-3 text-xs leading-5 text-[var(--color-text-secondary)]">
              暂无本地评估或投递记录；完成评估并加入投递清单后，这里会显示真实数量。
            </div>
          ) : null}
          <Link
            className="inline-flex w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-4 py-2 text-sm font-bold text-[var(--color-primary)] transition-all hover:border-[var(--color-primary)] active:scale-[0.98]"
            href="/applications"
          >
            进入投递管理
            <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.8} />
          </Link>
        </div>
      )}
    </section>
  );
}

function SkillCloud({
  insights,
  isLoading,
}: {
  insights: DashboardInsights;
  isLoading: boolean;
}) {
  const tags = insights.trendTags.slice(0, 12);
  const action = insights.weeklyBrief.recommendedActions[0];

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)]">
      <h2 className="mb-6 text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
        热门技术栈
      </h2>
      {isLoading ? (
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 12 }, (_, index) => (
            <div
              className="h-9 animate-pulse rounded-full bg-[var(--color-border-light)]"
              key={index}
              style={{ width: `${72 + (index % 4) * 16}px` }}
            />
          ))}
        </div>
      ) : tags.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-3">
            {tags.map((tag) => (
              <Link
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-primary-light)] px-4 py-2 text-sm font-medium text-[var(--color-primary)] transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white active:scale-[0.98]"
                href="/insights"
                key={tag.name}
              >
                {tag.name}
              </Link>
            ))}
          </div>
          {action ? (
            <div className="mt-8 rounded-[12px] border-l-4 border-[var(--color-primary)] bg-[var(--color-surface-hover)] p-4">
              <p className="flex gap-3 text-xs leading-5 text-[var(--color-text)]">
                <Sparkles
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-[var(--color-primary)]"
                  strokeWidth={1.8}
                />
                <span>
                  <span className="font-bold">建议：</span>
                  {action}
                </span>
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          className="min-h-64 rounded-[18px]"
          description="行业趋势数据为空时，技术栈标签会在这里显示空状态。"
          icon={<FileSearch aria-hidden="true" className="size-6" strokeWidth={1.8} />}
          title="暂无技术栈标签"
        />
      )}
    </section>
  );
}

function DomainSnapshot({
  insights,
  isLoading,
}: {
  insights: DashboardInsights;
  isLoading: boolean;
}) {
  const slices = insights.domainDistribution.slice(0, 5);

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)]">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            AI 岗位方向分布
          </h2>
          <p className="mt-1 text-xs leading-4 text-[var(--color-text-secondary)]">
            用于解释岗位生态位和简历定位
          </p>
        </div>
        <Link
          className="text-sm font-medium text-[var(--color-primary)] hover:underline"
          href="/insights"
        >
          详情
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="space-y-2" key={index}>
              <div className="h-4 w-36 animate-pulse rounded-full bg-[var(--color-border-light)]" />
              <div className="h-2 animate-pulse rounded-full bg-[var(--color-border-light)]" />
            </div>
          ))}
        </div>
      ) : slices.length > 0 ? (
        <div className="space-y-5">
          {slices.map((slice) => (
            <article key={slice.id ?? slice.label}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-bold leading-5 text-[var(--color-text)]">
                  {slice.label}
                </span>
                <span className="text-sm font-bold leading-5 text-[var(--color-primary)]">
                  {slice.percent}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--color-border-light)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    background: slice.color ?? "var(--color-primary)",
                    width: `${clampPercent(slice.percent)}%`,
                  }}
                />
              </div>
              {slice.detail ? (
                <p className="mt-2 line-clamp-1 text-xs leading-4 text-[var(--color-text-secondary)]">
                  {slice.detail}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          className="min-h-64 rounded-[18px]"
          description="没有方向分布数据时仍保留页面结构，避免出现空白区域。"
          icon={<BrainCircuit aria-hidden="true" className="size-6" strokeWidth={1.8} />}
          title="暂无方向分布"
        />
      )}
    </section>
  );
}

async function fetchReports(signal: AbortSignal): Promise<DashboardReport[]> {
  const body = await apiRequest<ReportsResponse>("/api/reports?limit=20", {
    cache: "no-store",
    errorMessage: "评估历史读取失败",
    signal,
  });

  return normalizeReports(body.reports);
}

async function fetchApplicationStats(
  signal: AbortSignal,
): Promise<ApplicationStats> {
  const body = await apiRequest<ApplicationStatsResponse>(
    "/api/applications/stats",
    {
      cache: "no-store",
      errorMessage: "本地投递统计读取失败",
      signal,
    },
  );

  return {
    abandoned: normalizeStatCount(body.abandoned),
    applied: normalizeStatCount(body.applied),
    evaluated: normalizeStatCount(body.evaluated),
    highMatch: normalizeStatCount(body.highMatch),
    highMatchThreshold:
      typeof body.highMatchThreshold === "number" &&
      Number.isFinite(body.highMatchThreshold)
        ? body.highMatchThreshold
        : EMPTY_APPLICATION_STATS.highMatchThreshold,
    interviewing: normalizeStatCount(body.interviewing),
    offerReceived: normalizeStatCount(body.offerReceived),
    rejected: normalizeStatCount(body.rejected),
    toApply: normalizeStatCount(body.toApply),
  };
}

async function fetchInsights(signal: AbortSignal): Promise<DashboardInsights> {
  const body = await apiRequest<InsightsResponse>("/api/insights/trends", {
    cache: "no-store",
    errorMessage: "行业趋势读取失败",
    signal,
  });

  return normalizeInsights(body, {
    provider: typeof body.provider === "string" ? body.provider : undefined,
    fallbackUsed: Boolean(body.fallbackUsed),
  });
}

function normalizeReports(rawReports: unknown[]): DashboardReport[] {
  if (!Array.isArray(rawReports)) {
    return [];
  }

  return rawReports
    .map((item, index) => {
      const reportRecord = toRecord(item);

      if (!reportRecord) {
        return null;
      }

      const id = readStringOrNumber(reportRecord.id) ?? `api-report-${index}`;
      const reportPayload = toRecord(reportRecord.report);
      const job = toRecord(reportPayload?.job);
      const score = toRecord(reportRecord.score);
      const reportScore = toRecord(reportPayload?.score);
      const risks = toRecord(reportPayload?.risks);
      const riskSignals = Array.isArray(reportRecord.risks) ? reportRecord.risks : [];
      const riskLevel =
        readRiskLevel(risks?.level) ?? deriveRiskLevelFromSignals(riskSignals);
      const company =
        readString(reportRecord.company) ?? readString(job?.company) ?? "未识别公司";
      const role =
        readString(reportRecord.role) ?? readString(job?.role) ?? "未识别岗位";
      const overall =
        readNumber(score?.overall) ?? readNumber(reportScore?.overall) ?? 0;
      const createdAt =
        readString(reportRecord.createdAt) ??
        readString(reportPayload?.generatedAt) ??
        new Date().toISOString();

      return {
        id: `api-${id}`,
        company,
        role,
        score: clampScore(overall),
        riskLevel,
        createdAt,
        href: `/evaluate/report?reportId=${id}`,
        source: "api" as const,
      };
    })
    .filter(isPresent);
}

function normalizeInsights(
  rawInsights: unknown,
  meta: { provider?: string; fallbackUsed?: boolean } = {},
): DashboardInsights {
  const root = toRecord(rawInsights) ?? {};
  const nestedInsights = toRecord(root.insights);
  const source = nestedInsights ?? root;
  const dataset = toRecord(source.dataset);
  const dataSources = toRecord(source.dataSources);

  return {
    snapshotPeriod: readString(dataset?.snapshotPeriod),
    overviewMetrics: readOverviewMetrics(source.overviewMetrics),
    techTrends: readTechTrends(source.techTrends),
    trendTags: readTrendTags(source.trendTags),
    domainDistribution: readDomainDistribution(source.domainDistribution),
    weeklyBrief: readWeeklyBrief(source.weeklyBrief),
    dataSourceText: readString(dataSources?.displayText),
    provider: meta.provider,
    fallbackUsed: meta.fallbackUsed,
  };
}

function readOverviewMetrics(value: unknown): OverviewMetric[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);

      if (!record) {
        return null;
      }

      const label = readString(record.label);
      const displayValue = readString(record.value);

      if (!label || !displayValue) {
        return null;
      }

      return {
        id: readString(record.id),
        label,
        value: displayValue,
        numericValue: readNumber(record.numericValue),
        description: readString(record.description),
        comparisonLabel: readString(record.comparisonLabel),
        progress: readNumber(record.progress),
        trend: readString(record.trend),
      };
    })
    .filter(isPresent);
}

function readTechTrends(value: unknown): TechTrend[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);

      if (!record) {
        return null;
      }

      const name = readString(record.name);
      const heatScore = readNumber(record.heatScore);

      if (!name || heatScore === undefined) {
        return null;
      }

      return {
        id: readString(record.id),
        rank: readNumber(record.rank),
        name,
        heatScore,
        demandSharePercent: readNumber(record.demandSharePercent),
        growthPercentEstimate: readNumber(record.growthPercentEstimate),
        trendLabel: readString(record.trendLabel),
        displayChange: readString(record.displayChange),
        note: readString(record.note),
        relatedSkills: readStringArray(record.relatedSkills),
      };
    })
    .filter(isPresent);
}

function readTrendTags(value: unknown): TrendTag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);

      if (!record) {
        return null;
      }

      const name = readString(record.name);
      const heatScore = readNumber(record.heatScore);

      if (!name || heatScore === undefined) {
        return null;
      }

      return {
        name,
        heatScore,
        trend: readString(record.trend),
      };
    })
    .filter(isPresent);
}

function readDomainDistribution(value: unknown): DomainSlice[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);

      if (!record) {
        return null;
      }

      const label = readString(record.label);
      const percent = readNumber(record.percent);

      if (!label || percent === undefined) {
        return null;
      }

      return {
        id: readString(record.id),
        label,
        percent,
        color: readString(record.color),
        detail: readString(record.detail),
      };
    })
    .filter(isPresent);
}

function readWeeklyBrief(value: unknown): WeeklyBrief {
  const record = toRecord(value);

  if (!record) {
    return {
      summary: "行业趋势数据暂未加载。",
      highlights: [],
      recommendedActions: [],
    };
  }

  return {
    title: readString(record.title),
    summary: readString(record.summary) ?? "行业趋势数据暂未加载。",
    highlights: readBriefHighlights(record.highlights),
    recommendedActions: readStringArray(record.recommendedActions),
    disclaimer: readString(record.disclaimer),
  };
}

function readBriefHighlights(value: unknown): WeeklyBrief["highlights"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);

      if (!record) {
        return null;
      }

      const title = readString(record.title);

      if (!title) {
        return null;
      }

      return {
        id: readString(record.id),
        title,
        detail: readString(record.detail),
        impact: readString(record.impact),
      };
    })
    .filter(isPresent);
}

function createDemoReports(): DashboardReport[] {
  const now = Date.now();

  return typedPresetJds.slice(0, 7).map((job, index) => ({
    id: `demo-${job.id}`,
    company: job.company,
    role: job.title,
    score: clampScore(job.expectedScore),
    riskLevel: job.expectedRiskLevel,
    createdAt: new Date(now - index * 21 * 60 * 60 * 1000).toISOString(),
    href: "/evaluate",
    source: "demo",
  }));
}

function buildMetrics(
  stats: ApplicationStats,
  statsStatus: StatsLoadStatus,
): MetricItem[] {
  const statsUnavailable = statsStatus === "error";
  const total = stats.evaluated;
  const highMatchPercent =
    total > 0 ? Math.round((stats.highMatch / total) * 100) : 0;

  return [
    {
      label: "已评估岗位",
      value: statsUnavailable ? "—" : String(total),
      detail: statsUnavailable
        ? "统计暂不可用"
        : total > 0
          ? "评估记录已同步"
          : "暂无评估记录",
      icon: History,
      accent: "text-[var(--color-primary)]",
      trendTone: total > 0 ? "positive" : "neutral",
    },
    {
      label: "高匹配岗位",
      value: statsUnavailable ? "—" : String(stats.highMatch),
      detail: statsUnavailable
        ? "统计暂不可用"
        : total > 0
          ? `${highMatchPercent}% 达到 ${stats.highMatchThreshold.toFixed(1)} 分以上`
          : "暂无高匹配记录",
      icon: Star,
      accent: "text-[var(--color-primary)]",
      trendTone: stats.highMatch > 0 ? "positive" : "neutral",
    },
    {
      label: "待投递",
      value: statsUnavailable ? "—" : String(stats.toApply),
      detail: statsUnavailable
        ? "投递状态统计未加载"
        : "applications.status = to_apply",
      icon: FileStack,
      accent: "text-[var(--color-primary)]",
      trendTone: stats.toApply > 0 ? "positive" : "neutral",
    },
    {
      label: "已投递",
      value: statsUnavailable ? "—" : String(stats.applied),
      detail: statsUnavailable
        ? "投递状态统计未加载"
        : "用户手动确认的本地状态",
      icon: BriefcaseBusiness,
      accent: "text-[var(--color-primary)]",
      trendTone: stats.applied > 0 ? "positive" : "neutral",
    },
    {
      label: "面试中",
      value: statsUnavailable ? "—" : String(stats.interviewing),
      detail: statsUnavailable
        ? "投递状态统计未加载"
        : "applications.status = interviewing",
      icon: Building2,
      accent: "text-[var(--color-blue)]",
      trendTone: stats.interviewing > 0 ? "positive" : "neutral",
    },
    {
      label: "已获 Offer",
      value: statsUnavailable ? "—" : String(stats.offerReceived),
      detail: statsUnavailable
        ? "投递状态统计未加载"
        : "applications.status = offer_received",
      icon: ShieldCheck,
      accent: "text-[var(--color-green)]",
      trendTone: stats.offerReceived > 0 ? "positive" : "neutral",
    },
  ];
}

function getDemoConfig(type: PresetJd["type"]): {
  icon: LucideIcon;
  iconTone: string;
} {
  if (type === "fake_ai") {
    return {
      icon: ShieldAlert,
      iconTone: "bg-[#f5e8e6] text-[var(--color-red)]",
    };
  }

  if (type === "borderline") {
    return {
      icon: ServerCog,
      iconTone: "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
    };
  }

  if (type === "real_ai") {
    return {
      icon: BrainCircuit,
      iconTone: "bg-[#e8f0f5] text-[var(--color-blue)]",
    };
  }

  return {
    icon: Bot,
    iconTone: "bg-[#eaf0e8] text-[var(--color-green)]",
  };
}

function getGreeting(): string {
  const hour = new Date().getHours();
  const day = new Date().getDay();
  const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  if (hour < 10) {
    return `早安，${dayNames[day]}愉快`;
  }

  if (hour < 14) {
    return `午安，${dayNames[day]}顺利`;
  }

  if (hour < 19) {
    return `下午好，${dayNames[day]}加油`;
  }

  return `晚安，${dayNames[day]}辛苦了`;
}

function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "时间未知";
  }

  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return "刚刚";
  }

  if (diffMs < hour) {
    return `${Math.max(1, Math.floor(diffMs / minute))} 分钟前`;
  }

  if (diffMs < day) {
    return `${Math.max(1, Math.floor(diffMs / hour))} 小时前`;
  }

  if (diffMs < 7 * day) {
    return `${Math.max(1, Math.floor(diffMs / day))} 天前`;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

function deriveRiskLevelFromSignals(signals: unknown[]): RiskLevel {
  const severities = signals
    .map((item) => readRiskLevel(toRecord(item)?.severity))
    .filter((level): level is RiskLevel => Boolean(level));

  if (severities.includes("critical")) {
    return "critical";
  }

  if (severities.includes("high")) {
    return "high";
  }

  if (severities.includes("medium")) {
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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeStatCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function readStringOrNumber(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return readString(value);
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

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
