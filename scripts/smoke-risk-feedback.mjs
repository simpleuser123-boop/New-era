#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import {
  assert,
  configureSmokeDatabaseEnv,
  ensureSmokeOwnerAndLogin,
  expectArray,
  expectErrorEnvelope,
  expectNumber,
  expectObject,
  expectOkEnvelope,
  installSmokeSignalHandlers,
  newEraDbPathEnvName,
  requestJson,
  resolveBaseUrl,
  rootDir,
  smokeUseRealDbEnvName,
  stopSpawnedServer,
} from "./smoke-support.mjs";

const smokeSuffix = `${Date.now()}`;
const benchmarkJdId = `risk-feedback-smoke-${smokeSuffix}`;
const smokeDbPath = path.join(
  rootDir,
  "data",
  "smoke-risk-feedback",
  "new-era-smoke.db",
);

installSmokeSignalHandlers();

try {
  if (process.env.SMOKE_BASE_URL) {
    throw new Error(
      "smoke:risk-feedback must spawn its own server so NEW_ERA_DB_PATH can point to an isolated DB. Unset SMOKE_BASE_URL.",
    );
  }

  if (process.env[smokeUseRealDbEnvName] === "1") {
    throw new Error("smoke:risk-feedback refuses SMOKE_USE_REAL_DB=1.");
  }

  if (!existsSync(path.join(rootDir, ".next"))) {
    throw new Error(
      "No .next build found. Run npm run build before smoke:risk-feedback.",
    );
  }

  process.env[newEraDbPathEnvName] = smokeDbPath;
  const smokeDatabase = configureSmokeDatabaseEnv();
  const { baseUrl, mode } = await resolveBaseUrl();

  console.log(`New Era risk feedback smoke against ${baseUrl} (${mode})`);
  console.log(
    `Smoke database: ${smokeDatabase.description}${
      smokeDatabase.path ? ` (${smokeDatabase.path})` : ""
    }`,
  );

  const { jar, ownerWasCreated } = await ensureSmokeOwnerAndLogin(baseUrl);

  console.log(
    `[ok] smoke authenticated as local owner (${ownerWasCreated ? "created" : "existing"})`,
  );

  const before = readBusinessTableCounts(smokeDbPath);
  const falsePositive = await createRiskFeedback(baseUrl, jar, {
      feedbackType: "false_positive",
      originalRiskLevel: "high",
      riskRuleVersion: "smoke-risk-rules-v1",
      signalId: "traditional-dev-ai-title-java-stack",
      signalText: "AI 标题下堆叠 Java Web 技术栈",
    userLabel: "real_ai",
    userNote:
      "这是内部 AI 平台岗位，Java 是服务端工程栈，不代表岗位是假 AI。",
  });
  const confirmedRisk = await createRiskFeedback(baseUrl, jar, {
      feedbackType: "confirmed_risk",
      originalRiskLevel: "critical",
      riskRuleVersion: "smoke-risk-rules-v1",
      signalId: "training-loan-before-onboarding",
    signalText: "入职前培训收费或贷款风险",
    userLabel: "fake_ai",
    userNote: "JD 要求先缴纳培训费用再安排项目，确认属于高风险岗位。",
  });

  await assertRiskFeedbackListContains(baseUrl, jar, [
    falsePositive.feedbackId,
    confirmedRisk.feedbackId,
  ]);
  await assertRiskFeedbackRuleVersionFilter(baseUrl, jar, [
    falsePositive.feedbackId,
    confirmedRisk.feedbackId,
  ]);
  await assertInvalidEnumRejected(baseUrl, jar);
  await assertEmptyJdExcerptRejected(baseUrl, jar);
  await assertLongUserNoteRejected(baseUrl, jar);

  const after = readBusinessTableCounts(smokeDbPath);

  assertBusinessCountsUnchanged(before, after);

  console.log("[ok] risk feedback smoke passed");
} catch (error) {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await stopSpawnedServer();
}

async function createRiskFeedback(baseUrl, jar, override) {
  const response = await requestJson(baseUrl, {
    body: {
      benchmarkJdId,
      company: `风险反馈烟测公司 ${smokeSuffix}`,
      jdExcerpt:
        "岗位标题写 AI 工程师，但职责包含 RAG、Agent、Java 服务端和内部平台交付，需要用户反馈辅助判断。",
      role: "AI 平台工程师",
      sourceUrl: "https://example.com/jobs/risk-feedback-smoke",
      ...override,
    },
    jar,
    method: "POST",
    path: "/api/risk-feedback",
  });

  assert(
    response.status === 201,
    `risk feedback create expected HTTP 201, got ${response.status}`,
  );
  expectOkEnvelope(response.body, "risk feedback create");
  expectNumber(response.body.feedbackId, "risk feedback create.feedbackId");
  expectObject(response.body.feedback, "risk feedback create.feedback");
  assert(
    response.body.feedback.feedbackType === override.feedbackType,
    "created feedback should preserve feedbackType",
  );
  assert(
    response.body.feedback.userLabel === override.userLabel,
    "created feedback should preserve userLabel",
  );
  assert(
    response.body.feedback.riskRuleVersion ===
      (override.riskRuleVersion ?? "规则版本未知"),
    "created feedback should preserve riskRuleVersion",
  );

  console.log(
    `[ok] created ${override.feedbackType} risk feedback #${response.body.feedbackId}`,
  );

  return response.body;
}

