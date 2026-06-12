import {
  BriefcaseBusiness,
  Building2,
  Gauge,
  TrendingUp,
} from "lucide-react";
import type { InsightMetric } from "@/components/features/insights/insightsModel";

const toneClass = {
  primary: "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
  green: "bg-[#eaf0e8] text-[var(--color-green)]",
  blue: "bg-[#e8f0f5] text-[var(--color-blue)]",
  neutral: "bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]",
} satisfies Record<InsightMetric["tone"], string>;

type MetricCardProps = {
  metric: InsightMetric;
};

export function MetricCard({ metric }: MetricCardProps) {
  return (
    <article className="flex min-h-40 flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] transition-all hover:-translate-y-px hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-lg)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <p className="text-sm font-medium leading-5 text-[var(--color-text-secondary)]">
          {metric.label}
        </p>
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-[12px] ${toneClass[metric.tone]}`}
        >
          <MetricIcon metric={metric} />
        </div>
      </div>

      <div className="mt-auto">
        <div className="flex flex-col gap-3">
          <h2 className="text-[34px] font-bold leading-none text-[var(--color-text)] sm:text-[40px]">
            {metric.value}
          </h2>
          {metric.comparisonLabel ? (
            <span className="w-fit rounded-full bg-[var(--color-primary-light)] px-2.5 py-1 text-xs font-bold leading-4 text-[#6b4716]">
              {metric.comparisonLabel}
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--color-text-secondary)]">
          {metric.description}
        </p>
        {typeof metric.progress === "number" ? (
          <div
            aria-label={`${metric.label} ${metric.progress}%`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={metric.progress}
            className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--color-primary-light)]"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-[var(--color-primary)]"
              style={{ width: `${metric.progress}%` }}
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function MetricIcon({ metric }: { metric: InsightMetric }) {
  const label = `${metric.id ?? ""} ${metric.label}`;

  if (label.includes("薪资") || label.includes("salary")) {
    return <BriefcaseBusiness aria-hidden="true" className="size-5" strokeWidth={1.8} />;
  }

  if (label.includes("竞争") || label.includes("competition")) {
    return <Building2 aria-hidden="true" className="size-5" strokeWidth={1.8} />;
  }

  if (label.includes("热门") || label.includes("覆盖")) {
    return <Gauge aria-hidden="true" className="size-5" strokeWidth={1.8} />;
  }

  return <TrendingUp aria-hidden="true" className="size-5" strokeWidth={1.8} />;
}
