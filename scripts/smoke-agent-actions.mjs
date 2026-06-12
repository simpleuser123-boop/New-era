#!/usr/bin/env node

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
  requestJson,
  resolveBaseUrl,
  stopSpawnedServer,
} from "./smoke-support.mjs";

const smokeNow = "2026-06-04T09:00:00.000Z";
const smokeSuffix = `${Date.now()}`;

installSmokeSignalHandlers();

try {
  const smokeDatabase = configureSmokeDatabaseEnv();
  const { baseUrl, mode } = await resolveBaseUrl();

  console.log(`New Era v3 Action Proposal smoke against ${baseUrl} (${mode})`);
  console.log(
    `Smoke database: ${smokeDatabase.description}${
      smokeDatabase.path ? ` (${smokeDatabase.path})` : ""
    }`,
  );

  const { jar, ownerWasCreated } = await ensureSmokeOwnerAndLogin(baseUrl);

  console.log(
    `[ok] smoke authenticated as local owner (${ownerWasCreated ? "created" : "existing"})`,
  );

  const seeded = await seedActionProposalData(baseUrl, jar);

  await assertCreateDoesNotWriteBusinessTable(baseUrl, jar, seeded.application);
  await assertConfirmWritesThroughBusinessMethod(baseUrl, jar, seeded.application);
  await assertDismissDoesNotWriteBusinessTable(baseUrl, jar, seeded.application);
  await assertInvalidPayloadRejected(baseUrl, jar, seeded.application.id);

  console.log("[ok] Action Proposal smoke passed");
} catch (error) {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await stopSpawnedServer();
}

async function seedActionProposalData(baseUrl, jar) {
  const report = await createReport(baseUrl, jar);
  const resume = await createResume(baseUrl, jar);
  const application = await createApplication(baseUrl, jar, report.id, resume.id);

  return {
    application,
    report,
    resume,
  };
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
  expectNumber(response.body.reportId, "report create.reportId");

  return response.body.report;
}

