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
  expectString,
  fetchWithTimeout,
  installSmokeSignalHandlers,
  resolveBaseUrl,
  runCheck,
  stopSpawnedServer,
} from "./smoke-support.mjs";

const checks = [
  {
    authenticated: false,
    name: "health",
    path: "/api/health",
    expectedStatus: 200,
    expect: ({ body }) => {
      expectOkEnvelope(body, "health");
      expectObject(body.database, "health.database");
      expectString(body.app, "health.app");
      expectString(body.timestamp, "health.timestamp");
      if (body.database.status !== "ok") {
        throw new Error("health.database.status should be ok.");
      }
    },
  },
  {
    name: "reports list",
    path: "/api/reports?limit=1",
    expectedStatus: 200,
    expect: ({ body }) => {
      expectOkEnvelope(body, "reports");
      expectArray(body.reports, "reports.reports");
      expectNumber(body.count, "reports.count");
      if (body.limit !== 1) {
        throw new Error("reports.limit should echo 1.");
      }
    },
  },
  {
    name: "tracker applications list",
    path: "/api/applications?limit=1",
    expectedStatus: 200,
    expect: ({ body }) => {
      expectOkEnvelope(body, "applications");
      expectArray(body.applications, "applications.applications");
      expectNumber(body.count, "applications.count");
      if (body.limit !== 1) {
        throw new Error("applications.limit should echo 1.");
      }
    },
  },
  {
    name: "tracker stats",
    path: "/api/applications/stats",
    expectedStatus: 200,
    expect: ({ body }) => {
      expectOkEnvelope(body, "application stats");
      for (const key of [
        "evaluated",
        "highMatch",
        "toApply",
        "applied",
        "interviewing",
        "offerReceived",
        "rejected",
        "abandoned",
        "overdueFollowUps",
      ]) {
        expectNumber(body[key], `application stats.${key}`);
      }
      expectArray(body.priorityDistribution, "application stats.priorityDistribution");
      expectArray(body.channelDistribution, "application stats.channelDistribution");
    },
  },
  {
    name: "career profile",
    path: "/api/career-profile",
    expectedStatus: 200,
    expect: ({ body }) => {
      expectOkEnvelope(body, "career profile");
      expectObject(body.profile, "career profile.profile");
      expectObject(body.defaults, "career profile.defaults");
      if (typeof body.defaultsApplied !== "boolean") {
        throw new Error("career profile.defaultsApplied should be boolean.");
      }
    },
  },
  {
    name: "career suggestions",
    path: "/api/career-profile/suggestions",
    method: "POST",
    expectedStatus: 200,
    expect: ({ body }) => {
      expectOkEnvelope(body, "career suggestions");
      expectArray(body.suggestions, "career suggestions.suggestions");
      expectArray(body.sources, "career suggestions.sources");
      expectNumber(body.count, "career suggestions.count");
      expectString(body.generatedAt, "career suggestions.generatedAt");
    },
  },
  {
    name: "analytics overview",
    path: "/api/analytics",
    expectedStatus: 200,
    expect: ({ body }) => {
      expectOkEnvelope(body, "analytics");
      expectString(body.generatedAt, "analytics.generatedAt");
      expectObject(body.sampleSize, "analytics.sampleSize");
      expectArray(body.funnel, "analytics.funnel");
      expectObject(body.tracker, "analytics.tracker");
      expectArray(body.caveats, "analytics.caveats");
    },
  },
  {
    name: "assistant legacy validation",
    path: "/api/assistant",
    method: "POST",
    body: {
      message: "",
    },
    expectedStatus: 400,
    expect: ({ body }) => {
      expectErrorEnvelope(body, "INVALID_ASSISTANT_INPUT", "assistant validation");
    },
  },
  {
    name: "assistant legacy local fallback",
    path: "/api/assistant",
    method: "POST",
    headers: {
      "x-new-era-force-local-fallback": "1",
    },
    body: {
      message: "请用一句话总结当前本地求职数据。",
    },
    expectedStatus: 200,
    expect: ({ body }) => {
      expectOkEnvelope(body, "assistant legacy local fallback");
      expectString(body.answer, "assistant legacy local fallback.answer");
      expectArray(body.citations, "assistant legacy local fallback.citations");
      expectArray(body.actions, "assistant legacy local fallback.actions");
      expectArray(body.warnings, "assistant legacy local fallback.warnings");
      if (body.provider !== "local_fallback") {
        throw new Error(
          "assistant legacy local fallback.provider should be local_fallback.",
        );
      }
      if (body.fallbackUsed !== true) {
        throw new Error("assistant legacy local fallback.fallbackUsed should be true.");
      }
      if (body.fallbackReason !== "smoke_forced_local_fallback") {
        throw new Error(
          `assistant legacy local fallback.fallbackReason should be smoke_forced_local_fallback, got ${String(body.fallbackReason)}.`,
        );
      }
    },
  },
  {
    name: "interview sessions list",
    path: "/api/interview/sessions?limit=1",
    expectedStatus: 200,
    expect: ({ body }) => {
      expectOkEnvelope(body, "interview sessions");
      expectArray(body.sessions, "interview sessions.sessions");
      expectNumber(body.count, "interview sessions.count");
      if (body.limit !== 1) {
        throw new Error("interview sessions.limit should echo 1.");
      }
    },
  },
  {
    name: "interview validation",
    path: "/api/interview/sessions",
    method: "POST",
    body: {
      reportId: 0,
    },
    expectedStatus: 400,
    expect: ({ body }) => {
      expectErrorEnvelope(
        body,
        "INVALID_INTERVIEW_SESSION_INPUT",
        "interview validation",
      );
    },
  },
  {
    name: "resume judge runs list",
    path: "/api/resume/judge/runs?limit=1",
    expectedStatus: 200,
    expect: ({ body }) => {
      expectOkEnvelope(body, "resume judge runs");
      expectArray(body.runs, "resume judge runs.runs");
      expectNumber(body.count, "resume judge runs.count");
      if (body.limit !== 1) {
        throw new Error("resume judge runs.limit should echo 1.");
      }
    },
  },
  {
    name: "resume judge validation",
    path: "/api/resume/judge",
    method: "POST",
    body: {
      resumeId: 0,
    },
    expectedStatus: 400,
    expect: ({ body }) => {
      expectErrorEnvelope(body, "INVALID_RESUME_JUDGE_INPUT", "resume judge validation");
    },
  },
  {
    name: "settings",
    path: "/api/settings",
    expectedStatus: 200,
    expect: ({ body }) => {
      expectOkEnvelope(body, "settings");
      expectObject(body.settings, "settings.settings");
      expectArray(body.entries, "settings.entries");
      expectNumber(body.count, "settings.count");
    },
  },
  {
    name: "export snapshot",
    path: "/api/export",
    expectedStatus: 200,
    expect: ({ body, headers }) => {
      expectString(body.product, "export.product");
      expectString(body.exportVersion, "export.exportVersion");
      expectString(body.exportedAt, "export.exportedAt");
      expectObject(body.source, "export.source");
      expectObject(body.tables, "export.tables");
      if (!headers.get("content-disposition")?.includes("new-era-export-")) {
        throw new Error("export should include a downloadable filename.");
      }
      for (const key of [
        "reports",
        "resumes",
        "applications",
        "settings",
        "interview_sessions",
        "resume_optimization_runs",
      ]) {
        if (!(key in body.tables)) {
          throw new Error(`export.tables.${key} should exist.`);
        }
      }
    },
  },
  {
    name: "jd fetch validation",
    path: "/api/jd/fetch",
    method: "POST",
    body: {
      url: "not-a-url",
    },
    expectedStatus: 400,
    expect: ({ body }) => {
      expectErrorEnvelope(body, "INVALID_JD_URL", "jd fetch validation");
    },
  },
  {
    name: "jd evaluation validation",
    path: "/api/evaluate",
    method: "POST",
    body: {
      jdText: "too short",
    },
    expectedStatus: 400,
    expect: ({ body }) => {
      expectErrorEnvelope(body, "JD_TEXT_TOO_SHORT", "jd evaluation validation");
    },
  },
];

