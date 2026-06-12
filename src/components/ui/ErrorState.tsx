import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

export type ErrorStateProps = React.HTMLAttributes<HTMLDivElement> & {
  action?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  title?: React.ReactNode;
};

export function ErrorState({
  action,
  className,
  description = "请稍后重试，或返回上一步继续操作。",
  icon,
  title = "加载失败",
  ...props
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "rounded-[24px] border border-[#efd2ce] bg-[#fff8f7] px-6 py-8 text-center shadow-[var(--shadow-sm)]",
        className,
      )}
      role="alert"
      {...props}
    >
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-[16px] bg-[#f5e8e6] text-[var(--color-red)]">
        {icon ?? (
          <AlertTriangle aria-hidden="true" className="size-6" strokeWidth={1.8} />
        )}
      </div>
      <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
        {title}
      </h2>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--color-text-secondary)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
