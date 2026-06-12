import { z } from "zod";

import { AUTH_EVENT_TYPES } from "./auth/types";
import { RESUME_DIRECTIONS } from "./resume-directions";
import {
  AiEcosystemDomain,
  AiEcosystemProfile,
  AiEcosystemVector,
  AGENT_ACTION_PROPOSAL_STATUSES,
  AGENT_ACTION_TYPES,
  AGENT_MEMORY_TYPES,
  AGENT_SESSION_MESSAGE_ROLES,
  ASSISTANT_ACTION_TYPES,
  ASSISTANT_CITATION_TYPES,
  APPLICATION_EVENT_TYPES,
  APPLICATION_PRIORITIES,
  APPLICATION_STATUSES,
  CAREER_PROFILE_SUGGESTION_FIELDS,
  CAREER_PROFILE_SUGGESTION_SOURCES,
  CAREER_PROFILE_WORK_MODES,
  INTERVIEW_MODES,
  INTERVIEW_QUESTION_TYPES,
  type AgentActionProposal,
  type AgentActionProposalCreateInput,
  type AgentActionProposalListInput,
  type AgentActionType,
  type AgentMemoryItem,
  type AgentMemoryListInput,
  type AgentMemoryType,
  type AgentMemoryUpdateInput,
  type AgentSession,
  type AgentSessionCreateInput,
  type AgentSessionListItem,
  type AgentSessionMessage,
  type AgentSessionUpdateInput,
  type ApplicationEventType,
  type ApplicationPriority,
  type ApplicationStatus,
  type AppSettings,
  type AnalyticsOverviewDto,
  type AssistantAction,
  type AssistantCitation,
  type AssistantRequest,
  type AssistantRequestContext,
  type AssistantResponse,
  type CareerProfileSettings,
  type CareerProfileSuggestion,
  type CareerProfileSuggestionField,
  type CareerProfileSuggestionSource,
  type CareerProfileWorkMode,
  type EvaluationDimension,
  type EvaluationDimensionScore,
  type EvaluationDimensionScores,
  type EvaluationReport,
  type EvaluationReportSection,
  type EvaluationScoreSummary,
  type InterviewAnswerCreateInput,
  type InterviewAnswerScore,
  type InterviewMode,
  type InterviewQuestion,
  type InterviewQuestionType,
  type InterviewSessionCreateInput,
  type JdFetchInput,
  type JdInput,
  type JobExtract,
  type JsonObject,
  type JsonValue,
  type NotificationPreferences,
  type NotificationSetting,
  OPTIMIZATION_FEEDBACK_DECISIONS,
  type PreferenceSettings,
  type ProductGuideSettings,
  type ProductGuideStatus,
  type ProfileSettings,
  type RiskBenchmarkOverview,
  RISK_FEEDBACK_TYPES,
  RISK_FEEDBACK_USER_LABELS,
  type RiskVerificationQuestion,
  type RiskVerificationQuestionInput,
  type RiskVerificationQuestionResult,
  RESUME_OPTIMIZATION_EFFORTS,
  RESUME_OPTIMIZATION_MODES,
  type RiskFeedbackCreateInput,
  type RiskFeedbackDto,
  type RiskFeedbackListInput,
  type RiskFeedbackType,
  type RiskFeedbackUserLabel,
  type ResumeContent,
  type ResumeEducation,
  type ResumeExperience,
  type ResumeOptimizationEffort,
  type ResumeOptimizationMode,
  type ResumeOptimizationResult,
  type ResumeOptimizationSuggestion,
  type ResumeProfile,
  type ResumeProject,
  type ResumeDirection,
  type ResumeSkill,
  type AtsCheckResult,
  type OptimizationFeedbackDecision,
  type RiskLevel,
  type RiskScanResult,
  type RiskSeverity,
  type RiskSignal,
  type RiskSource,
  type SalaryRange,
  type SettingKey,
  type StoryCreateInput,
  type ThemePreference,
} from "./types";

const MAX_SHORT_TEXT_LENGTH = 240;
const MAX_LONG_TEXT_LENGTH = 50_000;
const MAX_RESUME_TEXT_LENGTH = 100_000;
const MAX_APPLICATION_NOTES_LENGTH = 5_000;
const MAX_APPLICATION_TAGS = 20;
const MAX_APPLICATION_TAG_LENGTH = 80;
const MAX_APPLICATION_SOURCE_URL_LENGTH = 2_000;
const MAX_APPLICATION_FOLLOW_UP_LENGTH = 64;
const MAX_APPLICATION_CHANNEL_LENGTH = 120;
const MAX_APPLICATION_EVENT_TITLE_LENGTH = 240;
const MAX_APPLICATION_EVENT_NOTE_LENGTH = 5_000;
const MAX_ASSISTANT_CITATION_ID_LENGTH = 2_000;
const MAX_ASSISTANT_ACTIONS = 5;
const MAX_ASSISTANT_ANSWER_LENGTH = 8_000;
const MAX_ASSISTANT_CITATIONS = 20;
const MAX_ASSISTANT_MESSAGE_LENGTH = 4_000;
const MAX_ASSISTANT_WARNINGS = 12;
const MAX_AGENT_ACTION_PROPOSAL_REASON_LENGTH = 2_000;
const MAX_AGENT_ACTION_PROPOSAL_RISK_LENGTH = 2_000;
const MAX_AGENT_ACTION_SOURCE_LENGTH = 120;
const MAX_AGENT_MEMORY_CONTENT_LENGTH = 4_000;
const MAX_AGENT_MEMORY_ITEMS = 100;
const MAX_AGENT_MEMORY_SOURCE_LENGTH = 240;
const MAX_AGENT_SESSION_MESSAGES = 80;
const MAX_AGENT_SESSION_MESSAGE_LENGTH = 8_000;
const MAX_AGENT_SESSION_TITLE_LENGTH = 120;
const MAX_AGENT_SUMMARY_LENGTH = 2_000;
const MAX_INTERVIEW_ANSWER_LENGTH = 20_000;
const MAX_INTERVIEW_QUESTIONS = 12;
const MAX_INTERVIEW_STORY_TEXT_LENGTH = 5_000;
const MAX_INTERVIEW_TAGS = 20;
const MAX_INTERVIEW_TAG_LENGTH = 80;
const MAX_CAREER_PROFILE_ITEMS = 30;
const MAX_CAREER_PROFILE_SUGGESTIONS = 80;
const MAX_CAREER_PROFILE_TEXT_LENGTH = 2_000;
const MAX_CAREER_PROFILE_STRATEGY_LENGTH = 4_000;
const MAX_OPTIMIZATION_REASON_LENGTH = 1_000;
const MAX_OPTIMIZATION_SUGGESTIONS = 8;
const MAX_RISK_FEEDBACK_BENCHMARK_ID_LENGTH = 120;
const MAX_RISK_FEEDBACK_EXCERPT_LENGTH = 5_000;
const MAX_RISK_FEEDBACK_NOTE_LENGTH = 2_000;
const MAX_RISK_FEEDBACK_SIGNAL_ID_LENGTH = 120;
const MAX_RISK_FEEDBACK_SIGNAL_TEXT_LENGTH = 1_000;
const MAX_RISK_RULE_VERSION_LENGTH = 120;
const MIN_AUTH_PASSWORD_LENGTH = 8;
const MAX_AUTH_PASSWORD_LENGTH = 128;
const MAX_AUTH_IDENTIFIER_LENGTH = 254;
const MAX_AUTH_USER_AGENT_LENGTH = 500;

const shortTextSchema = z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH);
const optionalShortTextSchema = shortTextSchema.optional();
const longTextSchema = z.string().trim().min(20).max(MAX_LONG_TEXT_LENGTH);
const resumeTextSchema = z.string().trim().min(20).max(MAX_RESUME_TEXT_LENGTH);
const scoreSchema = z.number().finite().min(0).max(5);
const percentageSchema = z.number().finite().min(0).max(100);
const nonNegativeNumberSchema = z.number().finite().min(0);

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(
  z.string(),
  jsonValueSchema,
);

export const httpUrlSchema = z
  .string()
  .trim()
  .max(MAX_APPLICATION_SOURCE_URL_LENGTH, {
    message: `URL 不能超过 ${MAX_APPLICATION_SOURCE_URL_LENGTH} 个字符。`,
  })
  .url({ message: "请输入有效的 URL。" })
  .refine(
    (value) => {
      try {
        return ["http:", "https:"].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    },
    {
      message: "URL 仅支持 http 或 https。",
    },
  );

export const riskLevelSchema: z.ZodType<RiskLevel> = z.enum([
  "critical",
  "high",
  "medium",
  "low",
]);

export const applicationStatusSchema: z.ZodType<ApplicationStatus> =
  z.enum(APPLICATION_STATUSES);

export const applicationPrioritySchema: z.ZodType<ApplicationPriority> =
  z.enum(APPLICATION_PRIORITIES);

export const applicationEventTypeSchema: z.ZodType<ApplicationEventType> =
  z.enum(APPLICATION_EVENT_TYPES);

export const applicationTagsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, { message: "标签不能为空。" })
      .max(MAX_APPLICATION_TAG_LENGTH, {
        message: `单个标签不能超过 ${MAX_APPLICATION_TAG_LENGTH} 个字符。`,
      }),
  )
  .max(MAX_APPLICATION_TAGS, {
    message: `最多只能保存 ${MAX_APPLICATION_TAGS} 个标签。`,
  });

const nextFollowUpAtSchema = z
  .string()
  .trim()
  .max(MAX_APPLICATION_FOLLOW_UP_LENGTH)
  .refine(
    (value) => {
      const normalized = value.includes("T") ? value : value.replace(" ", "T");
      const timestamp = new Date(normalized).getTime();

      return Number.isFinite(timestamp);
    },
    { message: "下次跟进时间格式不正确。" },
  );

const applicationDateTimeSchema = z
  .string()
  .trim()
  .max(MAX_APPLICATION_FOLLOW_UP_LENGTH)
  .refine(
    (value) => {
      const normalized = value.includes("T") ? value : value.replace(" ", "T");
      const timestamp = new Date(normalized).getTime();

      return Number.isFinite(timestamp);
    },
    { message: "时间格式不正确。" },
  );

const optionalApplicationChannelSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? null : value),
  z
    .string()
    .trim()
    .max(MAX_APPLICATION_CHANNEL_LENGTH, {
      message: `渠道不能超过 ${MAX_APPLICATION_CHANNEL_LENGTH} 个字符。`,
    })
    .nullable(),
);

const optionalApplicationDateTimeSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? null : value),
  applicationDateTimeSchema.nullable(),
);

export const applicationCreateInputSchema = z.strictObject({
  reportId: z.number().int().positive().optional(),
  resumeId: z.number().int().positive().optional(),
  company: shortTextSchema,
  role: shortTextSchema,
  sourceUrl: httpUrlSchema.optional(),
  status: applicationStatusSchema.default("to_apply"),
  priority: applicationPrioritySchema.default("medium"),
  channel: optionalApplicationChannelSchema.optional(),
  scoreOverall: z.number().finite().optional(),
  riskLevel: riskLevelSchema.optional(),
  recommendedResumeName: optionalShortTextSchema,
  notes: z
    .string()
    .trim()
    .max(MAX_APPLICATION_NOTES_LENGTH, {
      message: `备注不能超过 ${MAX_APPLICATION_NOTES_LENGTH} 个字符。`,
    })
    .default(""),
  tags: applicationTagsSchema.default([]),
  nextFollowUpAt: nextFollowUpAtSchema.nullable().optional(),
  appliedAt: optionalApplicationDateTimeSchema.optional(),
  interviewAt: optionalApplicationDateTimeSchema.optional(),
  offerAt: optionalApplicationDateTimeSchema.optional(),
  rejectedAt: optionalApplicationDateTimeSchema.optional(),
  abandonedAt: optionalApplicationDateTimeSchema.optional(),
});

export const applicationStatusUpdateInputSchema = z.strictObject({
  status: applicationStatusSchema,
});

const optionalApplicationSourceUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? null : value),
  httpUrlSchema.nullable(),
);

const optionalApplicationNotesSchema = z.preprocess(
  (value) => (value === null || value === undefined ? "" : value),
  z.string().trim().max(MAX_APPLICATION_NOTES_LENGTH, {
    message: `备注不能超过 ${MAX_APPLICATION_NOTES_LENGTH} 个字符。`,
  }),
);

const optionalApplicationTagsSchema = z.preprocess(
  (value) => (value === null || value === undefined ? [] : value),
  applicationTagsSchema,
);

const optionalNextFollowUpAtSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? null : value),
  nextFollowUpAtSchema.nullable(),
);

export const applicationUpdateInputSchema = z
  .strictObject({
    status: applicationStatusSchema.optional(),
    priority: applicationPrioritySchema.optional(),
    channel: optionalApplicationChannelSchema.optional(),
    notes: optionalApplicationNotesSchema.optional(),
    tags: optionalApplicationTagsSchema.optional(),
    sourceUrl: optionalApplicationSourceUrlSchema.optional(),
    nextFollowUpAt: optionalNextFollowUpAtSchema.optional(),
    appliedAt: optionalApplicationDateTimeSchema.optional(),
    interviewAt: optionalApplicationDateTimeSchema.optional(),
    offerAt: optionalApplicationDateTimeSchema.optional(),
    rejectedAt: optionalApplicationDateTimeSchema.optional(),
    abandonedAt: optionalApplicationDateTimeSchema.optional(),
  })
  .refine(
    (input) =>
      input.status !== undefined ||
      input.priority !== undefined ||
      input.channel !== undefined ||
      input.notes !== undefined ||
      input.tags !== undefined ||
      input.sourceUrl !== undefined ||
      input.nextFollowUpAt !== undefined ||
      input.appliedAt !== undefined ||
      input.interviewAt !== undefined ||
      input.offerAt !== undefined ||
      input.rejectedAt !== undefined ||
      input.abandonedAt !== undefined,
    {
      message: "请至少提供一个要更新的字段。",
    },
  );

export const applicationEventCreateInputSchema = z.strictObject({
  eventType: applicationEventTypeSchema,
  title: z
    .string()
    .trim()
    .min(1, { message: "事件标题不能为空。" })
    .max(MAX_APPLICATION_EVENT_TITLE_LENGTH, {
      message: `事件标题不能超过 ${MAX_APPLICATION_EVENT_TITLE_LENGTH} 个字符。`,
    })
    .optional(),
  note: z
    .string()
    .trim()
    .max(MAX_APPLICATION_EVENT_NOTE_LENGTH, {
      message: `事件备注不能超过 ${MAX_APPLICATION_EVENT_NOTE_LENGTH} 个字符。`,
    })
    .default(""),
  happenedAt: applicationDateTimeSchema.optional(),
});

export const riskSeveritySchema: z.ZodType<RiskSeverity> = riskLevelSchema;

export const riskSourceSchema: z.ZodType<RiskSource> = z.enum([
  "regex",
  "dictionary",
  "llm",
]);

export const evaluationDimensionSchema: z.ZodType<EvaluationDimension> = z.enum([
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
]);

export const aiEcosystemDomainSchema: z.ZodType<AiEcosystemDomain> = z.enum([
  "llm_application",
  "ai_infra",
  "algorithm_research",
  "embodied_ai",
  "ai_safety",
]);

export const resumeDirectionSchema: z.ZodType<ResumeDirection> =
  z.enum(RESUME_DIRECTIONS);

export const careerProfileWorkModeSchema: z.ZodType<CareerProfileWorkMode> =
  z.enum(CAREER_PROFILE_WORK_MODES);

export const careerProfileSuggestionSourceSchema: z.ZodType<CareerProfileSuggestionSource> =
  z.enum(CAREER_PROFILE_SUGGESTION_SOURCES);

export const careerProfileSuggestionFieldSchema: z.ZodType<CareerProfileSuggestionField> =
  z.enum(CAREER_PROFILE_SUGGESTION_FIELDS);

export const salaryPeriodSchema = z.enum(["monthly", "yearly", "daily", "hourly"]);

export const salaryRangeSchema: z.ZodType<SalaryRange> = z
  .strictObject({
    raw: optionalShortTextSchema,
    currency: z.string().trim().min(1).max(16).optional(),
    period: salaryPeriodSchema.optional(),
    min: nonNegativeNumberSchema.optional(),
    max: nonNegativeNumberSchema.optional(),
  })
  .superRefine((salary, ctx) => {
    if (
      salary.min !== undefined &&
      salary.max !== undefined &&
      salary.max < salary.min
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Salary max must be greater than or equal to min.",
        path: ["max"],
      });
    }
  });

export const aiEcosystemVectorSchema: z.ZodType<AiEcosystemVector> = z.strictObject({
  llm_application: percentageSchema,
  ai_infra: percentageSchema,
  algorithm_research: percentageSchema,
  embodied_ai: percentageSchema,
  ai_safety: percentageSchema,
});

export const aiEcosystemProfileSchema: z.ZodType<AiEcosystemProfile> =
  z.strictObject({
    primaryDomain: aiEcosystemDomainSchema,
    vector: aiEcosystemVectorSchema,
    evidence: z.array(shortTextSchema).max(20),
  });

export const jdEvaluationInputSchema = z.strictObject({
  jdText: longTextSchema,
  company: optionalShortTextSchema,
  role: optionalShortTextSchema,
  sourceUrl: httpUrlSchema.optional(),
  resumeText: resumeTextSchema.optional(),
}) satisfies z.ZodType<JdInput>;

export const jdFetchInputSchema: z.ZodType<JdFetchInput> = z.strictObject({
  url: httpUrlSchema,
});

export const riskScanInputSchema = z.strictObject({
  jdText: longTextSchema,
  company: optionalShortTextSchema,
  role: optionalShortTextSchema,
  sourceUrl: httpUrlSchema.optional(),
});

export const riskSignalSchema: z.ZodType<RiskSignal> = z.strictObject({
  id: z.string().trim().min(1).max(80).optional(),
  signal: shortTextSchema,
  excerpt: z.string().trim().min(1).max(1_000),
  severity: riskSeveritySchema,
  source: riskSourceSchema,
  category: optionalShortTextSchema,
  explanation: z.string().trim().min(1).max(2_000).optional(),
  advice: z.string().trim().min(1).max(2_000).optional(),
  weight: nonNegativeNumberSchema.optional(),
  matchTerms: z.array(shortTextSchema).max(50).optional(),
});

export const riskScanResultSchema: z.ZodType<RiskScanResult> = z.strictObject({
  level: riskLevelSchema,
  summary: z.string().trim().min(1).max(2_000),
  recommendation: z.string().trim().min(1).max(2_000),
  totalWeight: nonNegativeNumberSchema,
  scoreCap: scoreSchema.optional(),
  ruleVersion: z.string().trim().min(1).max(MAX_RISK_RULE_VERSION_LENGTH).optional(),
  ruleVersionNotes: z.array(shortTextSchema).max(20).optional(),
  signals: z.array(riskSignalSchema).max(100),
});

export const riskVerificationQuestionInputSchema = z.strictObject({
    jdText: longTextSchema,
    company: optionalShortTextSchema,
    role: optionalShortTextSchema,
  }) satisfies z.ZodType<RiskVerificationQuestionInput>;

const riskVerificationQuestionPrioritySchema = z.enum(["high", "medium", "low"]);

export const riskVerificationQuestionSchema: z.ZodType<RiskVerificationQuestion> =
  z.strictObject({
    id: z.string().trim().min(1).max(120),
    category: shortTextSchema,
    question: z.string().trim().min(1).max(1_000),
    reason: z.string().trim().min(1).max(1_000),
    relatedEvidence: z.string().trim().min(1).max(1_000).optional(),
    priority: riskVerificationQuestionPrioritySchema,
  });

export const riskVerificationQuestionResultSchema: z.ZodType<RiskVerificationQuestionResult> =
  z.strictObject({
    decisionLabel: shortTextSchema,
    riskLevel: riskLevelSchema,
    ruleVersion: z.string().trim().min(1).max(MAX_RISK_RULE_VERSION_LENGTH),
    questions: z.array(riskVerificationQuestionSchema).min(1).max(20),
    disclaimer: z.string().trim().min(1).max(1_000),
  });

const riskBenchmarkLabelSchema = z.enum(["real_ai", "fake_ai", "borderline"]);

const riskBenchmarkMetricSchema = z.strictObject({
  numerator: z.number().finite().min(0),
  denominator: z.number().finite().min(0),
  value: z.number().finite().min(0).max(1).nullable(),
  percent: z.string().trim().min(1).max(24),
});

const riskBenchmarkDistributionSchema = z.record(
  z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH),
  z.number().int().min(0),
);

