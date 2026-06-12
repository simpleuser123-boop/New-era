import type { Metadata } from "next";
import { AssessmentHistoryPage } from "@/components/features/history/AssessmentHistoryPage";
import { requireProductPageAccess } from "@/lib/auth/page-access";

export const metadata: Metadata = {
  title: "评估历史 | New Era",
};

export default async function ReportsPage() {
  await requireProductPageAccess("/reports");

  return <AssessmentHistoryPage />;
}
