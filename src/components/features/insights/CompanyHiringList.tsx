import { ArrowUpRight } from "lucide-react";
import type { RecommendedCompany } from "@/components/features/insights/insightsModel";

type CompanyHiringListProps = {
  companies: RecommendedCompany[];
};

export function CompanyHiringList({ companies }: CompanyHiringListProps) {
  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8 lg:col-span-2">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            推荐关注公司
          </h2>
          <p className="mt-1 text-sm leading-5 text-[var(--color-text-secondary)]">
            按公开岗位热度与方向匹配度整理
          </p>
        </div>
        <span className="w-fit rounded-full bg-[var(--color-surface-hover)] px-3 py-1 text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
          推荐关注
        </span>
      </div>

      <div className="space-y-4">
        {companies.map((company, index) => (
          <article
            className="flex flex-col gap-4 rounded-[18px] border border-[var(--color-border)] p-4 transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] sm:flex-row sm:items-center sm:justify-between"
            key={company.name}
          >
            <div className="flex min-w-0 items-start gap-4">
              <div
                className={`flex size-12 shrink-0 items-center justify-center rounded-[14px] text-lg font-bold text-white ${avatarToneClass[index % avatarToneClass.length]}`}
              >
                {company.initials}
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold leading-6 text-[var(--color-text)] sm:text-lg sm:leading-7">
                  {company.name}
                </h3>
                <p className="mt-0.5 text-xs leading-5 text-[var(--color-text-secondary)]">
                  {company.headquarters ? `${company.headquarters} · ` : null}
                  {company.companyType ?? "AI 相关团队"}
                </p>
                <p className="mt-1 text-xs font-bold leading-4 text-[var(--color-primary)]">
                  重点方向：{company.focus ?? company.primaryDomains.join(" / ")}
                </p>
                {company.hiringRoles.length > 0 ? (
                  <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                    热招：{company.hiringRoles.slice(0, 3).join(" / ")}
                  </p>
                ) : null}
                {company.whyWatch ? (
                  <p className="mt-1 text-[11px] leading-4 text-[var(--color-muted)]">
                    {company.whyWatch}
                  </p>
                ) : null}
              </div>
            </div>

            <button
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--color-primary-light)] px-4 py-2 text-sm font-bold leading-5 text-[var(--color-primary)] transition-all hover:bg-[var(--color-primary)] hover:text-white active:scale-[0.98]"
              type="button"
            >
              关注 {company.estimatedOpenAiRoles?.display ?? "相关"} 岗位
              <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.8} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

const avatarToneClass = [
  "bg-[#2d2a26]",
  "bg-[var(--color-primary)]",
  "bg-[var(--color-blue)]",
  "bg-[var(--color-green)]",
  "bg-[#8c6f4a]",
  "bg-[var(--color-red)]",
];
