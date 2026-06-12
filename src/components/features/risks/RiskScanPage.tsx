import { Search, ShieldCheck } from "lucide-react";
import { AppShell, PageContainer, PageHeader } from "@/components/features/AppShell";
import { RiskScanWorkspace } from "@/components/features/risks/RiskScanWorkspace";

export function RiskScanPage() {
  return (
    <AppShell activeHref="/risks" contained={false}>
      <PageHeader
        actions={
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">搜索公司或职位</span>
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[var(--color-text-secondary)]"
              strokeWidth={1.8}
            />
            <input
              className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-hover)] py-2 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]"
              placeholder="搜索公司或职位..."
              type="search"
            />
          </label>
        }
        description="拦截培训贷、虚假挂靠、传统开发包装和非 AI 核心岗。"
        icon={<ShieldCheck aria-hidden="true" className="size-5" strokeWidth={1.8} />}
        title="AI 岗真假识别"
      />

      <PageContainer className="pb-12">
        <RiskScanWorkspace />
      </PageContainer>
    </AppShell>
  );
}
