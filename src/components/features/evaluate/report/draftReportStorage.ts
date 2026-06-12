import type { EvaluationReport } from "@/lib/types";

export const DRAFT_EVALUATION_REPORT_STORAGE_KEY =
  "new-era:draft-evaluation-report";

export type DraftEvaluationReport = {
  createdAt: string;
  jdText: string;
  report: EvaluationReport;
  saveError?: {
    code?: string;
    message?: string;
  } | null;
};

export function writeDraftEvaluationReport(
  draft: Omit<DraftEvaluationReport, "createdAt">,
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      DRAFT_EVALUATION_REPORT_STORAGE_KEY,
      JSON.stringify({
        ...draft,
        createdAt: new Date().toISOString(),
      } satisfies DraftEvaluationReport),
    );
  } catch {
    // The report is still visible in the current run state even if storage is full.
  }
}

export function readDraftEvaluationReport(): DraftEvaluationReport | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(
      DRAFT_EVALUATION_REPORT_STORAGE_KEY,
    );

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<DraftEvaluationReport>;

    if (
      typeof parsed.jdText !== "string" ||
      !parsed.report ||
      typeof parsed.report !== "object"
    ) {
      return null;
    }

    return {
      createdAt:
        typeof parsed.createdAt === "string"
          ? parsed.createdAt
          : new Date().toISOString(),
      jdText: parsed.jdText,
      report: parsed.report as EvaluationReport,
      saveError: normalizeSaveError(parsed.saveError),
    };
  } catch {
    return null;
  }
}

export function clearDraftEvaluationReport() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(DRAFT_EVALUATION_REPORT_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function normalizeSaveError(
  value: DraftEvaluationReport["saveError"] | undefined,
): DraftEvaluationReport["saveError"] {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    code: typeof value.code === "string" ? value.code : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
  };
}
