import type { Metadata } from "next";

import { AnalyticsPage } from "@/components/features/analytics/AnalyticsPage";
import { requireProductPageAccess } from "@/lib/auth/page-access";

export const metadata: Metadata = {
  title: "求职分析 | New Era",
};

export default async function AnalyticsRoute() {
  await requireProductPageAccess("/analytics");

  return <AnalyticsPage />;
}
