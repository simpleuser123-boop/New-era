#!/usr/bin/env node

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import Database from "better-sqlite3";

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
  "smoke-risk-verification-questions",
  "new-era-smoke.db",
);
const presetJdsPath = path.join(rootDir, "demo-data", "preset-jds.json");
const priorityRank = {
  high: 3,
  medium: 2,
  low: 1,
};

installSmokeSignalHandlers();

try {
  if (process.env.SMOKE_BASE_URL) {
    throw new Error(
      "smoke:risk-verification-questions must spawn its own server so NEW_ERA_DB_PATH can point to an isolated DB. Unset SMOKE_BASE_URL.",
    );
  }

  if (process.env[smokeUseRealDbEnvName] === "1") {
    throw new Error("smoke:risk-verification-questions refuses SMOKE_USE_REAL_DB=1.");
  }

  if (!existsSync(path.join(rootDir, ".next"))) {
    throw new Error(
      "No .next build found. Run npm run build before smoke:risk-verification-questions.",
    );
  }

  process.env[newEraDbPathEnvName] = smokeDbPath;
  const smokeDatabase = configureSmokeDatabaseEnv();
  const presets = await loadPresetJds();
  const { baseUrl, mode } = await resolveBaseUrl();

  console.log(`New Era risk verification questions smoke against ${baseUrl} (${mode})`);
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

  await assertTrainingLoanQuestions(baseUrl, jar, presets);
  await assertTraditionalAiDisguiseQuestions(baseUrl, jar, presets);
  await assertBorderlineQuestions(baseUrl, jar, presets);
  await assertLowRiskQuestions(baseUrl, jar, presets);
  await assertInvalidInputs(baseUrl, jar);

  const after = readBusinessTableCounts(smokeDbPath);
  assertBusinessCountsUnchanged(before, after);

  console.log("[ok] risk verification questions smoke passed");
} catch (error) {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await stopSpawnedServer();
}

async function assertTrainingLoanQuestions(baseUrl, jar, presets) {
  const preset = findPreset(presets, "fake-training-loan-ai-engineer");
  const response = await requestVerificationQuestions(baseUrl, jar, preset);

  assertVerificationShape(response.body, "training loan questions");
  assert(
    response.body.riskLevel === "critical" || response.body.riskLevel === "high",
    `training loan sample should be high risk, got ${response.body.riskLevel}.`,
  );
  assertQuestionTextIncludes(response.body, /培训费|服务费|押金|扣除|收费/, "收费");
  assertQuestionTextIncludes(response.body, /协议|借款|分期|贷款/, "协议");
  assertQuestionTextIncludes(response.body, /劳动合同|社保|劳动关系/, "劳动关系");
  assert(
    response.body.disclaimer.includes("不代表招聘方一定存在违规"),
    "disclaimer should avoid legal conclusion.",
  );

  console.log("[ok] 培训贷/招转培样本生成收费、协议、劳动关系问题");
}

async function assertTraditionalAiDisguiseQuestions(baseUrl, jar, presets) {
  const preset = findPreset(presets, "fake-traditional-dev-disguised-ai");
  const response = await requestVerificationQuestions(baseUrl, jar, preset);

  assertVerificationShape(response.body, "traditional AI disguise questions");
  assertQuestionTextIncludes(response.body, /占比/, "AI 工作占比");
  assertQuestionTextIncludes(response.body, /交付物/, "交付物");
  assertQuestionTextIncludes(response.body, /生产环境/, "生产环境");
  assertQuestionTextIncludes(response.body, /真实用户/, "真实用户");
  assertQuestionTextIncludes(response.body, /评测指标|准确率|召回率/, "评测指标");
  assertQuestionTextIncludes(response.body, /技术闭环|模型迭代|上线监控/, "技术闭环");

  console.log("[ok] 传统岗位包装 AI 样本生成 AI 占比、交付物和技术闭环问题");
}

async function assertBorderlineQuestions(baseUrl, jar, presets) {
  const preset = findPreset(presets, "borderline-data-evaluation-algorithm");
  const response = await requestVerificationQuestions(baseUrl, jar, preset);

  assertVerificationShape(response.body, "borderline questions");
  assert(
    response.body.riskLevel === "medium" || response.body.riskLevel === "low",
    `borderline sample should stay medium/low, got ${response.body.riskLevel}.`,
  );
  assertQuestionTextIncludes(response.body, /AI 技术含金量|模型|评测/, "AI 技术含金量");
  assertQuestionTextIncludes(response.body, /团队|负责人|协作边界/, "团队边界");
  assertQuestionTextIncludes(response.body, /前三个月|交付物|验收标准/, "前三个月交付物");

  console.log("[ok] 边界岗样本生成技术含金量、团队边界和交付物问题");
}