const riskBenchmarkTopIssueSignalSchema = z.strictObject({
  signal: shortTextSchema,
  category: shortTextSchema,
  severity: riskSeveritySchema,
  matchTerms: z.array(shortTextSchema).max(50),
});

const riskBenchmarkTopIssueSampleSchema = z.strictObject({
  id: z.string().trim().min(1).max(MAX_RISK_FEEDBACK_BENCHMARK_ID_LENGTH),
  company: shortTextSchema,
  role: shortTextSchema,
  label: riskBenchmarkLabelSchema,
  actualDecision: riskBenchmarkLabelSchema,
  expectedRiskLevel: riskLevelSchema,
  actualRiskLevel: riskLevelSchema,
  qualityIssue: shortTextSchema,
  ruleVersion: z.string().trim().min(1).max(MAX_RISK_RULE_VERSION_LENGTH),
  totalWeight: nonNegativeNumberSchema,
  scoreCap: scoreSchema.nullable(),
  expectedRiskSignalHitRate: z.number().finite().min(0).max(1).nullable(),
  signalCount: z.number().int().min(0),
  signals: z.array(riskBenchmarkTopIssueSignalSchema).max(20),
});

export const riskBenchmarkOverviewSchema: z.ZodType<RiskBenchmarkOverview> =
  z.strictObject({
    dataset: z.strictObject({
      total: z.number().int().min(0),
      realAi: z.number().int().min(0),
      fakeAi: z.number().int().min(0),
      borderline: z.number().int().min(0),
      source: z.literal("local_benchmark"),
      labels: z.strictObject({
        real_ai: z.number().int().min(0),
        fake_ai: z.number().int().min(0),
        borderline: z.number().int().min(0),
      }),
    }),
    ruleVersion: z.string().trim().min(1).max(MAX_RISK_RULE_VERSION_LENGTH),
    ruleVersions: riskBenchmarkDistributionSchema,
    generatedAt: z.string().trim().min(1).max(64),
    metrics: z.strictObject({
      riskLevelAccuracy: riskBenchmarkMetricSchema,
      decisionAccuracy: riskBenchmarkMetricSchema,
      fakeAiRecall: riskBenchmarkMetricSchema,
      fakeAiPrecision: riskBenchmarkMetricSchema,
      realAiFalsePositiveRate: riskBenchmarkMetricSchema,
      borderlinePrecision: riskBenchmarkMetricSchema,
      borderlineReasonableHitRate: riskBenchmarkMetricSchema,
      expectedRiskSignalHitRate: riskBenchmarkMetricSchema,
    }),
    issues: z.strictObject({
      correct: z.number().int().min(0),
      falseNegative: z.number().int().min(0),
      falsePositive: z.number().int().min(0),
      severityMismatch: z.number().int().min(0),
      borderlineFalsePositive: z.number().int().min(0),
      missingExpectedSignal: z.number().int().min(0),
    }),
    distributions: z.strictObject({
      expectedRiskLevels: riskBenchmarkDistributionSchema,
      actualRiskLevels: riskBenchmarkDistributionSchema,
      decisionConfusionMatrix: riskBenchmarkDistributionSchema,
    }),
    topIssues: z.strictObject({
      missedFakeAi: z.array(riskBenchmarkTopIssueSampleSchema).max(10),
      falsePositiveRealAi: z.array(riskBenchmarkTopIssueSampleSchema).max(10),
      borderlineAnomalies: z.array(riskBenchmarkTopIssueSampleSchema).max(10),
    }),
    warnings: z.array(z.string().trim().min(1).max(1_000)).max(20),
    disclaimer: z.string().trim().min(1).max(1_000),
  });

const evaluationDimensionScoreBaseSchema = z.strictObject({
  title: shortTextSchema,
  weight: percentageSchema,
  score: scoreSchema,
  summary: z.string().trim().min(1).max(2_000),
  evidence: z.array(shortTextSchema).max(30),
  suggestions: z.array(shortTextSchema).max(30),
});

export const evaluationDimensionScoreSchema: z.ZodType<EvaluationDimensionScore> =
  evaluationDimensionScoreBaseSchema.extend({
    dimension: evaluationDimensionSchema,
  });

export const evaluationDimensionScoresSchema: z.ZodType<EvaluationDimensionScores> =
  z.strictObject({
    A: evaluationDimensionScoreBaseSchema.extend({ dimension: z.literal("A") }),
    B: evaluationDimensionScoreBaseSchema.extend({ dimension: z.literal("B") }),
    C: evaluationDimensionScoreBaseSchema.extend({ dimension: z.literal("C") }),
    D: evaluationDimensionScoreBaseSchema.extend({ dimension: z.literal("D") }),
    E: evaluationDimensionScoreBaseSchema.extend({ dimension: z.literal("E") }),
    F: evaluationDimensionScoreBaseSchema.extend({ dimension: z.literal("F") }),
  });

export const evaluationScoreSummarySchema: z.ZodType<EvaluationScoreSummary> =
  z
    .strictObject({
      overall: scoreSchema,
      maxScore: z.number().finite().positive().max(100),
      dimensions: evaluationDimensionScoresSchema,
    })
    .superRefine((summary, ctx) => {
      if (summary.overall > summary.maxScore) {
        ctx.addIssue({
          code: "custom",
          message: "Overall score must not exceed maxScore.",
          path: ["overall"],
        });
      }
    });

export const jobExtractSchema: z.ZodType<JobExtract> = z.strictObject({
  company: shortTextSchema,
  role: shortTextSchema,
  department: optionalShortTextSchema,
  location: optionalShortTextSchema,
  salaryRange: optionalShortTextSchema,
  salary: salaryRangeSchema.optional(),
  aiDirection: optionalShortTextSchema,
  experienceLevel: optionalShortTextSchema,
  techStack: z.array(shortTextSchema).max(80),
  keywords: z.array(shortTextSchema).max(120),
  ecosystem: aiEcosystemProfileSchema.optional(),
});

export const evaluationReportSectionSchema: z.ZodType<EvaluationReportSection> =
  z.strictObject({
    dimension: evaluationDimensionSchema,
    title: shortTextSchema,
    score: scoreSchema,
    summary: z.string().trim().min(1).max(2_000),
    findings: z.array(shortTextSchema).max(30),
    suggestions: z.array(shortTextSchema).max(30),
  });

export const evaluationReportSectionsSchema: z.ZodType<
  EvaluationReportSection[]
> = z
  .array(evaluationReportSectionSchema)
  .length(6)
  .superRefine((sections, ctx) => {
    const seen = new Set<EvaluationDimension>();

    for (const section of sections) {
      if (seen.has(section.dimension)) {
        ctx.addIssue({
          code: "custom",
          message: "Report sections must contain each A-F dimension once.",
          path: [sections.indexOf(section), "dimension"],
        });
      }

      seen.add(section.dimension);
    }
  });

export const dateTimeStringSchema = z.string().trim().min(1).max(64);

export const evaluationReportSchema: z.ZodType<EvaluationReport> = z.strictObject({
  job: jobExtractSchema,
  score: evaluationScoreSummarySchema,
  risks: riskScanResultSchema,
  sections: evaluationReportSectionsSchema,
  recommendation: z.string().trim().min(1).max(2_000),
  generatedAt: dateTimeStringSchema,
});

export const reportCreateInputSchema = z.strictObject({
  company: shortTextSchema,
  role: shortTextSchema,
  jdText: longTextSchema,
  score: evaluationScoreSummarySchema,
  risks: z.array(riskSignalSchema).max(100),
  report: evaluationReportSchema,
});

export const resumeSkillLevelSchema = z.enum(["beginner", "proficient", "expert"]);

export const resumeSkillCategorySchema = z.enum([
  "framework",
  "tool",
  "domain",
  "language",
  "infrastructure",
  "evaluation",
  "other",
]);

export const resumeSkillSchema: z.ZodType<ResumeSkill> = z.strictObject({
  name: shortTextSchema,
  category: resumeSkillCategorySchema,
  level: resumeSkillLevelSchema.optional(),
  evidence: z.array(shortTextSchema).max(20).optional(),
});

export const resumeProjectSchema: z.ZodType<ResumeProject> = z.strictObject({
  name: shortTextSchema,
  role: optionalShortTextSchema,
  domain: aiEcosystemDomainSchema.optional(),
  techStack: z.array(shortTextSchema).max(80),
  summary: z.string().trim().min(1).max(2_000).optional(),
  impact: z.string().trim().min(1).max(2_000).optional(),
});

export const resumeExperienceSchema: z.ZodType<ResumeExperience> =
  z.strictObject({
    company: shortTextSchema,
    role: shortTextSchema,
    period: optionalShortTextSchema,
    domain: aiEcosystemDomainSchema.optional(),
    techStack: z.array(shortTextSchema).max(80),
    highlights: z.array(shortTextSchema).max(30),
  });

export const resumeEducationSchema: z.ZodType<ResumeEducation> = z.strictObject({
  school: shortTextSchema,
  major: optionalShortTextSchema,
  degree: optionalShortTextSchema,
  period: optionalShortTextSchema,
});

export const resumeContactSchema = z.strictObject({
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().min(3).max(40).optional(),
  website: httpUrlSchema.optional(),
  location: optionalShortTextSchema,
});

export const resumeContentSchema: z.ZodType<ResumeContent> = z.strictObject({
  name: shortTextSchema,
  yearsOfExperience: z.number().finite().min(0).max(80).optional(),
  currentRole: optionalShortTextSchema,
  summary: z.string().trim().min(1).max(2_000).optional(),
  contact: resumeContactSchema.optional(),
  skills: z.array(resumeSkillSchema).max(200),
  projects: z.array(resumeProjectSchema).max(80),
  experiences: z.array(resumeExperienceSchema).max(80),
  education: z.array(resumeEducationSchema).max(20),
  rawText: resumeTextSchema.optional(),
});

export const resumeParseInputSchema = z.strictObject({
  resumeText: resumeTextSchema,
  fileName: optionalShortTextSchema,
  targetRole: optionalShortTextSchema,
  targetJdText: longTextSchema.optional(),
  direction: resumeDirectionSchema.default("general"),
});

const positiveIdSchema = z.coerce.number().int().positive();

const riskFeedbackDefaultTextSchema = (
  maxLength: number,
  message: string,
) =>
  z.preprocess(
    (value) => (value === null || value === undefined ? "" : value),
    z.string().trim().max(maxLength, { message }),
  );

