import { ChevronRight } from "lucide-react";
import type { TechTrend } from "@/components/features/insights/insightsModel";

type TrendBarListProps = {
  trends: TechTrend[];
};

export function TrendBarList({ trends }: TrendBarListProps) {
  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8 lg:col-span-7">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            热门技术栈趋势
          </h2>
          <p className="mt-1 text-sm leading-5 text-[var(--color-text-secondary)]">
            基于近期 AI 岗位 JD 关键词变化估算
          </p>
        </div>
        <button
          className="inline-flex w-fit items-center gap-1 rounded-full px-1 py-2 text-sm font-bold text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary-hover)]"
          type="button"
        >
          查看完整报告
          <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </button>
      </div>

      <div className="space-y-6">
        {trends.map((trend) => (
          <article key={trend.name}>
            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {trend.rank ? (
                    <span className="rounded-full bg-[var(--color-surface-hover)] px-2 py-0.5 text-[11px] font-bold leading-4 text-[var(--color-text-secondary)]">
                      #{trend.rank}
                    </span>
                  ) : null}
                  <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
                    {trend.name}
                  </h3>
                  {trend.displayChange ? (
                    <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[11px] font-bold leading-4 text-[var(--color-primary)]">
                      {trend.displayChange}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
                  {trend.note}
                </p>
                {trend.relatedSkills.length > 0 ? (
                  <p className="mt-1 text-[11px] leading-4 text-[var(--color-muted)]">
                    相关能力：{trend.relatedSkills.slice(0, 4).join(" / ")}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-3 text-sm font-bold leading-5">
                <span className="text-[var(--color-primary)]">
                  热度 {trend.heatScore}
                </span>
                {typeof trend.demandSharePercent === "number" ? (
                  <span className="text-[var(--color-text-secondary)]">
                    需求占比 {trend.demandSharePercent}%
                  </span>
                ) : null}
              </div>
            </div>
            <div
              aria-label={`${trend.name} 热度 ${trend.heatScore}`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={trend.heatScore}
              className="h-2.5 overflow-hidden rounded-full bg-[var(--color-border-light)]"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-700"
                style={{ width: `${clampPercent(trend.heatScore)}%` }}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
