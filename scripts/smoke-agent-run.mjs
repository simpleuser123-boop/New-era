#!/usr/bin/env node

import {
  assert,
  configureSmokeDatabaseEnv,
  ensureSmokeOwnerAndLogin,
  expectArray,
  expectNumber,
  expectObject,
  expectOkEnvelope,
  fetchWithTimeout,
  installSmokeSignalHandlers,
  requestJson,
  resolveBaseUrl,
  stopSpawnedServer,
} from "./smoke-support.mjs";

const smokeNow = "2026-06-04T10:00:00.000Z";
const smokeSuffix = `${Date.now()}`;
const previousWebSearchMock = process.env.NEW_ERA_WEB_SEARCH_MOCK_JSON;
const webSearchMockUrl = "https://example.com/new-era-agent-run-web-search";

installSmokeSignalHandlers();

try {
  process.env.NEW_ERA_WEB_SEARCH_MOCK_JSON = JSON.stringify({
    results: [
      {
        description: "Agent Run smoke mocked web search result.",
        sourceName: "Example Search",
        title: "New Era Agent Run Web Search Smoke",
        url: webSearchMockUrl,
      },
    ],
  });

  const smokeDatabase = configureSmokeDatabaseEnv();
  const { baseUrl, mode } = await resolveBaseUrl();

  console.log(`New Era v3 Agent Run smoke against ${baseUrl} (${mode})`);
  console.log(
    `Smoke database: ${smokeDatabase.description}${
      smokeDatabase.path ? ` (${smokeDatabase.path})` : ""
    }`,
  );

  const { jar, ownerWasCreated } = await ensureSmokeOwnerAndLogin(baseUrl);

  console.log(
    `[ok] smoke authenticated as local owner (${ownerWasCreated ? "created" : "existing"})`,
  );

  const seeded = await seedAgentRunData(baseUrl, jar);

  await assertNormalAnswer(baseUrl, jar);
  await assertQueryToolCall(baseUrl, jar, seeded.report);
  await assertWebSearchToolCall(baseUrl, jar);
  await assertToolFailure(baseUrl, jar);
  await assertActionProposal(baseUrl, jar, seeded.application);

  console.log("[ok] Agent Run SSE smoke passed");
} catch (error) {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await stopSpawnedServer();
  if (previousWebSearchMock === undefined) {
    delete process.env.NEW_ERA_WEB_SEARCH_MOCK_JSON;
  } else {
    process.env.NEW_ERA_WEB_SEARCH_MOCK_JSON = previousWebSearchMock;
  }
}

async function seedAgentRunData(baseUrl, jar) {
  const report = await createReport(baseUrl, jar);
  const application = await createApplication(baseUrl, jar);

  return {
    application,
    report,
  };
}

async function assertNormalAnswer(baseUrl, jar) {
  const response = await requestSse(baseUrl, {
    body: {
      message: "请用一句话说明你能做什么，不需要读取本地数据。",
    },
    jar,
    path: "/api/agent/run",
  });

  assert(response.status === 200, `normal answer expected HTTP 200, got ${response.status}`);
  assertTextEventStream(response, "normal answer");
  expectEvent(response.events, "agent_selected", "normal answer agent_selected");
  expectEvent(response.events, "text", "normal answer text");
  expectStreamingText(response.events, "normal answer streaming text");
  expectEvent(response.events, "done", "normal answer done");

  console.log("[ok] /api/agent/run normal answer SSE passed");
}

async function assertQueryToolCall(baseUrl, jar, report) {
  const response = await requestSse(baseUrl, {
    body: {
      context: {
        reportId: report.id,
      },
      message: "解释这份报告的主要风险和评分依据。",
    },
    jar,
    path: "/api/agent/run",
  });

  assert(response.status === 200, `query tool expected HTTP 200, got ${response.status}`);
  assertTextEventStream(response, "query tool");

  expectEvent(response.events, "agent_selected", "query tool agent_selected");
  expectMatchingEvent(
    response.events,
    "tool_call",
    (event) => event.name === "get_report_detail",
    "query tool_call get_report_detail",
  );
  expectMatchingEvent(
    response.events,
    "tool_result",
    (event) => event.name === "get_report_detail" && event.ok === true,
    "query tool_result ok",
  );
  expectMatchingEvent(
    response.events,
    "done",
    (event) =>
      Array.isArray(event.citations) &&
      event.citations.some((citation) => citation.type === "report"),
    "query done citations",
  );

  console.log("[ok] /api/agent/run Query tool SSE passed");
}

async function assertToolFailure(baseUrl, jar) {
  const response = await requestSse(baseUrl, {
    body: {
      message: "请调用一个不存在的工具，验证工具失败时如何停止。",
    },
    jar,
    path: "/api/agent/run",
  });

  assert(response.status === 200, `tool failure expected HTTP 200, got ${response.status}`);
  assertTextEventStream(response, "tool failure");
  expectMatchingEvent(
    response.events,
    "tool_result",
    (event) => event.ok === false && event.error?.code === "tool_not_found",
    "tool failure result",
  );
  expectEvent(response.events, "done", "tool failure done");

  console.log("[ok] /api/agent/run tool failure SSE passed");
}

