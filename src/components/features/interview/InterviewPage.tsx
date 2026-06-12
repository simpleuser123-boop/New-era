import { MessageSquarePlus } from "lucide-react";

import { AppShell, PageContainer, PageHeader } from "@/components/features/AppShell";
import { InterviewWorkspace } from "@/components/features/interview/InterviewWorkspace";

type InterviewPageProps = {
  initialReportId?: number;
};

export function InterviewPage({ initialReportId }: InterviewPageProps) {
  return (
    <AppShell activeHref="/interview" contained={false}>
      <PageHeader
        description="基于本地评估报告、简历和 Career DNA 准备面试问题、记录回答评分，并沉淀 STAR 故事。"
        icon={
          <MessageSquarePlus
            aria-hidden="true"
            className="size-5"
            strokeWidth={1.8}
          />
        }
        title="Interview Coach"
      />

      <PageContainer className="pb-12">
        <InterviewWorkspace initialReportId={initialReportId} />
      </PageContainer>
    </AppShell>
  );
}
