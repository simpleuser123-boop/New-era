#!/usr/bin/env node

import {
  assert,
  configureSmokeDatabaseEnv,
  ensureSmokeOwnerAndLogin,
  expectArray,
  expectNumber,
  expectObject,
  expectOkEnvelope,
  installSmokeSignalHandlers,
  requestJson,
  resolveBaseUrl,
  stopSpawnedServer,
} from "./smoke-support.mjs";

const smokeNow = "2026-06-05T09:00:00.000Z";
const smokeSuffix = `${Date.now()}`;

installSmokeSignalHandlers();

try {
  const smokeDatabase = configureSmokeDatabaseEnv();
  const { baseUrl, mode } = await resolveBaseUrl();

  console.log(`New Era report delete smoke against ${baseUrl} (${mode})`);
  console.log(
    `Smoke database: ${smokeDatabase.description}${
      smokeDatabase.path ? ` (${smokeDatabase.path})` : ""
    }`,
  );

  const { jar, ownerWasCreated } = await ensureSmokeOwnerAndLogin(baseUrl);

  console.log(
    `[ok] smoke authenticated as local owner (${ownerWasCreated ? "created" : "existing"})`,
  );

  const report = await createReport(baseUrl, jar);
  const resume = await createResume(baseUrl, jar);
  const application = await createApplication(baseUrl, jar, report.id, resume.id);
  const interviewSession = await createInterviewSession(
    baseUrl,
    jar,
    report.id,
    resume.id,
  );
  const atsRun = await createAtsCheckRun(baseUrl, jar, report.id, resume.id);

  await deleteReport(baseUrl, jar, report.id);
  await assertReportDeleted(baseUrl, jar, report.id);
  await assertReferencesDetached(baseUrl, jar, {
    applicationId: application.id,
    interviewSessionId: interviewSession.id,
    runId: atsRun.id,
  });

  console.log("[ok] Report delete smoke passed");
} catch (error) {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await stopSpawnedServer();
}

async function createReport(baseUrl, jar) {
  const response = await requestJson(baseUrl, {
    body: {
      jdText:
        "负责企业 RAG、Agent 编排和 TypeScript 工程化落地，要求熟悉向量检索、评测与生产系统排障。",
      report: buildEvaluationReport(),
    },
    jar,
    method: "POST",
    path: "/api/reports",
  });

  assert(response.status === 200, `report create expected HTTP 200, got ${response.status}`);
  expectOkEnvelope(response.body, "report create");
  expectObject(response.body.report, "report create.report");
  expectNumber(response.body.report.id, "report create.report.id");

  console.log(`[ok] report #${response.body.report.id} created`);

  return response.body.report;
}

async function createResume(baseUrl, jar) {
  const response = await requestJson(baseUrl, {
    body: {
      content: buildResumeContent(),
      direction: "llm_application",
      ecosystem: buildEcosystemVector(82),
      name: `Report Delete Smoke Resume ${smokeSuffix}`,
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
    },
    jar,
    method: "POST",
    path: "/api/resume/save",
  });

  assert(response.status === 200, `resume create expected HTTP 200, got ${response.status}`);
  expectOkEnvelope(response.body, "resume create");
  expectObject(response.body.resume, "resume create.resume");
  expectNumber(response.body.resume.id, "resume create.resume.id");

  console.log(`[ok] resume #${response.body.resume.id} created`);

  return response.body.resume;
}

async function createApplication(baseUrl, jar, reportId, resumeId) {
  const response = await requestJson(baseUrl, {
    body: {
      channel: "Report Delete Smoke",
      company: `星火智能 ${smokeSuffix}`,
      notes: "用于报告删除 smoke 的本地记录。",
      priority: "high",
      recommendedResumeName: `Report Delete Smoke Resume ${smokeSuffix}`,
      reportId,
      resumeId,
      riskLevel: "high",
      role: "LLM 应用工程师",
      scoreOverall: 4.2,
      status: "to_apply",
      tags: ["RAG", "Agent", "delete-smoke"],
    },
    jar,
    method: "POST",
    path: "/api/applications",
  });

  assert(
    response.status === 201,
    `application create expected HTTP 201, got ${response.status}`,
  );
  expectOkEnvelope(response.body, "application create");
  expectObject(response.body.application, "application create.application");
  expectNumber(response.body.application.id, "application create.application.id");
  assert(
    response.body.application.reportId === reportId,
    "application should initially reference the report",
  );

  console.log(`[ok] application #${response.body.application.id} created`);

  return response.body.application;
}

async function createInterviewSession(baseUrl, jar, reportId, resumeId) {
  const response = await requestJson(baseUrl, {
    body: {
      mode: "mixed",
      reportId,
      resumeId,
      title: `Report Delete Smoke Interview ${smokeSuffix}`,
    },
    jar,
    method: "POST",
    path: "/api/interview/sessions",
  });

  assert(
    response.status === 201,
    `interview session create expected HTTP 201, got ${response.status}`,
  );
  expectOkEnvelope(response.body, "interview session create");
  expectObject(response.body.session, "interview session create.session");
  expectNumber(response.body.session.id, "interview session create.session.id");
  assert(
    response.body.session.reportId === reportId,
    "interview session should initially reference the report",
  );

  console.log(`[ok] interview session #${response.body.session.id} created`);

  return response.body.session;
}

