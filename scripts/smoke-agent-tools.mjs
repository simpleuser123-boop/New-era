#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const smokeNow = "2026-06-04T00:00:00.000Z";

async function compileLibModules() {
  const tempDir = await fs.mkdtemp(
    path.join(projectRoot, "tmp", "new-era-agent-tools-"),
  );
  const sourceRoot = path.join(projectRoot, "src", "lib");
  const files = await listTypeScriptFiles(sourceRoot);

  for (const sourcePath of files) {
    const source = await fs.readFile(sourcePath, "utf8");
    const output = ts.transpileModule(source, {
      fileName: sourcePath,
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    });
    const relativePath = path.relative(projectRoot, sourcePath);
    const outputPath = path
      .join(tempDir, relativePath)
      .replace(/\.ts$/, ".js");

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, output.outputText, "utf8");
  }

  const requireFromTemp = createRequire(path.join(tempDir, "package.json"));

  return {
    requireModule: (relativePath) =>
      requireFromTemp(path.join(tempDir, relativePath)),
    tempDir,
  };
}

async function listTypeScriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listTypeScriptFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

function runRegistrySmoke(ToolRegistry) {
  const registry = new ToolRegistry();
  let handlerCallCount = 0;

  registry.register({
    name: "echo_query",
    displayName: "Echo Query",
    description: "Returns validated echo data for registry smoke checks.",
    category: "query",
    parameters: {
      message: {
        type: "string",
        description: "Message to echo.",
        required: true,
      },
    },
    parametersSchema: z.strictObject({
      message: z.string().trim().min(1),
    }),
    handler: (params) => {
      handlerCallCount += 1;

      return {
        ok: true,
        data: { message: params.message },
        llmSummary: `Echoed ${params.message}.`,
      };
    },
  });

  assert.equal(registry.list().length, 1, "registered tool should be listed");
  assert.equal(registry.list({ category: "query" }).length, 1);
  assert.equal(registry.list({ category: "action" }).length, 0);
  assert.equal(registry.get("echo_query")?.name, "echo_query");

  return registry
    .execute("Bad Tool", {})
    .then((invalidToolName) => {
      assert.equal(invalidToolName.ok, false);
      assert.equal(invalidToolName.error.code, "invalid_tool_name");
      assert.equal(handlerCallCount, 0);

      return registry.execute(
        "echo_query",
        { message: "hello" },
        { requestId: "agent-tools-smoke", now: smokeNow },
      );
    })
    .then((success) => {
      assert.equal(success.ok, true);
      assert.equal(success.toolName, "echo_query");
      assert.equal(success.category, "query");
      assert.deepEqual(success.data, { message: "hello" });
      assert.equal(handlerCallCount, 1);

      registry.setActiveToolNames(["other_tool"]);
      return registry.execute("echo_query", { message: "hello" });
    })
    .then((denied) => {
      assert.equal(denied.ok, false);
      assert.equal(denied.error.code, "tool_not_allowed");
      assert.equal(handlerCallCount, 1);

      registry.setActiveToolNames(["echo_query"]);
      return registry.execute("echo_query", { message: "" });
    })
    .then((invalidParams) => {
      assert.equal(invalidParams.ok, false);
      assert.equal(invalidParams.error.code, "invalid_tool_params");
      assert.equal(handlerCallCount, 1);

      registry.clearActiveToolNames();
      return registry.execute("echo_query", { message: "open" });
    })
    .then((afterClear) => {
      assert.equal(afterClear.ok, true);
      assert.equal(handlerCallCount, 2);
      console.log("[ok] agent tool registry smoke passed");
    });
}

