import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import {
  agentMemoryItemSchema,
  agentMemoryListInputSchema,
  agentMemoryUpdateInputSchema,
  agentMemoryTypeSchema,
  agentSessionCreateInputSchema,
  agentSessionListItemSchema,
  agentSessionMessagesSchema,
  agentSessionSchema,
  agentSessionUpdateInputSchema,
  aiEcosystemVectorSchema,
  analyticsOverviewSchema,
  agentActionProposalCreateInputSchema,
  agentActionProposalListInputSchema,
  agentActionProposalSchema,
  agentActionProposalStatusSchema,
  agentActionTypeSchema,
  applicationCreateInputSchema,
  applicationEventCreateInputSchema,
  applicationEventTypeSchema,
  applicationPrioritySchema,
  applicationStatusSchema,
  applicationTagsSchema,
  applicationUpdateInputSchema,
  authEventCreateInputSchema,
  authOwnerCreateInputSchema,
  authSessionCreateInputSchema,
  careerProfileSettingsSchema,
  evaluationReportSchema,
  evaluationScoreSummarySchema,
  interviewAnswerCreateInputSchema,
  interviewAnswerScoreSchema,
  interviewModeSchema,
  interviewQuestionsSchema,
  interviewSessionCreateInputSchema,
  jsonObjectSchema,
  optimizationFeedbackCreateInputSchema,
  optimizationFeedbackDecisionSchema,
  reportCreateInputSchema,
  resumeContentSchema,
  resumeDirectionSchema,
  resumeOptimizationModeSchema,
  resumeOptimizationResultSchema,
  resumeOptimizationRunCreateInputSchema,
  resumeSaveInputSchema,
  resumeSkillSchema,
  riskFeedbackCreateInputSchema,
  riskFeedbackListInputSchema,
  riskFeedbackSchema,
  riskLevelSchema,
  riskSignalSchema,
  settingKeySchema,
  settingsUpsertInputSchema,
  storyCreateInputSchema,
  storyTagsSchema,
} from "./schemas";
import { hashPassword } from "./auth/password";
import {
  createSessionExpiresAt,
  generateSessionToken,
  hashSessionToken,
} from "./auth/session";
import type {
  AuthEventDto,
  AuthEventRow,
  AuthSessionCreatedDto,
  AuthSessionDto,
  AuthSessionRow,
  AuthSessionValidationDto,
  AuthUserDto,
  AuthUserPasswordRecord,
  AuthUserRow,
} from "./auth/types";
import {
  DATA_EXPORT_DEMO_DATA_PATH,
  DATA_EXPORT_PRODUCT,
  DATA_EXPORT_SQLITE_PATH,
  DATA_EXPORT_VERSION,
  type DataClearCategory,
  type DataClearResultDto,
  type DataExportDto,
} from "./data-export";
import {
  AI_DOMAIN_DIRECTIONS,
  RESUME_DIRECTION_LABELS,
  normalizeResumeDirection,
} from "./resume-directions";
import { matchResumeToJob } from "./resume-match";
import type {
  AnalyticsCareerFit,
  AnalyticsDirectionItem,
  AnalyticsOverviewDto,
  AnalyticsOverdueFollowUpItem,
  AnalyticsResumeEffect,
  AnalyticsRiskSignalItem,
  AnalyticsSkillGapItem,
  AnalyticsTrackerChannelItem,
  AnalyticsTrackerOverview,
  AnalyticsTrackerPriorityItem,
  AnalyticsTrackerStatusItem,
  AgentActionProposal,
  AgentActionProposalCreateInput,
  AgentActionProposalListInput,
  AgentMemoryItem,
  AgentMemoryItemRow,
  AgentMemoryListInput,
  AgentMemoryUpdateInput,
  AgentMemoryType,
  AgentSession,
  AgentSessionCreateInput,
  AgentSessionListItem,
  AgentSessionMessage,
  AgentSessionRow,
  AgentSessionUpdateInput,
  AgentActionProposalRow,
  AgentActionProposalStatus,
  ApplicationCreateInput,
  ApplicationDto,
  ApplicationEventCreateInput,
  ApplicationEventDto,
  ApplicationEventRow,
  ApplicationEventType,
  ApplicationListInput,
  ApplicationPriority,
  ApplicationRow,
  ApplicationStatsDto,
  ApplicationStatusUpdateInput,
  ApplicationStatus,
  ApplicationUpdateInput,
  CareerProfileSettings,
  InterviewAnswerCreateInput,
  InterviewAnswerDto,
  InterviewAnswerRow,
  InterviewAnswerScore,
  InterviewQuestion,
  InterviewSessionCreateInput,
  InterviewSessionDto,
  InterviewSessionRow,
  JsonObject,
  OptimizationFeedbackDto,
  OptimizationFeedbackRow,
  ReportDto,
  ReportRow,
  RiskFeedbackCreateInput,
  RiskFeedbackDto,
  RiskFeedbackListInput,
  RiskFeedbackRow,
  ResumeDirection,
  ResumeDto,
  ResumeOptimizationRunDto,
  ResumeOptimizationRunRow,
  ResumeProfile,
  ResumeRow,
  RiskSeverity,
  SettingDto,
  SettingKey,
  SettingRow,
  StoryCreateInput,
  StoryDto,
  StoryRow,
} from "./types";

const NEW_ERA_DB_PATH_ENV = "NEW_ERA_DB_PATH";

function resolveDbPath() {
  const configuredPath = process.env[NEW_ERA_DB_PATH_ENV]?.trim();

  if (!configuredPath) {
    return path.join(process.cwd(), "data", "new-era.db");
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), configuredPath);
}

const dbPath = resolveDbPath();
const dataDir = path.dirname(dbPath);
const idSchema = z.number().int().positive();
const listLimitSchema = z.number().int().positive().max(100).default(20);
const reportRisksSchema = z.array(riskSignalSchema).max(100);
const resumeSkillsSchema = z.array(resumeSkillSchema).max(200);
const settingsBatchSchema = z.array(settingsUpsertInputSchema).min(1).max(20);
const HIGH_MATCH_SCORE_THRESHOLD = 4;
const APPLICATION_STATUS_LABELS = {
  abandoned: "已放弃",
  applied: "已投递",
  interviewing: "面试中",
  offer_received: "已获 Offer",
  rejected: "未通过",
  to_apply: "待投递",
} as const;
const APPLICATION_PRIORITY_LABELS = {
  high: "高优先级",
  low: "低优先级",
  medium: "中优先级",
} as const;
const APPLICATION_STATUS_ORDER = [
  "to_apply",
  "applied",
  "interviewing",
  "offer_received",
  "rejected",
  "abandoned",
] as const satisfies ApplicationStatus[];
const APPLICATION_PRIORITY_ORDER = [
  "high",
  "medium",
  "low",
] as const satisfies ApplicationPriority[];
const TERMINAL_APPLICATION_STATUSES = new Set<ApplicationStatus>([
  "abandoned",
  "offer_received",
  "rejected",
]);
const APPLICATION_EVENT_DEFAULT_TITLES = {
  abandoned: "标记为已放弃",
  created: "加入投递清单",
  follow_up_scheduled: "安排跟进",
  interview_scheduled: "进入面试流程",
  note_added: "新增备注",
  offer_received: "收到 Offer",
  rejected: "标记为未通过",
  status_changed: "状态已更新",
} as const;

type ReportDeleteResult = {
  detachedReferences: {
    applications: number;
    interviewSessions: number;
    resumeOptimizationRuns: number;
  };
  report: ReportDto;
};

let db: Database.Database | undefined;

function configureDb(database: Database.Database) {
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  database.pragma("foreign_keys = ON");
}