async function assertWebSearchToolCall(baseUrl, jar) {
  const response = await requestSse(baseUrl, {
    body: {
      message: "请联网搜索一下 New Era Agent Run smoke 的公开网页信息。",
    },
    jar,
    path: "/api/agent/run",
  });

  assert(response.status === 200, `web search expected HTTP 200, got ${response.status}`);
  assertTextEventStream(response, "web search");

  expectMatchingEvent(
    response.events,
    "tool_call",
    (event) => event.name === "web_search" && event.category === "query",
    "web search tool_call",
  );
  expectMatchingEvent(
    response.events,
    "tool_result",
    (event) => event.name === "web_search" && event.ok === true,
    "web search tool_result",
  );
  expectMatchingEvent(
    response.events,
    "done",
    (event) =>
      Array.isArray(event.citations) &&
      event.citations.some(
        (citation) => citation.type === "web" && citation.id === webSearchMockUrl,
      ),
    "web search done citations",
  );

  console.log("[ok] /api/agent/run Web Search Query tool SSE passed");
}

async function assertActionProposal(baseUrl, jar, application) {
  const response = await requestSse(baseUrl, {
    body: {
      context: {
        applicationId: application.id,
      },
      message: "请把这条投递记录标记为已投递。",
    },
    jar,
    path: "/api/agent/run",
  });

  assert(response.status === 200, `action proposal expected HTTP 200, got ${response.status}`);
  assertTextEventStream(response, "action proposal");

  const actionEvent = expectEvent(
    response.events,
    "action_proposed",
    "action proposal event",
  );

  expectNumber(actionEvent.actionId, "action proposal actionId");
  expectMatchingEvent(
    response.events,
    "tool_result",
    (event) =>
      event.name === "propose_application_status_update" && event.ok === true,
    "action proposal tool_result",
  );

  const detail = await getApplicationDetail(baseUrl, jar, application.id);

  assert(
    detail.application.status === "to_apply",
    "Action proposal must not update applications.status before confirmation",
  );

  const proposals = await requestJson(baseUrl, {
    jar,
    path: "/api/agent/actions?status=pending&limit=20",
  });

  assert(
    proposals.status === 200,
    `proposal list expected HTTP 200, got ${proposals.status}`,
  );
  expectOkEnvelope(proposals.body, "proposal list");
  expectArray(proposals.body.proposals, "proposal list.proposals");
  assert(
    proposals.body.proposals.some((proposal) => proposal.id === actionEvent.actionId),
    "pending proposal list should include action_proposed id",
  );

  console.log("[ok] /api/agent/run Action proposal SSE passed");
}

async function requestSse(baseUrl, check) {
  const cookieHeader = check.jar?.header();
  const response = await fetchWithTimeout(`${baseUrl}${check.path}`, {
    body: JSON.stringify(check.body),
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    method: "POST",
  });

  check.jar?.applyFromHeaders(response.headers);

  const raw = await response.text();

  return {
    events: parseSseEvents(raw),
    headers: response.headers,
    raw,
    status: response.status,
  };
}

function parseSseEvents(raw) {
  const events = [];

  for (const block of raw.split(/\n\s*\n/)) {
    const dataLines = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());

    if (dataLines.length === 0) {
      continue;
    }

    events.push(JSON.parse(dataLines.join("\n")));
  }

  return events;
}

function assertTextEventStream(response, label) {
  const contentType = response.headers.get("content-type") ?? "";

  assert(
    contentType.includes("text/event-stream"),
    `${label} should return text/event-stream, got ${contentType}`,
  );
  assert(response.events.length > 0, `${label} should emit at least one SSE event`);
}

function expectEvent(events, type, label) {
  return expectMatchingEvent(events, type, () => true, label);
}

function expectStreamingText(events, label) {
  const textEvents = events.filter((item) => item.type === "text");
  const content = textEvents.map((item) => item.content).join("");

  assert(textEvents.length > 1, `${label} should emit multiple text chunks`);
  assert(content.trim().length > 0, `${label} should emit non-empty content`);
}

function expectMatchingEvent(events, type, predicate, label) {
  const event = events.find((item) => item.type === type && predicate(item));

  assert(event, `${label} should include ${type} event`);
  expectObject(event, label);

  return event;
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

async function createApplication(baseUrl, jar) {
  const response = await requestJson(baseUrl, {
    body: {
      channel: "Agent Run Smoke",
      company: `星火智能 ${smokeSuffix}`,
      notes: "用于 Agent Run smoke 的本地记录。",
      priority: "high",
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

function buildEcosystemVector(primaryScore) {
  return {
    ai_infra: 35,
    ai_safety: 18,
    algorithm_research: 30,
    embodied_ai: 12,
    llm_application: primaryScore,
  };
}