async function createAtsCheckRun(baseUrl, jar, reportId, resumeId) {
  const response = await requestJson(baseUrl, {
    body: {
      reportId,
      resumeId,
    },
    jar,
    method: "POST",
    path: "/api/resume/ats-check",
  });

  assert(
    response.status === 200,
    `ATS check create expected HTTP 200, got ${response.status}`,
  );
  expectOkEnvelope(response.body, "ATS check create");
  expectObject(response.body.run, "ATS check create.run");
  expectNumber(response.body.run.id, "ATS check create.run.id");
  assert(
    response.body.run.reportId === reportId,
    "ATS run should initially reference the report",
  );

  console.log(`[ok] ATS run #${response.body.run.id} created`);

  return response.body.run;
}

async function deleteReport(baseUrl, jar, reportId) {
  const response = await requestJson(baseUrl, {
    jar,
    method: "DELETE",
    path: `/api/reports/${reportId}`,
  });

  assert(
    response.status === 200,
    `report delete expected HTTP 200, got ${response.status}`,
  );
  expectOkEnvelope(response.body, "report delete");
  assert(response.body.deleted === true, "report delete should return deleted: true");
  expectObject(response.body.detachedReferences, "report delete.detachedReferences");
  assert(
    response.body.detachedReferences.applications >= 1,
    "report delete should detach application references",
  );
  assert(
    response.body.detachedReferences.interviewSessions >= 1,
    "report delete should detach interview session references",
  );
  assert(
    response.body.detachedReferences.resumeOptimizationRuns >= 1,
    "report delete should detach resume optimization run references",
  );

  console.log(`[ok] report #${reportId} deleted`);
}

async function assertReportDeleted(baseUrl, jar, reportId) {
  const detail = await requestJson(baseUrl, {
    jar,
    path: `/api/reports/${reportId}`,
  });

  assert(
    detail.status === 404,
    `deleted report detail expected HTTP 404, got ${detail.status}`,
  );

  const list = await requestJson(baseUrl, {
    jar,
    path: "/api/reports?limit=100",
  });

  assert(list.status === 200, `report list expected HTTP 200, got ${list.status}`);
  expectOkEnvelope(list.body, "report list");
  expectArray(list.body.reports, "report list.reports");
  assert(
    !list.body.reports.some((report) => report.id === reportId),
    "deleted report should not appear in report list",
  );

  console.log("[ok] deleted report no longer appears in API reads");
}

async function assertReferencesDetached(
  baseUrl,
  jar,
  { applicationId, interviewSessionId, runId },
) {
  const applicationDetail = await requestJson(baseUrl, {
    jar,
    path: `/api/applications/${applicationId}`,
  });

  assert(
    applicationDetail.status === 200,
    `application detail after report delete expected HTTP 200, got ${applicationDetail.status}`,
  );
  expectOkEnvelope(applicationDetail.body, "application detail after report delete");
  assert(
    applicationDetail.body.application.reportId === null,
    "application should remain but reportId should be null after report delete",
  );

  const interviewDetail = await requestJson(baseUrl, {
    jar,
    path: `/api/interview/sessions/${interviewSessionId}`,
  });

  assert(
    interviewDetail.status === 200,
    `interview detail after report delete expected HTTP 200, got ${interviewDetail.status}`,
  );
  expectOkEnvelope(interviewDetail.body, "interview detail after report delete");
  assert(
    interviewDetail.body.session.reportId === null,
    "interview session should remain but reportId should be null after report delete",
  );

  const exportResponse = await requestJson(baseUrl, {
    jar,
    path: "/api/export",
  });

  assert(
    exportResponse.status === 200,
    `export after report delete expected HTTP 200, got ${exportResponse.status}`,
  );
  expectObject(exportResponse.body.tables, "export tables after report delete");
  expectArray(
    exportResponse.body.tables.resume_optimization_runs,
    "export tables.resume_optimization_runs",
  );

  const exportedRun = exportResponse.body.tables.resume_optimization_runs.find(
    (run) => run.id === runId,
  );

  assert(exportedRun, "ATS run should remain in export after report delete");
  assert(
    exportedRun.reportId === null,
    "ATS run should remain but reportId should be null after report delete",
  );

  console.log("[ok] report references detached without deleting related records");
}

function buildEvaluationReport() {
  const score = buildScoreSummary();
  const riskSignal = {
    advice: "面试时确认用工主体、汇报线和转正可能性。",
    category: "employment",
    explanation: "可能影响稳定性和成长空间。",
    excerpt: "岗位描述包含外包派遣和驻场交付。",
    id: "risk-outsourcing",
    matchTerms: ["外包", "派遣"],
    severity: "high",
    signal: "外包派遣风险",
    source: "dictionary",
    weight: 3,
  };

  return {
    generatedAt: smokeNow,
    job: {
      aiDirection: "llm_application",
      company: `星火智能 ${smokeSuffix}`,
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

function buildResumeContent() {
  return {
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
  };
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
