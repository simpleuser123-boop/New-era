import type { DomainSlice } from "@/components/features/insights/insightsModel";

type DomainDistributionProps = {
  slices: DomainSlice[];
};

export function DomainDistribution({ slices }: DomainDistributionProps) {
  const gradientStops = buildConicGradient(slices);
  const dominant = slices[0];

  if (!dominant) {
    return (
      <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
        <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
          AI 细分方向分布
        </h2>
        <p className="mt-6 rounded-[18px] border border-dashed border-[var(--color-border)] px-5 py-8 text-center text-sm leading-6 text-[var(--color-text-secondary)]">
          暂无方向分布数据。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
      <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
        AI 细分方向分布
      </h2>
      <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
        基于 5000+ 条 JD 方向归类
      </p>

      <div className="mt-7 flex flex-col items-center">
        <div className="relative size-48 rounded-full" style={{ background: gradientStops }}>
          <div className="absolute inset-5 rounded-full bg-[var(--color-surface)]" />
          <div className="absolute inset-0 flex items-center justify-center text-center">
            <div>
              <p className="text-[40px] font-bold leading-[52px] text-[var(--color-primary)]">
                {dominant.percent}%
              </p>
              <p className="text-xs leading-4 text-[var(--color-text-secondary)]">
                {dominant.label}占比最高
              </p>
            </div>
          </div>
        </div>

        <div className="mt-7 grid w-full grid-cols-1 gap-4">
          {slices.map((slice) => (
            <div className="flex gap-3" key={slice.label}>
              <span
                aria-hidden="true"
                className="mt-1.5 size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: slice.color }}
              />
              <div>
                <p className="text-xs font-bold leading-4 text-[var(--color-text)]">
                  {slice.label}（{slice.percent}%）
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                  {slice.detail}
                </p>
                {slice.representativeCompanies.length > 0 ? (
                  <p className="mt-1 text-[11px] leading-4 text-[var(--color-muted)]">
                    代表公司：{slice.representativeCompanies.slice(0, 4).join(" / ")}
                  </p>
                ) : null}
                {slice.typicalRoles.length > 0 ? (
                  <p className="mt-1 text-[11px] leading-4 text-[var(--color-muted)]">
                    典型岗位：{slice.typicalRoles.slice(0, 3).join(" / ")}
                  </p>
                ) : null}
                {slice.entryBarrier ? (
                  <p className="mt-1 text-[11px] leading-4 text-[var(--color-muted)]">
                    门槛：{slice.entryBarrier}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function buildConicGradient(slices: DomainSlice[]) {
  if (slices.length === 0) {
    return "conic-gradient(var(--color-border-light) 0% 100%)";
  }

  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.percent), 0);

  if (total <= 0) {
    return "conic-gradient(var(--color-border-light) 0deg 360deg)";
  }

  let current = 0;
  const stops = slices.map((slice) => {
    const start = current;
    current += Math.max(0, slice.percent);
    const startDeg = (start / total) * 360;
    const endDeg = (current / total) * 360;

    return `${slice.color ?? "var(--color-primary)"} ${startDeg}deg ${endDeg}deg`;
  });

  return `conic-gradient(${stops.join(", ")})`;
}
