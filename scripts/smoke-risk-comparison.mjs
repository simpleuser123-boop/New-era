#!/usr/bin/env node

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

import Database from "better-sqlite3";
import ts from "typescript";

import {
  assert,
  configureSmokeDatabaseEnv,
  ensureSmokeOwnerAndLogin,
  expectArray,
  expectErrorEnvelope,
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
  "smoke-risk-comparison",
  "new-era-smoke.db",
);

installSmokeSignalHandlers();

let tempDir = null;

try {
  if (process.env.SMOKE_BASE_URL) {
    throw new Error(
      "smoke:risk-comparison must spawn its own server so NEW_ERA_DB_PATH can point to an isolated DB. Unset SMOKE_BASE_URL.",
    );
  }

  if (process.env[smokeUseRealDbEnvName] === "1") {
    throw new Error("smoke:risk-comparison refuses SMOKE_USE_REAL_DB=1.");
  }

  if (!existsSync(path.join(rootDir, ".next"))) {
    throw new Error("No .next build found. Run npm run build before smoke:risk-comparison.");
  }

  process.env[newEraDbPathEnvName] = smokeDbPath;
  const smokeDatabase = configureSmokeDatabaseEnv();
  const { model, tempDir: compiledTempDir } = await loadRiskScanModel();
  tempDir = compiledTempDir;

  const pairs = model.riskComparisonPairs;
  assert(Array.isArray(pairs), "riskComparisonPairs should be an array.");
  assert(pairs.length === 3, `expected 3 comparison pairs, got ${pairs.length}.`);

  const pairLabels = pairs.map((pair) => pair.label).join(" / ");
  assert(
    pairLabels.includes("真 AI 岗 vs 假 AI 岗") &&
      pairLabels.includes("真 AI 岗 vs 边界岗") &&
      pairLabels.includes("假 AI 岗 vs 边界岗"),
    `comparison pairs should include the three stable presets, got ${pairLabels}.`,
  );

  const { baseUrl, mode } = await resolveBaseUrl();

  console.log(`New Era risk comparison smoke against ${baseUrl} (${mode})`);
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

  for (const pair of pairs) {
    await assertComparisonPair(baseUrl, jar, model, pair);
  }

  await assertPartialFailureAndFallback(baseUrl, jar, model);

  const after = readBusinessTableCounts(smokeDbPath);
  assertBusinessCountsUnchanged(before, after);

  console.log("[ok] risk comparison smoke passed");
} catch (error) {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await removeTempDir(tempDir);
  await stopSpawnedServer();
}

async function assertComparisonPair(baseUrl, jar, model, pair) {
  const left = model.findDemoPreset(pair.leftId);
  const right = model.findDemoPreset(pair.rightId);

  expectObject(left, `${pair.id}.leftPreset`);
  expectObject(right, `${pair.id}.rightPreset`);
  assert(left.id !== right.id, `${pair.id} should compare two different preset JDs.`);
  expectString(left.sourceLabel, `${pair.id}.left.sourceLabel`);
  expectString(right.sourceLabel, `${pair.id}.right.sourceLabel`);

  const [leftResponse, rightResponse] = await Promise.all([
    scanPreset(baseUrl, jar, left),
    scanPreset(baseUrl, jar, right),
  ]);

  assertScanResponse(leftResponse.body, `${pair.id}.left`);
  assertScanResponse(rightResponse.body, `${pair.id}.right`);
  assert(
    leftResponse.body.ruleVersion === rightResponse.body.ruleVersion,
    `${pair.id} should use the same rule version on both sides.`,
  );

  if (left.type === "fake_ai" || right.type === "fake_ai") {
    const fakeBody = left.type === "fake_ai" ? leftResponse.body : rightResponse.body;
    assert(
      fakeBody.signals.length > 0,
      `${pair.id} fake_ai side should expose risk signals and evidence.`,
    );
  }

  console.log(`[ok] ${pair.label}双扫描使用同一扫描契约`);
}

