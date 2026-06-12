"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BrainCircuit,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardList,
  FileSearch,
  Gauge,
  RefreshCw,
  ShieldAlert,
  Target,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { apiRequest, readErrorMessage } from "@/lib/api-client";
import type {
  AnalyticsCareerFit,
  AnalyticsDirectionItem,
  AnalyticsOverviewDto,
  AnalyticsRiskSignalItem,
  AnalyticsSkillGapItem,
  AnalyticsTrackerChannelItem,
  AnalyticsTrackerPriorityItem,
  AnalyticsTrackerStatusItem,
  ApplicationPriority,
  ApplicationStatus,
  RiskSeverity,
} from "@/lib/types";

type AnalyticsResponse = {
  ok: true;
} & AnalyticsOverviewDto;

type LoadStatus = "loading" | "ready" | "error";
type SummaryMetric = {
  label: string;
  value: string;
  detail: string;
  tone: "amber" | "blue" | "green" | "red" | "neutral";
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  abandoned: "已放弃",
  applied: "已投递",
  interviewing: "面试中",
  offer_received: "已获 Offer",
  rejected: "未通过",
  to_apply: "待投递",
};

const PRIORITY_LABELS: Record<ApplicationPriority, string> = {
  high: "高优先级",
  low: "低优先级",
  medium: "中优先级",
};

const RISK_LABELS: Record<RiskSeverity, string> = {
  critical: "极高风险",
  high: "高风险",
  low: "低风险",
  medium: "中风险",
};

const GAP_PRIORITY_LABELS: Record<AnalyticsSkillGapItem["priority"], string> = {
  long_term: "长期补齐",
  quick_fix: "快速补证据",
};

export function AnalyticsWorkspace() {
  const [overview, setOverview] = useState<AnalyticsOverviewDto | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();

    void loadAnalytics(controller.signal);

    return () => controller.abort();
  }, []);

  async function loadAnalytics(signal?: AbortSignal) {
    setLoadStatus("loading");
    setErrorMessage(undefined);

    try {
      const body = await apiRequest<AnalyticsResponse>("/api/analytics", {
        cache: "no-store",
        errorMessage: "求职分析读取失败，请稍后重试。",
        signal,
      });

      if (signal?.aborted) {
        return;
      }

      setOverview(body);
      setLoadStatus("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setOverview(null);
      setErrorMessage(readErrorMessage(error, "求职分析读取失败，请稍后重试。"));
      setLoadStatus("error");
    }
  }

  if (loadStatus === "loading") {
    return <AnalyticsSkeleton />;
  }

  if (loadStatus === "error") {
    return (
      <ErrorState
        action={
          <Button
            leftIcon={<RefreshCw aria-hidden="true" className="size-4" />}
            onClick={() => void loadAnalytics()}
          >
            重新加载
          </Button>
        }
        description={errorMessage ?? "接口暂不可用，请稍后重试。"}
        title="求职分析加载失败"
      />
    );
  }

  if (!overview) {
    return null;
  }

  if (isAnalyticsEmpty(overview)) {
    return (
      <div className="space-y-6">
        <AnalyticsEmptyState />
      </div>
    );
  }

  return <AnalyticsContent overview={overview} />;
}

function AnalyticsContent({ overview }: { overview: AnalyticsOverviewDto }) {
  const summaryMetrics = useMemo(() => buildSummaryMetrics(overview), [overview]);

  return (
    <div className="space-y-6">
      <SummaryGrid metrics={summaryMetrics} />

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <FunnelCard overview={overview} />
        <TrackerDistribution overview={overview} />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <DirectionAnalytics directions={overview.directions} />
        <CareerFitSummary careerFit={overview.careerFit} />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RiskSignals signals={overview.riskSignals} />
        <SkillGaps gaps={overview.skillGaps} />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <OverdueFollowUps overview={overview} />
        <ResumeEffectCard overview={overview} />
      </section>
    </div>
  );
}

function SummaryGrid({ metrics }: { metrics: SummaryMetric[] }) {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <article
          className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)]"
          key={metric.label}
        >
          <p className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-[var(--color-text-secondary)]">
            {metric.label}
          </p>
          <p className={`mt-4 text-[34px] font-semibold leading-none ${metricToneClass(metric.tone)}`}>
            {metric.value}
          </p>
          <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
            {metric.detail}
          </p>
        </article>
      ))}
    </section>
  );
}

