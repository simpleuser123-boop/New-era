export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type DateTimeString = string;

export type RiskLevel = "critical" | "high" | "medium" | "low";
export type RiskSeverity = RiskLevel;
export type RiskSource = "regex" | "dictionary" | "llm";
export type EvaluationDimension = "A" | "B" | "C" | "D" | "E" | "F";

export const RISK_FEEDBACK_USER_LABELS = [
  "real_ai",
  "fake_ai",
  "borderline",
  "unsure",
] as const;

export type RiskFeedbackUserLabel =
  (typeof RISK_FEEDBACK_USER_LABELS)[number];

export const RISK_FEEDBACK_TYPES = [
  "false_positive",
  "false_negative",
  "confirmed_risk",
  "wrong_severity",
  "missing_signal",
  "other",
] as const;

export type RiskFeedbackType = (typeof RISK_FEEDBACK_TYPES)[number];

export type AiEcosystemDomain =
  | "llm_application"
  | "ai_infra"
  | "algorithm_research"
  | "embodied_ai"
  | "ai_safety";

export type ResumeDirection = "general" | AiEcosystemDomain;

export type AiEcosystemVector = Record<AiEcosystemDomain, number>;

export type AiEcosystemProfile = {
  primaryDomain: AiEcosystemDomain;
  vector: AiEcosystemVector;
  evidence: string[];
};

export type JdInput = {
  jdText: string;
  company?: string;
  role?: string;
  sourceUrl?: string;
  resumeText?: string;
};

export type JdFetchInput = {
  url: string;
};

export type SalaryPeriod = "monthly" | "yearly" | "daily" | "hourly";

export type SalaryRange = {
  raw?: string;
  currency?: string;
  period?: SalaryPeriod;
  min?: number;
  max?: number;
};

export type JobExtract = {
  company: string;
  role: string;
  department?: string;
  location?: string;
  salaryRange?: string;
  salary?: SalaryRange;
  aiDirection?: string;
  experienceLevel?: string;
  techStack: string[];
  keywords: string[];
  ecosystem?: AiEcosystemProfile;
};

export type EvaluationDimensionScore = {
  dimension: EvaluationDimension;
  title: string;
  weight: number;
  score: number;
  summary: string;
  evidence: string[];
  suggestions: string[];
};

export type EvaluationDimensionScores = Record<
  EvaluationDimension,
  EvaluationDimensionScore
>;

export type EvaluationScoreSummary = {
  overall: number;
  maxScore: number;
  dimensions: EvaluationDimensionScores;
};

export type RiskSignal = {
  id?: string;
  signal: string;
  excerpt: string;
  severity: RiskSeverity;
  source: RiskSource;
  category?: string;
  explanation?: string;
  advice?: string;
  weight?: number;
  matchTerms?: string[];
};

export type RiskScanResult = {
  level: RiskLevel;
  summary: string;
  recommendation: string;
  totalWeight: number;
  scoreCap?: number;
  ruleVersion?: string;
  ruleVersionNotes?: string[];
  signals: RiskSignal[];
};

export type RiskVerificationQuestionPriority = "high" | "medium" | "low";

export type RiskVerificationQuestion = {
  id: string;
  category: string;
  question: string;
  reason: string;
  relatedEvidence?: string;
  priority: RiskVerificationQuestionPriority;
};

export type RiskVerificationQuestionInput = {
  jdText: string;
  company?: string;
  role?: string;
};

export type RiskVerificationQuestionResult = {
  decisionLabel: string;
  riskLevel: RiskLevel;
  ruleVersion: string;
  questions: RiskVerificationQuestion[];
  disclaimer: string;
};

export type RiskBenchmarkLabel = "real_ai" | "fake_ai" | "borderline";

export type RiskBenchmarkMetric = {
  numerator: number;
  denominator: number;
  value: number | null;
  percent: string;
};

export type RiskBenchmarkDataset = {
  total: number;
  realAi: number;
  fakeAi: number;
  borderline: number;
  source: "local_benchmark";
  labels: Record<RiskBenchmarkLabel, number>;
};

export type RiskBenchmarkIssueBreakdown = {
  correct: number;
  falseNegative: number;
  falsePositive: number;
  severityMismatch: number;
  borderlineFalsePositive: number;
  missingExpectedSignal: number;
};

