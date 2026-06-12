import { useEffect, useId, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type ConfirmDialogStatus = "idle" | "loading" | "success" | "error";

export type ConfirmDialogProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  description: ReactNode;
  impact: ReactNode;
  isDanger?: boolean;
  objectLabel: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  recovery: ReactNode;
  status?: ConfirmDialogStatus;
  statusMessage?: ReactNode;
  title: string;
};

const statusClass: Record<ConfirmDialogStatus, string> = {
  error: "border-[#efd4d0] bg-[#fff0ee] text-[var(--color-red)]",
  idle: "border-[var(--color-border-light)] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]",
  loading: "border-[#eedaa6] bg-[#fffaf0] text-[var(--color-primary)]",
  success: "border-[#d7e7d2] bg-[#eef6eb] text-[#5f7f50]",
};

export function ConfirmDialog({
  cancelLabel = "取消",
  confirmLabel = "确认",
  description,
  impact,
  isDanger = false,
  objectLabel,
  onCancel,
  onConfirm,
  recovery,
  status = "idle",
  statusMessage,
  title,
}: ConfirmDialogProps) {
  const titleId = useId();
  const isBusy = status === "loading";
  const isDone = status === "success";

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isBusy) {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isBusy, onCancel]);

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(45,42,38,0.42)] px-4 pb-4 pt-6 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
    >
      <section className="max-h-[calc(100dvh-2rem)] w-full max-w-[520px] overflow-y-auto rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_24px_80px_rgba(45,42,38,0.22)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div
              className={cn(
                "mb-3 flex size-10 items-center justify-center rounded-[12px]",
                isDanger
                  ? "bg-[#fff0ee] text-[var(--color-red)]"
                  : "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
              )}
            >
              <AlertTriangle aria-hidden="true" className="size-5" strokeWidth={1.8} />
            </div>
            <h2
              className="break-words text-lg font-semibold leading-7 text-[var(--color-text)]"
              id={titleId}
            >
              {title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
              {description}
            </p>
          </div>
          <button
            aria-label="关闭确认"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isBusy}
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={1.8} />
          </button>
        </div>

        <dl className="mt-5 space-y-3">
          <ConfirmDialogDetail label="操作对象">{objectLabel}</ConfirmDialogDetail>
          <ConfirmDialogDetail label="影响范围">{impact}</ConfirmDialogDetail>
          <ConfirmDialogDetail label="可恢复性">{recovery}</ConfirmDialogDetail>
        </dl>

        {statusMessage || status !== "idle" ? (
          <div
            className={cn(
              "mt-5 flex gap-2 rounded-[14px] border px-3 py-3 text-xs font-bold leading-5",
              statusClass[status],
            )}
            role="status"
          >
            {status === "loading" ? (
              <LoaderCircle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 animate-spin"
                strokeWidth={1.8}
              />
            ) : status === "success" ? (
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
                strokeWidth={1.8}
              />
            ) : (
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
                strokeWidth={1.8}
              />
            )}
            <span className="min-w-0 break-words">
              {statusMessage ??
                (status === "loading" ? "操作处理中，请稍候。" : null)}
            </span>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            className="w-full whitespace-normal sm:w-auto"
            disabled={isBusy}
            onClick={onCancel}
            variant="outline"
          >
            {cancelLabel}
          </Button>
          <Button
            className="w-full whitespace-normal sm:w-auto"
            disabled={isBusy || isDone}
            leftIcon={
              isBusy ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                  strokeWidth={1.8}
                />
              ) : undefined
            }
            onClick={onConfirm}
            variant={isDanger ? "danger" : "primary"}
          >
            {isBusy ? "处理中..." : confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}

function ConfirmDialogDetail({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="rounded-[14px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] px-3 py-3">
      <dt className="text-[11px] font-bold leading-4 text-[var(--color-text-secondary)]">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold leading-6 text-[var(--color-text)]">
        {children}
      </dd>
    </div>
  );
}