const optionalRiskFeedbackTextSchema = (
  maxLength: number,
  message: string,
) =>
  z
    .preprocess(
      (value) =>
        value === null ||
        value === undefined ||
        (typeof value === "string" && value.trim().length === 0)
          ? null
          : value,
      z.string().trim().min(1).max(maxLength, { message }).nullable(),
    )
    .optional();

const optionalRiskFeedbackSourceUrlSchema = z
  .preprocess(
    (value) =>
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim().length === 0)
        ? null
        : value,
    httpUrlSchema.nullable(),
  )
  .optional();

const optionalRiskFeedbackQueryTextSchema = (
  maxLength: number,
  message: string,
) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0
        ? undefined
        : value,
    z.string().trim().min(1).max(maxLength, { message }).optional(),
  );

const optionalRiskFeedbackTypeQuerySchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0
      ? undefined
      : value,
  z.enum(RISK_FEEDBACK_TYPES).optional(),
);

const optionalRiskFeedbackUserLabelQuerySchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0
      ? undefined
      : value,
  z.enum(RISK_FEEDBACK_USER_LABELS).optional(),
);

export const riskFeedbackUserLabelSchema: z.ZodType<RiskFeedbackUserLabel> =
  z.enum(RISK_FEEDBACK_USER_LABELS);

export const riskFeedbackTypeSchema: z.ZodType<RiskFeedbackType> = z.enum(
  RISK_FEEDBACK_TYPES,
);

export const riskFeedbackCreateInputSchema: z.ZodType<RiskFeedbackCreateInput> =
  z.strictObject({
    benchmarkJdId: optionalRiskFeedbackTextSchema(
      MAX_RISK_FEEDBACK_BENCHMARK_ID_LENGTH,
      `benchmark JD id 不能超过 ${MAX_RISK_FEEDBACK_BENCHMARK_ID_LENGTH} 个字符。`,
    ),
    company: riskFeedbackDefaultTextSchema(
      MAX_SHORT_TEXT_LENGTH,
      `公司名不能超过 ${MAX_SHORT_TEXT_LENGTH} 个字符。`,
    ),
    feedbackType: riskFeedbackTypeSchema,
    jdExcerpt: z
      .string()
      .trim()
      .min(1, { message: "JD 片段不能为空。" })
      .max(MAX_RISK_FEEDBACK_EXCERPT_LENGTH, {
        message: `JD 片段不能超过 ${MAX_RISK_FEEDBACK_EXCERPT_LENGTH} 个字符。`,
      }),
    originalRiskLevel: riskLevelSchema,
    reportId: positiveIdSchema.nullable().optional(),
    riskRuleVersion: riskFeedbackDefaultTextSchema(
      MAX_RISK_RULE_VERSION_LENGTH,
      `风险规则版本不能超过 ${MAX_RISK_RULE_VERSION_LENGTH} 个字符。`,
    ),
    role: riskFeedbackDefaultTextSchema(
      MAX_SHORT_TEXT_LENGTH,
      `岗位名不能超过 ${MAX_SHORT_TEXT_LENGTH} 个字符。`,
    ),
    signalId: optionalRiskFeedbackTextSchema(
      MAX_RISK_FEEDBACK_SIGNAL_ID_LENGTH,
      `风险信号 id 不能超过 ${MAX_RISK_FEEDBACK_SIGNAL_ID_LENGTH} 个字符。`,
    ),
    signalText: optionalRiskFeedbackTextSchema(
      MAX_RISK_FEEDBACK_SIGNAL_TEXT_LENGTH,
      `风险信号文本不能超过 ${MAX_RISK_FEEDBACK_SIGNAL_TEXT_LENGTH} 个字符。`,
    ),
    sourceUrl: optionalRiskFeedbackSourceUrlSchema,
    userLabel: riskFeedbackUserLabelSchema,
    userNote: riskFeedbackDefaultTextSchema(
      MAX_RISK_FEEDBACK_NOTE_LENGTH,
      `反馈备注不能超过 ${MAX_RISK_FEEDBACK_NOTE_LENGTH} 个字符。`,
    ),
  });

export const riskFeedbackListInputSchema: z.ZodType<RiskFeedbackListInput> =
  z.strictObject({
    benchmarkJdId: optionalRiskFeedbackQueryTextSchema(
      MAX_RISK_FEEDBACK_BENCHMARK_ID_LENGTH,
      `benchmark JD id 不能超过 ${MAX_RISK_FEEDBACK_BENCHMARK_ID_LENGTH} 个字符。`,
    ),
    feedbackType: optionalRiskFeedbackTypeQuerySchema,
    limit: z.coerce.number().int().positive().max(100).default(50),
    reportId: positiveIdSchema.optional(),
    riskRuleVersion: optionalRiskFeedbackQueryTextSchema(
      MAX_RISK_RULE_VERSION_LENGTH,
      `风险规则版本不能超过 ${MAX_RISK_RULE_VERSION_LENGTH} 个字符。`,
    ),
    userLabel: optionalRiskFeedbackUserLabelQuerySchema,
  });

export const riskFeedbackSchema: z.ZodType<RiskFeedbackDto> = z.strictObject({
  benchmarkJdId: z.string().trim().min(1).max(MAX_RISK_FEEDBACK_BENCHMARK_ID_LENGTH).nullable(),
  company: z.string().trim().max(MAX_SHORT_TEXT_LENGTH),
  createdAt: dateTimeStringSchema,
  feedbackType: riskFeedbackTypeSchema,
  id: positiveIdSchema,
  jdExcerpt: z.string().trim().max(MAX_RISK_FEEDBACK_EXCERPT_LENGTH),
  originalRiskLevel: riskLevelSchema,
  reportId: positiveIdSchema.nullable(),
  riskRuleVersion: z.string().trim().min(1).max(MAX_RISK_RULE_VERSION_LENGTH),
  role: z.string().trim().max(MAX_SHORT_TEXT_LENGTH),
  signalId: z.string().trim().min(1).max(MAX_RISK_FEEDBACK_SIGNAL_ID_LENGTH).nullable(),
  signalText: z.string().trim().min(1).max(MAX_RISK_FEEDBACK_SIGNAL_TEXT_LENGTH).nullable(),
  sourceUrl: httpUrlSchema.nullable(),
  updatedAt: dateTimeStringSchema,
  userLabel: riskFeedbackUserLabelSchema,
  userNote: z.string().trim().max(MAX_RISK_FEEDBACK_NOTE_LENGTH),
});

const optionalAuthEmailSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0
      ? undefined
      : value,
  z
    .string()
    .trim()
    .email({ message: "请输入有效的邮箱。" })
    .max(254, { message: "邮箱不能超过 254 个字符。" })
    .optional(),
);

const optionalAuthPhoneSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0
      ? undefined
      : value,
  z
    .string()
    .trim()
    .min(6, { message: "手机号或联系电话不能少于 6 个字符。" })
    .max(40, { message: "手机号或联系电话不能超过 40 个字符。" })
    .regex(/^[0-9+\-()\s]+$/, {
      message: "手机号或联系电话只能包含数字、空格和常见分隔符。",
    })
    .optional(),
);

const optionalAuthDisplayNameSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0
      ? undefined
      : value,
  shortTextSchema.optional(),
);

const authPasswordSchema = z
  .string()
  .min(MIN_AUTH_PASSWORD_LENGTH, {
    message: `密码至少需要 ${MIN_AUTH_PASSWORD_LENGTH} 个字符。`,
  })
  .max(MAX_AUTH_PASSWORD_LENGTH, {
    message: `密码不能超过 ${MAX_AUTH_PASSWORD_LENGTH} 个字符。`,
  });

function requireEmailOrPhone(
  input: { email?: string; phone?: string },
  ctx: z.RefinementCtx,
) {
  if (!input.email && !input.phone) {
    ctx.addIssue({
      code: "custom",
      message: "请至少填写邮箱或手机号。",
      path: ["email"],
    });
  }
}

export const authOwnerCreateInputSchema = z
  .strictObject({
    displayName: optionalAuthDisplayNameSchema,
    email: optionalAuthEmailSchema,
    password: authPasswordSchema,
    phone: optionalAuthPhoneSchema,
  })
  .superRefine(requireEmailOrPhone);

export const authRegisterInputSchema = z
  .strictObject({
    confirmPassword: authPasswordSchema,
    displayName: optionalAuthDisplayNameSchema,
    email: optionalAuthEmailSchema,
    password: authPasswordSchema,
    phone: optionalAuthPhoneSchema,
  })
  .superRefine((input, ctx) => {
    requireEmailOrPhone(input, ctx);

    if (input.password !== input.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        message: "两次输入的密码不一致。",
        path: ["confirmPassword"],
      });
    }
  });

export const authLoginInputSchema = z.strictObject({
  identifier: z
    .string()
    .trim()
    .min(1, { message: "请输入邮箱或手机号。" })
    .max(MAX_AUTH_IDENTIFIER_LENGTH, {
      message: `账号不能超过 ${MAX_AUTH_IDENTIFIER_LENGTH} 个字符。`,
    }),
  password: authPasswordSchema,
  remember: z.boolean().optional(),
});

export const authChangePasswordInputSchema = z
  .strictObject({
    confirmPassword: authPasswordSchema,
    currentPassword: authPasswordSchema,
    nextPassword: authPasswordSchema,
  })
  .superRefine((input, ctx) => {
    if (input.nextPassword !== input.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        message: "两次输入的新密码不一致。",
        path: ["confirmPassword"],
      });
    }
  });

export const authSessionCreateInputSchema = z.strictObject({
  expiresAt: dateTimeStringSchema.optional(),
  userAgent: z
    .string()
    .trim()
    .max(MAX_AUTH_USER_AGENT_LENGTH, {
      message: `User-Agent 不能超过 ${MAX_AUTH_USER_AGENT_LENGTH} 个字符。`,
    })
    .nullable()
    .optional(),
  userId: positiveIdSchema,
});

export const authEventTypeSchema = z.enum(AUTH_EVENT_TYPES);

export const authEventCreateInputSchema = z.strictObject({
  detail: jsonObjectSchema.default({}),
  eventType: authEventTypeSchema,
  userId: positiveIdSchema.nullable().optional(),
});