function autoRunMigrations(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      jd_text TEXT NOT NULL,
      score_json TEXT NOT NULL DEFAULT '{}',
      risks_json TEXT NOT NULL DEFAULT '[]',
      report_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_reports_created
      ON reports(created_at DESC);

    CREATE TABLE IF NOT EXISTS resumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '未命名',
      content_json TEXT NOT NULL DEFAULT '{}',
      skills_json TEXT NOT NULL DEFAULT '[]',
      ecosystem_json TEXT NOT NULL DEFAULT '{}',
      direction TEXT NOT NULL DEFAULT 'general',
      is_default INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER,
      resume_id INTEGER,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      source_url TEXT,
      status TEXT NOT NULL DEFAULT 'to_apply',
      priority TEXT NOT NULL DEFAULT 'medium',
      channel TEXT,
      score_overall REAL,
      risk_level TEXT,
      recommended_resume_name TEXT,
      notes TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      next_follow_up_at TEXT,
      applied_at TEXT,
      interview_at TEXT,
      offer_at TEXT,
      rejected_at TEXT,
      abandoned_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(report_id) REFERENCES reports(id),
      FOREIGN KEY(resume_id) REFERENCES resumes(id)
    );

    CREATE INDEX IF NOT EXISTS idx_applications_updated
      ON applications(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_applications_report_id
      ON applications(report_id);

    CREATE TABLE IF NOT EXISTS application_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      happened_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(application_id) REFERENCES applications(id)
    );

    CREATE INDEX IF NOT EXISTS idx_application_events_application_id
      ON application_events(application_id, happened_at DESC);

    CREATE TABLE IF NOT EXISTS agent_action_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      title TEXT NOT NULL,
      reason TEXT NOT NULL,
      risk_note TEXT NOT NULL DEFAULT '',
      source_agent_id TEXT,
      source_tool_name TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_at TEXT,
      dismissed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_agent_action_proposals_status
      ON agent_action_proposals(status, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_agent_action_proposals_action_type
      ON agent_action_proposals(action_type);

    CREATE TABLE IF NOT EXISTS agent_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '新会话',
      messages_json TEXT NOT NULL DEFAULT '[]',
      memory_digest TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_agent_sessions_updated
      ON agent_sessions(updated_at DESC);

    CREATE TABLE IF NOT EXISTS agent_memory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      memory_type TEXT NOT NULL DEFAULT 'working_digest',
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'session_summary',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY(session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_memory_items_active
      ON agent_memory_items(deleted_at, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_agent_memory_items_session
      ON agent_memory_items(session_id, deleted_at, updated_at DESC);

    CREATE TABLE IF NOT EXISTS interview_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER,
      resume_id INTEGER,
      title TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'mixed',
      questions_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(report_id) REFERENCES reports(id),
      FOREIGN KEY(resume_id) REFERENCES resumes(id)
    );

    CREATE INDEX IF NOT EXISTS idx_interview_sessions_updated
      ON interview_sessions(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_interview_sessions_report_id
      ON interview_sessions(report_id);

    CREATE TABLE IF NOT EXISTS interview_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      question_id TEXT NOT NULL,
      answer_text TEXT NOT NULL,
      score_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(session_id) REFERENCES interview_sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_interview_answers_session_id
      ON interview_answers(session_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS resume_optimization_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resume_id INTEGER NOT NULL,
      report_id INTEGER,
      mode TEXT NOT NULL,
      result_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(resume_id) REFERENCES resumes(id),
      FOREIGN KEY(report_id) REFERENCES reports(id)
    );

    CREATE INDEX IF NOT EXISTS idx_resume_optimization_runs_resume_id
      ON resume_optimization_runs(resume_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_resume_optimization_runs_report_id
      ON resume_optimization_runs(report_id);

    CREATE TABLE IF NOT EXISTS optimization_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      suggestion_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(run_id) REFERENCES resume_optimization_runs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_optimization_feedback_run_id
      ON optimization_feedback(run_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS risk_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER,
      benchmark_jd_id TEXT,
      risk_rule_version TEXT NOT NULL DEFAULT '规则版本未知',
      source_url TEXT,
      company TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      jd_excerpt TEXT NOT NULL DEFAULT '',
      original_risk_level TEXT NOT NULL,
      user_label TEXT NOT NULL,
      feedback_type TEXT NOT NULL,
      signal_id TEXT,
      signal_text TEXT,
      user_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_risk_feedback_created
      ON risk_feedback(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_risk_feedback_report_id
      ON risk_feedback(report_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_risk_feedback_type
      ON risk_feedback(feedback_type, created_at DESC);

    CREATE TABLE IF NOT EXISTS stories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      situation TEXT NOT NULL DEFAULT '',
      task TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL DEFAULT '',
      result TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_stories_updated
      ON stories(updated_at DESC);

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      display_name TEXT NOT NULL DEFAULT 'New Era User',
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_params_json TEXT NOT NULL DEFAULT '{}',
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT,
      user_agent TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS auth_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      event_type TEXT NOT NULL,
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_owner
      ON users(role)
      WHERE role = 'owner';

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
      ON auth_sessions(user_id);

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires
      ON auth_sessions(expires_at);

    CREATE INDEX IF NOT EXISTS idx_auth_events_user_id
      ON auth_events(user_id);

    CREATE INDEX IF NOT EXISTS idx_auth_events_created
      ON auth_events(created_at DESC);
  `);

  ensureResumeColumns(database);
  ensureApplicationColumns(database);
  ensureInterviewColumns(database);
  ensureRiskFeedbackColumns(database);
  ensureAgentActionProposalColumns(database);
  ensureAgentSessionMemoryColumns(database);
  ensureAuthColumns(database);
  ensureApplicationEventBackfill(database);
  ensureSingleDefaultResume(database);
}

function ensureResumeColumns(database: Database.Database) {
  const columns = new Set(
    (
      database.pragma("table_info(resumes)") as Array<{
        name: string;
      }>
    ).map((column) => column.name),
  );
  const missingColumnMigrations = [
    {
      name: "direction",
      sql: "ALTER TABLE resumes ADD COLUMN direction TEXT NOT NULL DEFAULT 'general'",
    },
    {
      name: "is_default",
      sql: "ALTER TABLE resumes ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "archived_at",
      sql: "ALTER TABLE resumes ADD COLUMN archived_at TEXT",
    },
  ];

  for (const migration of missingColumnMigrations) {
    if (!columns.has(migration.name)) {
      database.exec(migration.sql);
      columns.add(migration.name);
    }
  }
}

function ensureApplicationColumns(database: Database.Database) {
  const columns = new Set(
    (
      database.pragma("table_info(applications)") as Array<{
        name: string;
      }>
    ).map((column) => column.name),
  );
  const missingColumnMigrations = [
    {
      name: "priority",
      sql: "ALTER TABLE applications ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'",
    },
    {
      name: "channel",
      sql: "ALTER TABLE applications ADD COLUMN channel TEXT",
    },
    {
      name: "next_follow_up_at",
      sql: "ALTER TABLE applications ADD COLUMN next_follow_up_at TEXT",
    },
    {
      name: "applied_at",
      sql: "ALTER TABLE applications ADD COLUMN applied_at TEXT",
    },
    {
      name: "interview_at",
      sql: "ALTER TABLE applications ADD COLUMN interview_at TEXT",
    },
    {
      name: "offer_at",
      sql: "ALTER TABLE applications ADD COLUMN offer_at TEXT",
    },
    {
      name: "rejected_at",
      sql: "ALTER TABLE applications ADD COLUMN rejected_at TEXT",
    },
    {
      name: "abandoned_at",
      sql: "ALTER TABLE applications ADD COLUMN abandoned_at TEXT",
    },
  ];

  for (const migration of missingColumnMigrations) {
    if (!columns.has(migration.name)) {
      database.exec(migration.sql);
      columns.add(migration.name);
    }
  }

  database.exec(`
    UPDATE applications
    SET priority = 'medium'
    WHERE priority IS NULL
      OR priority NOT IN ('high', 'medium', 'low');

    CREATE INDEX IF NOT EXISTS idx_applications_priority
      ON applications(priority);

    CREATE INDEX IF NOT EXISTS idx_applications_channel
      ON applications(channel);
  `);
}

function ensureInterviewColumns(database: Database.Database) {
  ensureTableColumns(database, "interview_sessions", [
    {
      name: "report_id",
      sql: "ALTER TABLE interview_sessions ADD COLUMN report_id INTEGER",
    },
    {
      name: "resume_id",
      sql: "ALTER TABLE interview_sessions ADD COLUMN resume_id INTEGER",
    },
    {
      name: "title",
      sql: "ALTER TABLE interview_sessions ADD COLUMN title TEXT NOT NULL DEFAULT '面试准备'",
    },
    {
      name: "mode",
      sql: "ALTER TABLE interview_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'mixed'",
    },
    {
      name: "questions_json",
      sql: "ALTER TABLE interview_sessions ADD COLUMN questions_json TEXT NOT NULL DEFAULT '[]'",
    },
    {
      name: "created_at",
      sql: "ALTER TABLE interview_sessions ADD COLUMN created_at TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "updated_at",
      sql: "ALTER TABLE interview_sessions ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
    },
  ]);
  ensureTableColumns(database, "interview_answers", [
    {
      name: "session_id",
      sql: "ALTER TABLE interview_answers ADD COLUMN session_id INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "question_id",
      sql: "ALTER TABLE interview_answers ADD COLUMN question_id TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "answer_text",
      sql: "ALTER TABLE interview_answers ADD COLUMN answer_text TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "score_json",
      sql: "ALTER TABLE interview_answers ADD COLUMN score_json TEXT NOT NULL DEFAULT '{}'",
    },
    {
      name: "created_at",
      sql: "ALTER TABLE interview_answers ADD COLUMN created_at TEXT NOT NULL DEFAULT ''",
    },
  ]);
  ensureTableColumns(database, "stories", [
    {
      name: "title",
      sql: "ALTER TABLE stories ADD COLUMN title TEXT NOT NULL DEFAULT '未命名故事'",
    },
    {
      name: "situation",
      sql: "ALTER TABLE stories ADD COLUMN situation TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "task",
      sql: "ALTER TABLE stories ADD COLUMN task TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "action",
      sql: "ALTER TABLE stories ADD COLUMN action TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "result",
      sql: "ALTER TABLE stories ADD COLUMN result TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "tags_json",
      sql: "ALTER TABLE stories ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'",
    },
    {
      name: "created_at",
      sql: "ALTER TABLE stories ADD COLUMN created_at TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "updated_at",
      sql: "ALTER TABLE stories ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
    },
  ]);

  database.exec(`
    UPDATE interview_sessions
    SET mode = 'mixed'
    WHERE mode IS NULL
      OR mode NOT IN ('mixed', 'technical', 'product', 'behavioral', 'project');

    UPDATE interview_sessions
    SET questions_json = '[]'
    WHERE questions_json IS NULL
      OR TRIM(questions_json) = ''
      OR json_valid(questions_json) = 0;

    UPDATE interview_sessions
    SET created_at = datetime('now')
    WHERE created_at IS NULL
      OR TRIM(created_at) = '';

    UPDATE interview_sessions
    SET updated_at = created_at
    WHERE updated_at IS NULL
      OR TRIM(updated_at) = '';

    UPDATE interview_answers
    SET score_json = '{}'
    WHERE score_json IS NULL
      OR TRIM(score_json) = ''
      OR json_valid(score_json) = 0;

    UPDATE interview_answers
    SET created_at = datetime('now')
    WHERE created_at IS NULL
      OR TRIM(created_at) = '';

    UPDATE stories
    SET tags_json = '[]'
    WHERE tags_json IS NULL
      OR TRIM(tags_json) = ''
      OR json_valid(tags_json) = 0;

    UPDATE stories
    SET created_at = datetime('now')
    WHERE created_at IS NULL
      OR TRIM(created_at) = '';

    UPDATE stories
    SET updated_at = created_at
    WHERE updated_at IS NULL
      OR TRIM(updated_at) = '';

    CREATE INDEX IF NOT EXISTS idx_interview_sessions_updated
      ON interview_sessions(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_interview_sessions_report_id
      ON interview_sessions(report_id);

    CREATE INDEX IF NOT EXISTS idx_interview_answers_session_id
      ON interview_answers(session_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_stories_updated
      ON stories(updated_at DESC);
  `);
}

function ensureRiskFeedbackColumns(database: Database.Database) {
  ensureTableColumns(database, "risk_feedback", [
    {
      name: "report_id",
      sql: "ALTER TABLE risk_feedback ADD COLUMN report_id INTEGER",
    },
    {
      name: "benchmark_jd_id",
      sql: "ALTER TABLE risk_feedback ADD COLUMN benchmark_jd_id TEXT",
    },
    {
      name: "risk_rule_version",
      sql: "ALTER TABLE risk_feedback ADD COLUMN risk_rule_version TEXT NOT NULL DEFAULT '规则版本未知'",
    },
    {
      name: "source_url",
      sql: "ALTER TABLE risk_feedback ADD COLUMN source_url TEXT",
    },
    {
      name: "company",
      sql: "ALTER TABLE risk_feedback ADD COLUMN company TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "role",
      sql: "ALTER TABLE risk_feedback ADD COLUMN role TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "jd_excerpt",
      sql: "ALTER TABLE risk_feedback ADD COLUMN jd_excerpt TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "original_risk_level",
      sql: "ALTER TABLE risk_feedback ADD COLUMN original_risk_level TEXT NOT NULL DEFAULT 'low'",
    },
    {
      name: "user_label",
      sql: "ALTER TABLE risk_feedback ADD COLUMN user_label TEXT NOT NULL DEFAULT 'unsure'",
    },
    {
      name: "feedback_type",
      sql: "ALTER TABLE risk_feedback ADD COLUMN feedback_type TEXT NOT NULL DEFAULT 'other'",
    },
    {
      name: "signal_id",
      sql: "ALTER TABLE risk_feedback ADD COLUMN signal_id TEXT",
    },
    {
      name: "signal_text",
      sql: "ALTER TABLE risk_feedback ADD COLUMN signal_text TEXT",
    },
    {
      name: "user_note",
      sql: "ALTER TABLE risk_feedback ADD COLUMN user_note TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "created_at",
      sql: "ALTER TABLE risk_feedback ADD COLUMN created_at TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "updated_at",
      sql: "ALTER TABLE risk_feedback ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
    },
  ]);

  database.exec(`
    UPDATE risk_feedback
    SET company = ''
    WHERE company IS NULL;

    UPDATE risk_feedback
    SET role = ''
    WHERE role IS NULL;

    UPDATE risk_feedback
    SET jd_excerpt = ''
    WHERE jd_excerpt IS NULL;

    UPDATE risk_feedback
    SET risk_rule_version = '规则版本未知'
    WHERE risk_rule_version IS NULL
      OR TRIM(risk_rule_version) = '';

    UPDATE risk_feedback
    SET original_risk_level = 'low'
    WHERE original_risk_level IS NULL
      OR TRIM(original_risk_level) = ''
      OR original_risk_level NOT IN ('critical', 'high', 'medium', 'low');

    UPDATE risk_feedback
    SET user_label = 'unsure'
    WHERE user_label IS NULL
      OR TRIM(user_label) = ''
      OR user_label NOT IN ('real_ai', 'fake_ai', 'borderline', 'unsure');

    UPDATE risk_feedback
    SET feedback_type = 'other'
    WHERE feedback_type IS NULL
      OR TRIM(feedback_type) = ''
      OR feedback_type NOT IN (
        'false_positive',
        'false_negative',
        'confirmed_risk',
        'wrong_severity',
        'missing_signal',
        'other'
      );

    UPDATE risk_feedback
    SET user_note = ''
    WHERE user_note IS NULL;

    UPDATE risk_feedback
    SET created_at = datetime('now')
    WHERE created_at IS NULL
      OR TRIM(created_at) = '';

    UPDATE risk_feedback
    SET updated_at = created_at
    WHERE updated_at IS NULL
      OR TRIM(updated_at) = '';

    CREATE INDEX IF NOT EXISTS idx_risk_feedback_created
      ON risk_feedback(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_risk_feedback_report_id
      ON risk_feedback(report_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_risk_feedback_type
      ON risk_feedback(feedback_type, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_risk_feedback_benchmark_jd_id
      ON risk_feedback(benchmark_jd_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_risk_feedback_rule_version
      ON risk_feedback(risk_rule_version, created_at DESC);
  `);
}

function ensureAgentActionProposalColumns(database: Database.Database) {
  ensureTableColumns(database, "agent_action_proposals", [
    {
      name: "action_type",
      sql: "ALTER TABLE agent_action_proposals ADD COLUMN action_type TEXT NOT NULL DEFAULT 'propose_follow_up_event'",
    },
    {
      name: "status",
      sql: "ALTER TABLE agent_action_proposals ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'",
    },
    {
      name: "title",
      sql: "ALTER TABLE agent_action_proposals ADD COLUMN title TEXT NOT NULL DEFAULT '待确认动作'",
    },
    {
      name: "reason",
      sql: "ALTER TABLE agent_action_proposals ADD COLUMN reason TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "risk_note",
      sql: "ALTER TABLE agent_action_proposals ADD COLUMN risk_note TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "source_agent_id",
      sql: "ALTER TABLE agent_action_proposals ADD COLUMN source_agent_id TEXT",
    },
    {
      name: "source_tool_name",
      sql: "ALTER TABLE agent_action_proposals ADD COLUMN source_tool_name TEXT",
    },
    {
      name: "payload_json",
      sql: "ALTER TABLE agent_action_proposals ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}'",
    },
    {
      name: "result_json",
      sql: "ALTER TABLE agent_action_proposals ADD COLUMN result_json TEXT",
    },
    {
      name: "created_at",
      sql: "ALTER TABLE agent_action_proposals ADD COLUMN created_at TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "updated_at",
      sql: "ALTER TABLE agent_action_proposals ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "confirmed_at",
      sql: "ALTER TABLE agent_action_proposals ADD COLUMN confirmed_at TEXT",
    },
    {
      name: "dismissed_at",
      sql: "ALTER TABLE agent_action_proposals ADD COLUMN dismissed_at TEXT",
    },
  ]);

  database.exec(`
    UPDATE agent_action_proposals
    SET status = 'pending'
    WHERE status IS NULL
      OR TRIM(status) = ''
      OR status NOT IN ('pending', 'confirmed', 'dismissed');

    UPDATE agent_action_proposals
    SET action_type = 'propose_follow_up_event'
    WHERE action_type IS NULL
      OR TRIM(action_type) = ''
      OR action_type NOT IN (
        'propose_application_status_update',
        'propose_follow_up_event',
        'propose_career_profile_patch',
        'propose_resume_judge_feedback',
        'propose_interview_session_start'
      );

    UPDATE agent_action_proposals
    SET payload_json = '{}'
    WHERE payload_json IS NULL
      OR TRIM(payload_json) = ''
      OR json_valid(payload_json) = 0;

    UPDATE agent_action_proposals
    SET result_json = NULL
    WHERE result_json IS NOT NULL
      AND (TRIM(result_json) = '' OR json_valid(result_json) = 0);

    UPDATE agent_action_proposals
    SET created_at = datetime('now')
    WHERE created_at IS NULL
      OR TRIM(created_at) = '';

    UPDATE agent_action_proposals
    SET updated_at = created_at
    WHERE updated_at IS NULL
      OR TRIM(updated_at) = '';

    CREATE INDEX IF NOT EXISTS idx_agent_action_proposals_status
      ON agent_action_proposals(status, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_agent_action_proposals_action_type
      ON agent_action_proposals(action_type);
  `);
}

function ensureAgentSessionMemoryColumns(database: Database.Database) {
  ensureTableColumns(database, "agent_sessions", [
    {
      name: "title",
      sql: "ALTER TABLE agent_sessions ADD COLUMN title TEXT NOT NULL DEFAULT '新会话'",
    },
    {
      name: "messages_json",
      sql: "ALTER TABLE agent_sessions ADD COLUMN messages_json TEXT NOT NULL DEFAULT '[]'",
    },
    {
      name: "memory_digest",
      sql: "ALTER TABLE agent_sessions ADD COLUMN memory_digest TEXT",
    },
    {
      name: "created_at",
      sql: "ALTER TABLE agent_sessions ADD COLUMN created_at TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "updated_at",
      sql: "ALTER TABLE agent_sessions ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
    },
  ]);
  ensureTableColumns(database, "agent_memory_items", [
    {
      name: "session_id",
      sql: "ALTER TABLE agent_memory_items ADD COLUMN session_id INTEGER",
    },
    {
      name: "memory_type",
      sql: "ALTER TABLE agent_memory_items ADD COLUMN memory_type TEXT NOT NULL DEFAULT 'working_digest'",
    },
    {
      name: "content",
      sql: "ALTER TABLE agent_memory_items ADD COLUMN content TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "source",
      sql: "ALTER TABLE agent_memory_items ADD COLUMN source TEXT NOT NULL DEFAULT 'session_summary'",
    },
    {
      name: "created_at",
      sql: "ALTER TABLE agent_memory_items ADD COLUMN created_at TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "updated_at",
      sql: "ALTER TABLE agent_memory_items ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "deleted_at",
      sql: "ALTER TABLE agent_memory_items ADD COLUMN deleted_at TEXT",
    },
  ]);

  database.exec(`
    UPDATE agent_sessions
    SET title = '新会话'
    WHERE title IS NULL
      OR TRIM(title) = '';

    UPDATE agent_sessions
    SET messages_json = '[]'
    WHERE messages_json IS NULL
      OR TRIM(messages_json) = ''
      OR json_valid(messages_json) = 0;

    UPDATE agent_sessions
    SET memory_digest = NULL
    WHERE memory_digest IS NOT NULL
      AND TRIM(memory_digest) = '';

    UPDATE agent_sessions
    SET created_at = datetime('now')
    WHERE created_at IS NULL
      OR TRIM(created_at) = '';

    UPDATE agent_sessions
    SET updated_at = created_at
    WHERE updated_at IS NULL
      OR TRIM(updated_at) = '';

    UPDATE agent_memory_items
    SET memory_type = 'working_digest'
    WHERE memory_type IS NULL
      OR TRIM(memory_type) = ''
      OR memory_type NOT IN ('working_digest', 'episodic_summary', 'user_preference');

    UPDATE agent_memory_items
    SET source = 'session_summary'
    WHERE source IS NULL
      OR TRIM(source) = '';

    UPDATE agent_memory_items
    SET created_at = datetime('now')
    WHERE created_at IS NULL
      OR TRIM(created_at) = '';

    UPDATE agent_memory_items
    SET updated_at = created_at
    WHERE updated_at IS NULL
      OR TRIM(updated_at) = '';

    CREATE INDEX IF NOT EXISTS idx_agent_sessions_updated
      ON agent_sessions(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_agent_memory_items_active
      ON agent_memory_items(deleted_at, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_agent_memory_items_session
      ON agent_memory_items(session_id, deleted_at, updated_at DESC);
  `);
}

function ensureAuthColumns(database: Database.Database) {
  ensureTableColumns(database, "users", [
    {
      name: "email",
      sql: "ALTER TABLE users ADD COLUMN email TEXT",
    },
    {
      name: "phone",
      sql: "ALTER TABLE users ADD COLUMN phone TEXT",
    },
    {
      name: "display_name",
      sql: "ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT 'New Era User'",
    },
    {
      name: "password_hash",
      sql: "ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "password_salt",
      sql: "ALTER TABLE users ADD COLUMN password_salt TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "password_params_json",
      sql: "ALTER TABLE users ADD COLUMN password_params_json TEXT NOT NULL DEFAULT '{}'",
    },
    {
      name: "role",
      sql: "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'owner'",
    },
    {
      name: "created_at",
      sql: "ALTER TABLE users ADD COLUMN created_at TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "updated_at",
      sql: "ALTER TABLE users ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "last_login_at",
      sql: "ALTER TABLE users ADD COLUMN last_login_at TEXT",
    },
  ]);
  ensureTableColumns(database, "auth_sessions", [
    {
      name: "user_id",
      sql: "ALTER TABLE auth_sessions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "token_hash",
      sql: "ALTER TABLE auth_sessions ADD COLUMN token_hash TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "expires_at",
      sql: "ALTER TABLE auth_sessions ADD COLUMN expires_at TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "created_at",
      sql: "ALTER TABLE auth_sessions ADD COLUMN created_at TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "last_seen_at",
      sql: "ALTER TABLE auth_sessions ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "revoked_at",
      sql: "ALTER TABLE auth_sessions ADD COLUMN revoked_at TEXT",
    },
    {
      name: "user_agent",
      sql: "ALTER TABLE auth_sessions ADD COLUMN user_agent TEXT",
    },
  ]);
  ensureTableColumns(database, "auth_events", [
    {
      name: "user_id",
      sql: "ALTER TABLE auth_events ADD COLUMN user_id INTEGER",
    },
    {
      name: "event_type",
      sql: "ALTER TABLE auth_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'owner_created'",
    },
    {
      name: "detail_json",
      sql: "ALTER TABLE auth_events ADD COLUMN detail_json TEXT NOT NULL DEFAULT '{}'",
    },
    {
      name: "created_at",
      sql: "ALTER TABLE auth_events ADD COLUMN created_at TEXT NOT NULL DEFAULT ''",
    },
  ]);

  database.exec(`
    UPDATE users
    SET display_name = 'New Era User'
    WHERE display_name IS NULL
      OR TRIM(display_name) = '';

    UPDATE users
    SET role = 'owner'
    WHERE role IS NULL
      OR TRIM(role) = '';

    UPDATE users
    SET created_at = datetime('now')
    WHERE created_at IS NULL
      OR TRIM(created_at) = '';

    UPDATE users
    SET updated_at = created_at
    WHERE updated_at IS NULL
      OR TRIM(updated_at) = '';

    UPDATE auth_sessions
    SET created_at = datetime('now')
    WHERE created_at IS NULL
      OR TRIM(created_at) = '';

    UPDATE auth_sessions
    SET last_seen_at = created_at
    WHERE last_seen_at IS NULL
      OR TRIM(last_seen_at) = '';

    UPDATE auth_events
    SET detail_json = '{}'
    WHERE detail_json IS NULL
      OR TRIM(detail_json) = ''
      OR json_valid(detail_json) = 0;

    UPDATE auth_events
    SET created_at = datetime('now')
    WHERE created_at IS NULL
      OR TRIM(created_at) = '';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
      ON users(email)
      WHERE email IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
      ON users(phone)
      WHERE phone IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_owner
      ON users(role)
      WHERE role = 'owner';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_sessions_token_hash
      ON auth_sessions(token_hash)
      WHERE token_hash <> '';

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
      ON auth_sessions(user_id);

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires
      ON auth_sessions(expires_at);

    CREATE INDEX IF NOT EXISTS idx_auth_events_user_id
      ON auth_events(user_id);

    CREATE INDEX IF NOT EXISTS idx_auth_events_created
      ON auth_events(created_at DESC);
  `);
}

function ensureTableColumns(
  database: Database.Database,
  tableName: string,
  migrations: Array<{ name: string; sql: string }>,
) {
  const columns = new Set(
    (
      database.pragma(`table_info(${tableName})`) as Array<{
        name: string;
      }>
    ).map((column) => column.name),
  );

  for (const migration of migrations) {
    if (!columns.has(migration.name)) {
      database.exec(migration.sql);
      columns.add(migration.name);
    }
  }
}

function ensureApplicationEventBackfill(database: Database.Database) {
  database.exec(`
    INSERT INTO application_events (
      application_id,
      event_type,
      title,
      note,
      happened_at,
      created_at
    )
    SELECT
      applications.id,
      'created',
      '加入投递清单',
      applications.company || ' · ' || applications.role,
      applications.created_at,
      applications.created_at
    FROM applications
    WHERE NOT EXISTS (
      SELECT 1
      FROM application_events
      WHERE application_events.application_id = applications.id
        AND application_events.event_type = 'created'
    );
  `);
}

function ensureSingleDefaultResume(database: Database.Database) {
  const migrateDefaults = database.transaction(() => {
    database.exec(`
      UPDATE resumes
      SET is_default = 0
      WHERE is_default = 1
        AND archived_at IS NOT NULL;

      UPDATE resumes
      SET is_default = 0
      WHERE is_default = 1
        AND id <> (
          SELECT id
          FROM resumes
          WHERE is_default = 1
          ORDER BY datetime(updated_at) DESC, id DESC
          LIMIT 1
        );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_resumes_single_default
        ON resumes(is_default)
        WHERE is_default = 1;
    `);
  });

  migrateDefaults();
}

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(dataDir, { recursive: true });
    db = new Database(dbPath);
    configureDb(db);
    autoRunMigrations(db);
  }

  return db;
}

function stringifyJson(value: unknown, context: string): string {
  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new Error(`Unable to serialize ${context} as JSON.`);
  }

  return serialized;
}

function parseJsonField<T>(
  raw: string,
  schema: z.ZodType<T>,
  context: string,
): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Unable to parse ${context}: invalid JSON.`, {
      cause: error,
    });
  }

  const result = schema.safeParse(parsed);

  if (!result.success) {
    throw new Error(`Unable to parse ${context}: ${result.error.message}`);
  }

  return result.data;
}

function normalizeRowId(rowId: number | bigint): number {
  const normalized = Number(rowId);

  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new Error("Database returned an invalid row id.");
  }

  return normalized;
}

function mapReportRow(row: ReportRow): ReportDto {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    jdText: row.jd_text,
    score: parseJsonField(
      row.score_json,
      evaluationScoreSummarySchema,
      `reports(${row.id}).score_json`,
    ),
    risks: parseJsonField(
      row.risks_json,
      reportRisksSchema,
      `reports(${row.id}).risks_json`,
    ),
    report: parseJsonField(
      row.report_json,
      evaluationReportSchema,
      `reports(${row.id}).report_json`,
    ),
    createdAt: row.created_at,
  };
}

function mapResumeRow(row: ResumeRow): ResumeDto {
  return {
    id: row.id,
    name: row.name,
    content: parseJsonField(
      row.content_json,
      resumeContentSchema,
      `resumes(${row.id}).content_json`,
    ),
    skills: parseJsonField(
      row.skills_json,
      resumeSkillsSchema,
      `resumes(${row.id}).skills_json`,
    ),
    ecosystem: parseJsonField(
      row.ecosystem_json,
      aiEcosystemVectorSchema,
      `resumes(${row.id}).ecosystem_json`,
    ),
    direction: resumeDirectionSchema.parse(row.direction),
    isDefault: row.is_default === 1,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOptimizationFeedbackRow(
  row: OptimizationFeedbackRow,
): OptimizationFeedbackDto {
  return {
    id: row.id,
    runId: row.run_id,
    suggestionId: row.suggestion_id,
    decision: optimizationFeedbackDecisionSchema.parse(row.decision),
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function mapRiskFeedbackRow(row: RiskFeedbackRow): RiskFeedbackDto {
  return riskFeedbackSchema.parse({
    benchmarkJdId: row.benchmark_jd_id,
    company: row.company,
    createdAt: row.created_at,
    feedbackType: row.feedback_type,
    id: row.id,
    jdExcerpt: row.jd_excerpt,
    originalRiskLevel: row.original_risk_level,
    reportId: row.report_id,
    riskRuleVersion: row.risk_rule_version,
    role: row.role,
    signalId: row.signal_id,
    signalText: row.signal_text,
    sourceUrl: row.source_url,
    updatedAt: row.updated_at,
    userLabel: row.user_label,
    userNote: row.user_note,
  });
}

function mapResumeOptimizationRunRow(
  row: ResumeOptimizationRunRow,
  feedback: OptimizationFeedbackDto[] = [],
): ResumeOptimizationRunDto {
  return {
    id: row.id,
    resumeId: row.resume_id,
    reportId: row.report_id,
    mode: resumeOptimizationModeSchema.parse(row.mode),
    result: parseJsonField(
      row.result_json,
      resumeOptimizationResultSchema,
      `resume_optimization_runs(${row.id}).result_json`,
    ),
    feedback,
    createdAt: row.created_at,
  };
}

function mapApplicationRow(row: ApplicationRow): ApplicationDto {
  return {
    id: row.id,
    reportId: row.report_id,
    resumeId: row.resume_id,
    company: row.company,
    role: row.role,
    sourceUrl: row.source_url,
    status: applicationStatusSchema.parse(row.status),
    priority: applicationPrioritySchema.parse(row.priority),
    channel: row.channel,
    scoreOverall: row.score_overall,
    riskLevel:
      row.risk_level === null ? null : riskLevelSchema.parse(row.risk_level),
    recommendedResumeName: row.recommended_resume_name,
    notes: row.notes,
    tags: parseJsonField(
      row.tags_json,
      applicationTagsSchema,
      `applications(${row.id}).tags_json`,
    ),
    nextFollowUpAt: row.next_follow_up_at,
    appliedAt: row.applied_at,
    interviewAt: row.interview_at,
    offerAt: row.offer_at,
    rejectedAt: row.rejected_at,
    abandonedAt: row.abandoned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapApplicationEventRow(row: ApplicationEventRow): ApplicationEventDto {
  return {
    id: row.id,
    applicationId: row.application_id,
    eventType: applicationEventTypeSchema.parse(row.event_type),
    title: row.title,
    note: row.note,
    happenedAt: row.happened_at,
    createdAt: row.created_at,
  };
}

function mapAgentActionProposalRow(
  row: AgentActionProposalRow,
): AgentActionProposal {
  return agentActionProposalSchema.parse({
    actionType: agentActionTypeSchema.parse(row.action_type),
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    dismissedAt: row.dismissed_at,
    id: row.id,
    payload: parseJsonField(
      row.payload_json,
      jsonObjectSchema,
      `agent_action_proposals(${row.id}).payload_json`,
    ),
    reason: row.reason,
    result:
      row.result_json === null
        ? null
        : parseJsonField(
            row.result_json,
            jsonObjectSchema,
            `agent_action_proposals(${row.id}).result_json`,
          ),
    riskNote: row.risk_note,
    sourceAgentId: row.source_agent_id,
    sourceToolName: row.source_tool_name,
    status: agentActionProposalStatusSchema.parse(row.status),
    title: row.title,
    updatedAt: row.updated_at,
  });
}

function mapAgentSessionRow(row: AgentSessionRow): AgentSession {
  return agentSessionSchema.parse({
    createdAt: row.created_at,
    id: row.id,
    memoryDigest: row.memory_digest,
    messages: parseJsonField(
      row.messages_json,
      agentSessionMessagesSchema,
      `agent_sessions(${row.id}).messages_json`,
    ),
    title: row.title,
    updatedAt: row.updated_at,
  });
}

function mapAgentMemoryItemRow(row: AgentMemoryItemRow): AgentMemoryItem {
  return agentMemoryItemSchema.parse({
    content: row.content,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    id: row.id,
    memoryType: agentMemoryTypeSchema.parse(row.memory_type),
    sessionId: row.session_id,
    source: row.source,
    updatedAt: row.updated_at,
  });
}

function mapAgentSessionListItem(session: AgentSession): AgentSessionListItem {
  const lastMessage = session.messages.at(-1) ?? null;

  return agentSessionListItemSchema.parse({
    createdAt: session.createdAt,
    id: session.id,
    lastMessageAt: lastMessage?.createdAt ?? null,
    lastMessagePreview: lastMessage
      ? truncateText(oneLine(lastMessage.content), 240)
      : null,
    memoryDigest: session.memoryDigest,
    messageCount: session.messages.length,
    title: session.title,
    updatedAt: session.updatedAt,
  });
}

function mapInterviewSessionRow(row: InterviewSessionRow): InterviewSessionDto {
  return {
    id: row.id,
    reportId: row.report_id,
    resumeId: row.resume_id,
    title: row.title,
    mode: interviewModeSchema.parse(row.mode),
    questions: parseJsonField(
      row.questions_json,
      interviewQuestionsSchema,
      `interview_sessions(${row.id}).questions_json`,
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInterviewAnswerRow(row: InterviewAnswerRow): InterviewAnswerDto {
  return {
    id: row.id,
    sessionId: row.session_id,
    questionId: row.question_id,
    answerText: row.answer_text,
    score: parseJsonField(
      row.score_json,
      interviewAnswerScoreSchema,
      `interview_answers(${row.id}).score_json`,
    ),
    createdAt: row.created_at,
  };
}

function mapStoryRow(row: StoryRow): StoryDto {
  return {
    id: row.id,
    title: row.title,
    situation: row.situation,
    task: row.task,
    action: row.action,
    result: row.result,
    tags: parseJsonField(
      row.tags_json,
      storyTagsSchema,
      `stories(${row.id}).tags_json`,
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSettingRow(row: SettingRow): SettingDto {
  const value = parseJsonField(
    row.value_json,
    z.unknown(),
    `settings(${row.key}).value_json`,
  );
  const parsed = settingsUpsertInputSchema.parse({
    key: row.key,
    value,
  });

  return {
    id: row.id,
    key: parsed.key,
    value: parsed.value,
    updatedAt: row.updated_at,
  };
}

function mapAuthUserRow(row: AuthUserRow): AuthUserDto {
  if (row.role !== "owner") {
    throw new Error(`Unsupported auth role: ${row.role}`);
  }

  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

function mapAuthUserPasswordRecord(
  row: AuthUserRow,
): AuthUserPasswordRecord {
  return {
    ...mapAuthUserRow(row),
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    passwordParamsJson: row.password_params_json,
  };
}

function mapAuthSessionRow(row: AuthSessionRow): AuthSessionDto {
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    userAgent: row.user_agent,
  };
}

function mapAuthEventRow(row: AuthEventRow): AuthEventDto {
  const detail = parseJsonField(
    row.detail_json,
    jsonObjectSchema,
    `auth_events(${row.id}).detail_json`,
  );
  const event = authEventCreateInputSchema.parse({
    detail,
    eventType: row.event_type,
    userId: row.user_id,
  });

  return {
    id: row.id,
    userId: row.user_id,
    eventType: event.eventType,
    detail: event.detail,
    createdAt: row.created_at,
  };
}

function getReportRowById(id: number): ReportRow | null {
  return (
    getDb()
      .prepare<[number], ReportRow>(
        `
        SELECT id, company, role, jd_text, score_json, risks_json, report_json, created_at
        FROM reports
        WHERE id = ?
      `,
      )
      .get(id) ?? null
  );
}

function getResumeRowById(id: number): ResumeRow | null {
  return (
    getDb()
      .prepare<[number], ResumeRow>(
        `
        SELECT id, name, content_json, skills_json, ecosystem_json, direction, is_default, archived_at, created_at, updated_at
        FROM resumes
        WHERE id = ?
      `,
      )
      .get(id) ?? null
  );
}

function getResumeOptimizationRunRowById(
  id: number,
): ResumeOptimizationRunRow | null {
  return (
    getDb()
      .prepare<[number], ResumeOptimizationRunRow>(
        `
        SELECT id, resume_id, report_id, mode, result_json, created_at
        FROM resume_optimization_runs
        WHERE id = ?
      `,
      )
      .get(id) ?? null
  );
}

function listOptimizationFeedbackRowsByRunId(
  runId: number,
): OptimizationFeedbackRow[] {
  return getDb()
    .prepare<[number], OptimizationFeedbackRow>(
      `
      SELECT id, run_id, suggestion_id, decision, reason, created_at
      FROM optimization_feedback
      WHERE run_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
    `,
    )
    .all(runId);
}

function getRiskFeedbackRowById(id: number): RiskFeedbackRow | null {
  return (
    getDb()
      .prepare<[number], RiskFeedbackRow>(
        `
        SELECT
          id,
          report_id,
          benchmark_jd_id,
          risk_rule_version,
          source_url,
          company,
          role,
          jd_excerpt,
          original_risk_level,
          user_label,
          feedback_type,
          signal_id,
          signal_text,
          user_note,
          created_at,
          updated_at
        FROM risk_feedback
        WHERE id = ?
      `,
      )
      .get(id) ?? null
  );
}

function getApplicationRowById(id: number): ApplicationRow | null {
  return (
    getDb()
      .prepare<[number], ApplicationRow>(
        `
        SELECT
          id,
          report_id,
          resume_id,
          company,
          role,
          source_url,
          status,
          priority,
          channel,
          score_overall,
          risk_level,
          recommended_resume_name,
          notes,
          tags_json,
          next_follow_up_at,
          applied_at,
          interview_at,
          offer_at,
          rejected_at,
          abandoned_at,
          created_at,
          updated_at
        FROM applications
        WHERE id = ?
      `,
      )
      .get(id) ?? null
  );
}

function getApplicationRowByReportId(reportId: number): ApplicationRow | null {
  return (
    getDb()
      .prepare<[number], ApplicationRow>(
        `
        SELECT
          id,
          report_id,
          resume_id,
          company,
          role,
          source_url,
          status,
          priority,
          channel,
          score_overall,
          risk_level,
          recommended_resume_name,
          notes,
          tags_json,
          next_follow_up_at,
          applied_at,
          interview_at,
          offer_at,
          rejected_at,
          abandoned_at,
          created_at,
          updated_at
        FROM applications
        WHERE report_id = ?
        ORDER BY id ASC
        LIMIT 1
      `,
      )
      .get(reportId) ?? null
  );
}

function getAgentActionProposalRowById(
  id: number,
): AgentActionProposalRow | null {
  return (
    getDb()
      .prepare<[number], AgentActionProposalRow>(
        `
        SELECT
          id,
          action_type,
          status,
          title,
          reason,
          risk_note,
          source_agent_id,
          source_tool_name,
          payload_json,
          result_json,
          created_at,
          updated_at,
          confirmed_at,
          dismissed_at
        FROM agent_action_proposals
        WHERE id = ?
      `,
      )
      .get(id) ?? null
  );
}

function getAgentSessionRowById(id: number): AgentSessionRow | null {
  return (
    getDb()
      .prepare<[number], AgentSessionRow>(
        `
        SELECT id, title, messages_json, memory_digest, created_at, updated_at
        FROM agent_sessions
        WHERE id = ?
      `,
      )
      .get(id) ?? null
  );
}

function getAgentMemoryItemRowById(id: number): AgentMemoryItemRow | null {
  return (
    getDb()
      .prepare<[number], AgentMemoryItemRow>(
        `
        SELECT
          id,
          session_id,
          memory_type,
          content,
          source,
          created_at,
          updated_at,
          deleted_at
        FROM agent_memory_items
        WHERE id = ?
      `,
      )
      .get(id) ?? null
  );
}

function getInterviewSessionRowById(id: number): InterviewSessionRow | null {
  return (
    getDb()
      .prepare<[number], InterviewSessionRow>(
        `
        SELECT id, report_id, resume_id, title, mode, questions_json, created_at, updated_at
        FROM interview_sessions
        WHERE id = ?
      `,
      )
      .get(id) ?? null
  );
}

function getInterviewAnswerRowById(id: number): InterviewAnswerRow | null {
  return (
    getDb()
      .prepare<[number], InterviewAnswerRow>(
        `
        SELECT id, session_id, question_id, answer_text, score_json, created_at
        FROM interview_answers
        WHERE id = ?
      `,
      )
      .get(id) ?? null
  );
}

function getStoryRowById(id: number): StoryRow | null {
  return (
    getDb()
      .prepare<[number], StoryRow>(
        `
        SELECT id, title, situation, task, action, result, tags_json, created_at, updated_at
        FROM stories
        WHERE id = ?
      `,
      )
      .get(id) ?? null
  );
}

function getSettingRowByKey(key: SettingKey): SettingRow | null {
  return (
    getDb()
      .prepare<[SettingKey], SettingRow>(
        `
        SELECT id, key, value_json, updated_at
        FROM settings
        WHERE key = ?
      `,
      )
      .get(key) ?? null
  );
}

function getAuthUserRowById(
  database: Database.Database,
  id: number,
): AuthUserRow | null {
  return (
    database
      .prepare<[number], AuthUserRow>(
        `
        SELECT id, email, phone, display_name, password_hash, password_salt, password_params_json, role, created_at, updated_at, last_login_at
        FROM users
        WHERE id = ?
      `,
      )
      .get(id) ?? null
  );
}

function getOwnerUserRow(database: Database.Database): AuthUserRow | null {
  return (
    database
      .prepare<[], AuthUserRow>(
        `
        SELECT id, email, phone, display_name, password_hash, password_salt, password_params_json, role, created_at, updated_at, last_login_at
        FROM users
        WHERE role = 'owner'
        ORDER BY id ASC
        LIMIT 1
      `,
      )
      .get() ?? null
  );
}

function getOwnerUserRowByIdentifier(
  database: Database.Database,
  identifier: string,
): AuthUserRow | null {
  const trimmed = identifier.trim();

  if (!trimmed) {
    return null;
  }

  return (
    database
      .prepare<[string, string], AuthUserRow>(
        `
        SELECT id, email, phone, display_name, password_hash, password_salt, password_params_json, role, created_at, updated_at, last_login_at
        FROM users
        WHERE role = 'owner'
          AND (
            lower(email) = ?
            OR phone = ?
          )
        ORDER BY id ASC
        LIMIT 1
      `,
      )
      .get(trimmed.toLowerCase(), trimmed) ?? null
  );
}

function getAuthSessionRowById(
  database: Database.Database,
  id: number,
): AuthSessionRow | null {
  return (
    database
      .prepare<[number], AuthSessionRow>(
        `
        SELECT id, user_id, token_hash, expires_at, created_at, last_seen_at, revoked_at, user_agent
        FROM auth_sessions
        WHERE id = ?
      `,
      )
      .get(id) ?? null
  );
}

function getAuthSessionRowByTokenHash(
  database: Database.Database,
  tokenHash: string,
): AuthSessionRow | null {
  return (
    database
      .prepare<[string], AuthSessionRow>(
        `
        SELECT id, user_id, token_hash, expires_at, created_at, last_seen_at, revoked_at, user_agent
        FROM auth_sessions
        WHERE token_hash = ?
      `,
      )
      .get(tokenHash) ?? null
  );
}

function getActiveAuthSessionRowByTokenHash(
  database: Database.Database,
  tokenHash: string,
): AuthSessionRow | null {
  return (
    database
      .prepare<[string], AuthSessionRow>(
        `
        SELECT id, user_id, token_hash, expires_at, created_at, last_seen_at, revoked_at, user_agent
        FROM auth_sessions
        WHERE token_hash = ?
          AND revoked_at IS NULL
          AND datetime(expires_at) > datetime('now')
      `,
      )
      .get(tokenHash) ?? null
  );
}

function getAuthEventRowById(
  database: Database.Database,
  id: number,
): AuthEventRow | null {
  return (
    database
      .prepare<[number], AuthEventRow>(
        `
        SELECT id, user_id, event_type, detail_json, created_at
        FROM auth_events
        WHERE id = ?
      `,
      )
      .get(id) ?? null
  );
}

export class OwnerUserAlreadyExistsError extends Error {
  constructor() {
    super("Local owner user already exists.");
    this.name = "OwnerUserAlreadyExistsError";
  }
}

export class AuthUserNotFoundError extends Error {
  constructor(id: number) {
    super(`Auth user ${id} was not found.`);
    this.name = "AuthUserNotFoundError";
  }
}

export function createOwnerUser(
  input: z.input<typeof authOwnerCreateInputSchema>,
): AuthUserDto {
  const owner = authOwnerCreateInputSchema.parse(input);
  const database = getDb();
  const createOwner = database.transaction(
    (ownerInput: typeof owner): AuthUserDto => {
      if (getOwnerUserRow(database)) {
        throw new OwnerUserAlreadyExistsError();
      }

      const password = hashPassword(ownerInput.password);
      const result = database
        .prepare<[string | null, string | null, string, string, string, string]>(
          `
          INSERT INTO users (
            email,
            phone,
            display_name,
            password_hash,
            password_salt,
            password_params_json,
            role,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, 'owner', datetime('now'))
        `,
        )
        .run(
          ownerInput.email ?? null,
          ownerInput.phone ?? null,
          ownerInput.displayName ?? "New Era User",
          password.passwordHash,
          password.passwordSalt,
          password.passwordParamsJson,
        );
      const id = normalizeRowId(result.lastInsertRowid);
      const created = getAuthUserRowById(database, id);

      if (!created) {
        throw new Error(`Auth user ${id} was inserted but could not be read.`);
      }

      insertAuthEventRecord(database, {
        detail: {
          hasEmail: ownerInput.email !== undefined,
          hasPhone: ownerInput.phone !== undefined,
        },
        eventType: "owner_created",
        userId: id,
      });

      return mapAuthUserRow(created);
    },
  );

  return createOwner(owner);
}

export function getOwnerUser(): AuthUserDto | null {
  const row = getOwnerUserRow(getDb());

  return row ? mapAuthUserRow(row) : null;
}

export function getOwnerUserPasswordRecord(
  identifier?: string,
): AuthUserPasswordRecord | null {
  const database = getDb();
  const row =
    identifier === undefined
      ? getOwnerUserRow(database)
      : getOwnerUserRowByIdentifier(database, identifier);

  return row ? mapAuthUserPasswordRecord(row) : null;
}

export function getAuthUserPasswordRecordById(
  userId: number,
): AuthUserPasswordRecord | null {
  const parsedUserId = idSchema.parse(userId);
  const row = getAuthUserRowById(getDb(), parsedUserId);

  return row ? mapAuthUserPasswordRecord(row) : null;
}

export function updateAuthUserPassword({
  currentSessionId,
  nextPassword,
  userId,
}: {
  currentSessionId: number;
  nextPassword: string;
  userId: number;
}): {
  revokedSessions: number;
  user: AuthUserDto;
} {
  const parsedUserId = idSchema.parse(userId);
  const parsedSessionId = idSchema.parse(currentSessionId);
  const password = hashPassword(nextPassword);
  const database = getDb();
  const updatePassword = database.transaction(() => {
    const existing = getAuthUserRowById(database, parsedUserId);

    if (!existing) {
      throw new AuthUserNotFoundError(parsedUserId);
    }

    database
      .prepare<[string, string, string, number]>(
        `
        UPDATE users
        SET password_hash = ?,
            password_salt = ?,
            password_params_json = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `,
      )
      .run(
        password.passwordHash,
        password.passwordSalt,
        password.passwordParamsJson,
        parsedUserId,
      );

    const revokeResult = database
      .prepare<[number, number]>(
        `
        UPDATE auth_sessions
        SET revoked_at = datetime('now'),
            last_seen_at = datetime('now')
        WHERE user_id = ?
          AND id <> ?
          AND revoked_at IS NULL
          AND datetime(expires_at) > datetime('now')
      `,
      )
      .run(parsedUserId, parsedSessionId);
    const updated = getAuthUserRowById(database, parsedUserId);

    if (!updated) {
      throw new Error(`Auth user ${parsedUserId} was updated but could not be read.`);
    }

    insertAuthEventRecord(database, {
      detail: {
        keptSessionId: parsedSessionId,
        revokedOtherSessions: revokeResult.changes,
      },
      eventType: "password_changed",
      userId: parsedUserId,
    });

    return {
      revokedSessions: revokeResult.changes,
      user: mapAuthUserRow(updated),
    };
  });

  return updatePassword();
}

export function createAuthSession(
  input: z.input<typeof authSessionCreateInputSchema>,
): AuthSessionCreatedDto {
  const sessionInput = authSessionCreateInputSchema.parse(input);
  const database = getDb();
  const createSession = database.transaction(
    (data: typeof sessionInput): AuthSessionCreatedDto => {
      const user = getAuthUserRowById(database, data.userId);

      if (!user) {
        throw new AuthUserNotFoundError(data.userId);
      }

      const token = generateSessionToken();
      const tokenHash = hashSessionToken(token);
      const expiresAt = data.expiresAt ?? createSessionExpiresAt();
      const result = database
        .prepare<[number, string, string, string | null]>(
          `
          INSERT INTO auth_sessions (
            user_id,
            token_hash,
            expires_at,
            user_agent
          )
          VALUES (?, ?, ?, ?)
        `,
        )
        .run(data.userId, tokenHash, expiresAt, data.userAgent ?? null);
      const sessionId = normalizeRowId(result.lastInsertRowid);

      database
        .prepare<[number]>(
          `
          UPDATE users
          SET last_login_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `,
        )
        .run(data.userId);

      const created = getAuthSessionRowById(database, sessionId);

      if (!created) {
        throw new Error(`Auth session ${sessionId} was inserted but could not be read.`);
      }

      insertAuthEventRecord(database, {
        detail: {
          expiresAt,
          sessionId,
        },
        eventType: "session_created",
        userId: data.userId,
      });

      return {
        token,
        session: mapAuthSessionRow(created),
      };
    },
  );

  return createSession(sessionInput);
}

export function validateAuthSession(
  token: string,
): AuthSessionValidationDto | null {
  const tokenHash = hashSessionToken(token);
  const database = getDb();
  const validateSession = database.transaction(
    (sessionTokenHash: string): AuthSessionValidationDto | null => {
      const session = getActiveAuthSessionRowByTokenHash(
        database,
        sessionTokenHash,
      );

      if (!session) {
        return null;
      }

      database
        .prepare<[number]>(
          `
          UPDATE auth_sessions
          SET last_seen_at = datetime('now')
          WHERE id = ?
        `,
        )
        .run(session.id);

      const updatedSession = getAuthSessionRowById(database, session.id);
      const user = getAuthUserRowById(database, session.user_id);

      if (!updatedSession || !user) {
        return null;
      }

      return {
        session: mapAuthSessionRow(updatedSession),
        user: mapAuthUserRow(user),
      };
    },
  );

  return validateSession(tokenHash);
}

export function revokeAuthSession(token: string): boolean {
  const tokenHash = hashSessionToken(token);
  const database = getDb();
  const revokeSession = database.transaction((sessionTokenHash: string) => {
    const session = getAuthSessionRowByTokenHash(database, sessionTokenHash);

    if (!session || session.revoked_at !== null) {
      return false;
    }

    const result = database
      .prepare<[string]>(
        `
        UPDATE auth_sessions
        SET revoked_at = datetime('now'),
            last_seen_at = datetime('now')
        WHERE token_hash = ?
          AND revoked_at IS NULL
      `,
      )
      .run(sessionTokenHash);

    if (result.changes > 0) {
      insertAuthEventRecord(database, {
        detail: {
          sessionId: session.id,
        },
        eventType: "session_revoked",
        userId: session.user_id,
      });
    }

    return result.changes > 0;
  });

  return revokeSession(tokenHash);
}

export function recordAuthEvent(
  input: z.input<typeof authEventCreateInputSchema>,
): AuthEventDto {
  return insertAuthEventRecord(getDb(), input);
}

function insertAuthEventRecord(
  database: Database.Database,
  input: z.input<typeof authEventCreateInputSchema>,
): AuthEventDto {
  const event = authEventCreateInputSchema.parse(input);
  const result = database
    .prepare<[number | null, string, string]>(
      `
      INSERT INTO auth_events (
        user_id,
        event_type,
        detail_json
      )
      VALUES (?, ?, ?)
    `,
    )
    .run(
      event.userId ?? null,
      event.eventType,
      stringifyJson(event.detail, `auth event ${event.eventType}`),
    );
  const eventId = normalizeRowId(result.lastInsertRowid);
  const row = getAuthEventRowById(database, eventId);

  if (!row) {
    throw new Error(`Auth event ${eventId} was inserted but could not be read.`);
  }

  return mapAuthEventRow(row);
}

export function createReport(
  input: z.input<typeof reportCreateInputSchema>,
): ReportDto {
  const report = reportCreateInputSchema.parse(input);
  const result = getDb()
    .prepare<[string, string, string, string, string, string]>(
      `
      INSERT INTO reports (company, role, jd_text, score_json, risks_json, report_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      report.company,
      report.role,
      report.jdText,
      stringifyJson(report.score, "report score"),
      stringifyJson(report.risks, "report risks"),
      stringifyJson(report.report, "report payload"),
    );
  const id = normalizeRowId(result.lastInsertRowid);
  const created = getReportRowById(id);

  if (!created) {
    throw new Error(`Report ${id} was inserted but could not be read.`);
  }

  return mapReportRow(created);
}

export function getReportById(id: number): ReportDto | null {
  const parsedId = idSchema.parse(id);
  const row = getReportRowById(parsedId);

  return row ? mapReportRow(row) : null;
}

export function listReports(limit?: number): ReportDto[] {
  const parsedLimit = listLimitSchema.parse(limit);

  return getDb()
    .prepare<[number], ReportRow>(
      `
      SELECT id, company, role, jd_text, score_json, risks_json, report_json, created_at
      FROM reports
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ?
    `,
    )
    .all(parsedLimit)
    .map(mapReportRow);
}

export function createRiskFeedback(
  input: RiskFeedbackCreateInput,
): RiskFeedbackDto {
  const feedback = riskFeedbackCreateInputSchema.parse(input);
  const now = new Date().toISOString();
  const result = getDb()
    .prepare<
      [
        number | null,
        string | null,
        string,
        string | null,
        string,
        string,
        string,
        string,
        string,
        string,
        string | null,
        string | null,
        string,
        string,
        string,
      ]
    >(
      `
      INSERT INTO risk_feedback (
        report_id,
        benchmark_jd_id,
        risk_rule_version,
        source_url,
        company,
        role,
        jd_excerpt,
        original_risk_level,
        user_label,
        feedback_type,
        signal_id,
        signal_text,
        user_note,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      feedback.reportId ?? null,
      feedback.benchmarkJdId ?? null,
      feedback.riskRuleVersion || "规则版本未知",
      feedback.sourceUrl ?? null,
      feedback.company ?? "",
      feedback.role ?? "",
      feedback.jdExcerpt,
      feedback.originalRiskLevel,
      feedback.userLabel,
      feedback.feedbackType,
      feedback.signalId ?? null,
      feedback.signalText ?? null,
      feedback.userNote ?? "",
      now,
      now,
    );
  const id = normalizeRowId(result.lastInsertRowid);
  const created = getRiskFeedbackRowById(id);

  if (!created) {
    throw new Error(`Risk feedback ${id} was inserted but could not be read.`);
  }

  return mapRiskFeedbackRow(created);
}

export function listRiskFeedback(
  input: RiskFeedbackListInput = {},
): RiskFeedbackDto[] {
  const filters = riskFeedbackListInputSchema.parse(input);
  const whereClauses: string[] = [];
  const params: Array<number | string> = [];

  if (filters.reportId !== undefined) {
    whereClauses.push("report_id = ?");
    params.push(filters.reportId);
  }

  if (filters.benchmarkJdId !== undefined) {
    whereClauses.push("benchmark_jd_id = ?");
    params.push(filters.benchmarkJdId);
  }

  if (filters.riskRuleVersion !== undefined) {
    whereClauses.push("risk_rule_version = ?");
    params.push(filters.riskRuleVersion);
  }

  if (filters.userLabel !== undefined) {
    whereClauses.push("user_label = ?");
    params.push(filters.userLabel);
  }

  if (filters.feedbackType !== undefined) {
    whereClauses.push("feedback_type = ?");
    params.push(filters.feedbackType);
  }

  const whereSql =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  params.push(filters.limit ?? 50);

  return getDb()
    .prepare<Array<number | string>, RiskFeedbackRow>(
      `
      SELECT
        id,
        report_id,
        benchmark_jd_id,
        risk_rule_version,
        source_url,
        company,
        role,
        jd_excerpt,
        original_risk_level,
        user_label,
        feedback_type,
        signal_id,
        signal_text,
        user_note,
        created_at,
        updated_at
      FROM risk_feedback
      ${whereSql}
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ?
    `,
    )
    .all(...params)
    .map(mapRiskFeedbackRow);
}

export function deleteReport(id: number): ReportDeleteResult | null {
  const parsedId = idSchema.parse(id);
  const database = getDb();
  const deleteRecord = database.transaction(() => {
    const existing = getReportRowById(parsedId);

    if (!existing) {
      return null;
    }

    const detachedApplications = database
      .prepare<[number]>(
        `
        UPDATE applications
        SET report_id = NULL,
            updated_at = datetime('now')
        WHERE report_id = ?
      `,
      )
      .run(parsedId).changes;
    const detachedInterviewSessions = database
      .prepare<[number]>(
        `
        UPDATE interview_sessions
        SET report_id = NULL,
            updated_at = datetime('now')
        WHERE report_id = ?
      `,
      )
      .run(parsedId).changes;
    const detachedResumeOptimizationRuns = database
      .prepare<[number]>(
        `
        UPDATE resume_optimization_runs
        SET report_id = NULL
        WHERE report_id = ?
      `,
      )
      .run(parsedId).changes;

    database
      .prepare<[number]>(
        `
        DELETE FROM reports
        WHERE id = ?
      `,
      )
      .run(parsedId);

    return {
      detachedReferences: {
        applications: detachedApplications,
        interviewSessions: detachedInterviewSessions,
        resumeOptimizationRuns: detachedResumeOptimizationRuns,
      },
      report: mapReportRow(existing),
    };
  });

  return deleteRecord();
}

export function createResumeOptimizationRun(
  input: z.input<typeof resumeOptimizationRunCreateInputSchema>,
): ResumeOptimizationRunDto {
  const run = resumeOptimizationRunCreateInputSchema.parse(input);
  const result = getDb()
    .prepare<[number, number | null, string, string]>(
      `
      INSERT INTO resume_optimization_runs (
        resume_id,
        report_id,
        mode,
        result_json
      )
      VALUES (?, ?, ?, ?)
    `,
    )
    .run(
      run.resumeId,
      run.reportId ?? null,
      run.mode,
      stringifyJson(run.result, "resume optimization result"),
    );
  const id = normalizeRowId(result.lastInsertRowid);
  const created = getResumeOptimizationRunRowById(id);

  if (!created) {
    throw new Error(`Resume optimization run ${id} was inserted but could not be read.`);
  }

  return mapResumeOptimizationRunRow(created);
}

export function getResumeOptimizationRunById(
  id: number,
): ResumeOptimizationRunDto | null {
  const parsedId = idSchema.parse(id);
  const row = getResumeOptimizationRunRowById(parsedId);

  return row
    ? mapResumeOptimizationRunRow(
        row,
        listOptimizationFeedbackRowsByRunId(parsedId).map(mapOptimizationFeedbackRow),
      )
    : null;
}

export function listResumeOptimizationRuns(
  input: { limit?: number; resumeId?: number } = {},
): ResumeOptimizationRunDto[] {
  const parsedLimit = listLimitSchema.parse(input.limit);
  const parsedResumeId =
    input.resumeId === undefined ? undefined : idSchema.parse(input.resumeId);
  const rows =
    parsedResumeId === undefined
      ? getDb()
          .prepare<[number], ResumeOptimizationRunRow>(
            `
            SELECT id, resume_id, report_id, mode, result_json, created_at
            FROM resume_optimization_runs
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT ?
          `,
          )
          .all(parsedLimit)
      : getDb()
          .prepare<[number, number], ResumeOptimizationRunRow>(
            `
            SELECT id, resume_id, report_id, mode, result_json, created_at
            FROM resume_optimization_runs
            WHERE resume_id = ?
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT ?
          `,
          )
          .all(parsedResumeId, parsedLimit);

  return rows.map((row) =>
    mapResumeOptimizationRunRow(
      row,
      listOptimizationFeedbackRowsByRunId(row.id).map(mapOptimizationFeedbackRow),
    ),
  );
}

export function createOptimizationFeedback(
  input: z.input<typeof optimizationFeedbackCreateInputSchema>,
): OptimizationFeedbackDto | null {
  const feedback = optimizationFeedbackCreateInputSchema.parse(input);
  const run = getResumeOptimizationRunRowById(feedback.runId);

  if (!run) {
    return null;
  }

  const result = getDb()
    .prepare<[number, string, string, string]>(
      `
      INSERT INTO optimization_feedback (
        run_id,
        suggestion_id,
        decision,
        reason
      )
      VALUES (?, ?, ?, ?)
    `,
    )
    .run(feedback.runId, feedback.suggestionId, feedback.decision, feedback.reason);
  const id = normalizeRowId(result.lastInsertRowid);
  const row =
    getDb()
      .prepare<[number], OptimizationFeedbackRow>(
        `
        SELECT id, run_id, suggestion_id, decision, reason, created_at
        FROM optimization_feedback
        WHERE id = ?
      `,
      )
      .get(id) ?? null;

  if (!row) {
    throw new Error(`Optimization feedback ${id} was inserted but could not be read.`);
  }

  return mapOptimizationFeedbackRow(row);
}

export function listInterviewSessions(limit?: number): InterviewSessionDto[] {
  const parsedLimit = listLimitSchema.parse(limit);

  return getDb()
    .prepare<[number], InterviewSessionRow>(
      `
      SELECT id, report_id, resume_id, title, mode, questions_json, created_at, updated_at
      FROM interview_sessions
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT ?
    `,
    )
    .all(parsedLimit)
    .map(mapInterviewSessionRow);
}

export function getInterviewSessionById(id: number): InterviewSessionDto | null {
  const parsedId = idSchema.parse(id);
  const row = getInterviewSessionRowById(parsedId);

  return row ? mapInterviewSessionRow(row) : null;
}

export function createInterviewSession(
  input: InterviewSessionCreateInput,
): InterviewSessionDto | null {
  const session = interviewSessionCreateInputSchema.parse(input);
  const report = getReportRowById(session.reportId);

  if (!report) {
    return null;
  }

  if (session.resumeId !== undefined) {
    const resume = getResumeRowById(session.resumeId);

    if (!resume || resume.archived_at !== null) {
      return null;
    }
  }

  const title = session.title ?? `${report.company} · ${report.role} 面试准备`;
  const result = getDb()
    .prepare<[number, number | null, string, string]>(
      `
      INSERT INTO interview_sessions (
        report_id,
        resume_id,
        title,
        mode,
        questions_json
      )
      VALUES (?, ?, ?, ?, '[]')
    `,
    )
    .run(session.reportId, session.resumeId ?? null, title, session.mode ?? "mixed");
  const id = normalizeRowId(result.lastInsertRowid);
  const created = getInterviewSessionRowById(id);

  if (!created) {
    throw new Error(`Interview session ${id} was inserted but could not be read.`);
  }

  return mapInterviewSessionRow(created);
}

export function updateInterviewSessionQuestions(
  id: number,
  questions: InterviewQuestion[],
): InterviewSessionDto | null {
  const parsedId = idSchema.parse(id);
  const parsedQuestions = interviewQuestionsSchema.parse(questions);
  const existing = getInterviewSessionRowById(parsedId);

  if (!existing) {
    return null;
  }

  getDb()
    .prepare<[string, number]>(
      `
      UPDATE interview_sessions
      SET questions_json = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `,
    )
    .run(
      stringifyJson(parsedQuestions, "interview questions"),
      parsedId,
    );

  const updated = getInterviewSessionRowById(parsedId);

  if (!updated) {
    throw new Error(`Interview session ${parsedId} was updated but could not be read.`);
  }

  return mapInterviewSessionRow(updated);
}

export function listInterviewAnswers(sessionId: number): InterviewAnswerDto[] {
  const parsedSessionId = idSchema.parse(sessionId);

  return getDb()
    .prepare<[number], InterviewAnswerRow>(
      `
      SELECT id, session_id, question_id, answer_text, score_json, created_at
      FROM interview_answers
      WHERE session_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
    `,
    )
    .all(parsedSessionId)
    .map(mapInterviewAnswerRow);
}

export function createInterviewAnswer(
  sessionId: number,
  input: InterviewAnswerCreateInput,
  score: InterviewAnswerScore,
): InterviewAnswerDto | null {
  const parsedSessionId = idSchema.parse(sessionId);
  const answer = interviewAnswerCreateInputSchema.parse(input);
  const parsedScore = interviewAnswerScoreSchema.parse(score);
  const database = getDb();
  const createAnswer = database.transaction(() => {
    const existing = getInterviewSessionRowById(parsedSessionId);

    if (!existing) {
      return null;
    }

    const result = database
      .prepare<[number, string, string, string]>(
        `
        INSERT INTO interview_answers (
          session_id,
          question_id,
          answer_text,
          score_json
        )
        VALUES (?, ?, ?, ?)
      `,
      )
      .run(
        parsedSessionId,
        answer.questionId,
        answer.answerText,
        stringifyJson(parsedScore, "interview answer score"),
      );
    const answerId = normalizeRowId(result.lastInsertRowid);

    database
      .prepare<[number]>(
        `
        UPDATE interview_sessions
        SET updated_at = datetime('now')
        WHERE id = ?
      `,
      )
      .run(parsedSessionId);

    const created = getInterviewAnswerRowById(answerId);

    if (!created) {
      throw new Error(`Interview answer ${answerId} was inserted but could not be read.`);
    }

    return mapInterviewAnswerRow(created);
  });

  return createAnswer();
}

export function listStories(limit?: number): StoryDto[] {
  const parsedLimit = listLimitSchema.parse(limit);

  return getDb()
    .prepare<[number], StoryRow>(
      `
      SELECT id, title, situation, task, action, result, tags_json, created_at, updated_at
      FROM stories
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT ?
    `,
    )
    .all(parsedLimit)
    .map(mapStoryRow);
}

export function createStory(input: StoryCreateInput): StoryDto {
  const story = storyCreateInputSchema.parse(input);
  const result = getDb()
    .prepare<[string, string, string, string, string, string]>(
      `
      INSERT INTO stories (
        title,
        situation,
        task,
        action,
        result,
        tags_json
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      story.title,
      story.situation ?? "",
      story.task ?? "",
      story.action ?? "",
      story.result ?? "",
      stringifyJson(story.tags ?? [], "story tags"),
    );
  const id = normalizeRowId(result.lastInsertRowid);
  const created = getStoryRowById(id);

  if (!created) {
    throw new Error(`Story ${id} was inserted but could not be read.`);
  }

  return mapStoryRow(created);
}

export function createApplication(input: ApplicationCreateInput): ApplicationDto {
  const application = applicationCreateInputSchema.parse(input);
  const database = getDb();
  const createApplicationRecord = database.transaction(() => {
    const eventTime = new Date().toISOString();
    const keyDates = applyStatusDateDefaults(
      application.status,
      {
        abandonedAt: application.abandonedAt ?? null,
        appliedAt: application.appliedAt ?? null,
        interviewAt: application.interviewAt ?? null,
        offerAt: application.offerAt ?? null,
        rejectedAt: application.rejectedAt ?? null,
      },
      eventTime,
    );
    const result = database
      .prepare<
        [
          number | null,
          number | null,
          string,
          string,
          string | null,
          string,
          ApplicationPriority,
          string | null,
          number | null,
          string | null,
          string | null,
          string,
          string,
          string | null,
          string | null,
          string | null,
          string | null,
          string | null,
          string | null,
        ]
      >(
        `
        INSERT INTO applications (
          report_id,
          resume_id,
          company,
          role,
          source_url,
          status,
          priority,
          channel,
          score_overall,
          risk_level,
          recommended_resume_name,
          notes,
          tags_json,
          next_follow_up_at,
          applied_at,
          interview_at,
          offer_at,
          rejected_at,
          abandoned_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        application.reportId ?? null,
        application.resumeId ?? null,
        application.company,
        application.role,
        application.sourceUrl ?? null,
        application.status,
        application.priority,
        application.channel ?? null,
        application.scoreOverall ?? null,
        application.riskLevel ?? null,
        application.recommendedResumeName ?? null,
        application.notes,
        stringifyJson(application.tags, "application tags"),
        application.nextFollowUpAt ?? null,
        keyDates.appliedAt,
        keyDates.interviewAt,
        keyDates.offerAt,
        keyDates.rejectedAt,
        keyDates.abandonedAt,
      );
    const id = normalizeRowId(result.lastInsertRowid);

    insertApplicationEventRecord(database, id, {
      eventType: "created",
      happenedAt: eventTime,
      note: `${application.company} · ${application.role}`,
      title: APPLICATION_EVENT_DEFAULT_TITLES.created,
    });

    const created = getApplicationRowById(id);

    if (!created) {
      throw new Error(`Application ${id} was inserted but could not be read.`);
    }

    return mapApplicationRow(created);
  });

  return createApplicationRecord();
}

export function getApplicationById(id: number): ApplicationDto | null {
  const parsedId = idSchema.parse(id);
  const row = getApplicationRowById(parsedId);

  return row ? mapApplicationRow(row) : null;
}

export function getApplicationByReportId(
  reportId: number,
): ApplicationDto | null {
  const parsedReportId = idSchema.parse(reportId);
  const row = getApplicationRowByReportId(parsedReportId);

  return row ? mapApplicationRow(row) : null;
}

export function listApplications(
  input?: number | ApplicationListInput,
): ApplicationDto[] {
  const filters = normalizeApplicationListInput(input);
  const whereClauses: string[] = [];
  const params: Array<number | string> = [];

  if (filters.q) {
    whereClauses.push("(company LIKE ? OR role LIKE ?)");
    params.push(`%${filters.q}%`, `%${filters.q}%`);
  }

  if (filters.status) {
    whereClauses.push("status = ?");
    params.push(filters.status);
  }

  if (filters.priority) {
    whereClauses.push("priority = ?");
    params.push(filters.priority);
  }

  if (filters.channel) {
    whereClauses.push("channel = ?");
    params.push(filters.channel);
  }

  params.push(filters.limit);

  return getDb()
    .prepare<Array<number | string>, ApplicationRow>(
      `
      SELECT
        id,
        report_id,
        resume_id,
        company,
        role,
        source_url,
        status,
        priority,
        channel,
        score_overall,
        risk_level,
        recommended_resume_name,
        notes,
        tags_json,
        next_follow_up_at,
        applied_at,
        interview_at,
        offer_at,
        rejected_at,
        abandoned_at,
        created_at,
        updated_at
      FROM applications
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ""}
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT ?
    `,
    )
    .all(...params)
    .map(mapApplicationRow);
}

export function getApplicationStats(): ApplicationStatsDto {
  const database = getDb();
  const reportCounts =
    database
      .prepare<
        [number],
        {
          evaluated: number | null;
          high_match: number | null;
        }
      >(
        `
        SELECT
          COUNT(*) AS evaluated,
          SUM(
            CASE
              WHEN json_valid(score_json)
                AND COALESCE(CAST(json_extract(score_json, '$.overall') AS REAL), 0) >= ?
                THEN 1
              ELSE 0
            END
          ) AS high_match
        FROM reports
      `,
      )
      .get(HIGH_MATCH_SCORE_THRESHOLD) ?? {
      evaluated: 0,
      high_match: 0,
    };
  const applicationCounts =
    database
      .prepare<
        [],
        {
          to_apply: number | null;
          applied: number | null;
          interviewing: number | null;
          offer_received: number | null;
          rejected: number | null;
          abandoned: number | null;
        }
      >(
        `
        SELECT
          SUM(CASE WHEN status = 'to_apply' THEN 1 ELSE 0 END) AS to_apply,
          SUM(CASE WHEN status = 'applied' THEN 1 ELSE 0 END) AS applied,
          SUM(CASE WHEN status = 'interviewing' THEN 1 ELSE 0 END) AS interviewing,
          SUM(CASE WHEN status = 'offer_received' THEN 1 ELSE 0 END) AS offer_received,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
          SUM(CASE WHEN status = 'abandoned' THEN 1 ELSE 0 END) AS abandoned
        FROM applications
      `,
      )
      .get() ?? {
      to_apply: 0,
      applied: 0,
      interviewing: 0,
      offer_received: 0,
      rejected: 0,
      abandoned: 0,
    };
  const overdueFollowUps =
    database
      .prepare<
        [],
        {
          count: number | null;
        }
      >(
        `
        SELECT COUNT(*) AS count
        FROM applications
        WHERE next_follow_up_at IS NOT NULL
          AND TRIM(next_follow_up_at) <> ''
          AND datetime(REPLACE(next_follow_up_at, 'T', ' ')) < datetime('now', 'localtime')
          AND status NOT IN ('offer_received', 'rejected', 'abandoned')
      `,
      )
      .get()?.count ?? 0;
  const priorityCounts = new Map(
    (
      database
        .prepare<
          [],
          {
            priority: ApplicationPriority | string;
            count: number | null;
          }
        >(
          `
          SELECT priority, COUNT(*) AS count
          FROM applications
          GROUP BY priority
        `,
        )
        .all()
    ).map((row) => [row.priority, row.count ?? 0]),
  );
  const channelDistribution = database
    .prepare<
      [],
      {
        channel_key: string;
        count: number | null;
      }
    >(
      `
      SELECT
        COALESCE(NULLIF(TRIM(channel), ''), '未填写') AS channel_key,
        COUNT(*) AS count
      FROM applications
      GROUP BY channel_key
      ORDER BY count DESC, channel_key ASC
      LIMIT 12
    `,
    )
    .all()
    .map((row) => ({
      count: row.count ?? 0,
      key: row.channel_key,
      label: row.channel_key,
    }));

  return {
    evaluated: reportCounts.evaluated ?? 0,
    highMatch: reportCounts.high_match ?? 0,
    toApply: applicationCounts.to_apply ?? 0,
    applied: applicationCounts.applied ?? 0,
    interviewing: applicationCounts.interviewing ?? 0,
    offerReceived: applicationCounts.offer_received ?? 0,
    rejected: applicationCounts.rejected ?? 0,
    abandoned: applicationCounts.abandoned ?? 0,
    overdueFollowUps,
    priorityDistribution: (["high", "medium", "low"] as const).map((priority) => ({
      count: priorityCounts.get(priority) ?? 0,
      key: priority,
      label: APPLICATION_PRIORITY_LABELS[priority],
    })),
    channelDistribution,
    highMatchThreshold: HIGH_MATCH_SCORE_THRESHOLD,
  };
}

export function getAnalyticsOverview(): AnalyticsOverviewDto {
  const reports = listAllReportsForAnalytics();
  const resumes = listActiveResumesForAnalytics();
  const applications = listAllApplicationsForAnalytics();
  const stats = getApplicationStats();
  const activeApplications = applications.filter(
    (application) => !TERMINAL_APPLICATION_STATUSES.has(application.status),
  );
  const matchedReportIds = new Set(
    applications
      .map((application) => application.reportId)
      .filter((reportId): reportId is number => reportId !== null),
  );
  const defaultResume = resumes.find((resume) => resume.isDefault) ?? null;
  const analyzedResume = defaultResume ?? resumes[0] ?? null;
  const caveats = [
    "Analytics 仅根据已保存记录生成，不会自动同步招聘平台转化。",
    "手动保存的岗位、报告和投递记录会参与复盘。",
  ];

  if (reports.length < 5 || applications.length < 3) {
    caveats.push("记录较少时，结论仅适合个人复盘，不适合作为稳定转化率判断。");
  }

  if (!defaultResume) {
    caveats.push("尚未设置默认简历，技能缺口和简历效果会受限。");
  }

  const careerFit = buildCareerFitSummary(reports, applications, caveats);
  const overview: AnalyticsOverviewDto = {
    generatedAt: new Date().toISOString(),
    sampleSize: {
      reports: reports.length,
      resumes: resumes.length,
      applications: applications.length,
      activeApplications: activeApplications.length,
      matchedReports: matchedReportIds.size,
    },
    funnel: buildAnalyticsFunnel(stats, applications.length),
    directions: buildDirectionAnalytics(reports, applications),
    riskSignals: buildRiskSignalAnalytics(reports),
    skillGaps: buildSkillGapAnalytics(reports, analyzedResume, caveats),
    tracker: buildTrackerAnalytics(stats, applications),
    resumeEffect: buildResumeEffectAnalytics(
      reports,
      applications,
      defaultResume,
      analyzedResume,
    ),
    ...(careerFit ? { careerFit } : {}),
    caveats: uniqueStrings(caveats).slice(0, 20),
    highMatchThreshold: HIGH_MATCH_SCORE_THRESHOLD,
  };

  return analyticsOverviewSchema.parse(overview);
}

function listAllReportsForAnalytics(): ReportDto[] {
  return getDb()
    .prepare<[], ReportRow>(
      `
      SELECT id, company, role, jd_text, score_json, risks_json, report_json, created_at
      FROM reports
      ORDER BY datetime(created_at) DESC, id DESC
    `,
    )
    .all()
    .map(mapReportRow);
}

function listActiveResumesForAnalytics(): ResumeDto[] {
  return getDb()
    .prepare<[], ResumeRow>(
      `
      SELECT id, name, content_json, skills_json, ecosystem_json, direction, is_default, archived_at, created_at, updated_at
      FROM resumes
      WHERE archived_at IS NULL
      ORDER BY is_default DESC, datetime(updated_at) DESC, id DESC
    `,
    )
    .all()
    .map(mapResumeRow);
}

function listAllApplicationsForAnalytics(): ApplicationDto[] {
  return getDb()
    .prepare<[], ApplicationRow>(
      `
      SELECT
        id,
        report_id,
        resume_id,
        company,
        role,
        source_url,
        status,
        priority,
        channel,
        score_overall,
        risk_level,
        recommended_resume_name,
        notes,
        tags_json,
        next_follow_up_at,
        applied_at,
        interview_at,
        offer_at,
        rejected_at,
        abandoned_at,
        created_at,
        updated_at
      FROM applications
      ORDER BY datetime(updated_at) DESC, id DESC
    `,
    )
    .all()
    .map(mapApplicationRow);
}

function buildAnalyticsFunnel(
  stats: ApplicationStatsDto,
  applicationCount: number,
): AnalyticsOverviewDto["funnel"] {
  return [
    { key: "evaluated", label: "已评估", count: stats.evaluated },
    { key: "in_tracker", label: "加入清单", count: applicationCount },
    { key: "to_apply", label: "待投递", count: stats.toApply },
    { key: "applied", label: "已投递", count: stats.applied },
    { key: "interviewing", label: "面试中", count: stats.interviewing },
    { key: "offer_received", label: "已获 Offer", count: stats.offerReceived },
    { key: "rejected", label: "未通过", count: stats.rejected },
    { key: "abandoned", label: "已放弃", count: stats.abandoned },
  ];
}

function buildDirectionAnalytics(
  reports: ReportDto[],
  applications: ApplicationDto[],
): AnalyticsDirectionItem[] {
  const linkedApplicationCounts = new Map<number, number>();

  for (const application of applications) {
    if (application.reportId !== null) {
      increment(linkedApplicationCounts, application.reportId);
    }
  }

  const directionStats = new Map<
    ResumeDirection,
    {
      count: number;
      highRiskCount: number;
      linkedApplicationCount: number;
      scoreSum: number;
    }
  >();

  for (const report of reports) {
    const direction = readReportDirection(report) ?? "general";
    const current =
      directionStats.get(direction) ?? {
        count: 0,
        highRiskCount: 0,
        linkedApplicationCount: 0,
        scoreSum: 0,
      };

    current.count += 1;
    current.scoreSum += clampScore(report.score.overall);
    current.highRiskCount += isHighRiskReport(report) ? 1 : 0;
    current.linkedApplicationCount += linkedApplicationCounts.get(report.id) ?? 0;
    directionStats.set(direction, current);
  }

  return Array.from(directionStats.entries())
    .map(([direction, item]) => ({
      direction,
      label: RESUME_DIRECTION_LABELS[direction],
      count: item.count,
      averageScore: roundToOne(item.scoreSum / Math.max(1, item.count)),
      highRiskCount: item.highRiskCount,
      highRiskRate: roundToOne((item.highRiskCount / Math.max(1, item.count)) * 100),
      linkedApplicationCount: item.linkedApplicationCount,
    }))
    .sort((left, right) => {
      const countDelta = right.count - left.count;

      if (countDelta !== 0) {
        return countDelta;
      }

      return right.averageScore - left.averageScore;
    })
    .slice(0, 8);
}

function buildRiskSignalAnalytics(reports: ReportDto[]): AnalyticsRiskSignalItem[] {
  const riskCounts = new Map<
    string,
    {
      category?: string;
      count: number;
      label: string;
      severity?: RiskSeverity;
    }
  >();

  for (const report of reports) {
    for (const signal of report.risks) {
      const label = normalizeAnalyticsLabel(signal.signal || signal.category);

      if (!label) {
        continue;
      }

      const key = label.toLocaleLowerCase();
      const current =
        riskCounts.get(key) ?? {
          count: 0,
          label,
        };

      current.count += 1;
      current.category = current.category ?? signal.category;
      current.severity = pickHigherSeverity(current.severity, signal.severity);
      riskCounts.set(key, current);
    }
  }

  return Array.from(riskCounts.values())
    .sort((left, right) => {
      const severityDelta =
        severityWeight(right.severity) - severityWeight(left.severity);

      if (severityDelta !== 0) {
        return severityDelta;
      }

      return right.count - left.count;
    })
    .slice(0, 10)
    .map((item) => ({
      label: item.label,
      count: item.count,
      ...(item.severity ? { severity: item.severity } : {}),
      ...(item.category ? { category: item.category } : {}),
    }));
}

function buildSkillGapAnalytics(
  reports: ReportDto[],
  resume: ResumeDto | null,
  caveats: string[],
): AnalyticsSkillGapItem[] {
  if (!resume) {
    return [];
  }

  const resumeProfile: ResumeProfile = {
    content: resume.content,
    ecosystem: resume.ecosystem,
    skills: resume.skills,
  };
  const gapCounts = new Map<
    string,
    {
      count: number;
      evidence?: string;
      priority: AnalyticsSkillGapItem["priority"];
      skill: string;
    }
  >();

  for (const report of reports.slice(0, 40)) {
    try {
      const match = matchResumeToJob(resumeProfile, report.report);

      for (const gap of [...match.quickGaps, ...match.longTermGaps]) {
        if (gap.priority !== "quick_fix" && gap.priority !== "long_term") {
          continue;
        }

        const skill = normalizeAnalyticsLabel(gap.skill);

        if (!skill) {
          continue;
        }

        const key = skill.toLocaleLowerCase();
        const current =
          gapCounts.get(key) ?? {
            count: 0,
            priority: gap.priority,
            skill,
          };

        current.count += 1;
        current.evidence = current.evidence ?? gap.evidence ?? gap.suggestion;
        if (gap.priority === "quick_fix") {
          current.priority = "quick_fix";
        }
        gapCounts.set(key, current);
      }
    } catch {
      caveats.push("部分报告无法完成简历匹配，技能缺口已跳过异常项。");
    }
  }

  return Array.from(gapCounts.values())
    .sort((left, right) => {
      const countDelta = right.count - left.count;

      if (countDelta !== 0) {
        return countDelta;
      }

      return gapPriorityWeight(left.priority) - gapPriorityWeight(right.priority);
    })
    .slice(0, 10)
    .map((item) => ({
      skill: item.skill,
      count: item.count,
      priority: item.priority,
      ...(item.evidence ? { evidence: item.evidence } : {}),
    }));
}

function buildTrackerAnalytics(
  stats: ApplicationStatsDto,
  applications: ApplicationDto[],
): AnalyticsTrackerOverview {
  const statusCounts: Record<ApplicationStatus, number> = {
    abandoned: stats.abandoned,
    applied: stats.applied,
    interviewing: stats.interviewing,
    offer_received: stats.offerReceived,
    rejected: stats.rejected,
    to_apply: stats.toApply,
  };
  const overdueItems = applications
    .filter(isOverdueApplication)
    .sort((left, right) =>
      parseDateTime(left.nextFollowUpAt) - parseDateTime(right.nextFollowUpAt),
    )
    .slice(0, 12)
    .map(mapOverdueApplication);

  return {
    overdueFollowUps: stats.overdueFollowUps,
    overdueItems,
    byStatus: APPLICATION_STATUS_ORDER.map<AnalyticsTrackerStatusItem>((status) => ({
      count: statusCounts[status],
      label: APPLICATION_STATUS_LABELS[status],
      status,
    })),
    byPriority: APPLICATION_PRIORITY_ORDER.map<AnalyticsTrackerPriorityItem>(
      (priority) => {
        const item = stats.priorityDistribution.find(
          (distribution) => distribution.key === priority,
        );

        return {
          count: item?.count ?? 0,
          label: APPLICATION_PRIORITY_LABELS[priority],
          priority,
        };
      },
    ),
    byChannel: stats.channelDistribution.map<AnalyticsTrackerChannelItem>((item) => ({
      channel: item.label,
      count: item.count,
    })),
  };
}

function buildResumeEffectAnalytics(
  reports: ReportDto[],
  applications: ApplicationDto[],
  defaultResume: ResumeDto | null,
  analyzedResume: ResumeDto | null,
): AnalyticsResumeEffect {
  if (!analyzedResume) {
    return {
      analyzedResumeName: null,
      defaultResumeName: null,
      directionAlignedCount: 0,
      directionAlignmentRate: null,
      linkedApplicationCount: 0,
      skillGapSource: "none",
      summary: "暂无可分析简历。设置默认简历后，可以复盘技能缺口和方向匹配情况。",
    };
  }

  const resumeDirection = readResumePrimaryDirection(analyzedResume);
  const directionAlignedCount = reports.filter(
    (report) => readReportDirection(report) === resumeDirection,
  ).length;
  const directionAlignmentRate =
    reports.length > 0
      ? roundToOne((directionAlignedCount / reports.length) * 100)
      : null;
  const linkedApplicationCount = defaultResume
    ? applications.filter((application) => application.resumeId === defaultResume.id)
        .length
    : 0;
  const skillGapSource = defaultResume ? "default_resume" : "latest_resume";
  const summary = defaultResume
    ? `默认简历「${defaultResume.name}」已关联 ${linkedApplicationCount} 条 Tracker；最近报告中 ${directionAlignedCount}/${reports.length} 个方向与简历主方向一致。`
    : `尚未设置默认简历，临时使用最近更新简历「${analyzedResume.name}」生成技能缺口；建议设置默认简历后再复盘。`;

  return {
    analyzedResumeName: analyzedResume.name,
    defaultResumeName: defaultResume?.name ?? null,
    directionAlignedCount,
    directionAlignmentRate,
    linkedApplicationCount,
    skillGapSource,
    summary,
  };
}

function buildCareerFitSummary(
  reports: ReportDto[],
  applications: ApplicationDto[],
  caveats: string[],
): AnalyticsCareerFit | undefined {
  const setting = getSetting("career_profile");

  if (!setting) {
    caveats.push("尚未配置 Career DNA，无法判断当前推进岗位是否符合个人目标。");
    return undefined;
  }

  const parsedProfile = careerProfileSettingsSchema.safeParse(setting.value);

  if (!parsedProfile.success) {
    caveats.push("Career DNA 数据格式异常，已跳过画像匹配摘要。");
    return undefined;
  }

  const profile = parsedProfile.data;
  const profileConfigured = isCareerProfileConfigured(profile);
  const activeApplications = applications.filter(
    (application) => !TERMINAL_APPLICATION_STATUSES.has(application.status),
  );
  const reportById = new Map(reports.map((report) => [report.id, report]));
  let matchedCount = 0;
  let warningCount = 0;
  let targetDirectionsMatched = 0;
  let targetCitiesMatched = 0;
  let workModesMatched = 0;
  let missingReportCount = 0;
  let directionWarningCount = 0;
  let cityWarningCount = 0;
  let workModeWarningCount = 0;

  for (const application of activeApplications) {
    const report =
      application.reportId === null ? undefined : reportById.get(application.reportId);

    if (!report) {
      missingReportCount += 1;
    }

    const direction = report ? readReportDirection(report) : undefined;
    const city = report?.report.job.location;
    const workModes = report
      ? detectWorkModes(`${report.jdText} ${report.report.job.location ?? ""}`)
      : [];
    const directionMatches =
      profile.targetDirections.length === 0 ||
      (direction !== undefined && profile.targetDirections.includes(direction));
    const roleMatches =
      profile.targetRoles.length === 0 ||
      profile.targetRoles.some((role) =>
        normalizedIncludesEither(application.role, role),
      );
    const cityMatches =
      profile.targetCities.length === 0 ||
      (city !== undefined &&
        profile.targetCities.some((targetCity) =>
          normalizedIncludesEither(city, targetCity),
        ));
    const workModeMatches =
      profile.preferredWorkModes.length === 0 ||
      workModes.some((mode) => profile.preferredWorkModes.includes(mode));

    if (profile.targetDirections.length > 0 && directionMatches) {
      targetDirectionsMatched += 1;
    }

    if (profile.targetCities.length > 0 && cityMatches) {
      targetCitiesMatched += 1;
    }

    if (profile.preferredWorkModes.length > 0 && workModeMatches) {
      workModesMatched += 1;
    }

    if (!directionMatches) {
      directionWarningCount += 1;
    }

    if (!cityMatches) {
      cityWarningCount += 1;
    }

    if (!workModeMatches) {
      workModeWarningCount += 1;
    }

    if (directionMatches && roleMatches && cityMatches && workModeMatches) {
      matchedCount += profileConfigured ? 1 : 0;
    } else {
      warningCount += 1;
    }
  }

  const warnings = [
    missingReportCount > 0
      ? `${missingReportCount} 条推进记录未关联评估报告，无法判断方向、城市或工作模式。`
      : null,
    directionWarningCount > 0
      ? `${directionWarningCount} 条推进记录不在 Career DNA 目标方向内。`
      : null,
    cityWarningCount > 0
      ? `${cityWarningCount} 条推进记录城市不在 Career DNA 目标城市内。`
      : null,
    workModeWarningCount > 0
      ? `${workModeWarningCount} 条推进记录工作模式未匹配偏好。`
      : null,
  ].filter((warning): warning is string => Boolean(warning));

  const summary = !profileConfigured
    ? "Career DNA 已保存，但目标方向、岗位、城市或工作模式仍为空，当前只能展示 Tracker 记录数量。"
    : activeApplications.length === 0
      ? "暂无推进中的 Tracker 记录，暂时无法判断当前机会是否贴合 Career DNA。"
      : `当前 ${activeApplications.length} 条推进中记录里，${matchedCount} 条符合已填写的 Career DNA 条件，${warningCount} 条建议复核。`;

  caveats.push("Career DNA 匹配只基于本地报告中的方向、地点和工作模式文本。");

  return {
    checkedCount: activeApplications.length,
    matchedCount,
    profileConfigured,
    summary,
    targetCitiesMatched,
    targetDirectionsMatched,
    warningCount,
    warnings,
    workModesMatched,
  };
}

function readReportDirection(report: ReportDto): ResumeDirection | undefined {
  return (
    normalizeResumeDirection(report.report.job.aiDirection) ??
    report.report.job.ecosystem?.primaryDomain
  );
}

function isHighRiskReport(report: ReportDto): boolean {
  if (
    report.report.risks.level === "critical" ||
    report.report.risks.level === "high"
  ) {
    return true;
  }

  return report.risks.some(
    (signal) => signal.severity === "critical" || signal.severity === "high",
  );
}

function readResumePrimaryDirection(resume: ResumeDto): ResumeDirection {
  if (resume.direction !== "general") {
    return resume.direction;
  }

  let bestDirection: ResumeDirection = "general";
  let bestScore = 0;

  for (const direction of AI_DOMAIN_DIRECTIONS) {
    const score = resume.ecosystem[direction] ?? 0;

    if (score > bestScore) {
      bestDirection = direction;
      bestScore = score;
    }
  }

  return bestDirection;
}

function isOverdueApplication(application: ApplicationDto): boolean {
  if (
    !application.nextFollowUpAt ||
    TERMINAL_APPLICATION_STATUSES.has(application.status)
  ) {
    return false;
  }

  const timestamp = parseDateTime(application.nextFollowUpAt);

  return timestamp > 0 && timestamp < Date.now();
}

function mapOverdueApplication(
  application: ApplicationDto,
): AnalyticsOverdueFollowUpItem {
  const timestamp = parseDateTime(application.nextFollowUpAt);
  const dayMs = 24 * 60 * 60 * 1000;

  return {
    id: application.id,
    company: application.company,
    daysOverdue: Math.max(0, Math.ceil((Date.now() - timestamp) / dayMs)),
    nextFollowUpAt: application.nextFollowUpAt ?? new Date(0).toISOString(),
    priority: application.priority,
    role: application.role,
    status: application.status,
  };
}

function isCareerProfileConfigured(profile: CareerProfileSettings): boolean {
  return (
    profile.targetDirections.length > 0 ||
    profile.targetRoles.length > 0 ||
    profile.targetCities.length > 0 ||
    profile.preferredWorkModes.length > 0
  );
}

function detectWorkModes(
  value: string,
): CareerProfileSettings["preferredWorkModes"] {
  const normalized = value.toLocaleLowerCase();
  const modes = new Set<CareerProfileSettings["preferredWorkModes"][number]>();

  if (/远程|居家|remote|work from home|wfh/.test(normalized)) {
    modes.add("remote");
  }

  if (/混合|hybrid|弹性到岗/.test(normalized)) {
    modes.add("hybrid");
  }

  if (/到岗|现场|驻场|坐班|办公室|onsite|on-site/.test(normalized)) {
    modes.add("onsite");
  }

  if (/弹性|灵活|flexible/.test(normalized)) {
    modes.add("flexible");
  }

  return Array.from(modes);
}

function normalizedIncludesEither(left: string, right: string): boolean {
  const normalizedLeft = normalizeSearchText(left);
  const normalizedRight = normalizeSearchText(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, "");
}

function normalizeAnalyticsLabel(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().replace(/\s+/g, " ");

  return normalized.length > 0 ? normalized.slice(0, 240) : undefined;
}

function pickHigherSeverity(
  left: RiskSeverity | undefined,
  right: RiskSeverity,
): RiskSeverity {
  return severityWeight(right) > severityWeight(left) ? right : left ?? right;
}

function severityWeight(severity: RiskSeverity | undefined): number {
  if (severity === "critical") {
    return 4;
  }

  if (severity === "high") {
    return 3;
  }

  if (severity === "medium") {
    return 2;
  }

  if (severity === "low") {
    return 1;
  }

  return 0;
}

function gapPriorityWeight(priority: AnalyticsSkillGapItem["priority"]): number {
  return priority === "quick_fix" ? 0 : 1;
}

function increment<TKey>(map: Map<TKey, number>, key: TKey) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function parseDateTime(value: string | null): number {
  if (!value) {
    return 0;
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const timestamp = new Date(normalized).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(5, value));
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLocaleLowerCase();

    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function oneLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function buildSessionMemoryDigest(
  messages: AgentSessionMessage[],
): string | null {
  const recentMessages = messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-6);

  if (recentMessages.length < 2) {
    return null;
  }

  return [
    "最近会话摘要（用户可编辑或删除）：",
    ...recentMessages.map(
      (message) =>
        `- ${message.role === "user" ? "用户" : "Agent"}: ${truncateText(
          oneLine(message.content),
          220,
        )}`,
    ),
  ].join("\n");
}

function shouldAutoMaintainSessionDigest(
  database: Database.Database,
  sessionId: number,
): boolean {
  const row = database
    .prepare<[number], { total_count: number; active_count: number | null }>(
      `
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS active_count
      FROM agent_memory_items
      WHERE session_id = ?
        AND memory_type = 'working_digest'
    `,
    )
    .get(sessionId);

  return !row || (row.active_count ?? 0) > 0 || row.total_count === 0;
}

function syncSessionDigestMemory(
  database: Database.Database,
  sessionId: number,
  content: string | null,
  source: string,
  options: { allowCreateAfterDelete?: boolean } = {},
) {
  const active = getSessionDigestMemoryRow(database, sessionId);

  if (content === null) {
    if (active) {
      database
        .prepare<[number]>(
          `
          UPDATE agent_memory_items
          SET deleted_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `,
        )
        .run(active.id);
    }

    return;
  }

  if (active) {
    database
      .prepare<[string, string, number]>(
        `
        UPDATE agent_memory_items
        SET content = ?,
            source = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `,
      )
      .run(content, source, active.id);
    return;
  }

  if (
    !options.allowCreateAfterDelete &&
    hasDeletedSessionDigestMemory(database, sessionId)
  ) {
    return;
  }

  database
    .prepare<[number, AgentMemoryType, string, string]>(
      `
      INSERT INTO agent_memory_items (
        session_id,
        memory_type,
        content,
        source
      )
      VALUES (?, ?, ?, ?)
    `,
    )
    .run(sessionId, "working_digest", content, source);
}

function getSessionDigestMemoryRow(
  database: Database.Database,
  sessionId: number,
): AgentMemoryItemRow | null {
  return (
    database
      .prepare<[number], AgentMemoryItemRow>(
        `
        SELECT
          id,
          session_id,
          memory_type,
          content,
          source,
          created_at,
          updated_at,
          deleted_at
        FROM agent_memory_items
        WHERE session_id = ?
          AND memory_type = 'working_digest'
          AND deleted_at IS NULL
        ORDER BY datetime(updated_at) DESC, id DESC
        LIMIT 1
      `,
      )
      .get(sessionId) ?? null
  );
}

function hasDeletedSessionDigestMemory(
  database: Database.Database,
  sessionId: number,
): boolean {
  const row = database
    .prepare<[number], { found: number }>(
      `
      SELECT 1 AS found
      FROM agent_memory_items
      WHERE session_id = ?
        AND memory_type = 'working_digest'
        AND deleted_at IS NOT NULL
      LIMIT 1
    `,
    )
    .get(sessionId);

  return Boolean(row?.found);
}

function isSessionDigestMemory(
  row: AgentMemoryItemRow,
): row is AgentMemoryItemRow & { session_id: number } {
  return row.session_id !== null && row.memory_type === "working_digest";
}

export function updateApplicationStatus(
  id: number,
  input: ApplicationStatusUpdateInput,
): ApplicationDto | null {
  return updateApplication(id, input);
}

export function updateApplication(
  id: number,
  input: ApplicationUpdateInput,
): ApplicationDto | null {
  const parsedId = idSchema.parse(id);
  const update = applicationUpdateInputSchema.parse(input);
  const database = getDb();
  const updateApplicationRecord = database.transaction(
    (applicationId: number, nextUpdate: ApplicationUpdateInput) => {
      const existing = getApplicationRowById(applicationId);

      if (!existing) {
        return null;
      }

      const nextStatus =
        nextUpdate.status === undefined
          ? applicationStatusSchema.parse(existing.status)
          : nextUpdate.status;
      const previousStatus = applicationStatusSchema.parse(existing.status);
      const nextPriority =
        nextUpdate.priority === undefined
          ? applicationPrioritySchema.parse(existing.priority)
          : nextUpdate.priority;
      const nextNotes =
        nextUpdate.notes === undefined ? existing.notes : nextUpdate.notes;
      const nextTags =
        nextUpdate.tags === undefined
          ? parseJsonField(
              existing.tags_json,
              applicationTagsSchema,
              `applications(${applicationId}).tags_json`,
            )
          : nextUpdate.tags;
      const previousTags = parseJsonField(
        existing.tags_json,
        applicationTagsSchema,
        `applications(${applicationId}).tags_json`,
      );
      const nextSourceUrl =
        nextUpdate.sourceUrl === undefined
          ? existing.source_url
          : nextUpdate.sourceUrl;
      const nextChannel =
        nextUpdate.channel === undefined ? existing.channel : nextUpdate.channel;
      const nextFollowUpAt =
        nextUpdate.nextFollowUpAt === undefined
          ? existing.next_follow_up_at
          : nextUpdate.nextFollowUpAt;
      const eventTime = new Date().toISOString();
      const keyDates = applyStatusDateDefaults(
        nextStatus,
        {
          abandonedAt:
            nextUpdate.abandonedAt === undefined
              ? existing.abandoned_at
              : nextUpdate.abandonedAt,
          appliedAt:
            nextUpdate.appliedAt === undefined
              ? existing.applied_at
              : nextUpdate.appliedAt,
          interviewAt:
            nextUpdate.interviewAt === undefined
              ? existing.interview_at
              : nextUpdate.interviewAt,
          offerAt:
            nextUpdate.offerAt === undefined
              ? existing.offer_at
              : nextUpdate.offerAt,
          rejectedAt:
            nextUpdate.rejectedAt === undefined
              ? existing.rejected_at
              : nextUpdate.rejectedAt,
        },
        eventTime,
      );

      database
        .prepare<
          [
            string,
            ApplicationPriority,
            string | null,
            string,
            string,
            string | null,
            string | null,
            string | null,
            string | null,
            string | null,
            string | null,
            string | null,
            number,
          ]
        >(
          `
          UPDATE applications
          SET status = ?,
              priority = ?,
              channel = ?,
              notes = ?,
              tags_json = ?,
              source_url = ?,
              next_follow_up_at = ?,
              applied_at = ?,
              interview_at = ?,
              offer_at = ?,
              rejected_at = ?,
              abandoned_at = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `,
        )
        .run(
          nextStatus,
          nextPriority,
          nextChannel,
          nextNotes,
          stringifyJson(nextTags, "application tags"),
          nextSourceUrl,
          nextFollowUpAt,
          keyDates.appliedAt,
          keyDates.interviewAt,
          keyDates.offerAt,
          keyDates.rejectedAt,
          keyDates.abandonedAt,
          applicationId,
        );

      for (const event of buildApplicationUpdateEvents({
        eventTime,
        existing,
        nextChannel,
        nextFollowUpAt,
        nextNotes,
        nextPriority,
        nextSourceUrl,
        nextStatus,
        nextTags,
        previousStatus,
        previousTags,
        keyDates,
      })) {
        insertApplicationEventRecord(database, applicationId, event);
      }

      const updated = getApplicationRowById(applicationId);

      if (!updated) {
        throw new Error(
          `Application ${applicationId} was updated but could not be read.`,
        );
      }

      return mapApplicationRow(updated);
    },
  );

  return updateApplicationRecord(parsedId, update);
}

export function listApplicationEvents(
  applicationId: number,
): ApplicationEventDto[] {
  const parsedApplicationId = idSchema.parse(applicationId);

  return getDb()
    .prepare<[number], ApplicationEventRow>(
      `
      SELECT id, application_id, event_type, title, note, happened_at, created_at
      FROM application_events
      WHERE application_id = ?
      ORDER BY datetime(happened_at) DESC, id DESC
    `,
    )
    .all(parsedApplicationId)
    .map(mapApplicationEventRow);
}

export function createApplicationEvent(
  applicationId: number,
  input: ApplicationEventCreateInput,
): ApplicationEventDto | null {
  const parsedApplicationId = idSchema.parse(applicationId);
  const event = applicationEventCreateInputSchema.parse(input);
  const database = getDb();
  const createEvent = database.transaction(() => {
    const existing = getApplicationRowById(parsedApplicationId);

    if (!existing) {
      return null;
    }

    const created = insertApplicationEventRecord(
      database,
      parsedApplicationId,
      event,
    );

    database
      .prepare<[number]>(
        `
        UPDATE applications
        SET updated_at = datetime('now')
        WHERE id = ?
      `,
      )
      .run(parsedApplicationId);

    return created;
  });

  return createEvent();
}

export class AgentActionProposalNotPendingError extends Error {
  constructor(
    readonly id: number,
    readonly status: AgentActionProposalStatus,
  ) {
    super(`Agent action proposal ${id} is ${status}.`);
    this.name = "AgentActionProposalNotPendingError";
  }
}

export function createAgentActionProposal(
  input: AgentActionProposalCreateInput,
): AgentActionProposal {
  const proposal = agentActionProposalCreateInputSchema.parse(input);
  const result = getDb()
    .prepare<[string, string, string, string, string | null, string | null, string]>(
      `
      INSERT INTO agent_action_proposals (
        action_type,
        title,
        reason,
        risk_note,
        source_agent_id,
        source_tool_name,
        payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      proposal.actionType,
      proposal.title,
      proposal.reason,
      proposal.riskNote ?? "",
      proposal.sourceAgentId ?? null,
      proposal.sourceToolName ?? null,
      stringifyJson(proposal.payload, "agent action proposal payload"),
    );
  const id = normalizeRowId(result.lastInsertRowid);
  const created = getAgentActionProposalRowById(id);

  if (!created) {
    throw new Error(`Agent action proposal ${id} was inserted but could not be read.`);
  }

  return mapAgentActionProposalRow(created);
}

export function getAgentActionProposalById(
  id: number,
): AgentActionProposal | null {
  const parsedId = idSchema.parse(id);
  const row = getAgentActionProposalRowById(parsedId);

  return row ? mapAgentActionProposalRow(row) : null;
}

export function listAgentActionProposals(
  input: AgentActionProposalListInput = {},
): AgentActionProposal[] {
  const listInput = agentActionProposalListInputSchema.parse(input);
  const limit = listInput.limit ?? 20;

  if (listInput.status) {
    return getDb()
      .prepare<[AgentActionProposalStatus, number], AgentActionProposalRow>(
        `
        SELECT
          id,
          action_type,
          status,
          title,
          reason,
          risk_note,
          source_agent_id,
          source_tool_name,
          payload_json,
          result_json,
          created_at,
          updated_at,
          confirmed_at,
          dismissed_at
        FROM agent_action_proposals
        WHERE status = ?
        ORDER BY datetime(updated_at) DESC, id DESC
        LIMIT ?
      `,
      )
      .all(listInput.status, limit)
      .map(mapAgentActionProposalRow);
  }

  return getDb()
    .prepare<[number], AgentActionProposalRow>(
      `
      SELECT
        id,
        action_type,
        status,
        title,
        reason,
        risk_note,
        source_agent_id,
        source_tool_name,
        payload_json,
        result_json,
        created_at,
        updated_at,
        confirmed_at,
        dismissed_at
      FROM agent_action_proposals
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT ?
    `,
    )
    .all(limit)
    .map(mapAgentActionProposalRow);
}

export function createAgentSession(
  input: AgentSessionCreateInput = {},
): AgentSession {
  const sessionInput = agentSessionCreateInputSchema.parse(input);
  const title = sessionInput.title ?? "新会话";
  const result = getDb()
    .prepare<[string, string]>(
      `
      INSERT INTO agent_sessions (title, messages_json)
      VALUES (?, ?)
    `,
    )
    .run(title, stringifyJson([], "agent session messages"));
  const id = normalizeRowId(result.lastInsertRowid);
  const created = getAgentSessionRowById(id);

  if (!created) {
    throw new Error(`Agent session ${id} was inserted but could not be read.`);
  }

  return mapAgentSessionRow(created);
}

export function listAgentSessions(limit?: number): AgentSessionListItem[] {
  const parsedLimit = listLimitSchema.parse(limit);

  return getDb()
    .prepare<[number], AgentSessionRow>(
      `
      SELECT id, title, messages_json, memory_digest, created_at, updated_at
      FROM agent_sessions
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT ?
    `,
    )
    .all(parsedLimit)
    .map(mapAgentSessionRow)
    .map(mapAgentSessionListItem);
}

export function getAgentSessionById(id: number): AgentSession | null {
  const parsedId = idSchema.parse(id);
  const row = getAgentSessionRowById(parsedId);

  return row ? mapAgentSessionRow(row) : null;
}

export function updateAgentSession(
  id: number,
  input: AgentSessionUpdateInput,
): AgentSession | null {
  const parsedId = idSchema.parse(id);
  const updateInput = agentSessionUpdateInputSchema.parse(input);
  const database = getDb();
  const updateSession = database.transaction(() => {
    const existing = getAgentSessionRowById(parsedId);

    if (!existing) {
      return null;
    }

    if (updateInput.title !== undefined) {
      database
        .prepare<[string, number]>(
          `
          UPDATE agent_sessions
          SET title = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `,
        )
        .run(updateInput.title, parsedId);
    }

    if (updateInput.memoryDigest !== undefined) {
      database
        .prepare<[string | null, number]>(
          `
          UPDATE agent_sessions
          SET memory_digest = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `,
        )
        .run(updateInput.memoryDigest, parsedId);

      syncSessionDigestMemory(
        database,
        parsedId,
        updateInput.memoryDigest,
        "user_edit",
        { allowCreateAfterDelete: true },
      );
    }

    const updated = getAgentSessionRowById(parsedId);

    if (!updated) {
      throw new Error(`Agent session ${parsedId} was updated but could not be read.`);
    }

    return mapAgentSessionRow(updated);
  });

  return updateSession();
}

export function deleteAgentSession(id: number): AgentSession | null {
  const parsedId = idSchema.parse(id);
  const database = getDb();
  const deleteSession = database.transaction(() => {
    const existing = getAgentSessionRowById(parsedId);

    if (!existing) {
      return null;
    }

    database
      .prepare<[number]>(
        `
        UPDATE agent_memory_items
        SET deleted_at = COALESCE(deleted_at, datetime('now')),
            updated_at = datetime('now')
        WHERE session_id = ?
          AND deleted_at IS NULL
      `,
      )
      .run(parsedId);
    database
      .prepare<[number]>(
        `
        DELETE FROM agent_sessions
        WHERE id = ?
      `,
      )
      .run(parsedId);

    return mapAgentSessionRow(existing);
  });

  return deleteSession();
}

export function appendAgentSessionMessages(
  id: number,
  messages: AgentSessionMessage[],
): AgentSession | null {
  const parsedId = idSchema.parse(id);
  const parsedMessages = agentSessionMessagesSchema.parse(messages);
  const database = getDb();
  const appendMessages = database.transaction(() => {
    const existing = getAgentSessionRowById(parsedId);

    if (!existing) {
      return null;
    }

    const current = mapAgentSessionRow(existing);
    const nextMessages = agentSessionMessagesSchema.parse(
      [...current.messages, ...parsedMessages].slice(-80),
    );
    const memoryDigest = shouldAutoMaintainSessionDigest(database, parsedId)
      ? buildSessionMemoryDigest(nextMessages)
      : current.memoryDigest;

    database
      .prepare<[string, string | null, number]>(
        `
        UPDATE agent_sessions
        SET messages_json = ?,
            memory_digest = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `,
      )
      .run(
        stringifyJson(nextMessages, `agent_sessions(${parsedId}).messages_json`),
        memoryDigest,
        parsedId,
      );
    syncSessionDigestMemory(
      database,
      parsedId,
      memoryDigest,
      "session_summary",
    );

    const updated = getAgentSessionRowById(parsedId);

    if (!updated) {
      throw new Error(`Agent session ${parsedId} was appended but could not be read.`);
    }

    return mapAgentSessionRow(updated);
  });

  return appendMessages();
}

export function getAgentMemoryItemById(id: number): AgentMemoryItem | null {
  const parsedId = idSchema.parse(id);
  const row = getAgentMemoryItemRowById(parsedId);

  return row ? mapAgentMemoryItemRow(row) : null;
}

export function listAgentMemoryItems(
  input: AgentMemoryListInput = {},
): AgentMemoryItem[] {
  const listInput = agentMemoryListInputSchema.parse(input);
  const limit = listInput.limit ?? 20;
  const activeClause = listInput.includeDeleted ? "" : "AND deleted_at IS NULL";
  const sessionClause =
    listInput.sessionId === undefined ? "" : "AND session_id = ?";
  const params =
    listInput.sessionId === undefined
      ? [limit]
      : [listInput.sessionId, limit];

  return getDb()
    .prepare<number[], AgentMemoryItemRow>(
      `
      SELECT
        id,
        session_id,
        memory_type,
        content,
        source,
        created_at,
        updated_at,
        deleted_at
      FROM agent_memory_items
      WHERE 1 = 1
        ${activeClause}
        ${sessionClause}
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT ?
    `,
    )
    .all(...params)
    .map(mapAgentMemoryItemRow);
}

export function listVisibleAgentMemoriesForPrompt(
  sessionId?: number,
): AgentMemoryItem[] {
  const parsedSessionId =
    sessionId === undefined ? undefined : idSchema.parse(sessionId);

  if (parsedSessionId === undefined) {
    return getDb()
      .prepare<[number], AgentMemoryItemRow>(
        `
        SELECT
          id,
          session_id,
          memory_type,
          content,
          source,
          created_at,
          updated_at,
          deleted_at
        FROM agent_memory_items
        WHERE deleted_at IS NULL
          AND session_id IS NULL
          AND memory_type = 'user_preference'
        ORDER BY datetime(updated_at) DESC, id DESC
        LIMIT ?
      `,
      )
      .all(8)
      .map(mapAgentMemoryItemRow);
  }

  return getDb()
    .prepare<[number, number], AgentMemoryItemRow>(
      `
      SELECT
        id,
        session_id,
        memory_type,
        content,
        source,
        created_at,
        updated_at,
        deleted_at
      FROM agent_memory_items
      WHERE deleted_at IS NULL
        AND (
          session_id = ?
          OR (session_id IS NULL AND memory_type = 'user_preference')
        )
      ORDER BY
        CASE memory_type
          WHEN 'working_digest' THEN 0
          WHEN 'episodic_summary' THEN 1
          ELSE 2
        END ASC,
        datetime(updated_at) DESC,
        id DESC
      LIMIT ?
    `,
    )
    .all(parsedSessionId, 8)
    .map(mapAgentMemoryItemRow);
}

export function updateAgentMemoryItem(
  id: number,
  input: AgentMemoryUpdateInput,
): AgentMemoryItem | null {
  const parsedId = idSchema.parse(id);
  const updateInput = agentMemoryUpdateInputSchema.parse(input);
  const database = getDb();
  const updateMemory = database.transaction(() => {
    const existing = getAgentMemoryItemRowById(parsedId);

    if (!existing || existing.deleted_at !== null) {
      return null;
    }

    const nextContent = updateInput.content ?? existing.content;
    const nextSource = updateInput.source ?? existing.source;

    database
      .prepare<[string, string, number]>(
        `
        UPDATE agent_memory_items
        SET content = ?,
            source = ?,
            updated_at = datetime('now')
        WHERE id = ?
          AND deleted_at IS NULL
      `,
      )
      .run(nextContent, nextSource, parsedId);

    if (isSessionDigestMemory(existing)) {
      database
        .prepare<[string, number]>(
          `
          UPDATE agent_sessions
          SET memory_digest = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `,
        )
        .run(nextContent, existing.session_id);
    }

    const updated = getAgentMemoryItemRowById(parsedId);

    if (!updated) {
      throw new Error(`Agent memory ${parsedId} was updated but could not be read.`);
    }

    return mapAgentMemoryItemRow(updated);
  });

  return updateMemory();
}

export function deleteAgentMemoryItem(id: number): AgentMemoryItem | null {
  const parsedId = idSchema.parse(id);
  const database = getDb();
  const deleteMemory = database.transaction(() => {
    const existing = getAgentMemoryItemRowById(parsedId);

    if (!existing || existing.deleted_at !== null) {
      return null;
    }

    database
      .prepare<[number]>(
        `
        UPDATE agent_memory_items
        SET deleted_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
          AND deleted_at IS NULL
      `,
      )
      .run(parsedId);

    if (isSessionDigestMemory(existing)) {
      database
        .prepare<[number]>(
          `
          UPDATE agent_sessions
          SET memory_digest = NULL,
              updated_at = datetime('now')
          WHERE id = ?
        `,
        )
        .run(existing.session_id);
    }

    const deleted = getAgentMemoryItemRowById(parsedId);

    if (!deleted) {
      throw new Error(`Agent memory ${parsedId} was deleted but could not be read.`);
    }

    return mapAgentMemoryItemRow(deleted);
  });

  return deleteMemory();
}

export function confirmAgentActionProposal(
  id: number,
  result: JsonObject,
): AgentActionProposal | null {
  return updateAgentActionProposalStatus(id, "confirmed", result);
}

export function dismissAgentActionProposal(
  id: number,
  result: JsonObject = {},
): AgentActionProposal | null {
  return updateAgentActionProposalStatus(id, "dismissed", result);
}

function updateAgentActionProposalStatus(
  id: number,
  status: Extract<AgentActionProposalStatus, "confirmed" | "dismissed">,
  result: JsonObject,
): AgentActionProposal | null {
  const parsedId = idSchema.parse(id);
  const parsedResult = jsonObjectSchema.parse(result);
  const database = getDb();
  const updateProposal = database.transaction(() => {
    const existing = getAgentActionProposalRowById(parsedId);

    if (!existing) {
      return null;
    }

    const existingStatus = agentActionProposalStatusSchema.parse(existing.status);

    if (existingStatus !== "pending") {
      throw new AgentActionProposalNotPendingError(parsedId, existingStatus);
    }

    if (status === "confirmed") {
      database
        .prepare<[string, number]>(
          `
          UPDATE agent_action_proposals
          SET status = 'confirmed',
              result_json = ?,
              confirmed_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `,
        )
        .run(
          stringifyJson(parsedResult, "agent action proposal result"),
          parsedId,
        );
    } else {
      database
        .prepare<[string, number]>(
          `
          UPDATE agent_action_proposals
          SET status = 'dismissed',
              result_json = ?,
              dismissed_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `,
        )
        .run(
          stringifyJson(parsedResult, "agent action proposal dismissal result"),
          parsedId,
        );
    }

    const updated = getAgentActionProposalRowById(parsedId);

    if (!updated) {
      throw new Error(`Agent action proposal ${parsedId} was updated but could not be read.`);
    }

    return mapAgentActionProposalRow(updated);
  });

  return updateProposal();
}

type ApplicationKeyDates = {
  abandonedAt: string | null;
  appliedAt: string | null;
  interviewAt: string | null;
  offerAt: string | null;
  rejectedAt: string | null;
};

function normalizeApplicationListInput(
  input?: number | ApplicationListInput,
): Required<Pick<ApplicationListInput, "limit">> &
  Omit<ApplicationListInput, "limit"> {
  if (typeof input === "number" || input === undefined) {
    return {
      limit: listLimitSchema.parse(input),
    };
  }

  return {
    channel:
      typeof input.channel === "string" && input.channel.trim().length > 0
        ? input.channel.trim()
        : undefined,
    limit: listLimitSchema.parse(input.limit),
    priority:
      input.priority === undefined
        ? undefined
        : applicationPrioritySchema.parse(input.priority),
    q:
      typeof input.q === "string" && input.q.trim().length > 0
        ? input.q.trim()
        : undefined,
    status:
      input.status === undefined
        ? undefined
        : applicationStatusSchema.parse(input.status),
  };
}

function applyStatusDateDefaults(
  status: ApplicationStatus,
  dates: ApplicationKeyDates,
  fallbackTime: string,
): ApplicationKeyDates {
  if (status === "applied" && !dates.appliedAt) {
    return { ...dates, appliedAt: fallbackTime };
  }

  if (status === "interviewing" && !dates.interviewAt) {
    return { ...dates, interviewAt: fallbackTime };
  }

  if (status === "offer_received" && !dates.offerAt) {
    return { ...dates, offerAt: fallbackTime };
  }

  if (status === "rejected" && !dates.rejectedAt) {
    return { ...dates, rejectedAt: fallbackTime };
  }

  if (status === "abandoned" && !dates.abandonedAt) {
    return { ...dates, abandonedAt: fallbackTime };
  }

  return dates;
}

function buildApplicationUpdateEvents({
  eventTime,
  existing,
  keyDates,
  nextChannel,
  nextFollowUpAt,
  nextNotes,
  nextPriority,
  nextSourceUrl,
  nextStatus,
  nextTags,
  previousStatus,
  previousTags,
}: {
  eventTime: string;
  existing: ApplicationRow;
  keyDates: ApplicationKeyDates;
  nextChannel: string | null;
  nextFollowUpAt: string | null;
  nextNotes: string;
  nextPriority: ApplicationPriority;
  nextSourceUrl: string | null;
  nextStatus: ApplicationStatus;
  nextTags: string[];
  previousStatus: ApplicationStatus;
  previousTags: string[];
}): ApplicationEventCreateInput[] {
  const events: ApplicationEventCreateInput[] = [];

  if (nextStatus !== previousStatus) {
    events.push({
      eventType: getStatusChangeEventType(nextStatus),
      happenedAt: eventTime,
      note: `从 ${APPLICATION_STATUS_LABELS[previousStatus]} 更新为 ${APPLICATION_STATUS_LABELS[nextStatus]}。`,
      title: `状态更新为${APPLICATION_STATUS_LABELS[nextStatus]}`,
    });
  }

  if (nextFollowUpAt !== existing.next_follow_up_at) {
    events.push({
      eventType: "follow_up_scheduled",
      happenedAt: eventTime,
      note: nextFollowUpAt
        ? `下次跟进时间：${nextFollowUpAt}`
        : "已清空下次跟进时间。",
      title: nextFollowUpAt ? "下次跟进已安排" : "下次跟进已清空",
    });
  }

  if (nextNotes !== existing.notes) {
    events.push({
      eventType: "note_added",
      happenedAt: eventTime,
      note: nextNotes.trim()
        ? truncateForEventNote(nextNotes.trim())
        : "备注已清空。",
      title: nextNotes.trim() ? "备注已更新" : "备注已清空",
    });
  }

  const detailChanges = buildApplicationDetailChangeNotes({
    existing,
    keyDates,
    nextChannel,
    nextPriority,
    nextSourceUrl,
    nextTags,
    previousTags,
  });

  if (detailChanges.length > 0) {
    events.push({
      eventType: "note_added",
      happenedAt: eventTime,
      note: detailChanges.join("；"),
      title: "跟进详情已更新",
    });
  }

  return events;
}

function buildApplicationDetailChangeNotes({
  existing,
  keyDates,
  nextChannel,
  nextPriority,
  nextSourceUrl,
  nextTags,
  previousTags,
}: {
  existing: ApplicationRow;
  keyDates: ApplicationKeyDates;
  nextChannel: string | null;
  nextPriority: ApplicationPriority;
  nextSourceUrl: string | null;
  nextTags: string[];
  previousTags: string[];
}): string[] {
  const changes: string[] = [];

  if (nextPriority !== existing.priority) {
    changes.push(`优先级：${formatPriority(existing.priority)} -> ${APPLICATION_PRIORITY_LABELS[nextPriority]}`);
  }

  if (nextChannel !== existing.channel) {
    changes.push(`渠道：${formatNullableText(existing.channel)} -> ${formatNullableText(nextChannel)}`);
  }

  if (nextSourceUrl !== existing.source_url) {
    changes.push("原岗位链接已更新");
  }

  if (nextTags.join("\n") !== previousTags.join("\n")) {
    changes.push(`标签：${formatTags(previousTags)} -> ${formatTags(nextTags)}`);
  }

  appendDateChange(changes, "投递日期", existing.applied_at, keyDates.appliedAt);
  appendDateChange(changes, "面试日期", existing.interview_at, keyDates.interviewAt);
  appendDateChange(changes, "Offer 日期", existing.offer_at, keyDates.offerAt);
  appendDateChange(changes, "未通过日期", existing.rejected_at, keyDates.rejectedAt);
  appendDateChange(changes, "放弃日期", existing.abandoned_at, keyDates.abandonedAt);

  return changes;
}

function appendDateChange(
  changes: string[],
  label: string,
  previousValue: string | null,
  nextValue: string | null,
) {
  if (previousValue !== nextValue) {
    changes.push(`${label}：${formatNullableText(previousValue)} -> ${formatNullableText(nextValue)}`);
  }
}

function getStatusChangeEventType(
  status: ApplicationStatus,
): ApplicationEventType {
  if (status === "interviewing") {
    return "interview_scheduled";
  }

  if (status === "offer_received") {
    return "offer_received";
  }

  if (status === "rejected") {
    return "rejected";
  }

  if (status === "abandoned") {
    return "abandoned";
  }

  return "status_changed";
}

function insertApplicationEventRecord(
  database: Database.Database,
  applicationId: number,
  input: ApplicationEventCreateInput,
): ApplicationEventDto {
  const event = applicationEventCreateInputSchema.parse(input);
  const title =
    event.title?.trim() || APPLICATION_EVENT_DEFAULT_TITLES[event.eventType];
  const happenedAt = event.happenedAt ?? new Date().toISOString();
  const result = database
    .prepare<[number, ApplicationEventType, string, string, string]>(
      `
      INSERT INTO application_events (
        application_id,
        event_type,
        title,
        note,
        happened_at
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    )
    .run(applicationId, event.eventType, title, event.note, happenedAt);
  const eventId = normalizeRowId(result.lastInsertRowid);
  const row =
    database
      .prepare<[number], ApplicationEventRow>(
        `
        SELECT id, application_id, event_type, title, note, happened_at, created_at
        FROM application_events
        WHERE id = ?
      `,
      )
      .get(eventId) ?? null;

  if (!row) {
    throw new Error(`Application event ${eventId} was inserted but could not be read.`);
  }

  return mapApplicationEventRow(row);
}

function formatPriority(value: string): string {
  const parsed = applicationPrioritySchema.safeParse(value);

  return parsed.success ? APPLICATION_PRIORITY_LABELS[parsed.data] : "中优先级";
}

function formatNullableText(value: string | null): string {
  return value && value.trim() ? value.trim() : "未填写";
}

function formatTags(tags: string[]): string {
  return tags.length > 0 ? tags.join("、") : "未填写";
}

function truncateForEventNote(value: string): string {
  return value.length > 800 ? `${value.slice(0, 800)}...` : value;
}

export function getSetting(key: SettingKey): SettingDto | null {
  const parsedKey = settingKeySchema.parse(key);
  const row = getSettingRowByKey(parsedKey);

  return row ? mapSettingRow(row) : null;
}

export function listSettings(): SettingDto[] {
  return getDb()
    .prepare<[], SettingRow>(
      `
      SELECT id, key, value_json, updated_at
      FROM settings
      ORDER BY key ASC
    `,
    )
    .all()
    .map(mapSettingRow);
}

export function getDataExportSnapshot(): DataExportDto {
  const settings = listAllSettingsForExport();
  const careerProfileSetting = settings.find(
    (setting) => setting.key === "career_profile",
  );
  const careerProfile =
    careerProfileSetting === undefined
      ? null
      : careerProfileSettingsSchema.parse(careerProfileSetting.value);

  return {
    product: DATA_EXPORT_PRODUCT,
    exportVersion: DATA_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    source: {
      boundaryNotes: [
        "导出主体来自已保存记录。",
        "导出内容包含你已保存的报告、简历、投递记录和设置。",
        "手动保存的岗位、报告和投递记录会随导出出现。",
        "模型辅助分析、规则回退结果或趋势摘要只会包含在已保存的相关记录字段中。",
      ],
      demoDataPath: DATA_EXPORT_DEMO_DATA_PATH,
      includesEnvironmentSecrets: false,
      sqlitePath: DATA_EXPORT_SQLITE_PATH,
      storage: "local-sqlite",
      userFacingLabel: "本地真实数据导出",
    },
    tables: {
      reports: listAllReportsForExport(),
      resumes: listAllResumesForExport(),
      applications: listAllApplicationsForExport(),
      application_events: listAllApplicationEventsForExport(),
      agent_action_proposals: listAllAgentActionProposalsForExport(),
      agent_sessions: listAllAgentSessionsForExport(),
      agent_memory_items: listAllAgentMemoryItemsForExport(),
      settings,
      career_profile: careerProfile,
      interview_sessions: listAllInterviewSessionsForExport(),
      interview_answers: listAllInterviewAnswersForExport(),
      stories: listAllStoriesForExport(),
      resume_optimization_runs: listAllResumeOptimizationRunsForExport(),
      optimization_feedback: listAllOptimizationFeedbackForExport(),
    },
  };
}

export function clearDataCategories(
  categories: DataClearCategory[],
): DataClearResultDto {
  const uniqueCategories = Array.from(new Set(categories));
  const database = getDb();
  const clearData = database.transaction(
    (selectedCategories: DataClearCategory[]): DataClearResultDto => {
      const selected = new Set(selectedCategories);
      const cleared: Record<DataClearCategory, number> = {
        applications: 0,
        reports: 0,
        resumes: 0,
        settings: 0,
      };
      const affected = {
        application_events: 0,
        detached_application_report_refs: 0,
        detached_application_resume_refs: 0,
        detached_interview_report_refs: 0,
        detached_interview_resume_refs: 0,
        detached_optimization_report_refs: 0,
        optimization_feedback: 0,
        resume_optimization_runs: 0,
      };

      if (selected.has("applications")) {
        affected.application_events += runDbChange(
          database,
          `
          DELETE FROM application_events
          WHERE application_id IN (SELECT id FROM applications)
        `,
        );
        cleared.applications += runDbChange(database, "DELETE FROM applications");
      }

      if (selected.has("reports")) {
        if (!selected.has("applications")) {
          affected.detached_application_report_refs += runDbChange(
            database,
            "UPDATE applications SET report_id = NULL WHERE report_id IS NOT NULL",
          );
        }

        affected.detached_interview_report_refs += runDbChange(
          database,
          "UPDATE interview_sessions SET report_id = NULL WHERE report_id IS NOT NULL",
        );
        affected.detached_optimization_report_refs += runDbChange(
          database,
          "UPDATE resume_optimization_runs SET report_id = NULL WHERE report_id IS NOT NULL",
        );
        cleared.reports += runDbChange(database, "DELETE FROM reports");
      }

      if (selected.has("resumes")) {
        affected.optimization_feedback += runDbChange(
          database,
          `
          DELETE FROM optimization_feedback
          WHERE run_id IN (
            SELECT id
            FROM resume_optimization_runs
            WHERE resume_id IN (SELECT id FROM resumes)
          )
        `,
        );
        affected.resume_optimization_runs += runDbChange(
          database,
          `
          DELETE FROM resume_optimization_runs
          WHERE resume_id IN (SELECT id FROM resumes)
        `,
        );

        if (!selected.has("applications")) {
          affected.detached_application_resume_refs += runDbChange(
            database,
            "UPDATE applications SET resume_id = NULL WHERE resume_id IS NOT NULL",
          );
        }

        affected.detached_interview_resume_refs += runDbChange(
          database,
          "UPDATE interview_sessions SET resume_id = NULL WHERE resume_id IS NOT NULL",
        );
        cleared.resumes += runDbChange(database, "DELETE FROM resumes");
      }

      if (selected.has("settings")) {
        cleared.settings += runDbChange(database, "DELETE FROM settings");
      }

      return {
        clearedAt: new Date().toISOString(),
        confirmation: "accepted",
        requestedCategories: selectedCategories,
        cleared,
        affected,
      };
    },
  );

  return clearData(uniqueCategories);
}

function listAllReportsForExport(): ReportDto[] {
  return getDb()
    .prepare<[], ReportRow>(
      `
      SELECT id, company, role, jd_text, score_json, risks_json, report_json, created_at
      FROM reports
      ORDER BY datetime(created_at) DESC, id DESC
    `,
    )
    .all()
    .map(mapReportRow);
}

function listAllResumesForExport(): ResumeDto[] {
  return getDb()
    .prepare<[], ResumeRow>(
      `
      SELECT id, name, content_json, skills_json, ecosystem_json, direction, is_default, archived_at, created_at, updated_at
      FROM resumes
      ORDER BY datetime(updated_at) DESC, id DESC
    `,
    )
    .all()
    .map(mapResumeRow);
}

function listAllApplicationsForExport(): ApplicationDto[] {
  return getDb()
    .prepare<[], ApplicationRow>(
      `
      SELECT
        id,
        report_id,
        resume_id,
        company,
        role,
        source_url,
        status,
        priority,
        channel,
        score_overall,
        risk_level,
        recommended_resume_name,
        notes,
        tags_json,
        next_follow_up_at,
        applied_at,
        interview_at,
        offer_at,
        rejected_at,
        abandoned_at,
        created_at,
        updated_at
      FROM applications
      ORDER BY datetime(updated_at) DESC, id DESC
    `,
    )
    .all()
    .map(mapApplicationRow);
}

function listAllApplicationEventsForExport(): ApplicationEventDto[] {
  return getDb()
    .prepare<[], ApplicationEventRow>(
      `
      SELECT id, application_id, event_type, title, note, happened_at, created_at
      FROM application_events
      ORDER BY datetime(happened_at) DESC, id DESC
    `,
    )
    .all()
    .map(mapApplicationEventRow);
}

function listAllAgentActionProposalsForExport(): AgentActionProposal[] {
  return getDb()
    .prepare<[], AgentActionProposalRow>(
      `
      SELECT
        id,
        action_type,
        status,
        title,
        reason,
        risk_note,
        source_agent_id,
        source_tool_name,
        payload_json,
        result_json,
        created_at,
        updated_at,
        confirmed_at,
        dismissed_at
      FROM agent_action_proposals
      ORDER BY datetime(updated_at) DESC, id DESC
    `,
    )
    .all()
    .map(mapAgentActionProposalRow);
}

function listAllAgentSessionsForExport(): AgentSession[] {
  return getDb()
    .prepare<[], AgentSessionRow>(
      `
      SELECT id, title, messages_json, memory_digest, created_at, updated_at
      FROM agent_sessions
      ORDER BY datetime(updated_at) DESC, id DESC
    `,
    )
    .all()
    .map(mapAgentSessionRow);
}

function listAllAgentMemoryItemsForExport(): AgentMemoryItem[] {
  return getDb()
    .prepare<[], AgentMemoryItemRow>(
      `
      SELECT
        id,
        session_id,
        memory_type,
        content,
        source,
        created_at,
        updated_at,
        deleted_at
      FROM agent_memory_items
      ORDER BY datetime(updated_at) DESC, id DESC
    `,
    )
    .all()
    .map(mapAgentMemoryItemRow);
}

function listAllSettingsForExport(): SettingDto[] {
  return getDb()
    .prepare<[], SettingRow>(
      `
      SELECT id, key, value_json, updated_at
      FROM settings
      ORDER BY key ASC
    `,
    )
    .all()
    .map(mapSettingRow);
}

function listAllInterviewSessionsForExport(): InterviewSessionDto[] {
  return getDb()
    .prepare<[], InterviewSessionRow>(
      `
      SELECT id, report_id, resume_id, title, mode, questions_json, created_at, updated_at
      FROM interview_sessions
      ORDER BY datetime(updated_at) DESC, id DESC
    `,
    )
    .all()
    .map(mapInterviewSessionRow);
}

function listAllInterviewAnswersForExport(): InterviewAnswerDto[] {
  return getDb()
    .prepare<[], InterviewAnswerRow>(
      `
      SELECT id, session_id, question_id, answer_text, score_json, created_at
      FROM interview_answers
      ORDER BY datetime(created_at) DESC, id DESC
    `,
    )
    .all()
    .map(mapInterviewAnswerRow);
}

function listAllStoriesForExport(): StoryDto[] {
  return getDb()
    .prepare<[], StoryRow>(
      `
      SELECT id, title, situation, task, action, result, tags_json, created_at, updated_at
      FROM stories
      ORDER BY datetime(updated_at) DESC, id DESC
    `,
    )
    .all()
    .map(mapStoryRow);
}

function listAllResumeOptimizationRunsForExport(): ResumeOptimizationRunDto[] {
  return getDb()
    .prepare<[], ResumeOptimizationRunRow>(
      `
      SELECT id, resume_id, report_id, mode, result_json, created_at
      FROM resume_optimization_runs
      ORDER BY datetime(created_at) DESC, id DESC
    `,
    )
    .all()
    .map((row) =>
      mapResumeOptimizationRunRow(
        row,
        listOptimizationFeedbackRowsByRunId(row.id).map(mapOptimizationFeedbackRow),
      ),
    );
}

function listAllOptimizationFeedbackForExport(): OptimizationFeedbackDto[] {
  return getDb()
    .prepare<[], OptimizationFeedbackRow>(
      `
      SELECT id, run_id, suggestion_id, decision, reason, created_at
      FROM optimization_feedback
      ORDER BY datetime(created_at) DESC, id DESC
    `,
    )
    .all()
    .map(mapOptimizationFeedbackRow);
}

function runDbChange(database: Database.Database, sql: string): number {
  return database.prepare(sql).run().changes;
}

export function upsertSetting(
  key: SettingKey,
  value: z.input<typeof settingsUpsertInputSchema>["value"],
): SettingDto {
  const setting = settingsUpsertInputSchema.parse({ key, value });

  getDb()
    .prepare<[SettingKey, string]>(
      `
      INSERT INTO settings (key, value_json, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = datetime('now')
    `,
    )
    .run(setting.key, stringifyJson(setting.value, `setting ${setting.key}`));

  const row = getSettingRowByKey(setting.key);

  if (!row) {
    throw new Error(`Setting ${setting.key} was saved but could not be read.`);
  }

  return mapSettingRow(row);
}

export function upsertSettings(
  inputs: z.input<typeof settingsUpsertInputSchema>[],
): SettingDto[] {
  const settings = settingsBatchSchema.parse(inputs);
  const database = getDb();
  const statement = database.prepare<[SettingKey, string]>(
    `
    INSERT INTO settings (key, value_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = datetime('now')
  `,
  );
  const writeSettings = database.transaction((items: typeof settings) => {
    for (const setting of items) {
      statement.run(
        setting.key,
        stringifyJson(setting.value, `setting ${setting.key}`),
      );
    }

    return items.map((setting) => {
      const row = getSettingRowByKey(setting.key);

      if (!row) {
        throw new Error(
          `Setting ${setting.key} was saved but could not be read.`,
        );
      }

      return mapSettingRow(row);
    });
  });

  return writeSettings(settings);
}

export function saveResume(input: z.input<typeof resumeSaveInputSchema>): ResumeDto {
  const resume = resumeSaveInputSchema.parse(input);
  const result = getDb()
    .prepare<[string, string, string, string, string]>(
      `
      INSERT INTO resumes (name, content_json, skills_json, ecosystem_json, direction, is_default, archived_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, NULL, datetime('now'))
    `,
    )
    .run(
      resume.name,
      stringifyJson(resume.content, "resume content"),
      stringifyJson(resume.skills, "resume skills"),
      stringifyJson(resume.ecosystem, "resume ecosystem"),
      resume.direction,
    );
  const id = normalizeRowId(result.lastInsertRowid);
  const created = getResumeRowById(id);

  if (!created) {
    throw new Error(`Resume ${id} was inserted but could not be read.`);
  }

  return mapResumeRow(created);
}

export function getResumeById(id: number): ResumeDto | null {
  const parsedId = idSchema.parse(id);
  const row = getResumeRowById(parsedId);

  return row ? mapResumeRow(row) : null;
}

export function listResumes(
  limit?: number,
  options: { includeArchived?: boolean } = {},
): ResumeDto[] {
  const parsedLimit = listLimitSchema.parse(limit);
  const archivedFilter = options.includeArchived ? "" : "WHERE archived_at IS NULL";

  return getDb()
    .prepare<[number], ResumeRow>(
      `
      SELECT id, name, content_json, skills_json, ecosystem_json, direction, is_default, archived_at, created_at, updated_at
      FROM resumes
      ${archivedFilter}
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT ?
    `,
    )
    .all(parsedLimit)
    .map(mapResumeRow);
}

export function getDefaultResume(): ResumeDto | null {
  const row =
    getDb()
      .prepare<[], ResumeRow>(
        `
        SELECT id, name, content_json, skills_json, ecosystem_json, direction, is_default, archived_at, created_at, updated_at
        FROM resumes
        WHERE is_default = 1
          AND archived_at IS NULL
        LIMIT 1
      `,
      )
      .get() ?? null;

  return row ? mapResumeRow(row) : null;
}

export class ArchivedResumeCannotBeDefaultError extends Error {
  constructor(id: number) {
    super(`Archived resume ${id} cannot be set as default.`);
    this.name = "ArchivedResumeCannotBeDefaultError";
  }
}

export class ArchivedResumeCannotUpdateDirectionError extends Error {
  constructor(id: number) {
    super(`Archived resume ${id} cannot update direction.`);
    this.name = "ArchivedResumeCannotUpdateDirectionError";
  }
}

export function updateResumeDirection(
  id: number,
  direction: ResumeDirection,
): ResumeDto | null {
  const parsedId = idSchema.parse(id);
  const parsedDirection = resumeDirectionSchema.parse(direction);
  const database = getDb();
  const updateDirection = database.transaction(
    (resumeId: number, nextDirection: ResumeDirection) => {
      const target = getResumeRowById(resumeId);

      if (!target) {
        return null;
      }

      if (target.archived_at !== null) {
        throw new ArchivedResumeCannotUpdateDirectionError(resumeId);
      }

      database
        .prepare<[ResumeDirection, number]>(
          `
          UPDATE resumes
          SET direction = ?,
              updated_at = datetime('now')
          WHERE id = ?
            AND archived_at IS NULL
        `,
        )
        .run(nextDirection, resumeId);

      const updated = getResumeRowById(resumeId);

      if (!updated) {
        throw new Error(`Resume ${resumeId} was updated but could not be read.`);
      }

      return mapResumeRow(updated);
    },
  );

  return updateDirection(parsedId, parsedDirection);
}

export function setDefaultResume(id: number): ResumeDto | null {
  const parsedId = idSchema.parse(id);
  const database = getDb();
  const updateDefault = database.transaction((resumeId: number) => {
    const target = getResumeRowById(resumeId);

    if (!target) {
      return null;
    }

    if (target.archived_at !== null) {
      throw new ArchivedResumeCannotBeDefaultError(resumeId);
    }

    database
      .prepare<[number]>(
        `
        UPDATE resumes
        SET is_default = 0
        WHERE is_default = 1
          AND id <> ?
      `,
      )
      .run(resumeId);
    database
      .prepare<[number]>(
        `
        UPDATE resumes
        SET is_default = 1,
            updated_at = datetime('now')
        WHERE id = ?
      `,
      )
      .run(resumeId);

    const updated = getResumeRowById(resumeId);

    if (!updated) {
      throw new Error(`Resume ${resumeId} was updated but could not be read.`);
    }

    return mapResumeRow(updated);
  });

  return updateDefault(parsedId);
}

export function archiveResume(id: number): ResumeDto | null {
  const parsedId = idSchema.parse(id);
  const database = getDb();
  const archive = database.transaction((resumeId: number) => {
    const target = getResumeRowById(resumeId);

    if (!target) {
      return null;
    }

    database
      .prepare<[number]>(
        `
        UPDATE resumes
        SET archived_at = COALESCE(archived_at, datetime('now')),
            updated_at = CASE
              WHEN archived_at IS NULL OR is_default <> 0 THEN datetime('now')
              ELSE updated_at
            END,
            is_default = 0
        WHERE id = ?
      `,
      )
      .run(resumeId);

    const archived = getResumeRowById(resumeId);

    if (!archived) {
      throw new Error(`Resume ${resumeId} was archived but could not be read.`);
    }

    return mapResumeRow(archived);
  });

  return archive(parsedId);
}