export type RiskBenchmarkDistribution = Record<string, number>;

export type RiskBenchmarkTopIssueSignal = {
  signal: string;
  category: string;
  severity: RiskSeverity;
  matchTerms: string[];
};

export type RiskBenchmarkTopIssueSample = {
  id: string;
  company: string;
  role: string;
  label: RiskBenchmarkLabel;
  actualDecision: RiskBenchmarkLabel;
  expectedRiskLevel: RiskLevel;
  actualRiskLevel: RiskLevel;
  qualityIssue: string;
  ruleVersion: string;
  totalWeight: number;
  scoreCap: number | null;
  expectedRiskSignalHitRate: number | null;
  signalCount: number;
  signals: RiskBenchmarkTopIssueSignal[];
};

export type RiskBenchmarkOverview = {
  dataset: RiskBenchmarkDataset;
  ruleVersion: string;
  ruleVersions: Record<string, number>;
  generatedAt: DateTimeString;
  metrics: {
    riskLevelAccuracy: RiskBenchmarkMetric;
    decisionAccuracy: RiskBenchmarkMetric;
    fakeAiRecall: RiskBenchmarkMetric;
    fakeAiPrecision: RiskBenchmarkMetric;
    realAiFalsePositiveRate: RiskBenchmarkMetric;
    borderlinePrecision: RiskBenchmarkMetric;
    borderlineReasonableHitRate: RiskBenchmarkMetric;
    expectedRiskSignalHitRate: RiskBenchmarkMetric;
  };
  issues: RiskBenchmarkIssueBreakdown;
  distributions: {
    expectedRiskLevels: RiskBenchmarkDistribution;
    actualRiskLevels: RiskBenchmarkDistribution;
    decisionConfusionMatrix: RiskBenchmarkDistribution;
  };
  topIssues: {
    missedFakeAi: RiskBenchmarkTopIssueSample[];
    falsePositiveRealAi: RiskBenchmarkTopIssueSample[];
    borderlineAnomalies: RiskBenchmarkTopIssueSample[];
  };
  warnings: string[];
  disclaimer: string;
};

export type EvaluationReportSection = {
  dimension: EvaluationDimension;
  title: string;
  score: number;
  summary: string;
  findings: string[];
  suggestions: string[];
};

export type EvaluationReport = {
  job: JobExtract;
  score: EvaluationScoreSummary;
  risks: RiskScanResult;
  sections: EvaluationReportSection[];
  recommendation: string;
  generatedAt: DateTimeString;
};

export type ResumeSkillLevel = "beginner" | "proficient" | "expert";

export type ResumeSkillCategory =
  | "framework"
  | "tool"
  | "domain"
  | "language"
  | "infrastructure"
  | "evaluation"
  | "other";

export type ResumeSkill = {
  name: string;
  category: ResumeSkillCategory;
  level?: ResumeSkillLevel;
  evidence?: string[];
};

export type ResumeProject = {
  name: string;
  role?: string;
  domain?: AiEcosystemDomain;
  techStack: string[];
  summary?: string;
  impact?: string;
};

export type ResumeExperience = {
  company: string;
  role: string;
  period?: string;
  domain?: AiEcosystemDomain;
  techStack: string[];
  highlights: string[];
};

export type ResumeEducation = {
  school: string;
  major?: string;
  degree?: string;
  period?: string;
};

export type ResumeContact = {
  email?: string;
  phone?: string;
  website?: string;
  location?: string;
};

export type ResumeContent = {
  name: string;
  yearsOfExperience?: number;
  currentRole?: string;
  summary?: string;
  contact?: ResumeContact;
  skills: ResumeSkill[];
  projects: ResumeProject[];
  experiences: ResumeExperience[];
  education: ResumeEducation[];
  rawText?: string;
};

export type ResumeProfile = {
  content: ResumeContent;
  skills: ResumeSkill[];
  ecosystem: AiEcosystemVector;
  ecosystemProfile?: AiEcosystemProfile;
};

export type SkillGapPriority = "matched" | "quick_fix" | "long_term";

export type SkillGap = {
  skill: string;
  priority: SkillGapPriority;
  evidence?: string;
  suggestion?: string;
};