export const resumeMatchInputSchema = z
  .strictObject({
    resumeId: positiveIdSchema.optional(),
    resumeText: resumeTextSchema.optional(),
    jdText: longTextSchema.optional(),
    reportId: positiveIdSchema.optional(),
  })
  .superRefine((input, ctx) => {
    const resumeSourceCount =
      Number(input.resumeId !== undefined) + Number(input.resumeText !== undefined);
    const jobSourceCount =
      Number(input.jdText !== undefined) + Number(input.reportId !== undefined);

    if (resumeSourceCount !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of resumeId or resumeText.",
        path: ["resumeId"],
      });
    }

    if (jobSourceCount !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of jdText or reportId.",
        path: ["jdText"],
      });
    }
  });

export const resumeOptimizeInputSchema = z.strictObject({
  resumeText: resumeTextSchema,
  jdText: longTextSchema,
});

export const resumeOptimizationModeSchema: z.ZodType<ResumeOptimizationMode> =
  z.enum(RESUME_OPTIMIZATION_MODES);

export const resumeOptimizationEffortSchema: z.ZodType<ResumeOptimizationEffort> =
  z.enum(RESUME_OPTIMIZATION_EFFORTS);

export const optimizationFeedbackDecisionSchema: z.ZodType<OptimizationFeedbackDecision> =
  z.enum(OPTIMIZATION_FEEDBACK_DECISIONS);

export const resumeOptimizationSuggestionSchema: z.ZodType<ResumeOptimizationSuggestion> =
  z.strictObject({
    id: z.string().trim().min(1).max(120),
    mode: resumeOptimizationModeSchema,
    title: shortTextSchema,
    targetSection: shortTextSchema,
    originalEvidence: z.string().trim().min(1).max(2_000),
    jdEvidence: z.string().trim().min(1).max(2_000).optional(),
    recommendation: z.string().trim().min(1).max(2_000),
    rewriteDraft: z.string().trim().min(1).max(2_000).optional(),
    copyText: z.string().trim().min(1).max(2_000),
    rationale: z.string().trim().min(1).max(2_000),
    safetyNote: z.string().trim().min(1).max(1_000),
    tags: z.array(shortTextSchema).max(8),
  });

const atsCheckStatusSchema = z.enum(["pass", "warning", "fail"]);

export const atsCheckResultSchema: z.ZodType<AtsCheckResult> = z.strictObject({
  score: z.number().finite().min(0).max(100),
  summary: z.string().trim().min(1).max(2_000),
  keywordCoverage: z.strictObject({
    covered: z.array(shortTextSchema).max(80),
    missing: z.array(shortTextSchema).max(80),
    coverageRate: z.number().finite().min(0).max(100),
  }),
  checks: z
    .array(
      z.strictObject({
        id: z.string().trim().min(1).max(120),
        title: shortTextSchema,
        status: atsCheckStatusSchema,
        detail: z.string().trim().min(1).max(2_000),
        fix: z.string().trim().min(1).max(2_000).optional(),
      }),
    )
    .max(20),
  suggestions: z.array(z.string().trim().min(1).max(2_000)).max(12),
  generatedAt: dateTimeStringSchema,
});

export const resumeOptimizationResultSchema: z.ZodType<ResumeOptimizationResult> =
  z.strictObject({
    generatedAt: dateTimeStringSchema,
    mode: resumeOptimizationModeSchema,
    effort: resumeOptimizationEffortSchema,
    resume: z.strictObject({
      id: positiveIdSchema,
      name: shortTextSchema,
      updatedAt: dateTimeStringSchema,
    }),
    target: z.strictObject({
      reportId: positiveIdSchema.nullable(),
      company: optionalShortTextSchema,
      role: optionalShortTextSchema,
      jdPreview: z.string().trim().min(1).max(1_000),
    }),
    matchSummary: z.strictObject({
      directionMatch: z.number().finite().min(0).max(1),
      skillCoverage: z.number().finite().min(0).max(1),
      overallMatch: z.number().finite().min(0).max(1),
      matchLevel: z.enum(["高度匹配", "中度匹配", "低度匹配", "不匹配"]),
    }),
    suggestions: z.array(resumeOptimizationSuggestionSchema).max(MAX_OPTIMIZATION_SUGGESTIONS),
    atsCheck: atsCheckResultSchema.optional(),
    guardrails: z.array(shortTextSchema).max(10),
    provider: z.literal("local_fallback"),
    fallbackUsed: z.literal(true),
  });

function requireOneJudgeTarget(
  input: { reportId?: number; jdText?: string },
  ctx: z.RefinementCtx,
) {
  const targetSourceCount =
    Number(input.reportId !== undefined) + Number(input.jdText !== undefined);

  if (targetSourceCount !== 1) {
    ctx.addIssue({
      code: "custom",
      message: "Provide exactly one of reportId or jdText.",
      path: ["reportId"],
    });
  }
}

export const resumeJudgeInputSchema = z
  .strictObject({
    resumeId: positiveIdSchema,
    reportId: positiveIdSchema.optional(),
    jdText: longTextSchema.optional(),
    mode: resumeOptimizationModeSchema.default("keyword_alignment"),
    effort: resumeOptimizationEffortSchema.default("standard"),
  })
  .superRefine(requireOneJudgeTarget);

export const resumeAtsCheckInputSchema = z
  .strictObject({
    resumeId: positiveIdSchema,
    reportId: positiveIdSchema.optional(),
    jdText: longTextSchema.optional(),
  })
  .superRefine(requireOneJudgeTarget);

export const resumeOptimizationRunCreateInputSchema = z.strictObject({
  resumeId: positiveIdSchema,
  reportId: positiveIdSchema.nullable().optional(),
  mode: resumeOptimizationModeSchema,
  result: resumeOptimizationResultSchema,
});

export const optimizationFeedbackCreateInputSchema = z.strictObject({
  runId: positiveIdSchema,
  suggestionId: z.string().trim().min(1).max(120),
  decision: optimizationFeedbackDecisionSchema,
  reason: z
    .string()
    .trim()
    .max(MAX_OPTIMIZATION_REASON_LENGTH, {
      message: `反馈原因不能超过 ${MAX_OPTIMIZATION_REASON_LENGTH} 个字符。`,
    })
    .default(""),
});

export const resumeSkillEcosystemOutputSchema: z.ZodType<
  Pick<ResumeProfile, "skills" | "ecosystem" | "ecosystemProfile">
> = z.strictObject({
  skills: z.array(resumeSkillSchema).max(200),
  ecosystem: aiEcosystemVectorSchema,
  ecosystemProfile: aiEcosystemProfileSchema.optional(),
});

export const resumeProfileSchema: z.ZodType<ResumeProfile> = z.strictObject({
  content: resumeContentSchema,
  skills: z.array(resumeSkillSchema).max(200),
  ecosystem: aiEcosystemVectorSchema,
  ecosystemProfile: aiEcosystemProfileSchema.optional(),
});

export const resumeSaveInputSchema = z.strictObject({
  name: shortTextSchema,
  content: resumeContentSchema,
  skills: z.array(resumeSkillSchema).max(200),
  ecosystem: aiEcosystemVectorSchema,
  direction: resumeDirectionSchema.default("general"),
});

const careerProfileTextItemSchema = z
  .string()
  .trim()
  .min(1, { message: "内容不能为空。" })
  .max(MAX_SHORT_TEXT_LENGTH);

export const careerProfileSalaryExpectationSchema = z
  .strictObject({
    minMonthlyK: z.number().finite().min(0).max(1_000).optional(),
    maxMonthlyK: z.number().finite().min(0).max(1_000).optional(),
    negotiable: z.boolean().optional(),
  })
  .superRefine((salary, ctx) => {
    if (
      salary.minMonthlyK !== undefined &&
      salary.maxMonthlyK !== undefined &&
      salary.maxMonthlyK < salary.minMonthlyK
    ) {
      ctx.addIssue({
        code: "custom",
        message: "薪资上限不能低于下限。",
        path: ["maxMonthlyK"],
      });
    }
  });

export const careerProfileStrengthSchema = z.strictObject({
  title: careerProfileTextItemSchema,
  evidence: z
    .string()
    .trim()
    .max(MAX_CAREER_PROFILE_TEXT_LENGTH)
    .optional(),
});

export const careerProfileWeaknessSchema = z.strictObject({
  title: careerProfileTextItemSchema,
  mitigation: z
    .string()
    .trim()
    .max(MAX_CAREER_PROFILE_TEXT_LENGTH)
    .optional(),
});

export const careerProfileSuggestionSchema: z.ZodType<CareerProfileSuggestion> =
  z.strictObject({
    id: z.string().trim().min(1).max(120),
    source: careerProfileSuggestionSourceSchema,
    sourceLabel: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH),
    title: careerProfileTextItemSchema,
    detail: z.string().trim().min(1).max(MAX_CAREER_PROFILE_TEXT_LENGTH),
    accepted: z.boolean(),
    field: careerProfileSuggestionFieldSchema.optional(),
    value: jsonValueSchema.optional(),
  });

export const careerProfilePatchInputSchema = z
  .strictObject({
    currentStrategy: z
      .string()
      .trim()
      .max(MAX_CAREER_PROFILE_STRATEGY_LENGTH)
      .optional(),
    dealBreakers: z
      .array(careerProfileTextItemSchema)
      .max(MAX_CAREER_PROFILE_ITEMS)
      .optional(),
    generatedSuggestions: z
      .array(careerProfileSuggestionSchema)
      .max(MAX_CAREER_PROFILE_SUGGESTIONS)
      .optional(),
    preferredCompanyStages: z
      .array(careerProfileTextItemSchema)
      .max(MAX_CAREER_PROFILE_ITEMS)
      .optional(),
    preferredWorkModes: z
      .array(careerProfileWorkModeSchema)
      .max(CAREER_PROFILE_WORK_MODES.length)
      .optional(),
    salaryExpectation: careerProfileSalaryExpectationSchema.optional(),
    strengths: z
      .array(careerProfileStrengthSchema)
      .max(MAX_CAREER_PROFILE_ITEMS)
      .optional(),
    targetCities: z
      .array(careerProfileTextItemSchema)
      .max(MAX_CAREER_PROFILE_ITEMS)
      .optional(),
    targetDirections: z
      .array(resumeDirectionSchema)
      .max(MAX_CAREER_PROFILE_ITEMS)
      .optional(),
    targetRoles: z
      .array(careerProfileTextItemSchema)
      .max(MAX_CAREER_PROFILE_ITEMS)
      .optional(),
    weaknesses: z
      .array(careerProfileWeaknessSchema)
      .max(MAX_CAREER_PROFILE_ITEMS)
      .optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Career DNA patch 至少需要包含一个字段。",
  });