function FunnelCard({ overview }: { overview: AnalyticsOverviewDto }) {
  const maxCount = Math.max(1, ...overview.funnel.map((item) => item.count));

  return (
    <AnalyticsCard
      description="从评估到 Tracker 状态的本地漏斗。"
      icon={<BarChart3 aria-hidden="true" className="size-5" strokeWidth={1.8} />}
      title="求职漏斗"
    >
      <div className="space-y-4">
        {overview.funnel.map((item) => (
          <div key={item.key}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-bold leading-5 text-[var(--color-text)]">
                {item.label}
              </span>
              <span className="text-sm font-semibold leading-5 text-[var(--color-primary)]">
                {item.count}
              </span>
            </div>
            <ProgressBar value={(item.count / maxCount) * 100} />
          </div>
        ))}
      </div>
    </AnalyticsCard>
  );
}

function TrackerDistribution({ overview }: { overview: AnalyticsOverviewDto }) {
  return (
    <AnalyticsCard
      description="状态、优先级和渠道都来自 Tracker 手动记录。"
      icon={<ClipboardList aria-hidden="true" className="size-5" strokeWidth={1.8} />}
      title="状态分布"
    >
      <DistributionList items={overview.tracker.byStatus} type="status" />
      <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
        <MiniDistribution
          items={overview.tracker.byPriority}
          title="优先级分布"
          valueKey="priority"
        />
        <ChannelDistribution channels={overview.tracker.byChannel} />
      </div>
    </AnalyticsCard>
  );
}

function DirectionAnalytics({
  directions,
}: {
  directions: AnalyticsDirectionItem[];
}) {
  if (directions.length === 0) {
    return (
      <AnalyticsCard
        description="完成 JD 评估后会按 AI 方向归类。"
        icon={<Target aria-hidden="true" className="size-5" strokeWidth={1.8} />}
        title="AI 方向分析"
      >
        <InlineEmpty
          description="暂无报告方向数据。"
          icon={<FileSearch aria-hidden="true" className="size-5" />}
          title="还没有方向记录"
        />
      </AnalyticsCard>
    );
  }

  const maxCount = Math.max(1, ...directions.map((direction) => direction.count));

  return (
    <AnalyticsCard
      description="评估数量、平均分、高风险比例和加入 Tracker 数。"
      icon={<Target aria-hidden="true" className="size-5" strokeWidth={1.8} />}
      title="AI 方向分析"
    >
      <div className="space-y-4">
        {directions.map((direction) => (
          <article
            className="rounded-[18px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4"
            key={direction.direction}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
                  {direction.label}
                </h3>
                <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                  {direction.count} 份报告 · 平均 {formatScore(direction.averageScore)} · Tracker {direction.linkedApplicationCount}
                </p>
              </div>
              <RiskBadge
                label={`高风险 ${direction.highRiskRate.toFixed(1)}%`}
                severity={direction.highRiskRate >= 30 ? "high" : "low"}
              />
            </div>
            <div className="mt-4">
              <ProgressBar value={(direction.count / maxCount) * 100} />
            </div>
          </article>
        ))}
      </div>
    </AnalyticsCard>
  );
}

function RiskSignals({ signals }: { signals: AnalyticsRiskSignalItem[] }) {
  return (
    <AnalyticsCard
      description="按评估报告中的风险信号聚合 Top 项。"
      icon={<ShieldAlert aria-hidden="true" className="size-5" strokeWidth={1.8} />}
      title="风险信号 Top"
    >
      {signals.length > 0 ? (
        <div className="space-y-3">
          {signals.map((signal) => (
            <RankRow
              badge={
                signal.severity ? (
                  <RiskBadge label={RISK_LABELS[signal.severity]} severity={signal.severity} />
                ) : null
              }
              detail={signal.category ?? "风险扫描"}
              key={signal.label}
              label={signal.label}
              value={`${signal.count} 次`}
            />
          ))}
        </div>
      ) : (
        <InlineEmpty
          description="暂无风险信号。报告里出现高风险或中风险后会在这里聚合。"
          icon={<ShieldAlert aria-hidden="true" className="size-5" />}
          title="暂无风险 Top"
        />
      )}
    </AnalyticsCard>
  );
}

