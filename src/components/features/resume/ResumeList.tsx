import { FileText, MoreVertical, UploadCloud } from "lucide-react";
import type { ResumeRecord } from "@/components/features/resume/resumeData";

type ResumeListProps = {
  resumes: ResumeRecord[];
};

export function ResumeList({ resumes }: ResumeListProps) {
  return (
    <section className="flex h-full min-h-[520px] flex-col rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            我的简历
          </h2>
          <p className="mt-1 text-xs leading-4 text-[var(--color-text-secondary)]">
            多版本管理与目标岗位对齐
          </p>
        </div>
        <span className="rounded-[10px] bg-[var(--color-primary-light)] px-2.5 py-1 text-xs font-bold leading-4 text-[#6b4716]">
          共 {resumes.length} 份
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin]">
        {resumes.map((resume, index) => (
          <ResumeListItem isActive={index === 0} key={resume.id} resume={resume} />
        ))}
      </div>

      <button
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-[16px] border-2 border-dashed border-[var(--color-border)] px-4 py-3 text-sm font-bold text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)] active:scale-[0.98]"
        type="button"
      >
        <UploadCloud aria-hidden="true" className="size-5" strokeWidth={1.8} />
        上传新简历
      </button>
    </section>
  );
}

type ResumeListItemProps = {
  resume: ResumeRecord;
  isActive: boolean;
};

function ResumeListItem({ resume, isActive }: ResumeListItemProps) {
  return (
    <article
      className={`group cursor-pointer rounded-[18px] border p-4 transition-all hover:-translate-y-px hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-lg)] ${
        isActive
          ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]"
          : "border-transparent bg-[var(--color-surface-hover)]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-[14px] ${
            resume.type === "pdf"
              ? "bg-[#f5e8e6] text-[var(--color-red)]"
              : "bg-[#e8f0f5] text-[var(--color-blue)]"
          }`}
        >
          <FileText aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold leading-5 text-[var(--color-text)] transition-colors group-hover:text-[var(--color-primary)]">
            {resume.name}
          </h3>
          <p className="mt-1 text-xs leading-4 text-[var(--color-text-secondary)]">
            修改于 {resume.updatedAt} · {resume.size}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium leading-4 text-[var(--color-text-secondary)]">
              {resume.focus}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold leading-4 text-[var(--color-primary)]">
              {resume.matchScore} 匹配
            </span>
          </div>
        </div>

        <button
          aria-label={`打开 ${resume.name} 更多操作`}
          className="rounded-full p-1 text-[var(--color-muted)] transition-colors hover:bg-white hover:text-[var(--color-primary)]"
          type="button"
        >
          <MoreVertical aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </button>
      </div>
    </article>
  );
}
