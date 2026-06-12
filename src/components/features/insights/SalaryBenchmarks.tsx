import type { SalaryBenchmarks as SalaryBenchmarksModel } from "@/components/features/insights/insightsModel";

type SalaryBenchmarksProps = {
  salaryBenchmarks: SalaryBenchmarksModel;
};

export function SalaryBenchmarks({ salaryBenchmarks }: SalaryBenchmarksProps) {
  const { experienceBands, rows } = salaryBenchmarks;

  return (
    <section className="flex flex-col rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8 lg:col-span-5">
      <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
        薪资基准参考
      </h2>
      <p className="mt-1 text-sm leading-5 text-[var(--color-text-secondary)]">
        {salaryBenchmarks.period ?? "市场快照"} 月薪区间，按方向与经验段整理
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-[560px] w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className="border-b border-[var(--color-border)] pb-3 pr-4 text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
                方向
              </th>
              {experienceBands.map((band) => (
                <th
                  className="border-b border-[var(--color-border)] px-3 pb-3 text-center text-xs font-bold leading-4 text-[var(--color-text-secondary)]"
                  key={band.key}
                >
                  {band.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.domain}>
                <th className="border-b border-[var(--color-border-light)] py-3 pr-4 text-sm font-bold leading-5 text-[var(--color-text)]">
                  {row.domain}
                </th>
                {experienceBands.map((band) => (
                  <td
                    className="border-b border-[var(--color-border-light)] px-3 py-3 text-center text-sm font-semibold leading-5 text-[var(--color-primary)]"
                    key={band.key}
                  >
                    {row.ranges[band.key]?.display ?? "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows[0]?.note ? (
        <p className="mt-4 text-xs leading-5 text-[var(--color-text-secondary)]">
          {rows[0].note}
        </p>
      ) : null}
      <p className="mt-3 text-[11px] font-medium leading-4 text-[var(--color-muted)]">
        薪资区间用于辅助判断岗位机会
      </p>
    </section>
  );
}