function SkillGaps({ gaps }: { gaps: AnalyticsSkillGapItem[] }) {
  return (
    <AnalyticsCard
      description="基于默认简历与最近报告的本地匹配结果。"
      icon={<TrendingUp aria-hidden="true" className="size-5" strokeWidth={1.8} />}
      title="技能缺口 Top"
    >
      {gaps.length > 0 ? (
        <div className="space-y-3">
          {gaps.map((gap) => (
            <RankRow
              badge={<GapBadge priority={gap.priority} />}
              detail={gap.evidence ?? "建议补齐项目证据或简历表达"}
              key={gap.skill}
              label={gap.skill}
              value={`${gap.count} 个岗位`}
            />
          ))}
        </div>
      ) : (
        <InlineEmpty
          description="设置默认简历并积累报告后，系统会展示反复出现的缺口。"
          icon={<TrendingUp aria-hidden="true" className="size-5" />}
          title="暂无技能缺口"
        />
      )}
    </AnalyticsCard>
  );
}

function OverdueFollowUps({ overview }: { overview: AnalyticsOverviewDto }) {
  return (
    <AnalyticsCard
      description="只提醒本地 Tracker 中未完成且已过跟进时间的记录。"
      icon={<CalendarClock aria-hidden="true" className="size-5" strokeWidth={1.8} />}
      title="逾期跟进"
    >
      {overview.tracker.overdueItems.length > 0 ? (
        <div className="space-y-3">
          {overview.tracker.overdueItems.map((item) => (
            <Link
              className="block rounded-[18px] border border-[#eedaa6] bg-[#fffaf0] p-4 transition-all hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-sm)]"
              href="/applications"
              key={item.id}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
                    {item.company} · {item.role}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                    下次跟进：{formatDateTime(item.nextFollowUpAt)} · 已逾期 {item.daysOverdue} 天
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge label={STATUS_LABELS[item.status]} />
                  <StatusBadge label={PRIORITY_LABELS[item.priority]} tone="amber" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <InlineEmpty
          description="当前没有逾期跟进。继续在 Tracker 维护下一次跟进时间即可。"
          icon={<CalendarClock aria-hidden="true" className="size-5" />}
          title="跟进节奏正常"
        />
      )}
    </AnalyticsCard>
  );
}

function CareerFitSummary({
  careerFit,
}: {
  careerFit: AnalyticsCareerFit | undefined;
}) {
  return (
    <AnalyticsCard
      description="只基于已填写的 Career DNA 与本地 Tracker/报告判断。"
      icon={<BrainCircuit aria-hidden="true" className="size-5" strokeWidth={1.8} />}
      title="Career DNA 匹配"
    >
      {careerFit ? (
        <div>
          <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
            {careerFit.summary}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <FactBox label="已检查" value={careerFit.checkedCount} />
            <FactBox label="符合画像" value={careerFit.matchedCount} />
            <FactBox label="需复核" value={careerFit.warningCount} tone="amber" />
            <FactBox
              label="方向匹配"
              value={careerFit.targetDirectionsMatched}
              tone="blue"
            />
          </div>
          {careerFit.warnings.length > 0 ? (
            <div className="mt-5 space-y-2">
              {careerFit.warnings.map((warning) => (
                <p
                  className="rounded-[14px] border border-[#eedaa6] bg-[#fffaf0] px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]"
                  key={warning}
                >
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <InlineEmpty
          description="填写 Career DNA 后，这里会展示当前推进岗位与目标方向、城市和工作模式的匹配摘要。"
          icon={<BrainCircuit aria-hidden="true" className="size-5" />}
          title="尚未配置 Career DNA"
        />
      )}
    </AnalyticsCard>
  );
}

function ResumeEffectCard({ overview }: { overview: AnalyticsOverviewDto }) {
  const resumeEffect = overview.resumeEffect;

  return (
    <AnalyticsCard
      description="默认简历关联和方向匹配情况。"
      icon={<BriefcaseBusiness aria-hidden="true" className="size-5" strokeWidth={1.8} />}
      title="简历效果"
    >
      <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
        {resumeEffect.summary}
      </p>
      <div className="mt-5 space-y-3">
        <FactLine
          label="默认简历"
          value={resumeEffect.defaultResumeName ?? "未设置"}
        />
        <FactLine
          label="分析简历"
          value={resumeEffect.analyzedResumeName ?? "暂无"}
        />
        <FactLine
          label="关联 Tracker"
          value={`${resumeEffect.linkedApplicationCount} 条`}
        />
        <FactLine
          label="方向一致率"
          value={
            resumeEffect.directionAlignmentRate === null
              ? "暂无报告"
              : `${resumeEffect.directionAlignmentRate.toFixed(1)}%`
          }
        />
      </div>
      <div className="mt-5">
        <LinkButton href="/resume" label="查看简历" />
      </div>
    </AnalyticsCard>
  );
}

function DistributionList({
  items,
  type,
}: {
  items: AnalyticsTrackerStatusItem[];
  type: "status";
}) {
  const maxCount = Math.max(1, ...items.map((item) => item.count));

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={`${type}-${item.status}`}>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-bold leading-5 text-[var(--color-text)]">
              {item.label}
            </span>
            <span className="font-semibold leading-5 text-[var(--color-primary)]">
              {item.count}
            </span>
          </div>
          <ProgressBar value={(item.count / maxCount) * 100} />
        </div>
      ))}
    </div>
  );
}

function MiniDistribution({
  items,
  title,
  valueKey,
}: {
  items: AnalyticsTrackerPriorityItem[];
  title: string;
  valueKey: "priority";
}) {
  return (
    <div>
      <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
        {title}
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <StatusBadge
            label={`${item.label} ${item.count}`}
            tone={item.priority === "high" ? "red" : "neutral"}
            key={`${valueKey}-${item.priority}`}
          />
        ))}
      </div>
    </div>
  );
}

function ChannelDistribution({
  channels,
}: {
  channels: AnalyticsTrackerChannelItem[];
}) {
  return (
    <div>
      <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
        渠道分布
      </h3>
      {channels.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {channels.slice(0, 8).map((channel) => (
            <StatusBadge
              label={`${channel.channel} ${channel.count}`}
              key={channel.channel}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs leading-5 text-[var(--color-text-secondary)]">
          暂无渠道记录。
        </p>
      )}
    </div>
  );
}

function AnalyticsCard({
  children,
  description,
  icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
          {icon}
        </div>
        <div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            {title}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function RankRow({
  badge,
  detail,
  label,
  value,
}: {
  badge: React.ReactNode;
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-[18px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-bold leading-5 text-[var(--color-text)]">
            {label}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-secondary)]">
            {detail}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {badge}
          <span className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-bold leading-4 text-[var(--color-primary)]">
            {value}
          </span>
        </div>
      </div>
    </article>
  );
}

function InlineEmpty({
  description,
  icon,
  title,
}: {
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="grid min-h-48 place-items-center rounded-[18px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-hover)] px-5 py-8 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-[16px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
          {icon}
        </div>
        <h3 className="text-lg font-semibold leading-6 text-[var(--color-text)]">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
          {description}
        </p>
      </div>
    </div>
  );
}

function AnalyticsEmptyState() {
  return (
    <EmptyState
      action={
        <div className="flex flex-col gap-3 sm:flex-row">
          <LinkButton href="/evaluate" label="新建评估" />
          <LinkButton href="/resume" label="添加简历" variant="outline" />
          <LinkButton href="/career" label="填写 Career DNA" variant="outline" />
        </div>
      }
      description="当前没有报告、简历或 Tracker 记录。完成评估、保存简历或维护投递清单后，这里会生成个人求职分析。"
      icon={<Gauge aria-hidden="true" className="size-6" strokeWidth={1.8} />}
      title="暂无可分析数据"
    />
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-36 animate-pulse rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)]" />
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="h-36 animate-pulse rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)]"
            key={index}
          />
        ))}
      </section>
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="h-96 animate-pulse rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)]"
            key={index}
          />
        ))}
      </section>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[var(--color-border-light)]">
      <div
        className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function RiskBadge({
  label,
  severity,
}: {
  label: string;
  severity: RiskSeverity;
}) {
  const className =
    severity === "critical" || severity === "high"
      ? "border-[#efd4d0] bg-[#fff0ee] text-[#b45c52]"
      : severity === "medium"
        ? "border-[#eedaa6] bg-[#fff7df] text-[#875006]"
        : "border-[#d7e7d2] bg-[#eef6eb] text-[#5f7f50]";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold leading-4 ${className}`}>
      {label}
    </span>
  );
}

function GapBadge({ priority }: { priority: AnalyticsSkillGapItem["priority"] }) {
  const isQuickFix = priority === "quick_fix";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-bold leading-4 ${
        isQuickFix
          ? "border-[#eedaa6] bg-[#fff7df] text-[#875006]"
          : "border-[#cfe2f7] bg-[#f1f7ff] text-[#2f6aa3]"
      }`}
    >
      {GAP_PRIORITY_LABELS[priority]}
    </span>
  );
}