function seedQueryToolData(serverDb) {
  const score = buildScoreSummary();
  const riskSignal = {
    id: "risk-outsourcing",
    signal: "外包派遣风险",
    excerpt: "岗位描述包含外包派遣和驻场交付。",
    severity: "high",
    source: "dictionary",
    category: "employment",
    explanation: "可能影响稳定性和成长空间。",
    advice: "面试时确认用工主体、汇报线和转正可能性。",
    weight: 3,
    matchTerms: ["外包", "派遣"],
  };
  const report = serverDb.createReport({
    company: "星火智能",
    role: "LLM 应用工程师",
    jdText:
      "负责企业 RAG、Agent 编排和 TypeScript 工程化落地，要求熟悉向量检索、评测与生产系统排障。",
    report: {
      generatedAt: smokeNow,
      job: {
        aiDirection: "llm_application",
        company: "星火智能",
        ecosystem: {
          evidence: ["RAG", "Agent", "TypeScript"],
          primaryDomain: "llm_application",
          vector: buildEcosystemVector(88),
        },
        keywords: ["RAG", "Agent", "评测"],
        location: "上海",
        role: "LLM 应用工程师",
        techStack: ["RAG", "Agent", "TypeScript", "向量数据库"],
      },
      recommendation: "建议作为重点机会推进，但需要确认用工主体和业务归属。",
      risks: {
        level: "high",
        recommendation: "推进前确认风险项。",
        signals: [riskSignal],
        summary: "岗位存在外包派遣风险。",
        totalWeight: 3,
      },
      score,
      sections: buildReportSections(),
    },
    risks: [riskSignal],
    score,
  });
  const resume = serverDb.saveResume({
    content: {
      currentRole: "AI 应用工程师",
      education: [
        {
          degree: "本科",
          major: "计算机科学",
          period: "2018-2022",
          school: "新纪元大学",
        },
      ],
      experiences: [
        {
          company: "本地智能",
          highlights: ["落地企业 RAG 问答", "建设模型评测流水线"],
          period: "2023-2026",
          role: "AI 应用工程师",
          techStack: ["TypeScript", "RAG", "LLM"],
        },
      ],
      name: "李明",
      projects: [
        {
          name: "企业知识库 Agent",
          role: "负责人",
          summary: "面向售前和交付团队构建 RAG + Agent 工作台。",
          techStack: ["RAG", "Agent", "SQLite"],
        },
      ],
      rawText:
        "李明，AI 应用工程师，熟悉 RAG、Agent、TypeScript 和企业知识库系统。",
      skills: [
        {
          category: "framework",
          level: "expert",
          name: "RAG",
        },
        {
          category: "language",
          level: "proficient",
          name: "TypeScript",
        },
      ],
      summary: "三年 AI 应用落地经验，关注企业 RAG 与 Agent 工程化。",
      yearsOfExperience: 3,
    },
    direction: "llm_application",
    ecosystem: buildEcosystemVector(82),
    name: "李明 - LLM 应用简历",
    skills: [
      {
        category: "framework",
        level: "expert",
        name: "RAG",
      },
      {
        category: "language",
        level: "proficient",
        name: "TypeScript",
      },
    ],
  });

  serverDb.setDefaultResume(resume.id);

  const application = serverDb.createApplication({
    channel: "Boss 直聘",
    company: "星火智能",
    notes: "准备确认业务归属、团队结构和用工主体。",
    priority: "high",
    recommendedResumeName: resume.name,
    reportId: report.id,
    resumeId: resume.id,
    riskLevel: "high",
    role: "LLM 应用工程师",
    scoreOverall: 4.2,
    status: "interviewing",
    tags: ["RAG", "Agent"],
  });

  serverDb.upsertSetting("career_profile", {
    currentStrategy: "优先推进 LLM 应用层岗位，规避外包和纯交付驻场机会。",
    dealBreakers: ["外包派遣", "长期驻场"],
    generatedSuggestions: [],
    preferredCompanyStages: ["成长期"],
    preferredWorkModes: ["hybrid"],
    salaryExpectation: {
      negotiable: true,
    },
    strengths: [
      {
        evidence: "做过企业知识库、评测和 Agent 编排。",
        title: "RAG 工程化",
      },
    ],
    targetCities: ["上海"],
    targetDirections: ["llm_application"],
    targetRoles: ["LLM 应用工程师"],
    updatedAt: smokeNow,
    weaknesses: [
      {
        mitigation: "通过项目复盘补充指标和性能优化案例。",
        title: "大规模训练经验不足",
      },
    ],
  });

  return {
    application,
    report,
    resume,
  };
}

function buildScoreSummary() {
  const dimensions = {};

  for (const dimension of ["A", "B", "C", "D", "E", "F"]) {
    dimensions[dimension] = {
      dimension,
      evidence: [`${dimension} 维度证据`],
      score: dimension === "D" ? 3.6 : 4.2,
      suggestions: [`${dimension} 维度准备建议`],
      summary: `${dimension} 维度整体匹配良好。`,
      title: `${dimension} 维度`,
      weight: 16,
    };
  }

  return {
    dimensions,
    maxScore: 5,
    overall: 4.2,
  };
}

function buildReportSections() {
  return ["A", "B", "C", "D", "E", "F"].map((dimension) => ({
    dimension,
    findings: [`${dimension} 维度发现`],
    score: dimension === "D" ? 3.6 : 4.2,
    suggestions: [`${dimension} 维度面试准备`],
    summary: `${dimension} 维度适配度较高。`,
    title: `${dimension} 维度`,
  }));
}

function buildEcosystemVector(primaryScore) {
  return {
    ai_infra: 35,
    ai_safety: 18,
    algorithm_research: 30,
    embodied_ai: 12,
    llm_application: primaryScore,
  };
}

