import { AppShell } from "@/components/features/AppShell";
import { JdAssessmentWorkspace } from "@/components/features/evaluate/JdAssessmentWorkspace";

export function JdAssessmentPage() {
  return (
    <AppShell activeHref="/evaluate" contained={false}>
      <JdAssessmentWorkspace />
    </AppShell>
  );
}