function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "amber" | "neutral" | "red";
}) {
  const className =
    tone === "amber"
      ? "border-[#eedaa6] bg-[#fff7df] text-[#875006]"
      : tone === "red"
        ? "border-[#efd4d0] bg-[#fff0ee] text-[#b45c52]"
        : "border-[var(--color-border)] bg-white text-[var(--color-text-secondary)]";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold leading-4 ${className}`}>
      {label}
    </span>
  );
}

function FactBox({
  label,
  tone = "green",
  value,
}: {
  label: string;
  tone?: "amber" | "blue" | "green";
  value: number;
}) {
  const className =
    tone === "amber"
      ? "text-[var(--color-primary)]"
      : tone === "blue"
        ? "text-[var(--color-blue)]"
        : "text-[var(--color-green)]";

  return (
    <div className="rounded-[16px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] px-4 py-3">
      <p className={`text-xl font-semibold leading-7 ${className}`}>{value}</p>
      <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
        {label}
      </p>
    </div>
  );
}

function FactLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[14px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] px-4 py-3">
      <span className="text-xs font-bold leading-5 text-[var(--color-text-secondary)]">
        {label}
      </span>
      <span className="min-w-0 break-words text-right text-sm font-semibold leading-5 text-[var(--color-text)]">
        {value}
      </span>
    </div>
  );
}

function LinkButton({
  href,
  label,
  variant = "primary",
}: {
  href: string;
  label: string;
  variant?: "primary" | "outline";
}) {
  return (
    <Link
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-[12px] px-4 text-sm font-bold leading-5 transition-all active:scale-[0.98] ${
        variant === "primary"
          ? "bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--color-primary-hover)]"
          : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)]"
      }`}
      href={href}
    >
      {label}
    </Link>
  );
}

