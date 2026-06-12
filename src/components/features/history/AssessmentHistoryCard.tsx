import Link from "next/link";
import {
  Building2,
  CalendarDays,
  Eye,
  Lock,
  Trash2,
  WandSparkles,
} from "lucide-react";
import type {
  AssessmentHistoryItem,
  AssessmentStatus,
} from "@/components/features/history/historyData";

const statusStyles: Record<
  AssessmentStatus,
  {
    label: string;
    className: string;
  }
> = {
  completed: {
    label: "已完成",
    className: "border-[#d7e7d2] bg-[#eef6eb] text-[#5f7f50]",
  },
  processing: {
    label: "评估中",
    className: "border-[#eedaa6] bg-[#fff7df] text-[#9a6d20]",
  },
  needsOptimization: {
    label: "需优化",
    className: "border-[#efd4d0] bg-[#fff0ee] text-[#b45c52]",
  },
};

type AssessmentHistoryCardProps = {
  deleteError?: string;
  isDeleting?: boolean;
  item: AssessmentHistoryItem;
  onDelete?: (item: AssessmentHistoryItem) => void;
};

export function AssessmentHistoryCard({
  deleteError,
  isDeleting = false,
  item,
  onDelete,
}: AssessmentHistoryCardProps) {
  const status = statusStyles[item.status];
  const Icon = item.icon;

  return (
    <article className="group grid gap-5 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] transition-all duration-200 hover:-translate-y-px hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-lg)] sm:p-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
      <div
        className={`flex size-16 shrink-0 items-center justify-center rounded-[18px] border ${item.logoTone}`}
      >
        <div className="grid place-items-center gap-0.5">
          <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
          <span className="text-[10px] font-bold leading-none tracking-[0.08em]">
            {item.logoText}
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-[20px] font-semibold leading-7 text-[var(--color-text)] sm:text-[22px] sm:leading-[30px]">
            {item.title}
          </h2>
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold leading-4 ${status.className}`}
          >
            {status.label}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm leading-5 text-[var(--color-text-secondary)]">
          <span className="inline-flex items-center gap-1.5">
            <Building2
              aria-hidden="true"
              className="size-[17px]"
              strokeWidth={1.8}
            />
            {item.company}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays
              aria-hidden="true"
              className="size-[17px]"
              strokeWidth={1.8}
            />
            {item.date}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-5 border-[var(--color-border)] lg:min-w-[260px] lg:border-l lg:pl-6">
        <AssessmentMetric item={item} />
        <AssessmentActions
          isDeleting={isDeleting}
          item={item}
          onDelete={onDelete}
        />
        {deleteError ? (
          <p
            className="rounded-[12px] border border-[#efd4d0] bg-[#fff0ee] px-3 py-2 text-xs font-medium leading-5 text-[var(--color-red)]"
            role="status"
          >
            {deleteError}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function AssessmentMetric({ item }: { item: AssessmentHistoryItem }) {
  if (item.status === "processing") {
    const progress = item.progress ?? 0;

    return (
      <div className="w-full lg:w-24 lg:self-center">
        <div
          aria-label="评估进度"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className="h-2 overflow-hidden rounded-full bg-[var(--color-border-light)]"
          role="progressbar"
        >
          <div
            className="new-era-progress-flow h-full rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-center text-xs leading-4 text-[var(--color-text-secondary)]">
          计算中 {progress}%
        </p>
      </div>
    );
  }

  return (
    <div className="text-left lg:text-center">
      <p className="mb-1 text-xs leading-4 text-[var(--color-text-secondary)]">
        匹配度
      </p>
      <p
        className={`text-[24px] font-semibold leading-8 ${
          item.status === "needsOptimization"
            ? "text-[var(--color-text-secondary)]"
            : "text-[var(--color-primary)]"
        }`}
      >
        {item.score?.toFixed(1)}
        <span className="text-base font-medium text-[var(--color-muted)]">
          /5.0
        </span>
      </p>
    </div>
  );
}

function AssessmentActions({
  isDeleting,
  item,
  onDelete,
}: {
  isDeleting: boolean;
  item: AssessmentHistoryItem;
  onDelete?: (item: AssessmentHistoryItem) => void;
}) {
  const status = item.status;

  if (status === "processing") {
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <button
          className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-[12px] bg-[var(--color-border-light)] px-4 py-2 text-sm font-bold leading-5 text-[var(--color-muted)]"
          disabled
          type="button"
        >
          <Lock aria-hidden="true" className="size-4" strokeWidth={1.8} />
          等待结果
        </button>
        <DeleteButton
          isDeleting={isDeleting}
          item={item}
          onDelete={onDelete}
        />
      </div>
    );
  }

  if (status === "needsOptimization") {
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <Link
          className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary-light)] px-4 py-2 text-sm font-bold leading-5 text-[#6b4716] transition-all hover:bg-[var(--color-primary)] hover:text-white active:scale-[0.98]"
          href="/resume"
        >
          <WandSparkles
            aria-hidden="true"
            className="size-4"
            strokeWidth={1.8}
          />
          立即优化
        </Link>
        <DeleteButton
          isDeleting={isDeleting}
          item={item}
          onDelete={onDelete}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
      <Link
        className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary-light)] px-4 py-2 text-sm font-bold leading-5 text-[#6b4716] transition-all hover:bg-[var(--color-primary)] hover:text-white active:scale-[0.98]"
        href={item.href ?? "/evaluate/report"}
      >
        <Eye aria-hidden="true" className="size-4" strokeWidth={1.8} />
        查看报告
      </Link>
      <DeleteButton
        isDeleting={isDeleting}
        item={item}
        onDelete={onDelete}
      />
    </div>
  );
}

type DeleteButtonProps = {
  isDeleting: boolean;
  item: AssessmentHistoryItem;
  onDelete?: (item: AssessmentHistoryItem) => void;
};

function DeleteButton({ isDeleting, item, onDelete }: DeleteButtonProps) {
  const canDelete = item.reportId !== undefined && onDelete !== undefined;

  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-bold leading-5 text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-red)] hover:bg-[#fff0ee] hover:text-[var(--color-red)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
      disabled={isDeleting || !canDelete}
      onClick={() => onDelete?.(item)}
      type="button"
    >
      <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.8} />
      {isDeleting ? "删除中" : "删除"}
    </button>
  );
}