async function runQueryToolsSmoke(toolsModule, serverDb) {
  const {
    createQueryToolRegistry,
    queryToolDefinitions,
    queryToolNames,
  } = toolsModule;
  const seeded = seedQueryToolData(serverDb);
  const registry = createQueryToolRegistry();

  const previousWebSearchMock = process.env.NEW_ERA_WEB_SEARCH_MOCK_JSON;

  process.env.NEW_ERA_WEB_SEARCH_MOCK_JSON = JSON.stringify({
    results: [
      {
        description: "New Era smoke mocked web search result.",
        sourceName: "Example Search",
        title: "New Era Web Search Smoke",
        url: "https://example.com/new-era-web-search-smoke",
      },
    ],
  });

  assert.equal(queryToolDefinitions.length, 10);
  assert.deepEqual(
    [...queryToolNames].sort(),
    [
      "build_interview_prep_context",
      "get_analytics_overview",
      "get_application_detail",
      "get_career_profile",
      "get_default_resume",
      "get_report_detail",
      "list_applications",
      "list_resumes",
      "search_reports",
      "web_search",
    ].sort(),
  );
  assert.equal(registry.list({ category: "query" }).length, 10);
  assert.equal(registry.list({ category: "action" }).length, 0);

  try {
    const checks = [
    {
      name: "search_reports",
      params: { limit: 5, query: "RAG Agent" },
      expect: (result) => {
        assert.equal(result.data.count, 1);
        assert.equal(result.citations.length, 1);
      },
    },
    {
      name: "get_report_detail",
      params: { reportId: seeded.report.id },
      expect: (result) => {
        assert.equal(result.data.report.id, seeded.report.id);
        assert.equal(result.citations[0].type, "report");
      },
    },
    {
      name: "list_applications",
      params: { limit: 5, priority: "high", query: "星火", status: "interviewing" },
      expect: (result) => {
        assert.equal(result.data.count, 1);
        assert.equal(result.citations[0].type, "application");
      },
    },
    {
      name: "get_application_detail",
      params: { applicationId: seeded.application.id },
      expect: (result) => {
        assert.equal(result.data.detail.application.id, seeded.application.id);
        assert.ok(result.data.detail.events.length >= 1);
      },
    },
    {
      name: "get_analytics_overview",
      params: {},
      expect: (result) => {
        assert.equal(result.data.sampleSize.reports, 1);
        assert.equal(result.citations[0].type, "analytics");
      },
    },
    {
      name: "get_career_profile",
      params: {},
      expect: (result) => {
        assert.equal(result.data.configured, true);
        assert.equal(result.citations[0].type, "career_profile");
      },
    },
    {
      name: "list_resumes",
      params: { limit: 5 },
      expect: (result) => {
        assert.equal(result.data.count, 1);
        assert.equal(result.data.defaultResumeId, seeded.resume.id);
      },
    },
    {
      name: "get_default_resume",
      params: {},
      expect: (result) => {
        assert.equal(result.data.resume.id, seeded.resume.id);
        assert.equal(result.citations[0].type, "resume");
      },
    },
    {
      name: "build_interview_prep_context",
      params: { query: "RAG", resumeId: seeded.resume.id },
      expect: (result) => {
        assert.equal(result.data.interviewPrep.report.id, seeded.report.id);
        assert.equal(result.data.interviewPrep.resume.id, seeded.resume.id);
        assert.ok(result.data.interviewPrep.focusAreas.length > 0);
      },
    },
    {
      name: "web_search",
      params: { limit: 3, query: "New Era web search smoke" },
      expect: (result) => {
        assert.equal(result.data.provider, "mock");
        assert.equal(result.data.results.length, 1);
        assert.equal(result.citations[0].type, "web");
        assert.equal(
          result.citations[0].id,
          "https://example.com/new-era-web-search-smoke",
        );
      },
    },
    ];

    for (const check of checks) {
      const result = await registry.execute(check.name, check.params, {
        requestId: "query-tools-smoke",
        now: smokeNow,
      });

      assert.equal(result.ok, true, `${check.name} should succeed`);
      assert.equal(result.category, "query");
      assert.equal(result.toolName, check.name);
      assert.equal(typeof result.llmSummary, "string");
      assert.ok(result.llmSummary.length > 0);
      assert.equal("action" in result, false, `${check.name} must not return action`);
      assert.ok(Array.isArray(result.citations ?? []));
      check.expect(result);
    }

    const missingDetail = await registry.execute(
      "get_report_detail",
      { reportId: seeded.report.id + 10_000 },
      { requestId: "query-tools-smoke-empty", now: smokeNow },
    );

    assert.equal(missingDetail.ok, true);
    assert.equal(missingDetail.data.report, null);
    assert.equal(missingDetail.citations.length, 0);

    console.log(`[ok] query tools smoke passed (${checks.length} tools)`);
  } finally {
    if (previousWebSearchMock === undefined) {
      delete process.env.NEW_ERA_WEB_SEARCH_MOCK_JSON;
    } else {
      process.env.NEW_ERA_WEB_SEARCH_MOCK_JSON = previousWebSearchMock;
    }
  }
}

async function main() {
  const { requireModule, tempDir } = await compileLibModules();
  const previousDbPath = process.env.NEW_ERA_DB_PATH;
  let serverDb;

  process.env.NEW_ERA_DB_PATH = path.join(tempDir, "new-era-query-tools.db");

  try {
    const toolsModule = requireModule("src/lib/agent/tools/index.js");
    serverDb = requireModule("src/lib/server-db.js");

    await runRegistrySmoke(toolsModule.ToolRegistry);
    await runQueryToolsSmoke(toolsModule, serverDb);
  } finally {
    try {
      serverDb?.getDb().close();
    } catch {
      // The smoke cleanup should not hide the original assertion failure.
    }

    if (previousDbPath === undefined) {
      delete process.env.NEW_ERA_DB_PATH;
    } else {
      process.env.NEW_ERA_DB_PATH = previousDbPath;
    }

    await fs.rm(tempDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