export const careerProfileSettingsSchema: z.ZodType<CareerProfileSettings> =
  z.strictObject({
    targetDirections: z
      .array(resumeDirectionSchema)
      .max(MAX_CAREER_PROFILE_ITEMS),
    targetRoles: z
      .array(careerProfileTextItemSchema)
      .max(MAX_CAREER_PROFILE_ITEMS),
    targetCities: z
      .array(careerProfileTextItemSchema)
      .max(MAX_CAREER_PROFILE_ITEMS),
    preferredWorkModes: z
      .array(careerProfileWorkModeSchema)
      .max(CAREER_PROFILE_WORK_MODES.length),
    salaryExpectation: careerProfileSalaryExpectationSchema.optional(),
    strengths: z
      .array(careerProfileStrengthSchema)
      .max(MAX_CAREER_PROFILE_ITEMS),
    weaknesses: z
      .array(careerProfileWeaknessSchema)
      .max(MAX_CAREER_PROFILE_ITEMS),
    dealBreakers: z
      .array(careerProfileTextItemSchema)
      .max(MAX_CAREER_PROFILE_ITEMS),
    preferredCompanyStages: z
      .array(careerProfileTextItemSchema)
      .max(MAX_CAREER_PROFILE_ITEMS),
    currentStrategy: z
      .string()
      .trim()
      .max(MAX_CAREER_PROFILE_STRATEGY_LENGTH)
      .optional(),
    generatedSuggestions: z
      .array(careerProfileSuggestionSchema)
      .max(MAX_CAREER_PROFILE_SUGGESTIONS)
      .optional(),
    updatedAt: dateTimeStringSchema,
  });

export const assistantCitationTypeSchema = z.enum(ASSISTANT_CITATION_TYPES);

export const assistantActionTypeSchema = z.enum(ASSISTANT_ACTION_TYPES);

export const agentMemoryTypeSchema: z.ZodType<AgentMemoryType> =
  z.enum(AGENT_MEMORY_TYPES);

export const agentSessionMessageRoleSchema = z.enum(
  AGENT_SESSION_MESSAGE_ROLES,
);

const agentSessionTitleSchema = z
  .string()
  .trim()
  .min(1, { message: "会话标题不能为空。" })
  .max(MAX_AGENT_SESSION_TITLE_LENGTH, {
    message: `会话标题不能超过 ${MAX_AGENT_SESSION_TITLE_LENGTH} 个字符。`,
  });

const agentSessionMemoryDigestSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? null : value,
  z
    .string()
    .trim()
    .min(1)
    .max(MAX_AGENT_SUMMARY_LENGTH, {
      message: `摘要不能超过 ${MAX_AGENT_SUMMARY_LENGTH} 个字符。`,
    })
    .nullable(),
);

export const assistantCitationSchema: z.ZodType<AssistantCitation> =
  z.strictObject({
    id: z
      .union([
        z.number().int().positive(),
        z.string().trim().min(1).max(MAX_ASSISTANT_CITATION_ID_LENGTH),
      ])
      .optional(),
    label: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH),
    type: assistantCitationTypeSchema,
  });

export const agentSessionMessageSchema: z.ZodType<AgentSessionMessage> =
  z.strictObject({
    citations: z.array(assistantCitationSchema).max(MAX_ASSISTANT_CITATIONS).optional(),
    content: z.string().trim().min(1).max(MAX_AGENT_SESSION_MESSAGE_LENGTH),
    createdAt: dateTimeStringSchema,
    id: z.string().trim().min(1).max(160),
    isError: z.boolean().optional(),
    role: agentSessionMessageRoleSchema,
    warnings: z
      .array(z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH))
      .max(MAX_ASSISTANT_WARNINGS)
      .optional(),
  });

export const agentSessionMessagesSchema = z
  .array(agentSessionMessageSchema)
  .max(MAX_AGENT_SESSION_MESSAGES);

export const agentSessionCreateInputSchema: z.ZodType<AgentSessionCreateInput> =
  z.strictObject({
    title: agentSessionTitleSchema.optional(),
  });

export const agentSessionUpdateInputSchema: z.ZodType<AgentSessionUpdateInput> =
  z
    .strictObject({
      memoryDigest: agentSessionMemoryDigestSchema.optional(),
      title: agentSessionTitleSchema.optional(),
    })
    .refine(
      (input) => input.title !== undefined || input.memoryDigest !== undefined,
      {
        message: "请至少提供一个要更新的字段。",
      },
    );

export const agentSessionSchema: z.ZodType<AgentSession> = z.strictObject({
  createdAt: dateTimeStringSchema,
  id: positiveIdSchema,
  memoryDigest: agentSessionMemoryDigestSchema,
  messages: agentSessionMessagesSchema,
  title: agentSessionTitleSchema,
  updatedAt: dateTimeStringSchema,
});

export const agentSessionListItemSchema: z.ZodType<AgentSessionListItem> =
  z.strictObject({
    createdAt: dateTimeStringSchema,
    id: positiveIdSchema,
    lastMessageAt: dateTimeStringSchema.nullable(),
    lastMessagePreview: z
      .string()
      .trim()
      .min(1)
      .max(MAX_SHORT_TEXT_LENGTH)
      .nullable(),
    memoryDigest: agentSessionMemoryDigestSchema,
    messageCount: z.number().int().min(0),
    title: agentSessionTitleSchema,
    updatedAt: dateTimeStringSchema,
  });

const agentMemoryContentSchema = z
  .string()
  .trim()
  .min(1, { message: "记忆内容不能为空。" })
  .max(MAX_AGENT_MEMORY_CONTENT_LENGTH, {
    message: `记忆内容不能超过 ${MAX_AGENT_MEMORY_CONTENT_LENGTH} 个字符。`,
  });

const agentMemorySourceSchema = z
  .string()
  .trim()
  .min(1, { message: "记忆来源不能为空。" })
  .max(MAX_AGENT_MEMORY_SOURCE_LENGTH, {
    message: `记忆来源不能超过 ${MAX_AGENT_MEMORY_SOURCE_LENGTH} 个字符。`,
  });

const booleanQuerySchema = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true" || normalized === "1") {
      return true;
    }

    if (normalized === "false" || normalized === "0" || normalized.length === 0) {
      return false;
    }
  }

  return value;
}, z.boolean());

export const agentMemoryItemSchema: z.ZodType<AgentMemoryItem> = z.strictObject({
  content: agentMemoryContentSchema,
  createdAt: dateTimeStringSchema,
  deletedAt: dateTimeStringSchema.nullable(),
  id: positiveIdSchema,
  memoryType: agentMemoryTypeSchema,
  sessionId: positiveIdSchema.nullable(),
  source: agentMemorySourceSchema,
  updatedAt: dateTimeStringSchema,
});

export const agentMemoryListInputSchema: z.ZodType<AgentMemoryListInput> =
  z.strictObject({
    includeDeleted: booleanQuerySchema.default(false),
    limit: z.coerce.number().int().positive().max(MAX_AGENT_MEMORY_ITEMS).default(20),
    sessionId: positiveIdSchema.optional(),
  });

export const agentMemoryUpdateInputSchema: z.ZodType<AgentMemoryUpdateInput> =
  z
    .strictObject({
      content: agentMemoryContentSchema.optional(),
      source: agentMemorySourceSchema.optional(),
    })
    .refine(
      (input) => input.content !== undefined || input.source !== undefined,
      {
        message: "请至少提供一个要更新的字段。",
      },
    );

export const assistantRequestContextSchema: z.ZodType<AssistantRequestContext> =
  z.strictObject({
    applicationId: positiveIdSchema.optional(),
    reportId: positiveIdSchema.optional(),
    resumeId: positiveIdSchema.optional(),
    sessionId: positiveIdSchema.optional(),
  });

export const assistantRequestSchema: z.ZodType<AssistantRequest> =
  z.strictObject({
    context: assistantRequestContextSchema.optional(),
    message: z
      .string()
      .trim()
      .min(1, { message: "请输入问题。" })
      .max(MAX_ASSISTANT_MESSAGE_LENGTH, {
        message: `问题不能超过 ${MAX_ASSISTANT_MESSAGE_LENGTH} 个字符。`,
      }),
  });

export const assistantActionSchema: z.ZodType<AssistantAction> =
  z.strictObject({
    id: z.string().trim().min(1).max(160),
    label: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH),
    payload: jsonObjectSchema,
    requiresConfirmation: z.literal(true),
    type: assistantActionTypeSchema,
  });

export const assistantResponseSchema: z.ZodType<AssistantResponse> =
  z.strictObject({
    actions: z.array(assistantActionSchema).max(MAX_ASSISTANT_ACTIONS),
    answer: z.string().trim().min(1).max(MAX_ASSISTANT_ANSWER_LENGTH),
    citations: z
      .array(assistantCitationSchema)
      .min(1)
      .max(MAX_ASSISTANT_CITATIONS),
    fallbackCode: z.string().trim().min(1).max(120).nullable().optional(),
    fallbackMessage: z
      .string()
      .trim()
      .min(1)
      .max(MAX_SHORT_TEXT_LENGTH)
      .nullable()
      .optional(),
    fallbackReason: z.string().trim().min(1).max(120).nullable().optional(),
    fallbackUsed: z.boolean().optional(),
    provider: z
      .enum(["deepseek_enhanced", "local_fallback"])
      .optional(),
    warnings: z
      .array(z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH))
      .max(MAX_ASSISTANT_WARNINGS),
  });

export const interviewModeSchema: z.ZodType<InterviewMode> =
  z.enum(INTERVIEW_MODES);

export const interviewQuestionTypeSchema: z.ZodType<InterviewQuestionType> =
  z.enum(INTERVIEW_QUESTION_TYPES);

export const interviewProviderSchema = z.enum([
  "deepseek_enhanced",
  "local_fallback",
]);

export const interviewQuestionSchema: z.ZodType<InterviewQuestion> =
  z.strictObject({
    expectedSignals: z
      .array(z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH))
      .max(12),
    focus: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH),
    id: z.string().trim().min(1).max(120),
    question: z.string().trim().min(1).max(1_200),
    source: z
      .enum([
        "report",
        "resume",
        "career_profile",
        "local_template",
        "deepseek",
      ])
      .optional(),
    type: interviewQuestionTypeSchema,
  });

export const interviewQuestionsSchema = z
  .array(interviewQuestionSchema)
  .max(MAX_INTERVIEW_QUESTIONS);

