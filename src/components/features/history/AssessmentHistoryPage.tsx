import { AppShell } from "@/components/features/AppShell";
import { AssessmentHistoryWorkspace } from "@/components/features/history/AssessmentHistoryWorkspace";

export function AssessmentHistoryPage() {
  return (
    <AppShell activeHref="/reports" contained={false}>
      <AssessmentHistoryWorkspace />
    </AppShell>
  );
}