export type ResumeMatchLevel =
  | "高度匹配"
  | "中度匹配"
  | "低度匹配"
  | "不匹配";

export type ResumeMatchedSkill = {
  skill: string;
  category?: ResumeSkillCategory;
  level?: ResumeSkillLevel;
  resumeEvidence?: string;
  jdEvidence?: string;
};

export type ResumeMatchResult = {
  directionMatch: number;
  skillCoverage: number;
  overallMatch: number;
  matchLevel: ResumeMatchLevel;
  matchedSkills: ResumeMatchedSkill[];
  quickGaps: SkillGap[];
  longTermGaps: SkillGap[];
  optimizationSuggestions: string[];
  gaps: SkillGap[];
  suggestions: string[];
};

export const RESUME_OPTIMIZATION_MODES = [
  "keyword_alignment",
  "star_rewrite",
  "quantify_impact",
  "ats_check",
  "full_tailor",
] as const;

export type ResumeOptimizationMode =
  (typeof RESUME_OPTIMIZATION_MODES)[number];

export const RESUME_OPTIMIZATION_EFFORTS = [
  "light",
  "standard",
  "deep",
] as const;

export type ResumeOptimizationEffort =
  (typeof RESUME_OPTIMIZATION_EFFORTS)[number];

export const OPTIMIZATION_FEEDBACK_DECISIONS = [
  "accepted",
  "rejected",
] as const;

export type OptimizationFeedbackDecision =
  (typeof OPTIMIZATION_FEEDBACK_DECISIONS)[number];

export type ResumeOptimizationSuggestion = {
  id: string;
  mode: ResumeOptimizationMode;
  title: string;
  targetSection: string;
  originalEvidence: string;
  jdEvidence?: string;
  recommendation: string;
  rewriteDraft?: string;
  copyText: string;
  rationale: string;
  safetyNote: string;
  tags: string[];
};

export type AtsCheckStatus = "pass" | "warning" | "fail";

export type AtsCheckItem = {
  id: string;
  title: string;
  status: AtsCheckStatus;
  detail: string;
  fix?: string;
};

export type AtsCheckResult = {
  score: number;
  summary: string;
  keywordCoverage: {
    covered: string[];
    missing: string[];
    coverageRate: number;
  };
  checks: AtsCheckItem[];
  suggestions: string[];
  generatedAt: DateTimeString;
};

export type ResumeOptimizationResult = {
  generatedAt: DateTimeString;
  mode: ResumeOptimizationMode;
  effort: ResumeOptimizationEffort;
  resume: {
    id: number;
    name: string;
    updatedAt: DateTimeString;
  };
  target: {
    reportId: number | null;
    company?: string;
    role?: string;
    jdPreview: string;
  };
  matchSummary: {
    directionMatch: number;
    skillCoverage: number;
    overallMatch: number;
    matchLevel: ResumeMatchLevel;
  };
  suggestions: ResumeOptimizationSuggestion[];
  atsCheck?: AtsCheckResult;
  guardrails: string[];
  provider: "local_fallback";
  fallbackUsed: true;
};

export type ThemePreference = "light" | "dark" | "system";

export const CAREER_PROFILE_WORK_MODES = [
  "remote",
  "hybrid",
  "onsite",
  "flexible",
] as const;

export type CareerProfileWorkMode =
  (typeof CAREER_PROFILE_WORK_MODES)[number];

export const CAREER_PROFILE_SUGGESTION_SOURCES = [
  "default_resume",
  "reports",
  "tracker",
] as const;

export type CareerProfileSuggestionSource =
  (typeof CAREER_PROFILE_SUGGESTION_SOURCES)[number];

export const CAREER_PROFILE_SUGGESTION_FIELDS = [
  "targetDirections",
  "targetRoles",
  "targetCities",
  "preferredWorkModes",
  "salaryExpectation",
  "strengths",
  "weaknesses",
  "dealBreakers",
  "preferredCompanyStages",
  "currentStrategy",
] as const;

export type CareerProfileSuggestionField =
  (typeof CAREER_PROFILE_SUGGESTION_FIELDS)[number];

