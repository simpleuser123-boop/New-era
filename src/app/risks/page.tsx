import { RiskScanPage } from "@/components/features/risks/RiskScanPage";
import { requireProductPageAccess } from "@/lib/auth/page-access";

export default async function RisksPage() {
  await requireProductPageAccess("/risks");

  return <RiskScanPage />;
}
