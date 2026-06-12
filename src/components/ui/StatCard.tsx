import * as React from "react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Card";

type TrendTone = "positive" | "negative" | "neutral";

const trendClass: Record<TrendTone, string> = {
  positive: "text-[var(--color-green)]",
  negative: "text-[var(--color-red)]",
  neutral: "text-[var(--color-text-secondary)]",
};

export type StatCardProps = React.HTMLAttributes<HTMLDivElement> & {
  icon?: React.ReactNode;
  label: React.ReactNode;
  trend?: React.ReactNode;
  trendTone?: TrendTone;
  value: React.ReactNode;
};

export function StatCard({
  className,
  icon,
  label,
  trend,
  trendTone = "neutral",
  value,
  ...props
}: StatCardProps) {
  return (
    <Card
      className={cn("flex min-h-36 flex-col p-6", className)}
      interactive
      {...props}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-[var(--color-text-secondary)]">
          {label}
        </span>
        {icon ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-auto">
        <p className="text-[40px] font-bold leading-none text-[var(--color-primary)]">
          {value}
        </p>
        {trend ? (
          <p className={cn("mt-3 text-xs font-bold leading-4", trendClass[trendTone])}>
            {trend}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
