#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const emptyVector = {
  ai_infra: 0,
  ai_safety: 0,
  algorithm_research: 0,
  embodied_ai: 0,
  llm_application: 0,
};

try {
  const { requireModule, tempDir } = await compileLibModules();
  const { matchResumeToJob } = requireModule("src/lib/resume-match.js");
  const { buildResumeJudgeResult, toJudgeTarget } = requireModule(
    "src/lib/resume-judge.js",
  );

  const ragResume = buildResume({
    id: 1,
    name: "RAG 应用工程师简历",
    direction: "llm_application",
    currentRole: "LLM 应用工程师",
    skills: ["Python", "LangChain", "RAG", "Milvus", "Prompt Engineering"],
    projectName: "企业知识库 Agent",
    projectStack: ["LangChain", "RAG", "Milvus", "OpenAI-compatible API"],
    summary: "负责企业知识库、检索增强和业务 Agent 落地。",
  });
  const infraResume = buildResume({
    id: 2,
    name: "AI Infra 工程师简历",
    direction: "ai_infra",
    currentRole: "AI Infra 工程师",
    skills: ["Go", "Kubernetes", "vLLM", "Docker", "Prometheus"],
    projectName: "多租户推理平台",
    projectStack: ["Kubernetes", "vLLM", "NVIDIA GPU", "Prometheus"],
    summary: "负责模型服务、GPU 集群调度和推理平台可观测性。",
  });
  const ragJd = [
    "岗位名称：RAG 应用工程师",
    "公司：知识库产品团队",
    "任职要求：LangChain、RAG、Milvus、Agent、Prompt Engineering、问答评测集。",
    "岗位职责：建设企业知识库问答、答案引用和工具调用能力。",
  ].join("\n");
  const infraJd = [
    "岗位名称：AI Infra 工程师",
    "公司：模型平台团队",
    "任职要求：Kubernetes、vLLM、NVIDIA GPU、Triton、Prometheus、MLOps。",
    "岗位职责：建设多租户推理平台、灰度发布、成本看板和 P95 延迟优化。",
  ].join("\n");

  const ragForRag = runJudge({
    buildResumeJudgeResult,
    jdText: ragJd,
    matchResumeToJob,
    resume: ragResume,
    toJudgeTarget,
  });
  const ragForInfra = runJudge({
    buildResumeJudgeResult,
    jdText: infraJd,
    matchResumeToJob,
    resume: ragResume,
    toJudgeTarget,
  });
  const infraForInfra = runJudge({
    buildResumeJudgeResult,
    jdText: infraJd,
    matchResumeToJob,
    resume: infraResume,
    toJudgeTarget,
  });

  assert.notEqual(
    suggestionIds(ragForRag),
    suggestionIds(ragForInfra),
    "same resume with different JDs should get different suggestion ids",
  );
  assert.notEqual(
    suggestionText(ragForRag),
    suggestionText(ragForInfra),
    "same resume with different JDs should get different suggestion content",
  );
  assert.notEqual(
    suggestionText(ragForInfra),
    suggestionText(infraForInfra),
    "same JD with different resumes should get different suggestion content",
  );
  assert(
    suggestionEvidence(ragForRag).includes("RAG 应用工程师"),
    "RAG target context should appear in JD evidence",
  );
  assert(
    suggestionEvidence(ragForInfra).includes("AI Infra 工程师"),
    "AI Infra target context should appear in JD evidence",
  );

  await fs.rm(tempDir, { force: true, recursive: true });
  console.log("[ok] resume judge suggestions vary by resume and JD");
} catch (error) {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

async function compileLibModules() {
  const tempDir = await fs.mkdtemp(
    path.join(projectRoot, "tmp", "new-era-resume-judge-"),
  );
  const sourceRoot = path.join(projectRoot, "src", "lib");
  const files = await listTypeScriptFiles(sourceRoot);

  for (const sourcePath of files) {
    const source = await fs.readFile(sourcePath, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: sourcePath,
    });
    const relativePath = path.relative(projectRoot, sourcePath);
    const outputPath = path.join(tempDir, relativePath).replace(/\.ts$/, ".js");

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

function buildResume({
  currentRole,
  direction,
  id,
  name,
  projectName,
  projectStack,
  skills,
  summary,
}) {
  const ecosystem = {
    ...emptyVector,
    [direction]: 1,
  };
  const resumeSkills = skills.map((skill) => ({
    category: inferSkillCategory(skill),
    evidence: [`技能清单：${skill}`],
    level: "proficient",
    name: skill,
  }));
  const rawText = [
    name,
    currentRole,
    summary,
    `核心技能：${skills.join("、")}`,
    `项目经历：${projectName}，技术栈 ${projectStack.join("、")}，负责方案设计、实现和验证。`,
  ].join("\n");

  return {
    archivedAt: null,
    content: {
      currentRole,
      education: [],
      experiences: [],
      name,
      projects: [
        {
          domain: direction,
          impact: "完成真实业务验证并沉淀可复用交付流程。",
          name: projectName,
          role: "核心负责人",
          summary,
          techStack: projectStack,
        },
      ],
      rawText,
      skills: resumeSkills,
      summary,
    },
    createdAt: "2026-06-11T00:00:00.000Z",
    direction,
    ecosystem,
    id,
    isDefault: false,
    name,
    skills: resumeSkills,
    updatedAt: "2026-06-11T00:00:00.000Z",
  };
}

function inferSkillCategory(skill) {
  if (/Python|Go|JavaScript|TypeScript/i.test(skill)) {
    return "language";
  }

  if (/Kubernetes|Docker|GPU|Milvus|Prometheus|vLLM/i.test(skill)) {
    return "infrastructure";
  }

  if (/LangChain|Triton/i.test(skill)) {
    return "framework";
  }

  return "domain";
}

function runJudge({
  buildResumeJudgeResult,
  jdText,
  matchResumeToJob,
  resume,
  toJudgeTarget,
}) {
  const resumeProfile = {
    content: resume.content,
    ecosystem: resume.ecosystem,
    skills: resume.skills,
  };
  const match = matchResumeToJob(resumeProfile, jdText);
  const result = buildResumeJudgeResult({
    effort: "standard",
    match,
    mode: "keyword_alignment",
    resume,
    target: toJudgeTarget({ jdText }),
  });

  assert(result.suggestions.length > 0, "judge should return suggestions");

  return result;
}

function suggestionIds(result) {
  return result.suggestions.map((suggestion) => suggestion.id).join("\n");
}

function suggestionText(result) {
  return result.suggestions
    .map((suggestion) =>
      [
        suggestion.title,
        suggestion.originalEvidence,
        suggestion.jdEvidence,
        suggestion.recommendation,
        suggestion.rewriteDraft,
        suggestion.copyText,
      ].join("\n"),
    )
    .join("\n---\n");
}

function suggestionEvidence(result) {
  return result.suggestions
    .map((suggestion) => suggestion.jdEvidence ?? "")
    .join("\n");
}
