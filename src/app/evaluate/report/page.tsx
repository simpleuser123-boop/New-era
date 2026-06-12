import { AppShell } from "@/components/features/AppShell";
import { EvaluationReportView } from "@/components/features/evaluate/report/EvaluationReportView";
import {
  buildProtectedNextPath,
  requireProductPageAccess,
} from "@/lib/auth/page-access";

type EvaluateReportPageProps = {
  searchParams?: Promise<{
    reportId?: string | string[];
  }>;
};

export default async function EvaluateReportPage({
  searchParams,
}: EvaluateReportPageProps) {
  const params = searchParams ? await searchParams : {};
  await requireProductPageAccess(
    buildProtectedNextPath("/evaluate/report", params),
  );

  const rawReportId = Array.isArray(params.reportId)
    ? params.reportId[0]
    : params.reportId;
  const reportId = parseReportId(rawReportId);

  return (
    <AppShell
      activeHref="/evaluate"
      className="report-print-page"
      contentClassName="pb-0"
    >
      <EvaluationReportView reportId={reportId} />
    </AppShell>
  );
}

function parseReportId(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    return undefined;
  }

  const reportId = Number(value);

  return Number.isSafeInteger(reportId) ? reportId : undefined;
}