export type CareerProfileSalaryExpectation = {
  minMonthlyK?: number;
  maxMonthlyK?: number;
  negotiable?: boolean;
};

export type CareerProfileStrength = {
  title: string;
  evidence?: string;
};

export type CareerProfileWeakness = {
  title: string;
  mitigation?: string;
};

export type CareerProfileSuggestion = {
  id: string;
  source: CareerProfileSuggestionSource;
  sourceLabel: string;
  title: string;
  detail: string;
  accepted: boolean;
  field?: CareerProfileSuggestionField;
  value?: JsonValue;
};

export type CareerProfileSettings = {
  targetDirections: ResumeDirection[];
  targetRoles: string[];
  targetCities: string[];
  preferredWorkModes: CareerProfileWorkMode[];
  salaryExpectation?: CareerProfileSalaryExpectation;
  strengths: CareerProfileStrength[];
  weaknesses: CareerProfileWeakness[];
  dealBreakers: string[];
  preferredCompanyStages: string[];
  currentStrategy?: string;
  generatedSuggestions?: CareerProfileSuggestion[];
  updatedAt: DateTimeString;
};

export type ProductGuideStatus = "completed" | "skipped";

export type ProductGuideSettings = {
  version: number;
  status: ProductGuideStatus;
  completedAt?: DateTimeString;
  skippedAt?: DateTimeString;
  lastViewedAt: DateTimeString;
};

export type SettingKey =
  | "profile"
  | "preferences"
  | "ui_preferences"
  | "notifications"
  | "notification_preferences"
  | "security"
  | "language"
  | "theme"
  | "model_provider"
  | "data_export"
  | "career_profile"
  | "product_guide";

export type ProfileSettings = {
  name?: string;
  role?: string;
  city?: string;
  bio?: string;
  targetIndustries?: string[];
  skills?: string[];
};

export type PreferenceSettings = {
  theme?: ThemePreference;
  language?: string;
};

export type NotificationSetting = {
  key: string;
  enabled: boolean;
};

export type NotificationPreferences = Record<string, boolean>;

export type AppSettings = {
  career_profile?: CareerProfileSettings;
  profile?: ProfileSettings;
  preferences?: PreferenceSettings;
  ui_preferences?: PreferenceSettings;
  notifications?: NotificationSetting[];
  notification_preferences?: NotificationPreferences;
  product_guide?: ProductGuideSettings;
};

export const ASSISTANT_CITATION_TYPES = [
  "report",
  "application",
  "resume",
  "analytics",
  "career_profile",
  "web",
] as const;

export type AssistantCitationType =
  (typeof ASSISTANT_CITATION_TYPES)[number];

export const ASSISTANT_ACTION_TYPES = [
  "update_application_status",
  "create_follow_up_event",
  "edit_career_profile",
  "confirm_agent_action_proposal",
] as const;

export type AssistantActionType = (typeof ASSISTANT_ACTION_TYPES)[number];

export const AGENT_ACTION_TYPES = [
  "propose_application_status_update",
  "propose_follow_up_event",
  "propose_career_profile_patch",
  "propose_resume_judge_feedback",
  "propose_interview_session_start",
] as const;

export type AgentActionType = (typeof AGENT_ACTION_TYPES)[number];

export const AGENT_ACTION_PROPOSAL_STATUSES = [
  "pending",
  "confirmed",
  "dismissed",
] as const;

export type AgentActionProposalStatus =
  (typeof AGENT_ACTION_PROPOSAL_STATUSES)[number];

export const AGENT_MEMORY_TYPES = [
  "working_digest",
  "episodic_summary",
  "user_preference",
] as const;

export type AgentMemoryType = (typeof AGENT_MEMORY_TYPES)[number];

export const AGENT_SESSION_MESSAGE_ROLES = ["assistant", "user"] as const;

export type AgentSessionMessageRole =
  (typeof AGENT_SESSION_MESSAGE_ROLES)[number];

export type AgentActionProposalCreateInput = {
  actionType: AgentActionType;
  title: string;
  reason: string;
  riskNote?: string;
  sourceAgentId?: string | null;
  sourceToolName?: string | null;
  payload: JsonObject;
};

export type AgentActionProposalListInput = {
  status?: AgentActionProposalStatus;
  limit?: number;
};

