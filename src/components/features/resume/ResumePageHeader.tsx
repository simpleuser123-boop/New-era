"use client";

import {
  ArrowLeft,
  ArrowRight,
  Bell,
  ClipboardList,
  HelpCircle,
  Search,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { PageHeader } from "@/components/features/AppShell";
import type { ResumeWorkspaceView } from "@/components/features/resume/ResumeWorkspace";

type ResumePageHeaderProps = {
  activeView: ResumeWorkspaceView;
  onChangeView: (view: ResumeWorkspaceView) => void;
  onUploadClick: () => void;
};

export function ResumePageHeader({
  activeView,
  onChangeView,
  onUploadClick,
}: ResumePageHeaderProps) {
  const isOptimizeView = activeView === "optimize";

  return (
    <PageHeader
      actions={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center md:w-auto">
          <div className="relative w-full sm:w-80">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[var(--color-text-secondary)]"
              strokeWidth={1.8}
            />
            <input
              className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]"
              placeholder="搜索简历、技能或个人洞察..."
              type="search"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-bold text-[var(--color-primary)] transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] active:scale-[0.98]"
              onClick={onUploadClick}
              type="button"
            >
              <UploadCloud aria-hidden="true" className="size-4" strokeWidth={1.8} />
              上传简历
            </button>
            <button
              aria-label="简历通知"
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-primary)]"
              type="button"
            >
              <Bell aria-hidden="true" className="size-5" strokeWidth={1.8} />
            </button>
            <button
              aria-label="简历帮助"
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-primary)]"
              type="button"
            >
              <HelpCircle aria-hidden="true" className="size-5" strokeWidth={1.8} />
            </button>
          </div>
        </div>
      }
      description="管理本地简历、默认简历和岗位匹配优化；长期数据只在你明确保存后写入。"
      icon={
        <ClipboardList
          aria-hidden="true"
          className="size-5"
          strokeWidth={1.8}
        />
      }
      title="简历管理"
      titleAction={
        <button
          aria-label={isOptimizeView ? "返回简历管理" : "进入简历优化"}
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-[12px] px-4 text-sm font-bold transition-all active:scale-[0.98] ${
            isOptimizeView
              ? "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              : "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] hover:shadow-[var(--shadow-md)]"
          }`}
          onClick={() => onChangeView(isOptimizeView ? "manage" : "optimize")}
          type="button"
        >
          {isOptimizeView ? (
            <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.8} />
          ) : (
            <Sparkles aria-hidden="true" className="size-4" strokeWidth={1.8} />
          )}
          {isOptimizeView ? "返回管理" : "简历优化"}
          {isOptimizeView ? null : (
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.8} />
          )}
        </button>
      }
    />
  );
}
