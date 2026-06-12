import * as React from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/cn";

export type EmptyStateProps = React.HTMLAttributes<HTMLDivElement> & {
  action?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
};

export function EmptyState({
  action,
  className,
  description,
  icon,
  title,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "grid min-h-72 place-items-center rounded-[24px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      <div className="max-w-sm">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-[18px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
          {icon ?? <Inbox aria-hidden="true" className="size-6" strokeWidth={1.8} />}
        </div>
        <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
            {description}
          </p>
        ) : null}
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}
