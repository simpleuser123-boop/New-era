import { BriefcaseBusiness } from "lucide-react";
import { AppShell, PageContainer, PageHeader } from "@/components/features/AppShell";
import { ApplicationWorkspace } from "@/components/features/applications/ApplicationWorkspace";

export function ApplicationManagementPage() {
  return (
    <AppShell activeHref="/applications" contained={false}>
      <PageHeader
        description="集中查看本地投递记录、跟进时间线和下一步动作；“已投递”仅表示你已在外部渠道自行完成投递。"
        icon={
          <BriefcaseBusiness
            aria-hidden="true"
            className="size-5"
            strokeWidth={1.8}
          />
        }
        title="Tracker 工作台"
      />

      <PageContainer className="pb-12">
        <ApplicationWorkspace />
      </PageContainer>
    </AppShell>
  );
}