export const interviewAnswerScoreSchema: z.ZodType<InterviewAnswerScore> =
  z.strictObject({
    aiAccuracy: scoreSchema,
    evidence: scoreSchema,
    jdRelevance: scoreSchema,
    overall: scoreSchema,
    provider: interviewProviderSchema.default("local_fallback"),
    riskHandling: scoreSchema,
    structure: scoreSchema,
    strengths: z.array(shortTextSchema).max(8),
    suggestions: z.array(shortTextSchema).max(8),
    summary: z.string().trim().min(1).max(2_000),
    weaknesses: z.array(shortTextSchema).max(8),
  });

export const interviewSessionCreateInputSchema: z.ZodType<InterviewSessionCreateInput> =
  z.strictObject({
    mode: interviewModeSchema.default("mixed"),
    reportId: positiveIdSchema,
    resumeId: positiveIdSchema.optional(),
    title: optionalShortTextSchema,
  });

export const interviewAnswerCreateInputSchema: z.ZodType<InterviewAnswerCreateInput> =
  z.strictObject({
    answerText: z
      .string()
      .trim()
      .min(10, { message: "回答至少需要 10 个字符。" })
      .max(MAX_INTERVIEW_ANSWER_LENGTH, {
        message: `回答不能超过 ${MAX_INTERVIEW_ANSWER_LENGTH} 个字符。`,
      }),
    questionId: z.string().trim().min(1).max(120),
  });

export const agentActionTypeSchema: z.ZodType<AgentActionType> =
  z.enum(AGENT_ACTION_TYPES);

export const agentActionProposalStatusSchema = z.enum(
  AGENT_ACTION_PROPOSAL_STATUSES,
);

const agentActionProposalTitleSchema = z
  .string()
  .trim()
  .min(1, { message: "待确认动作标题不能为空。" })
  .max(MAX_SHORT_TEXT_LENGTH);
const agentActionProposalReasonSchema = z
  .string()
  .trim()
  .min(1, { message: "待确认动作需要说明生成原因。" })
  .max(MAX_AGENT_ACTION_PROPOSAL_REASON_LENGTH);
const agentActionProposalRiskNoteSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_AGENT_ACTION_PROPOSAL_RISK_LENGTH)
  .default("确认前不会修改本地业务数据；确认后仅执行本 proposal 描述的本地写入。");
const optionalAgentActionSourceSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? null : value,
  z.string().trim().min(1).max(MAX_AGENT_ACTION_SOURCE_LENGTH).nullable().optional(),
);

export const proposeApplicationStatusUpdatePayloadSchema = z.strictObject({
  applicationId: positiveIdSchema,
  status: applicationStatusSchema,
});

export const proposeFollowUpEventPayloadSchema = z.strictObject({
  applicationId: positiveIdSchema,
  event: z.strictObject({
    eventType: z.enum(["follow_up_scheduled", "note_added"]),
    happenedAt: applicationDateTimeSchema.optional(),
    note: z
      .string()
      .trim()
      .max(MAX_APPLICATION_EVENT_NOTE_LENGTH, {
        message: `事件备注不能超过 ${MAX_APPLICATION_EVENT_NOTE_LENGTH} 个字符。`,
      })
      .default(""),
    title: z
      .string()
      .trim()
      .min(1, { message: "事件标题不能为空。" })
      .max(MAX_APPLICATION_EVENT_TITLE_LENGTH, {
        message: `事件标题不能超过 ${MAX_APPLICATION_EVENT_TITLE_LENGTH} 个字符。`,
      })
      .optional(),
  }),
});

export const proposeCareerProfilePatchPayloadSchema = z.strictObject({
  patch: careerProfilePatchInputSchema,
});

export const proposeResumeJudgeFeedbackPayloadSchema =
  optimizationFeedbackCreateInputSchema;

export const proposeInterviewSessionStartPayloadSchema =
  interviewSessionCreateInputSchema;

const agentActionPayloadSchemas: Record<AgentActionType, z.ZodType<JsonObject>> = {
  propose_application_status_update:
    proposeApplicationStatusUpdatePayloadSchema as z.ZodType<JsonObject>,
  propose_career_profile_patch:
    proposeCareerProfilePatchPayloadSchema as z.ZodType<JsonObject>,
  propose_follow_up_event:
    proposeFollowUpEventPayloadSchema as z.ZodType<JsonObject>,
  propose_interview_session_start:
    proposeInterviewSessionStartPayloadSchema as z.ZodType<JsonObject>,
  propose_resume_judge_feedback:
    proposeResumeJudgeFeedbackPayloadSchema as z.ZodType<JsonObject>,
};

export function parseAgentActionPayload(
  actionType: AgentActionType,
  payload: JsonObject,
): JsonObject {
  return agentActionPayloadSchemas[actionType].parse(payload);
}

function addAgentActionPayloadIssues(
  ctx: z.RefinementCtx,
  actionType: AgentActionType,
  payload: JsonObject,
) {
  const result = agentActionPayloadSchemas[actionType].safeParse(payload);

  if (result.success) {
    return;
  }

  for (const issue of result.error.issues) {
    ctx.addIssue({
      ...issue,
      path: ["payload", ...issue.path],
    });
  }
}

export const agentActionProposalCreateInputSchema: z.ZodType<AgentActionProposalCreateInput> =
  z
    .strictObject({
      actionType: agentActionTypeSchema,
      payload: jsonObjectSchema,
      reason: agentActionProposalReasonSchema,
      riskNote: agentActionProposalRiskNoteSchema,
      sourceAgentId: optionalAgentActionSourceSchema,
      sourceToolName: optionalAgentActionSourceSchema,
      title: agentActionProposalTitleSchema,
    })
    .superRefine((input, ctx) => {
      addAgentActionPayloadIssues(ctx, input.actionType, input.payload);
    });

export const agentActionProposalListInputSchema: z.ZodType<AgentActionProposalListInput> =
  z.strictObject({
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: agentActionProposalStatusSchema.optional(),
  });

export const agentActionProposalSchema: z.ZodType<AgentActionProposal> =
  z.strictObject({
    actionType: agentActionTypeSchema,
    confirmedAt: dateTimeStringSchema.nullable(),
    createdAt: dateTimeStringSchema,
    dismissedAt: dateTimeStringSchema.nullable(),
    id: positiveIdSchema,
    payload: jsonObjectSchema,
    reason: agentActionProposalReasonSchema,
    result: jsonObjectSchema.nullable(),
    riskNote: agentActionProposalRiskNoteSchema,
    sourceAgentId: z.string().trim().min(1).max(MAX_AGENT_ACTION_SOURCE_LENGTH).nullable(),
    sourceToolName: z.string().trim().min(1).max(MAX_AGENT_ACTION_SOURCE_LENGTH).nullable(),
    status: agentActionProposalStatusSchema,
    title: agentActionProposalTitleSchema,
    updatedAt: dateTimeStringSchema,
  });

export const storyTagsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, { message: "标签不能为空。" })
      .max(MAX_INTERVIEW_TAG_LENGTH, {
        message: `单个标签不能超过 ${MAX_INTERVIEW_TAG_LENGTH} 个字符。`,
      }),
  )
  .max(MAX_INTERVIEW_TAGS, {
    message: `最多只能保存 ${MAX_INTERVIEW_TAGS} 个标签。`,
  });

const optionalInterviewStoryTextSchema = z.preprocess(
  (value) => (value === null || value === undefined ? "" : value),
  z.string().trim().max(MAX_INTERVIEW_STORY_TEXT_LENGTH, {
    message: `STAR 内容不能超过 ${MAX_INTERVIEW_STORY_TEXT_LENGTH} 个字符。`,
  }),
);

export const storyCreateInputSchema: z.ZodType<StoryCreateInput> =
  z.strictObject({
    action: optionalInterviewStoryTextSchema.default(""),
    result: optionalInterviewStoryTextSchema.default(""),
    situation: optionalInterviewStoryTextSchema.default(""),
    tags: storyTagsSchema.default([]),
    task: optionalInterviewStoryTextSchema.default(""),
    title: shortTextSchema,
  });

const analyticsCountSchema = z.number().int().min(0);
const analyticsRateSchema = z.number().finite().min(0).max(100);
const analyticsSkillGapPrioritySchema = z.enum(["quick_fix", "long_term"]);

export const analyticsOverviewSchema: z.ZodType<AnalyticsOverviewDto> =
  z.strictObject({
    generatedAt: dateTimeStringSchema,
    sampleSize: z.strictObject({
      reports: analyticsCountSchema,
      resumes: analyticsCountSchema,
      applications: analyticsCountSchema,
      activeApplications: analyticsCountSchema,
      matchedReports: analyticsCountSchema,
    }),
    funnel: z.array(
      z.strictObject({
        key: z.string().trim().min(1).max(80),
        label: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH),
        count: analyticsCountSchema,
      }),
    ).max(20),
    directions: z.array(
      z.strictObject({
        direction: resumeDirectionSchema,
        label: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH),
        count: analyticsCountSchema,
        averageScore: scoreSchema,
        highRiskCount: analyticsCountSchema,
        highRiskRate: analyticsRateSchema,
        linkedApplicationCount: analyticsCountSchema,
      }),
    ).max(RESUME_DIRECTIONS.length),
    riskSignals: z.array(
      z.strictObject({
        label: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH),
        count: analyticsCountSchema,
        severity: riskSeveritySchema.optional(),
        category: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH).optional(),
      }),
    ).max(20),
    skillGaps: z.array(
      z.strictObject({
        skill: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH),
        count: analyticsCountSchema,
        priority: analyticsSkillGapPrioritySchema,
        evidence: z.string().trim().min(1).max(1_000).optional(),
      }),
    ).max(20),
    tracker: z.strictObject({
      overdueFollowUps: analyticsCountSchema,
      overdueItems: z.array(
        z.strictObject({
          id: z.number().int().positive(),
          company: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH),
          role: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH),
          status: applicationStatusSchema,
          priority: applicationPrioritySchema,
          nextFollowUpAt: dateTimeStringSchema,
          daysOverdue: analyticsCountSchema,
        }),
      ).max(20),
      byStatus: z.array(
        z.strictObject({
          status: applicationStatusSchema,
          label: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH),
          count: analyticsCountSchema,
        }),
      ).max(APPLICATION_STATUSES.length),
      byPriority: z.array(
        z.strictObject({
          priority: applicationPrioritySchema,
          label: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH),
          count: analyticsCountSchema,
        }),
      ).max(APPLICATION_PRIORITIES.length),
      byChannel: z.array(
        z.strictObject({
          channel: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH),
          count: analyticsCountSchema,
        }),
      ).max(20),
    }),
    resumeEffect: z.strictObject({
      defaultResumeName: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH).nullable(),
      analyzedResumeName: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH).nullable(),
      linkedApplicationCount: analyticsCountSchema,
      directionAlignedCount: analyticsCountSchema,
      directionAlignmentRate: analyticsRateSchema.nullable(),
      skillGapSource: z.enum(["default_resume", "latest_resume", "none"]),
      summary: z.string().trim().min(1).max(2_000),
    }),
    careerFit: z.strictObject({
      summary: z.string().trim().min(1).max(2_000),
      matchedCount: analyticsCountSchema,
      warningCount: analyticsCountSchema,
      checkedCount: analyticsCountSchema,
      targetDirectionsMatched: analyticsCountSchema,
      targetCitiesMatched: analyticsCountSchema,
      workModesMatched: analyticsCountSchema,
      warnings: z.array(z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH)).max(12),
      profileConfigured: z.boolean(),
    }).optional(),
    caveats: z.array(z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH)).max(20),
    highMatchThreshold: scoreSchema,
  });