installSmokeSignalHandlers();

try {
  const smokeDatabase = configureSmokeDatabaseEnv();
  const { baseUrl, mode } = await resolveBaseUrl();

  console.log(`New Era v2 smoke against ${baseUrl} (${mode})`);
  console.log(
    `Smoke database: ${smokeDatabase.description}${
      smokeDatabase.path ? ` (${smokeDatabase.path})` : ""
    }`,
  );

  const { jar, ownerWasCreated } = await ensureSmokeOwnerAndLogin(baseUrl);

  console.log(
    `[ok] smoke authenticated as local owner (${ownerWasCreated ? "created" : "existing"})`,
  );

  await assertAssistantPrimaryAgentRun(baseUrl, jar);

  for (const check of checks) {
    await runCheck(baseUrl, {
      ...check,
      ...(check.authenticated === false ? {} : { jar }),
    });
  }

  console.log(`Smoke complete: ${checks.length + 1}/${checks.length + 1} checks passed.`);
} catch (error) {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await stopSpawnedServer();
}

async function assertAssistantPrimaryAgentRun(baseUrl, jar) {
  const response = await requestSse(baseUrl, {
    body: {
      message: "请用一句话说明你能做什么，不需要读取本地数据。",
      source: "smoke-default-assistant-primary",
    },
    headers: {
      "x-new-era-force-local-fallback": "1",
    },
    jar,
    path: "/api/agent/run",
  });

  assert(
    response.status === 200,
    `assistant primary agent run expected HTTP 200, got ${response.status}.`,
  );
  assertTextEventStream(response, "assistant primary agent run");
  expectSseEvent(response.events, "agent_selected", "assistant primary agent run agent");
  expectSseEvent(
    response.events,
    "fallback",
    "assistant primary agent run forced fallback",
    (event) => event.fallbackCode === "forced_local_fallback",
  );
  expectSseEvent(response.events, "text", "assistant primary agent run text");
  expectSseEvent(response.events, "done", "assistant primary agent run done");

  const streamedText = response.events
    .filter((event) => event.type === "text")
    .map((event) => event.content)
    .join("");

  expectString(streamedText, "assistant primary agent run streamed text");
  console.log("[ok] assistant primary /api/agent/run SSE passed");
}

async function requestSse(baseUrl, check) {
  const cookieHeader = check.jar?.header();
  const response = await fetchWithTimeout(`${baseUrl}${check.path}`, {
    body: JSON.stringify(check.body),
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(check.headers ?? {}),
    },
    method: check.method ?? "POST",
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
    `${label} should return text/event-stream, got ${contentType}.`,
  );
  assert(response.events.length > 0, `${label} should emit at least one SSE event.`);
}

function expectSseEvent(events, type, label, predicate = () => true) {
  const event = events.find((item) => item.type === type && predicate(item));

  expectObject(event, label);

  return event;
}
