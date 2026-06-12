import { IndustryInsightsPage } from "@/components/features/insights/IndustryInsightsPage";
import { requireProductPageAccess } from "@/lib/auth/page-access";

export default async function InsightsPage() {
  await requireProductPageAccess("/insights");

  return <IndustryInsightsPage />;
}
