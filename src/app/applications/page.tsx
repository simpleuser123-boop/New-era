import type { Metadata } from "next";
import { ApplicationManagementPage } from "@/components/features/applications/ApplicationManagementPage";
import { requireProductPageAccess } from "@/lib/auth/page-access";

export const metadata: Metadata = {
  title: "投递管理 | New Era",
};

export default async function ApplicationsPage() {
  await requireProductPageAccess("/applications");

  return <ApplicationManagementPage />;
}
