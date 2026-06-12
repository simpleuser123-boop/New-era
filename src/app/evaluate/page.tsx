import { JdAssessmentPage } from "@/components/features/evaluate/JdAssessmentPage";
import { requireProductPageAccess } from "@/lib/auth/page-access";

export default async function EvaluatePage() {
  await requireProductPageAccess("/evaluate");

  return <JdAssessmentPage />;
}
