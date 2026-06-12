import { AppShell } from "@/components/features/AppShell";
import { AssistantWorkspace } from "@/components/features/assistant/AssistantWorkspace";

export function AssistantPage() {
  return (
    <AppShell
      activeHref="/assistant"
      contained={false}
      mainClassName="relative h-[100dvh] overflow-hidden bg-[var(--color-bg)]"
    >
      <AssistantWorkspace />
    </AppShell>
  );
}
