import { ResumeManagementPage } from "@/components/features/resume/ResumeManagementPage";
import {
  buildProtectedNextPath,
  requireProductPageAccess,
} from "@/lib/auth/page-access";

type ResumePageProps = {
  searchParams?: Promise<{
    view?: string | string[];
  }>;
};

export default async function ResumePage({ searchParams }: ResumePageProps) {
  const params = searchParams ? await searchParams : {};
  await requireProductPageAccess(buildProtectedNextPath("/resume", params));

  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;

  return <ResumeManagementPage initialView={parseResumeView(rawView)} />;
}

function parseResumeView(value: string | undefined) {
  return value === "optimize" ? "optimize" : "manage";
}