export const themePreferenceSchema: z.ZodType<ThemePreference> = z.enum([
  "light",
  "dark",
  "system",
]);

export const settingKeySchema: z.ZodType<SettingKey> = z.enum([
  "profile",
  "preferences",
  "ui_preferences",
  "notifications",
  "notification_preferences",
  "security",
  "language",
  "theme",
  "model_provider",
  "data_export",
  "career_profile",
  "product_guide",
]);

export const profileSettingsSchema: z.ZodType<ProfileSettings> = z.strictObject({
  name: optionalShortTextSchema,
  role: optionalShortTextSchema,
  city: optionalShortTextSchema,
  bio: z.string().trim().min(1).max(2_000).optional(),
  targetIndustries: z.array(shortTextSchema).max(30).optional(),
  skills: z.array(shortTextSchema).max(100).optional(),
});

export const preferenceSettingsSchema: z.ZodType<PreferenceSettings> =
  z.strictObject({
    theme: themePreferenceSchema.optional(),
    language: optionalShortTextSchema,
  });

export const notificationSettingSchema: z.ZodType<NotificationSetting> =
  z.strictObject({
    key: shortTextSchema,
    enabled: z.boolean(),
  });

export const notificationPreferencesSchema: z.ZodType<NotificationPreferences> =
  z
    .record(z.string().trim().min(1).max(80), z.boolean())
    .refine((value) => Object.keys(value).length <= 100, {
      message: "Notification preferences must include at most 100 keys.",
    });

export const productGuideStatusSchema: z.ZodType<ProductGuideStatus> = z.enum([
  "completed",
  "skipped",
]);

export const productGuideSettingsSchema: z.ZodType<ProductGuideSettings> =
  z.strictObject({
    completedAt: dateTimeStringSchema.optional(),
    lastViewedAt: dateTimeStringSchema,
    skippedAt: dateTimeStringSchema.optional(),
    status: productGuideStatusSchema,
    version: z.number().int().positive().max(100),
  });

export const appSettingsSchema: z.ZodType<AppSettings> = z.strictObject({
  career_profile: careerProfileSettingsSchema.optional(),
  profile: profileSettingsSchema.optional(),
  preferences: preferenceSettingsSchema.optional(),
  ui_preferences: preferenceSettingsSchema.optional(),
  notifications: z.array(notificationSettingSchema).max(100).optional(),
  notification_preferences: notificationPreferencesSchema.optional(),
  product_guide: productGuideSettingsSchema.optional(),
});

export const settingsUpsertInputSchema = z.discriminatedUnion("key", [
  z.strictObject({
    key: z.literal("profile"),
    value: profileSettingsSchema,
  }),
  z.strictObject({
    key: z.literal("preferences"),
    value: preferenceSettingsSchema,
  }),
  z.strictObject({
    key: z.literal("ui_preferences"),
    value: preferenceSettingsSchema,
  }),
  z.strictObject({
    key: z.literal("notifications"),
    value: z.array(notificationSettingSchema).max(100),
  }),
  z.strictObject({
    key: z.literal("notification_preferences"),
    value: notificationPreferencesSchema,
  }),
  z.strictObject({
    key: z.literal("security"),
    value: jsonObjectSchema,
  }),
  z.strictObject({
    key: z.literal("language"),
    value: shortTextSchema,
  }),
  z.strictObject({
    key: z.literal("theme"),
    value: themePreferenceSchema,
  }),
  z.strictObject({
    key: z.literal("model_provider"),
    value: jsonObjectSchema,
  }),
  z.strictObject({
    key: z.literal("data_export"),
    value: jsonObjectSchema,
  }),
  z.strictObject({
    key: z.literal("career_profile"),
    value: careerProfileSettingsSchema,
  }),
  z.strictObject({
    key: z.literal("product_guide"),
    value: productGuideSettingsSchema,
  }),
]);

export type JdEvaluationInput = z.infer<typeof jdEvaluationInputSchema>;
export type JdUrlFetchInput = z.infer<typeof jdFetchInputSchema>;
export type RiskScanInput = z.infer<typeof riskScanInputSchema>;
export type RiskSignalOutput = z.infer<typeof riskSignalSchema>;
export type RiskScanOutput = z.infer<typeof riskScanResultSchema>;
export type RiskVerificationQuestionInputSchemaInput = z.input<
  typeof riskVerificationQuestionInputSchema
>;
export type RiskVerificationQuestionOutput = z.infer<
  typeof riskVerificationQuestionResultSchema
>;
export type EvaluationScoresOutput = z.infer<typeof evaluationScoreSummarySchema>;
export type EvaluationReportOutput = z.infer<typeof evaluationReportSchema>;
export type ReportCreateInput = z.infer<typeof reportCreateInputSchema>;
export type RiskFeedbackCreateSchemaInput = z.input<
  typeof riskFeedbackCreateInputSchema
>;
export type RiskFeedbackListSchemaInput = z.input<
  typeof riskFeedbackListInputSchema
>;
export type RiskFeedbackOutput = z.infer<typeof riskFeedbackSchema>;
export type RiskBenchmarkOverviewOutput = z.infer<
  typeof riskBenchmarkOverviewSchema
>;
export type ApplicationCreateSchemaInput = z.input<
  typeof applicationCreateInputSchema
>;
export type ApplicationEventCreateSchemaInput = z.input<
  typeof applicationEventCreateInputSchema
>;
export type ApplicationStatusUpdateSchemaInput = z.input<
  typeof applicationStatusUpdateInputSchema
>;
export type ApplicationUpdateSchemaInput = z.input<
  typeof applicationUpdateInputSchema
>;
export type AuthChangePasswordSchemaInput = z.infer<
  typeof authChangePasswordInputSchema
>;
export type AuthLoginSchemaInput = z.infer<typeof authLoginInputSchema>;
export type AuthOwnerCreateSchemaInput = z.infer<
  typeof authOwnerCreateInputSchema
>;
export type AuthRegisterSchemaInput = z.infer<typeof authRegisterInputSchema>;
export type AuthSessionCreateSchemaInput = z.infer<
  typeof authSessionCreateInputSchema
>;
export type AuthEventCreateSchemaInput = z.infer<
  typeof authEventCreateInputSchema
>;
export type AnalyticsOverviewOutput = z.infer<typeof analyticsOverviewSchema>;
export type AssistantRequestInput = z.infer<typeof assistantRequestSchema>;
export type AssistantResponseOutput = z.infer<typeof assistantResponseSchema>;
export type AgentActionProposalCreateSchemaInput = z.input<
  typeof agentActionProposalCreateInputSchema
>;
export type AgentActionProposalListSchemaInput = z.input<
  typeof agentActionProposalListInputSchema
>;
export type AgentActionProposalOutput = z.infer<typeof agentActionProposalSchema>;
export type AgentSessionCreateSchemaInput = z.input<
  typeof agentSessionCreateInputSchema
>;
export type AgentSessionUpdateSchemaInput = z.input<
  typeof agentSessionUpdateInputSchema
>;
export type AgentSessionOutput = z.infer<typeof agentSessionSchema>;
export type AgentSessionListItemOutput = z.infer<
  typeof agentSessionListItemSchema
>;
export type AgentMemoryListSchemaInput = z.input<
  typeof agentMemoryListInputSchema
>;
export type AgentMemoryUpdateSchemaInput = z.input<
  typeof agentMemoryUpdateInputSchema
>;
export type AgentMemoryItemOutput = z.infer<typeof agentMemoryItemSchema>;
export type CareerProfilePatchInput = z.infer<
  typeof careerProfilePatchInputSchema
>;
export type InterviewAnswerCreateSchemaInput = z.input<
  typeof interviewAnswerCreateInputSchema
>;
export type InterviewAnswerScoreOutput = z.infer<
  typeof interviewAnswerScoreSchema
>;
export type InterviewQuestionOutput = z.infer<typeof interviewQuestionSchema>;
export type InterviewSessionCreateSchemaInput = z.input<
  typeof interviewSessionCreateInputSchema
>;
export type StoryCreateSchemaInput = z.input<typeof storyCreateInputSchema>;
export type ResumeParseInput = z.infer<typeof resumeParseInputSchema>;
export type ResumeMatchInput = z.infer<typeof resumeMatchInputSchema>;
export type ResumeOptimizeInput = z.infer<typeof resumeOptimizeInputSchema>;
export type ResumeJudgeInput = z.infer<typeof resumeJudgeInputSchema>;
export type ResumeAtsCheckInput = z.infer<typeof resumeAtsCheckInputSchema>;
export type ResumeOptimizationRunCreateInput = z.infer<
  typeof resumeOptimizationRunCreateInputSchema
>;
export type OptimizationFeedbackCreateInput = z.infer<
  typeof optimizationFeedbackCreateInputSchema
>;
export type ResumeSkillEcosystemOutput = z.infer<
  typeof resumeSkillEcosystemOutputSchema
>;
export type ResumeSaveInput = z.infer<typeof resumeSaveInputSchema>;
export type SettingsUpsertInput = z.infer<typeof settingsUpsertInputSchema>;
export type CareerProfileSettingsInput = z.infer<
  typeof careerProfileSettingsSchema
>;
