import type { Metadata } from "next";

import { InterviewPage } from "@/components/features/interview/InterviewPage";
import {
  buildProtectedNextPath,
  requireProductPageAccess,
} from "@/lib/auth/page-access";

export const metadata: Metadata = {
  title: "面试教练 | New Era",
};

type InterviewRouteProps = {
  searchParams?: Promise<{
    reportId?: string | string[];
  }>;
};

export default async function InterviewRoute({
  searchParams,
}: InterviewRouteProps) {
  const params = searchParams ? await searchParams : {};
  await requireProductPageAccess(buildProtectedNextPath("/interview", params));

  const rawReportId = Array.isArray(params.reportId)
    ? params.reportId[0]
    : params.reportId;

  return <InterviewPage initialReportId={parseReportId(rawReportId)} />;
}

function parseReportId(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    return undefined;
  }

  const reportId = Number(value);

  return Number.isSafeInteger(reportId) ? reportId : undefined;
}
