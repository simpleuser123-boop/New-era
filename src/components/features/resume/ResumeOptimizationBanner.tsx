import { ArrowRight, FileCheck2, Rocket, Sparkles } from "lucide-react";
import { optimizationTips } from "@/components/features/resume/resumeData";

export function ResumeOptimizationBanner() {
  return (
    <section className="relative overflow-hidden rounded-[24px] bg-[var(--color-primary)] p-6 text-white shadow-[var(--shadow-lg)] xl:col-span-12 sm:p-8">
      <div className="pointer-events-none absolute right-8 top-1/2 hidden -translate-y-1/2 opacity-15 lg:block">
        <Rocket aria-hidden="true" className="size-56" strokeWidth={1.2} />
      </div>
      <div className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-white opacity-10 blur-3xl" />

      <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] lg:items-center">
        <div>
          <div className="mb-4 flex size-12 items-center justify-center rounded-[16px] bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
            <Sparkles aria-hidden="true" className="size-6" strokeWidth={1.8} />
          </div>
          <h2 className="max-w-2xl text-[24px] font-semibold leading-[34px] sm:text-[28px] sm:leading-[38px]">
            准备好优化这份简历了吗？
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/85 sm:text-base">
            基于当前技能缺口，系统已经生成一组可直接落到简历里的修改方向，优先补强项目证据、关键词对齐和量化成果。
          </p>
          <button
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-[var(--color-primary)] transition-all hover:shadow-xl active:scale-[0.98]"
            type="button"
          >
            一键优化简历
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="space-y-3">
          {optimizationTips.map((tip) => (
            <article
              className="rounded-[18px] border border-white/15 bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
              key={tip.title}
            >
              <div className="mb-2 flex items-center gap-2">
                <FileCheck2
                  aria-hidden="true"
                  className="size-4 shrink-0 text-white"
                  strokeWidth={1.8}
                />
                <h3 className="text-sm font-bold leading-5">{tip.title}</h3>
              </div>
              <p className="text-xs leading-5 text-white/78">{tip.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
