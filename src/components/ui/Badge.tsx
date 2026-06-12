import * as React from "react";
import { cn } from "@/lib/cn";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple"
  | "muted";

const variantClass: Record<BadgeVariant, string> = {
  default: "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
  success: "bg-[#eaf0e8] text-[var(--color-green)]",
  warning: "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
  danger: "bg-[#f5e8e6] text-[var(--color-red)]",
  info: "bg-[#e8f0f5] text-[var(--color-blue)]",
  purple: "bg-[#eeeaf4] text-[var(--color-purple)]",
  muted:
    "border border-[var(--color-border)] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]",
};

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-xs font-bold leading-4",
        variantClass[variant],
        className,
      )}
      {...props}
    />
  );
}
