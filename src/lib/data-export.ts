import { z } from "zod";

import type {
  AgentActionProposal,
  AgentMemoryItem,
  AgentSession,
  ApplicationDto,
  ApplicationEventDto,
  CareerProfileSettings,
  DateTimeString,
  InterviewAnswerDto,
  InterviewSessionDto,
  OptimizationFeedbackDto,
  ReportDto,
  ResumeDto,
  ResumeOptimizationRunDto,
  SettingDto,
  StoryDto,
} from "./types";

export const DATA_EXPORT_PRODUCT = "new-era";
export const DATA_EXPORT_VERSION = "2.0";
export const DATA_CLEAR_CONFIRMATION_TEXT = "DELETE NEW ERA DATA";
export const DATA_EXPORT_SQLITE_PATH = "data/new-era.db";
export const DATA_EXPORT_DEMO_DATA_PATH = "demo-data";

export const DATA_CLEAR_CATEGORIES = [
  "reports",
  "resumes",
  "applications",
  "settings",
] as const;

export const dataClearCategorySchema = z.enum(DATA_CLEAR_CATEGORIES);
export const dataClearRequestSchema = z.strictObject({
  categories: z
    .array(dataClearCategorySchema)
    .min(1)
    .max(DATA_CLEAR_CATEGORIES.length),
  confirmText: z.literal(DATA_CLEAR_CONFIRMATION_TEXT),
});

export type DataClearCategory = z.infer<typeof dataClearCategorySchema>;
export type DataClearRequest = z.infer<typeof dataClearRequestSchema>;

export type DataExportTables = {
  reports: ReportDto[];
  resumes: ResumeDto[];
  applications: ApplicationDto[];
  application_events: ApplicationEventDto[];
  agent_action_proposals: AgentActionProposal[];
  agent_sessions: AgentSession[];
  agent_memory_items: AgentMemoryItem[];
  settings: SettingDto[];
  career_profile: CareerProfileSettings | null;
  interview_sessions: InterviewSessionDto[];
  interview_answers: InterviewAnswerDto[];
  stories: StoryDto[];
  resume_optimization_runs: ResumeOptimizationRunDto[];
  optimization_feedback: OptimizationFeedbackDto[];
};

export type DataExportDto = {
  product: typeof DATA_EXPORT_PRODUCT;
  exportVersion: typeof DATA_EXPORT_VERSION;
  exportedAt: DateTimeString;
  source: {
    boundaryNotes: string[];
    demoDataPath: typeof DATA_EXPORT_DEMO_DATA_PATH;
    includesEnvironmentSecrets: false;
    sqlitePath: typeof DATA_EXPORT_SQLITE_PATH;
    storage: "local-sqlite";
    userFacingLabel: "本地真实数据导出";
  };
  tables: DataExportTables;
};

export type DataClearResultDto = {
  clearedAt: DateTimeString;
  confirmation: "accepted";
  requestedCategories: DataClearCategory[];
  cleared: Record<DataClearCategory, number>;
  affected: {
    application_events: number;
    detached_application_report_refs: number;
    detached_application_resume_refs: number;
    detached_interview_report_refs: number;
    detached_interview_resume_refs: number;
    detached_optimization_report_refs: number;
    optimization_feedback: number;
    resume_optimization_runs: number;
  };
};
