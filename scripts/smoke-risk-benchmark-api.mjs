#!/usr/bin/env node

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import Database from "better-sqlite3";

import {
  assert,
  configureSmokeDatabaseEnv,
  ensureSmokeOwnerAndLogin,
  expectObject,
  expectOkEnvelope,
  expectString,
  installSmokeSignalHandlers,
  newEraDbPathEnvName,
  requestJson,
  resolveBaseUrl,
  rootDir,
  smokeUseRealDbEnvName,
  stopSpawnedServer,
} from "./smoke-support.mjs";

const smokeDbPath = path.join(
  rootDir,
  "data",
  "smoke-risk-benchmark-api",
  "new-era-smoke.db",
);
const datasetPath = path.join(rootDir, "demo-data", "risk-benchmark-jds.jsonl");
const benchmarkResultPath = path.join(rootDir, "tmp", "risk-benchmark-result.json");
const benchmarkResultBackupPath = `${benchmarkResultPath}.smoke-backup-${Date.now()}`;

installSmokeSignalHandlers();

let movedBenchmarkResult = false;

try {
  if (process.env.SMOKE_BASE_URL) {
    throw new Error(
      "smoke:risk-benchmark-api must spawn its own server so NEW_ERA_DB_PATH can point to an isolated DB. Unset SMOKE_BASE_URL.",
    );
  }

  if (process.env[smokeUseRealDbEnvName] === "1") {
    throw new Error("smoke:risk-benchmark-api refuses SMOKE_USE_REAL_DB=1.");
  }

  if (!existsSync(path.join(rootDir, ".next"))) {
    throw new Error(
      "No .next build found. Run npm run build before smoke:risk-benchmark-api.",
    );
  }

  process.env[newEraDbPathEnvName] = smokeDbPath;
  const smokeDatabase = configureSmokeDatabaseEnv();
  const { baseUrl, mode } = await resolveBaseUrl();

  console.log(`New Era risk benchmark API smoke against ${baseUrl} (${mode})`);
  console.log(
    `Smoke database: ${smokeDatabase.description}${
      smokeDatabase.path ? ` (${smokeDatabase.path})` : ""
    }`,
  );

  const { jar, ownerWasCreated } = await ensureSmokeOwnerAndLogin(baseUrl);

  console.log(
    `[ok] smoke authenticated as local owner (${ownerWasCreated ? "created" : "existing"})`,
  );

  const datasetBefore = await fs.stat(datasetPath);
  const businessCountsBefore = readBusinessTableCounts(smokeDbPath);

  if (existsSync(benchmarkResultPath)) {
    await fs.rename(benchmarkResultPath, benchmarkResultBackupPath);
    movedBenchmarkResult = true;
  }

  const response = await requestJson(baseUrl, {
    jar,
    path: "/api/risk-benchmark",
  });

  assert(
    response.status === 200,
    `risk benchmark API expected HTTP 200, got ${response.status}`,
  );
  expectOkEnvelope(response.body, "risk benchmark API");
  assertBenchmarkShape(response.body);
  assert(
    !existsSync(benchmarkResultPath),
    "risk benchmark API should not create or depend on tmp/risk-benchmark-result.json",
  );

  const datasetAfter = await fs.stat(datasetPath);
  const businessCountsAfter = readBusinessTableCounts(smokeDbPath);

  assert(
    datasetBefore.size === datasetAfter.size &&
      datasetBefore.mtimeMs === datasetAfter.mtimeMs,
    "risk benchmark API should not modify demo-data/risk-benchmark-jds.jsonl",
  );
  assertBusinessCountsUnchanged(businessCountsBefore, businessCountsAfter);

  console.log("[ok] risk benchmark API smoke passed");
} catch (error) {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (movedBenchmarkResult) {
    await fs.rename(benchmarkResultBackupPath, benchmarkResultPath);
  }

  await stopSpawnedServer();
}

function assertBenchmarkShape(body) {
  expectObject(body.dataset, "risk benchmark API.dataset");
  assert(body.dataset.source === "local_benchmark", "dataset.source should be local_benchmark");
  assert(body.dataset.total === 100, `dataset.total expected 100, got ${body.dataset.total}`);
  assert(body.dataset.realAi === 40, `dataset.realAi expected 40, got ${body.dataset.realAi}`);
  assert(body.dataset.fakeAi === 35, `dataset.fakeAi expected 35, got ${body.dataset.fakeAi}`);
  assert(
    body.dataset.borderline === 25,
    `dataset.borderline expected 25, got ${body.dataset.borderline}`,
  );
  expectString(body.ruleVersion, "risk benchmark API.ruleVersion");
  expectString(body.generatedAt, "risk benchmark API.generatedAt");
  expectString(body.disclaimer, "risk benchmark API.disclaimer");
  expectObject(body.ruleVersions, "risk benchmark API.ruleVersions");
  expectObject(body.metrics, "risk benchmark API.metrics");
  expectObject(body.issues, "risk benchmark API.issues");
  expectObject(body.distributions, "risk benchmark API.distributions");

  for (const metricKey of [
    "decisionAccuracy",
    "fakeAiRecall",
    "fakeAiPrecision",
    "realAiFalsePositiveRate",
    "riskLevelAccuracy",
    "borderlinePrecision",
    "borderlineReasonableHitRate",
    "expectedRiskSignalHitRate",
  ]) {
    assertMetric(body.metrics[metricKey], `metrics.${metricKey}`);
  }

  for (const issueKey of [
    "correct",
    "falseNegative",
    "falsePositive",
    "severityMismatch",
    "borderlineFalsePositive",
    "missingExpectedSignal",
  ]) {
    assert(
      Number.isInteger(body.issues[issueKey]) && body.issues[issueKey] >= 0,
      `issues.${issueKey} should be a non-negative integer`,
    );
  }

  console.log("[ok] risk benchmark API returned stable metric contract");
}

function assertMetric(metric, label) {
  expectObject(metric, label);
  assert(
    typeof metric.numerator === "number" && Number.isFinite(metric.numerator),
    `${label}.numerator should be a finite number`,
  );
  assert(
    typeof metric.denominator === "number" && Number.isFinite(metric.denominator),
    `${label}.denominator should be a finite number`,
  );
  assert(
    metric.value === null ||
      (typeof metric.value === "number" &&
        Number.isFinite(metric.value) &&
        metric.value >= 0 &&
        metric.value <= 1),
    `${label}.value should be null or a 0-1 number`,
  );
  expectString(metric.percent, `${label}.percent`);
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

  console.log("[ok] risk benchmark API did not modify business tables");
}
