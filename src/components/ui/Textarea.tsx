import * as React from "react";
import { cn } from "@/lib/cn";

export type TextareaProps =
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    error?: React.ReactNode;
    helperText?: React.ReactNode;
    label?: React.ReactNode;
    wrapperClassName?: string;
  };

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      error,
      helperText,
      id,
      label,
      wrapperClassName,
      ...props
    },
    ref,
  ) => {
    const helperId = id && helperText ? `${id}-helper` : undefined;
    const errorId = id && error ? `${id}-error` : undefined;
    const describedBy = [helperId, errorId].filter(Boolean).join(" ") || undefined;

    return (
      <label className={cn("block space-y-2", wrapperClassName)}>
        {label ? (
          <span className="block text-sm font-bold leading-5 text-[var(--color-text-secondary)]">
            {label}
          </span>
        ) : null}
        <textarea
          aria-describedby={describedBy}
          aria-invalid={Boolean(error) || undefined}
          className={cn(
            "min-h-32 w-full resize-y rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base leading-7 text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-muted)]",
            "focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]",
            Boolean(error)
              ? "border-[var(--color-red)] focus:border-[var(--color-red)]"
              : undefined,
            className,
          )}
          id={id}
          ref={ref}
          {...props}
        />
        {helperText ? (
          <span
            className="block text-xs leading-5 text-[var(--color-text-secondary)]"
            id={helperId}
          >
            {helperText}
          </span>
        ) : null}
        {error ? (
          <span
            className="block text-xs font-medium leading-5 text-[var(--color-red)]"
            id={errorId}
          >
            {error}
          </span>
        ) : null}
      </label>
    );
  },
);

Textarea.displayName = "Textarea";
