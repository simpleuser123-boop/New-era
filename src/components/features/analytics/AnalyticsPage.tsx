import { BarChart3 } from "lucide-react";

import { AppShell, PageContainer, PageHeader } from "@/components/features/AppShell";
import { AnalyticsWorkspace } from "@/components/features/analytics/AnalyticsWorkspace";

export function AnalyticsPage() {
  return (
    <AppShell activeHref="/analytics" contained={false}>
      <PageHeader
        description="聚合评估报告、简历、Tracker 和 Career DNA，复盘个人求职节奏与优先级。"
        icon={<BarChart3 aria-hidden="true" className="size-5" strokeWidth={1.8} />}
        title="Analytics 求职分析"
      />

      <PageContainer className="pb-12">
        <AnalyticsWorkspace />
      </PageContainer>
    </AppShell>
  );
}
