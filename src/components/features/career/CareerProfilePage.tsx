import { BrainCircuit } from "lucide-react";

import { AppShell, PageContainer, PageHeader } from "@/components/features/AppShell";
import { CareerProfileWorkspace } from "@/components/features/career/CareerProfileWorkspace";

export function CareerProfilePage() {
  return (
    <AppShell activeHref="/career" contained={false}>
      <PageHeader
        description="维护职业目标、优势短板、偏好和当前策略；系统建议会先进入草稿，确认保存前不会写入长期画像。"
        icon={
          <BrainCircuit
            aria-hidden="true"
            className="size-5"
            strokeWidth={1.8}
          />
        }
        title="Career DNA 求职画像"
      />

      <PageContainer className="pb-12">
        <CareerProfileWorkspace />
      </PageContainer>
    </AppShell>
  );
}
