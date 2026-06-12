import type { Metadata } from "next";
import { SettingsPage } from "@/components/features/settings/SettingsPage";
import { requireProductPageAccess } from "@/lib/auth/page-access";

export const metadata: Metadata = {
  title: "设置 | New Era",
};

export default async function SettingsRoute() {
  await requireProductPageAccess("/settings");

  return <SettingsPage />;
}