export type AgentActionProposal = {
  id: number;
  actionType: AgentActionType;
  status: AgentActionProposalStatus;
  title: string;
  reason: string;
  riskNote: string;
  sourceAgentId: string | null;
  sourceToolName: string | null;
  payload: JsonObject;
  result: JsonObject | null;
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
  confirmedAt: DateTimeString | null;
  dismissedAt: DateTimeString | null;
};

export type AgentSessionMessage = {
  id: string;
  role: AgentSessionMessageRole;
  content: string;
  citations?: AssistantCitation[];
  warnings?: string[];
  isError?: boolean;
  createdAt: DateTimeString;
};

export type AgentSession = {
  id: number;
  title: string;
  messages: AgentSessionMessage[];
  memoryDigest: string | null;
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
};

export type AgentSessionListItem = {
  id: number;
  title: string;
  messageCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: DateTimeString | null;
  memoryDigest: string | null;
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
};

export type AgentSessionCreateInput = {
  title?: string;
};

export type AgentSessionUpdateInput = {
  memoryDigest?: string | null;
  title?: string;
};

export type AgentMemoryItem = {
  id: number;
  sessionId: number | null;
  memoryType: AgentMemoryType;
  content: string;
  source: string;
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
  deletedAt: DateTimeString | null;
};

export type AgentMemoryListInput = {
  sessionId?: number;
  includeDeleted?: boolean;
  limit?: number;
};

export type AgentMemoryUpdateInput = {
  content?: string;
  source?: string;
};

export type AssistantRequestContext = {
  reportId?: number;
  applicationId?: number;
  resumeId?: number;
  sessionId?: number;
};

export type AssistantRequest = {
  message: string;
  context?: AssistantRequestContext;
};

export type AssistantCitation = {
  type: AssistantCitationType;
  id?: number | string;
  label: string;
};

export type AssistantAction = {
  id: string;
  type: AssistantActionType;
  label: string;
  requiresConfirmation: true;
  payload: JsonObject;
};

export type AssistantResponse = {
  answer: string;
  citations: AssistantCitation[];
  actions: AssistantAction[];
  warnings: string[];
  provider?: "deepseek_enhanced" | "local_fallback";
  fallbackUsed?: boolean;
  fallbackCode?: string | null;
  fallbackReason?: string | null;
  fallbackMessage?: string | null;
};

export const INTERVIEW_MODES = [
  "mixed",
  "technical",
  "product",
  "behavioral",
  "project",
] as const;

export type InterviewMode = (typeof INTERVIEW_MODES)[number];

export const INTERVIEW_QUESTION_TYPES = [
  "technical",
  "product",
  "behavioral",
  "project",
  "risk",
  "motivation",
] as const;

export type InterviewQuestionType = (typeof INTERVIEW_QUESTION_TYPES)[number];

export type InterviewAiProvider = "deepseek_enhanced" | "local_fallback";

export type InterviewQuestion = {
  id: string;
  type: InterviewQuestionType;
  question: string;
  focus: string;
  expectedSignals: string[];
  source?: "report" | "resume" | "career_profile" | "local_template" | "deepseek";
};

export type InterviewAnswerScore = {
  overall: number;
  structure: number;
  evidence: number;
  jdRelevance: number;
  aiAccuracy: number;
  riskHandling: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  provider: InterviewAiProvider;
};

export type InterviewSessionCreateInput = {
  reportId: number;
  resumeId?: number;
  title?: string;
  mode?: InterviewMode;
};

export type InterviewAnswerCreateInput = {
  questionId: string;
  answerText: string;
};

export type StoryCreateInput = {
  title: string;
  situation?: string;
  task?: string;
  action?: string;
  result?: string;
  tags?: string[];
};

