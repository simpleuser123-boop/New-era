import { TriangleAlert } from "lucide-react";
import type { SkillGap } from "@/components/features/resume/resumeData";

type SkillGapCardProps = {
  gaps: SkillGap[];
};

export function SkillGapCard({ gaps }: SkillGapCardProps) {
  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[var(--color-red)]">
            <TriangleAlert aria-hidden="true" className="size-5" strokeWidth={1.8} />
            <span className="text-xs font-bold uppercase tracking-[0.08em]">
              Skill Gap
            </span>
          </div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            核心技能缺口
          </h2>
        </div>
      </div>

      <div className="space-y-5">
        {gaps.map((gap) => (
          <article key={gap.label}>
            <div className="mb-2 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
                  {gap.label}
                </h3>
                <p className="text-xs leading-4 text-[var(--color-text-secondary)]">
                  当前覆盖度 {gap.value}%
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[#f5e8e6] px-2.5 py-1 text-xs font-bold leading-4 text-[var(--color-red)]">
                {gap.status}
              </span>
            </div>
            <div
              aria-label={`${gap.label} 覆盖度 ${gap.value}%`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={gap.value}
              className="h-2 overflow-hidden rounded-full bg-[var(--color-border-light)]"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-[var(--color-primary)]"
                style={{ width: `${gap.value}%` }}
              />
            </div>
          </article>
        ))}
      </div>

      <p className="mt-6 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-3 text-xs leading-5 text-[var(--color-text-secondary)]">
        建议：增加 Milvus、Pinecone 或 LangGraph Agent 的项目描述，并补充召回率、延迟和业务影响。
      </p>
    </section>
  );
}
