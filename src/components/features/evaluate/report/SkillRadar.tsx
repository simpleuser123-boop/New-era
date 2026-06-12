import { radarAxes } from "@/components/features/evaluate/report/reportData";

export function SkillRadar() {
  return (
    <section className="print-card rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
      <h2 className="mb-6 text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
        技能覆盖概览
      </h2>
      <div className="relative mx-auto flex aspect-square w-full max-w-[320px] items-center justify-center">
        <div
          aria-hidden="true"
          className="absolute inset-8 border border-[var(--color-border)] opacity-60 [clip-path:polygon(50%_0%,100%_38%,81%_100%,19%_100%,0%_38%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-14 border border-[var(--color-border)] opacity-70 [clip-path:polygon(50%_0%,100%_38%,81%_100%,19%_100%,0%_38%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-20 border border-[var(--color-border)] opacity-80 [clip-path:polygon(50%_0%,100%_38%,81%_100%,19%_100%,0%_38%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-12 bg-[rgba(196,135,58,0.26)] [clip-path:polygon(50%_8%,90%_41%,75%_86%,26%_80%,15%_46%)]"
        />
        <div
          aria-hidden="true"
          className="absolute size-2 rounded-full bg-[var(--color-primary)]"
        />
        {radarAxes.map((axis) => (
          <span
            className={`absolute whitespace-nowrap text-xs font-bold leading-4 text-[var(--color-text)] ${axis.position}`}
            key={axis.label}
          >
            {axis.label}
          </span>
        ))}
      </div>
    </section>
  );
}
