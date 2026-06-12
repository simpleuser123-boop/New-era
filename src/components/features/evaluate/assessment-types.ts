import type {
  EvaluationDimension,
  EvaluationReport,
  RiskSignal,
} from "@/lib/types";

export type JdAssessmentRequest = {
  jdText: string;
  resumeText?: string;
  title?: string;
  company?: string;
  role?: string;
  sourceUrl?: string;
  demoId?: string;
  clientRequestId?: string;
};

export type EvaluationStreamSection = {
  dimension: EvaluationDimension;
  title: string;
  score?: number;
  summary: string;
  findings?: string[];
  evidence?: string[];
  suggestions?: string[];
};

export type EvaluationRunStatus = "evaluating" | "completed" | "failed";

export type EvaluationRunPhase =
  | "connecting"
  | "scanning_risks"
  | "evaluating"
  | "fallback"
  | "completed"
  | "failed";

export type EvaluationLogTone = "amber" | "blue" | "green" | "red";

export type EvaluationLog = {
  text: string;
  tone: EvaluationLogTone;
};

export type EvaluationRunState = {
  status: EvaluationRunStatus;
  phase: EvaluationRunPhase;
  request: JdAssessmentRequest;
  sections: Partial<Record<EvaluationDimension, EvaluationStreamSection>>;
  completedDimensions: EvaluationDimension[];
  logs: EvaluationLog[];
  risks: RiskSignal[];
  startedAt?: number;
  activeDimension?: EvaluationDimension;
  fallbackUsed?: boolean;
  message?: string;
  errorMessage?: string;
  overallScore?: number;
  reportId?: number;
  report?: EvaluationReport;
  saveStatus?: "saved" | "failed" | "saving";
  saveErrorMessage?: string;
};