async function scanPreset(baseUrl, jar, preset) {
  const response = await requestJson(baseUrl, {
    body: {
      company: preset.company,
      jdText: preset.jdText,
      role: preset.role,
    },
    jar,
    method: "POST",
    path: "/api/scan-risks",
  });

  assert(
    response.status === 200,
    `${preset.id} scan expected HTTP 200, got ${response.status}.`,
  );
  expectOkEnvelope(response.body, `${preset.id} scan`);

  return response;
}

async function assertPartialFailureAndFallback(baseUrl, jar, model) {
  const pair = model.riskComparisonPairs[0];
  const left = model.findDemoPreset(pair.leftId);
  const right = model.findDemoPreset(pair.rightId);

  const [valid, invalid] = await Promise.all([
    scanPreset(baseUrl, jar, left),
    requestJson(baseUrl, {
      body: {
        company: right.company,
        jdText: "太短",
        role: right.role,
      },
      jar,
      method: "POST",
      path: "/api/scan-risks",
    }),
  ]);

  assertScanResponse(valid.body, "partial failure valid side");
  assert(
    invalid.status === 400,
    `invalid side expected HTTP 400, got ${invalid.status}.`,
  );
  expectErrorEnvelope(invalid.body, "JD_TEXT_TOO_SHORT", "partial failure invalid side");

  const fallback = model.buildPresetScanResult(right.id);

  expectObject(fallback, "preset fallback result");
  assert(
    fallback.source === "preset_fallback",
    `fallback source should be preset_fallback, got ${String(fallback.source)}.`,
  );
  assert(
    fallback.ruleVersion === "preset-fallback",
    `fallback ruleVersion should be preset-fallback, got ${String(fallback.ruleVersion)}.`,
  );
  expectString(fallback.fallbackReason, "fallback.fallbackReason");
  expectArray(fallback.signals, "fallback.signals");

  console.log("[ok] partial failure keeps valid side readable and fallback marker explicit");
}

function assertScanResponse(body, label) {
  expectObject(body, label);
  expectString(body.ruleVersion, `${label}.ruleVersion`);
  expectString(body.summary, `${label}.summary`);
  expectString(body.recommendation, `${label}.recommendation`);
  expectArray(body.signals, `${label}.signals`);

  for (const signal of body.signals) {
    expectString(signal.signal, `${label}.signal.signal`);
    expectString(signal.excerpt, `${label}.signal.excerpt`);
    expectString(signal.severity, `${label}.signal.severity`);
  }
}

async function loadRiskScanModel() {
  const tempRoot = await fs.mkdtemp(
    path.join(rootDir, "tmp", "new-era-risk-comparison-"),
  );
  const sourcePath = path.join(
    rootDir,
    "src",
    "components",
    "features",
    "risks",
    "riskScanModel.ts",
  );
  const outputPath = path.join(
    tempRoot,
    "src",
    "components",
    "features",
    "risks",
    "riskScanModel.cjs",
  );
  const presetSourcePath = path.join(rootDir, "demo-data", "preset-jds.json");
  const presetOutputPath = path.join(tempRoot, "demo-data", "preset-jds.json");
  const source = await fs.readFile(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: sourcePath,
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.dirname(presetOutputPath), { recursive: true });
  await fs.writeFile(outputPath, output.outputText, "utf8");
  await fs.copyFile(presetSourcePath, presetOutputPath);

  const require = createRequire(import.meta.url);

  return {
    model: require(outputPath),
    tempDir: tempRoot,
  };
}

async function removeTempDir(directory) {
  if (!directory) {
    return;
  }

  try {
    await fs.rm(directory, { force: true, recursive: true });
  } catch (error) {
    console.warn(`[warn] 临时编译目录清理失败：${error.message}`);
  }
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

  console.log("[ok] risk comparison did not modify business tables");
}
