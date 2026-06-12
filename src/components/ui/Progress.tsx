import * as React from "react";
import { cn } from "@/lib/cn";

type ProgressTone = "primary" | "success" | "danger" | "info" | "muted";

const toneClass: Record<ProgressTone, string> = {
  primary: "bg-[var(--color-primary)]",
  success: "bg-[var(--color-green)]",
  danger: "bg-[var(--color-red)]",
  info: "bg-[var(--color-blue)]",
  muted: "bg-[var(--color-muted)]",
};

export type ProgressProps = React.HTMLAttributes<HTMLDivElement> & {
  animated?: boolean;
  max?: number;
  tone?: ProgressTone;
  value: number;
};

export function Progress({
  animated = false,
  className,
  max = 100,
  tone = "primary",
  value,
  ...props
}: ProgressProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={value}
      className={cn(
        "h-2 overflow-hidden rounded-full bg-[var(--color-border-light)]",
        className,
      )}
      role="progressbar"
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          animated ? "new-era-progress-flow" : toneClass[tone],
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