async function assertRiskFeedbackListContains(baseUrl, jar, feedbackIds) {
  const response = await requestJson(baseUrl, {
    jar,
    path: `/api/risk-feedback?benchmarkJdId=${encodeURIComponent(
      benchmarkJdId,
    )}&limit=10`,
  });

  assert(response.status === 200, `risk feedback list expected HTTP 200, got ${response.status}`);
  expectOkEnvelope(response.body, "risk feedback list");
  expectArray(response.body.feedback, "risk feedback list.feedback");

  const returnedIds = new Set(response.body.feedback.map((item) => item.id));

  for (const feedbackId of feedbackIds) {
    assert(
      returnedIds.has(feedbackId),
      `risk feedback list should include #${feedbackId}`,
    );
  }

  console.log("[ok] risk feedback GET returned created records");
}

async function assertRiskFeedbackRuleVersionFilter(baseUrl, jar, feedbackIds) {
  const response = await requestJson(baseUrl, {
    jar,
    path: `/api/risk-feedback?riskRuleVersion=smoke-risk-rules-v1&limit=10`,
  });

  assert(response.status === 200, `risk feedback rule-version filter expected HTTP 200, got ${response.status}`);
  expectOkEnvelope(response.body, "risk feedback rule-version filter");
  expectArray(response.body.feedback, "risk feedback rule-version filter.feedback");

  const returnedIds = new Set(response.body.feedback.map((item) => item.id));

  for (const feedbackId of feedbackIds) {
    assert(
      returnedIds.has(feedbackId),
      `risk feedback rule-version filter should include #${feedbackId}`,
    );
  }

  console.log("[ok] risk feedback GET can filter by risk rule version");
}

async function assertInvalidEnumRejected(baseUrl, jar) {
  const response = await requestJson(baseUrl, {
    body: {
      ...baseInvalidBody(),
      feedbackType: "not_a_feedback_type",
    },
    jar,
    method: "POST",
    path: "/api/risk-feedback",
  });

  assert(response.status === 400, `invalid enum expected HTTP 400, got ${response.status}`);
  expectErrorEnvelope(
    response.body,
    "INVALID_RISK_FEEDBACK_INPUT",
    "invalid enum",
  );

  console.log("[ok] invalid feedback enum rejected");
}

async function assertEmptyJdExcerptRejected(baseUrl, jar) {
  const response = await requestJson(baseUrl, {
    body: {
      ...baseInvalidBody(),
      jdExcerpt: "   ",
    },
    jar,
    method: "POST",
    path: "/api/risk-feedback",
  });

  assert(response.status === 400, `empty jdExcerpt expected HTTP 400, got ${response.status}`);
  expectErrorEnvelope(
    response.body,
    "INVALID_RISK_FEEDBACK_INPUT",
    "empty jdExcerpt",
  );

  console.log("[ok] empty jdExcerpt rejected");
}

async function assertLongUserNoteRejected(baseUrl, jar) {
  const response = await requestJson(baseUrl, {
    body: {
      ...baseInvalidBody(),
      userNote: "x".repeat(2_001),
    },
    jar,
    method: "POST",
    path: "/api/risk-feedback",
  });

  assert(response.status === 400, `long userNote expected HTTP 400, got ${response.status}`);
  expectErrorEnvelope(
    response.body,
    "INVALID_RISK_FEEDBACK_INPUT",
    "long userNote",
  );

  console.log("[ok] overlong userNote rejected");
}

function baseInvalidBody() {
  return {
    benchmarkJdId,
    company: `风险反馈烟测公司 ${smokeSuffix}`,
      feedbackType: "false_positive",
      jdExcerpt: "用于校验非法输入不会落库的 JD 片段。",
      originalRiskLevel: "high",
      riskRuleVersion: "smoke-risk-rules-v1",
      role: "AI 平台工程师",
    userLabel: "real_ai",
    userNote: "",
  };
}

function readBusinessTableCounts(dbPath) {
  const database = new Database(dbPath, { readonly: true });

  try {
    return {
      agent_action_proposals: countRows(database, "agent_action_proposals"),
      application_events: countRows(database, "application_events"),
      applications: countRows(database, "applications"),
      interview_sessions: countRows(database, "interview_sessions"),
      optimization_feedback: countRows(database, "optimization_feedback"),
      reports: countRows(database, "reports"),
      resume_optimization_runs: countRows(database, "resume_optimization_runs"),
      resumes: countRows(database, "resumes"),
    };
  } finally {
    database.close();
  }
}

function countRows(database, tableName) {
  return database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
}

function assertBusinessCountsUnchanged(before, after) {
  for (const tableName of Object.keys(before)) {
    assert(
      before[tableName] === after[tableName],
      `${tableName} count changed from ${before[tableName]} to ${after[tableName]}`,
    );
  }

  console.log("[ok] risk feedback did not modify reports/applications business tables");
}