function buildSummaryMetrics(overview: AnalyticsOverviewDto): SummaryMetric[] {
  const highMatch =
    overview.funnel.find((item) => item.key === "evaluated")?.count ?? 0;
  const offerCount =
    overview.funnel.find((item) => item.key === "offer_received")?.count ?? 0;

  return [
    {
      detail: `高匹配阈值 ${overview.highMatchThreshold.toFixed(1)} 分，本页不估算平台转化率`,
      label: "评估报告",
      tone: overview.sampleSize.reports > 0 ? "amber" : "neutral",
      value: String(overview.sampleSize.reports),
    },
    {
      detail: `${overview.sampleSize.activeApplications} 条仍在推进中`,
      label: "Tracker",
      tone: overview.sampleSize.applications > 0 ? "blue" : "neutral",
      value: String(overview.sampleSize.applications),
    },
    {
      detail:
        overview.tracker.overdueFollowUps > 0
          ? "优先处理高优先级和已逾期机会"
          : "当前没有逾期跟进提醒",
      label: "逾期跟进",
      tone: overview.tracker.overdueFollowUps > 0 ? "red" : "green",
      value: String(overview.tracker.overdueFollowUps),
    },
    {
      detail: `已获 Offer ${offerCount} 条，已评估 ${highMatch} 份报告`,
      label: "Career DNA",
      tone: overview.careerFit?.warningCount ? "amber" : "green",
      value: overview.careerFit
        ? `${overview.careerFit.matchedCount}/${overview.careerFit.checkedCount}`
        : "未配置",
    },
  ];
}

function metricToneClass(tone: SummaryMetric["tone"]): string {
  if (tone === "blue") {
    return "text-[var(--color-blue)]";
  }

  if (tone === "green") {
    return "text-[var(--color-green)]";
  }

  if (tone === "red") {
    return "text-[var(--color-red)]";
  }

  if (tone === "amber") {
    return "text-[var(--color-primary)]";
  }

  return "text-[var(--color-text-secondary)]";
}

function isAnalyticsEmpty(overview: AnalyticsOverviewDto): boolean {
  return (
    overview.sampleSize.reports === 0 &&
    overview.sampleSize.resumes === 0 &&
    overview.sampleSize.applications === 0
  );
}

function formatScore(value: number): string {
  return `${value.toFixed(1)} / 5`;
}

function formatDateTime(value: string): string {
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));

  if (!Number.isFinite(date.getTime())) {
    return "时间未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
