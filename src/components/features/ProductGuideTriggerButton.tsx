"use client";

import { HelpCircle } from "lucide-react";

import { openProductGuide } from "@/components/features/ProductGuide";
import { cn } from "@/lib/cn";

type ProductGuideTriggerButtonProps = {
  className?: string;
};

export function ProductGuideTriggerButton({
  className,
}: ProductGuideTriggerButtonProps) {
  return (
    <button
      aria-label="重新查看功能指导"
      className={cn(
        "text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)]",
        className,
      )}
      onClick={openProductGuide}
      title="功能指导"
      type="button"
    >
      <HelpCircle
        aria-hidden="true"
        className="size-[18px]"
        strokeWidth={1.8}
      />
    </button>
  );
}

export function ProductGuideMobileTriggerButton() {
  return (
    <button
      className="fixed bottom-4 left-4 z-30 inline-flex h-11 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-bold text-[var(--color-text-secondary)] shadow-[var(--shadow-md)] transition-all hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] active:scale-[0.98] lg:hidden"
      onClick={openProductGuide}
      type="button"
    >
      <HelpCircle
        aria-hidden="true"
        className="size-[18px]"
        strokeWidth={1.8}
      />
      功能指导
    </button>
  );
}
