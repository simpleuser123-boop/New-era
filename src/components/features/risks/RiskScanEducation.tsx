import { GraduationCap } from "lucide-react";
import { knowledgeItems } from "@/components/features/risks/riskScanModel";

export function RiskScanEducation() {
  return (
    <section className="rounded-[24px] border border-[var(--color-border-light)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-[12px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
          <GraduationCap aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </div>
        <div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            假 AI 岗知识库
          </h2>
          <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
            常见骗术模式和核验方法。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {knowledgeItems.map((item) => (
          <article
            className="rounded-[18px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4"
            key={item.title}
          >
            <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
              {item.title}
            </h3>
            <p className="mt-2 rounded-[10px] bg-white px-3 py-2 text-xs leading-5 text-[var(--color-primary)]">
              {item.phrase}
            </p>
            <p className="mt-3 text-xs leading-5 text-[var(--color-text-secondary)]">
              {item.method}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
