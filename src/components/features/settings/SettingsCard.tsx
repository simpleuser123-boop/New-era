import type { ReactNode } from "react";

type SettingsCardProps = {
  children: ReactNode;
  className?: string;
};

export function SettingsCard({ children, className = "" }: SettingsCardProps) {
  return (
    <section
      className={`rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)] ${className}`}
    >
      {children}
    </section>
  );
}
