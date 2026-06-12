import Image from "next/image";
import { MapPin } from "lucide-react";
import { employerSnapshot } from "@/components/features/evaluate/report/reportData";

export function EmployerSnapshot() {
  return (
    <section className="print-card overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]">
      <div className="relative h-32 bg-[var(--color-surface-hover)] sm:h-36">
        <Image
          alt="明亮的现代办公空间"
          className="h-full w-full object-cover"
          fill
          sizes="(min-width: 1024px) 320px, (min-width: 768px) 33vw, 100vw"
          src={employerSnapshot.imageUrl}
          unoptimized
        />
        <div className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-[8px] border border-white/70 bg-white/90 px-2.5 py-1 text-xs font-bold text-[var(--color-text)] shadow-[var(--shadow-sm)] backdrop-blur">
          <MapPin
            aria-hidden="true"
            className="size-3.5 text-[var(--color-primary)]"
            strokeWidth={1.8}
          />
          {employerSnapshot.location}
        </div>
      </div>

      <div className="p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
              {employerSnapshot.name}
            </h2>
            <p className="mt-1 text-xs leading-4 text-[var(--color-text-secondary)]">
              {employerSnapshot.fullName}
            </p>
          </div>
          <span className="shrink-0 rounded-[8px] bg-[var(--color-primary-light)] px-3 py-1 text-xs font-bold text-[var(--color-primary)]">
            {employerSnapshot.funding}
          </span>
        </div>

        <dl className="space-y-3 border-t border-[var(--color-border)] pt-4">
          {employerSnapshot.facts.map((fact) => (
            <div className="flex items-center justify-between gap-4" key={fact.label}>
              <dt className="text-sm font-medium leading-5 text-[var(--color-text-secondary)]">
                {fact.label}
              </dt>
              <dd
                className={`text-right text-sm font-bold leading-5 ${
                  fact.tone ?? "text-[var(--color-text)]"
                }`}
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