async function createResume(baseUrl, jar) {
  const response = await requestJson(baseUrl, {
    body: {
      content: buildResumeContent(),
      direction: "llm_application",
      ecosystem: buildEcosystemVector(82),
      name: `Action Proposal Smoke Resume ${smokeSuffix}`,
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
  expectNumber(response.body.resumeId, "resume create.resumeId");

  return response.body.resume;
}

async function createApplication(baseUrl, jar, reportId, resumeId) {
  const response = await requestJson(baseUrl, {
    body: {
      channel: "Action Proposal Smoke",
      company: `星火智能 ${smokeSuffix}`,
      notes: "用于 Action Proposal smoke 的本地记录。",
      priority: "high",
      recommendedResumeName: `Action Proposal Smoke Resume ${smokeSuffix}`,
      reportId,
      resumeId,
      riskLevel: "high",
      role: "LLM 应用工程师",
      scoreOverall: 4.2,
      status: "to_apply",
      tags: ["RAG", "Agent", "smoke"],
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
  expectNumber(response.body.applicationId, "application create.applicationId");
  assert(
    response.body.application.status === "to_apply",
    "seed application should start as to_apply",
  );

  return response.body.application;
}

async function assertCreateDoesNotWriteBusinessTable(baseUrl, jar, application) {
  const proposalResponse = await requestJson(baseUrl, {
    body: buildStatusProposalBody(application.id, "applied"),
    jar,
    method: "POST",
    path: "/api/agent/actions",
  });

  assert(
    proposalResponse.status === 201,
    `proposal create expected HTTP 201, got ${proposalResponse.status}`,
  );
  expectOkEnvelope(proposalResponse.body, "proposal create");
  expectObject(proposalResponse.body.proposal, "proposal create.proposal");
  assert(
    proposalResponse.body.proposal.status === "pending",
    "created proposal should be pending",
  );

  const unchanged = await getApplicationDetail(baseUrl, jar, application.id);

  assert(
    unchanged.application.status === "to_apply",
    "unconfirmed proposal must not update applications.status",
  );

  console.log(
    `[ok] unconfirmed proposal #${proposalResponse.body.proposal.id} did not change applications`,
  );
}

async function assertConfirmWritesThroughBusinessMethod(baseUrl, jar, application) {
  const proposalResponse = await requestJson(baseUrl, {
    body: buildStatusProposalBody(application.id, "applied"),
    jar,
    method: "POST",
    path: "/api/agent/actions",
  });
  const proposal = proposalResponse.body.proposal;

  const confirm = await requestJson(baseUrl, {
    jar,
    method: "POST",
    path: `/api/agent/actions/${proposal.id}/confirm`,
  });

  assert(confirm.status === 200, `proposal confirm expected HTTP 200, got ${confirm.status}`);
  expectOkEnvelope(confirm.body, "proposal confirm");
  expectObject(confirm.body.proposal, "proposal confirm.proposal");
  expectObject(confirm.body.result, "proposal confirm.result");
  assert(confirm.body.proposal.status === "confirmed", "proposal should be confirmed");
  assert(
    confirm.body.result.application.status === "applied",
    "confirm result should include updated application",
  );

  const detail = await getApplicationDetail(baseUrl, jar, application.id);

  assert(
    detail.application.status === "applied",
    "confirmed proposal should update applications.status",
  );
  assert(
    detail.events.some((event) => event.eventType === "status_changed"),
    "confirmed status update should reuse application event logic",
  );

  console.log(`[ok] confirmed proposal #${proposal.id} updated application status`);
}

async function assertDismissDoesNotWriteBusinessTable(baseUrl, jar, application) {
  const before = await getApplicationDetail(baseUrl, jar, application.id);
  const proposalResponse = await requestJson(baseUrl, {
    body: {
      actionType: "propose_follow_up_event",
      payload: {
        applicationId: application.id,
        event: {
          eventType: "follow_up_scheduled",
          happenedAt: smokeNow,
          note: "smoke 忽略前不应写入时间线。",
          title: "准备跟进 HR",
        },
      },
      reason: "Smoke 验证忽略 proposal 不写入 application_events。",
      riskNote: "忽略后不会新增 Tracker 时间线事件。",
      sourceAgentId: "tracker-agent",
      sourceToolName: "propose_follow_up_event",
      title: "新增跟进时间线事件",
    },
    jar,
    method: "POST",
    path: "/api/agent/actions",
  });
  const proposal = proposalResponse.body.proposal;

  assert(
    proposalResponse.status === 201,
    `dismiss proposal create expected HTTP 201, got ${proposalResponse.status}`,
  );

  const dismiss = await requestJson(baseUrl, {
    body: {
      reason: "smoke ignore",
    },
    jar,
    method: "POST",
    path: `/api/agent/actions/${proposal.id}/dismiss`,
  });

  assert(dismiss.status === 200, `proposal dismiss expected HTTP 200, got ${dismiss.status}`);
  expectOkEnvelope(dismiss.body, "proposal dismiss");
  assert(dismiss.body.proposal.status === "dismissed", "proposal should be dismissed");

  const after = await getApplicationDetail(baseUrl, jar, application.id);

  assert(
    after.events.length === before.events.length,
    "dismissed proposal must not create application_events rows",
  );

  console.log(`[ok] dismissed proposal #${proposal.id} did not change application_events`);
}

async function assertInvalidPayloadRejected(baseUrl, jar, applicationId) {
  const response = await requestJson(baseUrl, {
    body: {
      actionType: "propose_application_status_update",
      payload: {
        applicationId,
        status: "not_a_status",
      },
      reason: "Smoke 验证非法 payload 被拒绝。",
      title: "非法状态更新",
    },
    jar,
    method: "POST",
    path: "/api/agent/actions",
  });

  assert(
    response.status === 400,
    `invalid proposal expected HTTP 400, got ${response.status}`,
  );
  expectErrorEnvelope(
    response.body,
    "INVALID_AGENT_ACTION_PROPOSAL_INPUT",
    "invalid proposal",
  );

  const list = await requestJson(baseUrl, {
    jar,
    path: "/api/agent/actions?status=pending&limit=10",
  });

  assert(list.status === 200, `proposal list expected HTTP 200, got ${list.status}`);
  expectOkEnvelope(list.body, "proposal list");
  expectArray(list.body.proposals, "proposal list.proposals");

  console.log("[ok] invalid proposal payload rejected before insert");
}

async function getApplicationDetail(baseUrl, jar, applicationId) {
  const response = await requestJson(baseUrl, {
    jar,
    path: `/api/applications/${applicationId}`,
  });

  assert(
    response.status === 200,
    `application detail expected HTTP 200, got ${response.status}`,
  );
  expectOkEnvelope(response.body, "application detail");
  expectObject(response.body.application, "application detail.application");
  expectArray(response.body.events, "application detail.events");

  return response.body;
}

function buildStatusProposalBody(applicationId, status) {
  return {
    actionType: "propose_application_status_update",
    payload: {
      applicationId,
      status,
    },
    reason: "Smoke 验证状态更新只能通过用户确认执行。",
    riskNote: "确认后会更新本地 Tracker 状态并写入状态变更时间线。",
    sourceAgentId: "tracker-agent",
    sourceToolName: "propose_application_status_update",
    title: "更新 Tracker 状态",
  };
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