export const APPLICATION_STATUSES = [
  "to_apply",
  "applied",
  "interviewing",
  "offer_received",
  "rejected",
  "abandoned",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_PRIORITIES = ["high", "medium", "low"] as const;

export type ApplicationPriority = (typeof APPLICATION_PRIORITIES)[number];

export const APPLICATION_EVENT_TYPES = [
  "created",
  "status_changed",
  "note_added",
  "follow_up_scheduled",
  "interview_scheduled",
  "offer_received",
  "rejected",
  "abandoned",
] as const;

export type ApplicationEventType = (typeof APPLICATION_EVENT_TYPES)[number];

export type ApplicationCreateInput = {
  reportId?: number;
  resumeId?: number;
  company: string;
  role: string;
  sourceUrl?: string;
  status?: ApplicationStatus;
  priority?: ApplicationPriority;
  channel?: string | null;
  scoreOverall?: number;
  riskLevel?: RiskLevel;
  recommendedResumeName?: string;
  notes?: string;
  tags?: string[];
  nextFollowUpAt?: string | null;
  appliedAt?: string | null;
  interviewAt?: string | null;
  offerAt?: string | null;
  rejectedAt?: string | null;
  abandonedAt?: string | null;
};

export type ApplicationStatusUpdateInput = {
  status: ApplicationStatus;
};

export type ApplicationUpdateInput = {
  status?: ApplicationStatus;
  priority?: ApplicationPriority;
  channel?: string | null;
  notes?: string;
  tags?: string[];
  sourceUrl?: string | null;
  nextFollowUpAt?: string | null;
  appliedAt?: string | null;
  interviewAt?: string | null;
  offerAt?: string | null;
  rejectedAt?: string | null;
  abandonedAt?: string | null;
};

export type ApplicationListInput = {
  q?: string;
  status?: ApplicationStatus;
  priority?: ApplicationPriority;
  channel?: string;
  limit?: number;
};

export type ApplicationEventCreateInput = {
  eventType: ApplicationEventType;
  title?: string;
  note?: string;
  happenedAt?: string;
};

export type ApplicationDistributionItem = {
  key: string;
  label: string;
  count: number;
};

export type ApplicationStatsDto = {
  evaluated: number;
  highMatch: number;
  toApply: number;
  applied: number;
  interviewing: number;
  offerReceived: number;
  rejected: number;
  abandoned: number;
  overdueFollowUps: number;
  priorityDistribution: ApplicationDistributionItem[];
  channelDistribution: ApplicationDistributionItem[];
  highMatchThreshold: number;
};

export type AnalyticsFunnelItem = {
  key: string;
  label: string;
  count: number;
};

export type AnalyticsDirectionItem = {
  direction: ResumeDirection;
  label: string;
  count: number;
  averageScore: number;
  highRiskCount: number;
  highRiskRate: number;
  linkedApplicationCount: number;
};

export type AnalyticsRiskSignalItem = {
  label: string;
  count: number;
  severity?: RiskSeverity;
  category?: string;
};

export type AnalyticsSkillGapPriority = "quick_fix" | "long_term";

export type AnalyticsSkillGapItem = {
  skill: string;
  count: number;
  priority: AnalyticsSkillGapPriority;
  evidence?: string;
};

export type AnalyticsTrackerStatusItem = {
  status: ApplicationStatus;
  label: string;
  count: number;
};

export type AnalyticsTrackerPriorityItem = {
  priority: ApplicationPriority;
  label: string;
  count: number;
};

export type AnalyticsTrackerChannelItem = {
  channel: string;
  count: number;
};

export type AnalyticsOverdueFollowUpItem = {
  id: number;
  company: string;
  role: string;
  status: ApplicationStatus;
  priority: ApplicationPriority;
  nextFollowUpAt: DateTimeString;
  daysOverdue: number;
};

export type AnalyticsTrackerOverview = {
  overdueFollowUps: number;
  overdueItems: AnalyticsOverdueFollowUpItem[];
  byStatus: AnalyticsTrackerStatusItem[];
  byPriority: AnalyticsTrackerPriorityItem[];
  byChannel: AnalyticsTrackerChannelItem[];
};

export type AnalyticsResumeEffect = {
  defaultResumeName: string | null;
  analyzedResumeName: string | null;
  linkedApplicationCount: number;
  directionAlignedCount: number;
  directionAlignmentRate: number | null;
  skillGapSource: "default_resume" | "latest_resume" | "none";
  summary: string;
};

export type AnalyticsCareerFit = {
  summary: string;
  matchedCount: number;
  warningCount: number;
  checkedCount: number;
  targetDirectionsMatched: number;
  targetCitiesMatched: number;
  workModesMatched: number;
  warnings: string[];
  profileConfigured: boolean;
};

export type AnalyticsSampleSize = {
  reports: number;
  resumes: number;
  applications: number;
  activeApplications: number;
  matchedReports: number;
};

export type AnalyticsOverviewDto = {
  generatedAt: DateTimeString;
  sampleSize: AnalyticsSampleSize;
  funnel: AnalyticsFunnelItem[];
  directions: AnalyticsDirectionItem[];
  riskSignals: AnalyticsRiskSignalItem[];
  skillGaps: AnalyticsSkillGapItem[];
  tracker: AnalyticsTrackerOverview;
  resumeEffect: AnalyticsResumeEffect;
  careerFit?: AnalyticsCareerFit;
  caveats: string[];
  highMatchThreshold: number;
};

export type ReportRow = {
  id: number;
  company: string;
  role: string;
  jd_text: string;
  score_json: string;
  risks_json: string;
  report_json: string;
  created_at: DateTimeString;
};

export type ResumeRow = {
  id: number;
  name: string;
  content_json: string;
  skills_json: string;
  ecosystem_json: string;
  direction: ResumeDirection | string;
  is_default: 0 | 1;
  archived_at: string | null;
  created_at: DateTimeString;
  updated_at: DateTimeString;
};

export type ResumeOptimizationRunRow = {
  id: number;
  resume_id: number;
  report_id: number | null;
  mode: ResumeOptimizationMode | string;
  result_json: string;
  created_at: DateTimeString;
};

export type OptimizationFeedbackRow = {
  id: number;
  run_id: number;
  suggestion_id: string;
  decision: OptimizationFeedbackDecision | string;
  reason: string;
  created_at: DateTimeString;
};

export type RiskFeedbackRow = {
  id: number;
  report_id: number | null;
  benchmark_jd_id: string | null;
  risk_rule_version: string;
  source_url: string | null;
  company: string;
  role: string;
  jd_excerpt: string;
  original_risk_level: RiskLevel | string;
  user_label: RiskFeedbackUserLabel | string;
  feedback_type: RiskFeedbackType | string;
  signal_id: string | null;
  signal_text: string | null;
  user_note: string;
  created_at: DateTimeString;
  updated_at: DateTimeString;
};

export type ApplicationRow = {
  id: number;
  report_id: number | null;
  resume_id: number | null;
  company: string;
  role: string;
  source_url: string | null;
  status: ApplicationStatus | string;
  priority: ApplicationPriority | string;
  channel: string | null;
  score_overall: number | null;
  risk_level: RiskLevel | string | null;
  recommended_resume_name: string | null;
  notes: string;
  tags_json: string;
  next_follow_up_at: string | null;
  applied_at: string | null;
  interview_at: string | null;
  offer_at: string | null;
  rejected_at: string | null;
  abandoned_at: string | null;
  created_at: DateTimeString;
  updated_at: DateTimeString;
};

export type ApplicationEventRow = {
  id: number;
  application_id: number;
  event_type: ApplicationEventType | string;
  title: string;
  note: string;
  happened_at: DateTimeString;
  created_at: DateTimeString;
};

export type AgentActionProposalRow = {
  id: number;
  action_type: AgentActionType | string;
  status: AgentActionProposalStatus | string;
  title: string;
  reason: string;
  risk_note: string;
  source_agent_id: string | null;
  source_tool_name: string | null;
  payload_json: string;
  result_json: string | null;
  created_at: DateTimeString;
  updated_at: DateTimeString;
  confirmed_at: DateTimeString | null;
  dismissed_at: DateTimeString | null;
};

export type AgentSessionRow = {
  id: number;
  title: string;
  messages_json: string;
  memory_digest: string | null;
  created_at: DateTimeString;
  updated_at: DateTimeString;
};

export type AgentMemoryItemRow = {
  id: number;
  session_id: number | null;
  memory_type: AgentMemoryType | string;
  content: string;
  source: string;
  created_at: DateTimeString;
  updated_at: DateTimeString;
  deleted_at: DateTimeString | null;
};

export type SettingRow = {
  id: number;
  key: SettingKey | string;
  value_json: string;
  updated_at: DateTimeString;
};

export type ReportDto = {
  id: number;
  company: string;
  role: string;
  jdText: string;
  score: EvaluationScoreSummary;
  risks: RiskSignal[];
  report: EvaluationReport;
  createdAt: DateTimeString;
};

export type ResumeDto = {
  id: number;
  name: string;
  content: ResumeContent;
  skills: ResumeSkill[];
  ecosystem: AiEcosystemVector;
  direction: ResumeDirection;
  isDefault: boolean;
  archivedAt: string | null;
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
};

export type OptimizationFeedbackDto = {
  id: number;
  runId: number;
  suggestionId: string;
  decision: OptimizationFeedbackDecision;
  reason: string;
  createdAt: DateTimeString;
};

export type RiskFeedbackCreateInput = {
  reportId?: number | null;
  benchmarkJdId?: string | null;
  riskRuleVersion?: string;
  sourceUrl?: string | null;
  company?: string;
  role?: string;
  jdExcerpt: string;
  originalRiskLevel: RiskLevel;
  userLabel: RiskFeedbackUserLabel;
  feedbackType: RiskFeedbackType;
  signalId?: string | null;
  signalText?: string | null;
  userNote?: string;
};

export type RiskFeedbackListInput = {
  benchmarkJdId?: string;
  feedbackType?: RiskFeedbackType;
  limit?: number;
  reportId?: number;
  riskRuleVersion?: string;
  userLabel?: RiskFeedbackUserLabel;
};

export type RiskFeedbackDto = {
  id: number;
  reportId: number | null;
  benchmarkJdId: string | null;
  riskRuleVersion: string;
  sourceUrl: string | null;
  company: string;
  role: string;
  jdExcerpt: string;
  originalRiskLevel: RiskLevel;
  userLabel: RiskFeedbackUserLabel;
  feedbackType: RiskFeedbackType;
  signalId: string | null;
  signalText: string | null;
  userNote: string;
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
};

export type ResumeOptimizationRunDto = {
  id: number;
  resumeId: number;
  reportId: number | null;
  mode: ResumeOptimizationMode;
  result: ResumeOptimizationResult;
  feedback: OptimizationFeedbackDto[];
  createdAt: DateTimeString;
};

export type ApplicationDto = {
  id: number;
  reportId: number | null;
  resumeId: number | null;
  company: string;
  role: string;
  sourceUrl: string | null;
  status: ApplicationStatus;
  priority: ApplicationPriority;
  channel: string | null;
  scoreOverall: number | null;
  riskLevel: RiskLevel | null;
  recommendedResumeName: string | null;
  notes: string;
  tags: string[];
  nextFollowUpAt: string | null;
  appliedAt: string | null;
  interviewAt: string | null;
  offerAt: string | null;
  rejectedAt: string | null;
  abandonedAt: string | null;
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
};

export type ApplicationEventDto = {
  id: number;
  applicationId: number;
  eventType: ApplicationEventType;
  title: string;
  note: string;
  happenedAt: DateTimeString;
  createdAt: DateTimeString;
};

export type InterviewSessionRow = {
  id: number;
  report_id: number | null;
  resume_id: number | null;
  title: string;
  mode: InterviewMode | string;
  questions_json: string;
  created_at: DateTimeString;
  updated_at: DateTimeString;
};

export type InterviewAnswerRow = {
  id: number;
  session_id: number;
  question_id: string;
  answer_text: string;
  score_json: string;
  created_at: DateTimeString;
};

export type StoryRow = {
  id: number;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  tags_json: string;
  created_at: DateTimeString;
  updated_at: DateTimeString;
};

export type InterviewSessionDto = {
  id: number;
  reportId: number | null;
  resumeId: number | null;
  title: string;
  mode: InterviewMode;
  questions: InterviewQuestion[];
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
};

export type InterviewAnswerDto = {
  id: number;
  sessionId: number;
  questionId: string;
  answerText: string;
  score: InterviewAnswerScore;
  createdAt: DateTimeString;
};

export type StoryDto = {
  id: number;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  tags: string[];
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
};

export type SettingDto<TValue = JsonValue> = {
  id: number;
  key: SettingKey;
  value: TValue;
  updatedAt: DateTimeString;
};
