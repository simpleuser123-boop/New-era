import { AppShell } from "@/components/features/AppShell";
import { SettingsWorkspace } from "@/components/features/settings/SettingsWorkspace";

export function SettingsPage() {
  return (
    <AppShell activeHref="/settings" contained={false}>
      <SettingsWorkspace />
    </AppShell>
  );
}