async function assertLowRiskQuestions(baseUrl, jar, presets) {
  const preset = findPreset(presets, "real-llm-rag-agent-engineer");
  const response = await requestVerificationQuestions(baseUrl, jar, preset);

  assertVerificationShape(response.body, "low risk questions");
  assert(
    response.body.riskLevel === "low",
    `low risk sample should be low risk, got ${response.body.riskLevel}.`,
  );
  assertQuestionTextIncludes(response.body, /AI 技术含金量|模型|RAG|Agent/, "AI 技术含金量");
  assertQuestionTextIncludes(response.body, /团队|负责人|协作边界/, "团队边界");
  assertQuestionTextIncludes(response.body, /前三个月|交付物|验收标准/, "前三个月交付物");

  console.log("[ok] 低风险样本仍生成核实 AI 技术含金量的问题");
}

async function assertInvalidInputs(baseUrl, jar) {
  const invalid = await requestJson(baseUrl, {
    body: {
      jdText: 123,
    },
    jar,
    method: "POST",
    path: "/api/risk-verification-questions",
  });

  assert(invalid.status === 400, `invalid input expected HTTP 400, got ${invalid.status}.`);
  expectErrorEnvelope(
    invalid.body,
    "INVALID_RISK_VERIFICATION_QUESTION_INPUT",
    "invalid input",
  );

  const tooShort = await requestJson(baseUrl, {
    body: {
      jdText: "太短",
    },
    jar,
    method: "POST",
    path: "/api/risk-verification-questions",
  });

  assert(tooShort.status === 400, `too short expected HTTP 400, got ${tooShort.status}.`);
  expectErrorEnvelope(tooShort.body, "JD_TEXT_TOO_SHORT", "too short input");

  const tooLong = await requestJson(baseUrl, {
    body: {
      jdText: "A".repeat(50_001),
    },
    jar,
    method: "POST",
    path: "/api/risk-verification-questions",
  });

  assert(tooLong.status === 400, `too long expected HTTP 400, got ${tooLong.status}.`);
  expectErrorEnvelope(tooLong.body, "JD_TEXT_TOO_LONG", "too long input");

  console.log("[ok] 非法、过短和过长输入返回明确错误");
}

async function requestVerificationQuestions(baseUrl, jar, preset) {
  const response = await requestJson(baseUrl, {
    body: {
      company: preset.company,
      jdText: preset.jdText,
      role: preset.role,
    },
    jar,
    method: "POST",
    path: "/api/risk-verification-questions",
  });

  assert(
    response.status === 200,
    `${preset.id} verification questions expected HTTP 200, got ${response.status}.`,
  );
  expectOkEnvelope(response.body, `${preset.id} verification questions`);

  return response;
}

function assertVerificationShape(body, label) {
  expectObject(body, label);
  expectString(body.decisionLabel, `${label}.decisionLabel`);
  expectString(body.riskLevel, `${label}.riskLevel`);
  expectString(body.ruleVersion, `${label}.ruleVersion`);
  expectString(body.disclaimer, `${label}.disclaimer`);
  expectArray(body.questions, `${label}.questions`);
  assert(body.questions.length > 0, `${label}.questions should not be empty.`);

  let previousPriority = Number.POSITIVE_INFINITY;

  for (const question of body.questions) {
    expectObject(question, `${label}.question`);
    expectString(question.id, `${label}.question.id`);
    expectString(question.category, `${label}.question.category`);
    expectString(question.question, `${label}.question.question`);
    expectString(question.reason, `${label}.question.reason`);
    expectString(question.priority, `${label}.question.priority`);
    assert(
      ["high", "medium", "low"].includes(question.priority),
      `${label}.question.priority should be high, medium or low.`,
    );

    if (question.relatedEvidence !== undefined) {
      expectString(question.relatedEvidence, `${label}.question.relatedEvidence`);
    }

    const nextPriority = priorityRank[question.priority];
    assert(
      nextPriority <= previousPriority,
      `${label}.questions should be sorted with high priority first.`,
    );
    previousPriority = nextPriority;
  }
}

function assertQuestionTextIncludes(body, pattern, label) {
  const text = body.questions
    .map((question) =>
      [
        question.category,
        question.question,
        question.reason,
        question.relatedEvidence ?? "",
      ].join(" "),
    )
    .join("\n");

  assert(pattern.test(text), `expected questions to include ${label}.`);
}

async function loadPresetJds() {
  const raw = await fs.readFile(presetJdsPath, "utf8");
  const parsed = JSON.parse(raw);

  assert(Array.isArray(parsed), "preset-jds.json should be an array.");

  return parsed;
}

function findPreset(presets, id) {
  const preset = presets.find((item) => item.id === id);

  expectObject(preset, `preset ${id}`);
  expectString(preset.company, `${id}.company`);
  expectString(preset.role, `${id}.role`);
  expectString(preset.jdText, `${id}.jdText`);

  return preset;
}

function readBusinessTableCounts(dbPath) {
  const database = new Database(dbPath, { readonly: true });

  try {
    return {
      agent_action_proposals: countRows(database, "agent_action_proposals"),
      agent_sessions: countRows(database, "agent_sessions"),
      applications: countRows(database, "applications"),
      interview_sessions: countRows(database, "interview_sessions"),
      reports: countRows(database, "reports"),
      settings: countRows(database, "settings"),
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

  console.log("[ok] risk verification questions did not modify business tables");
}
