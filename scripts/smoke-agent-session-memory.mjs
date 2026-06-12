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

const smokeSuffix = `${Date.now()}`;
const marker = `agent-memory-smoke-${smokeSuffix}`;

installSmokeSignalHandlers();

try {
  const smokeDatabase = configureSmokeDatabaseEnv();
  const { baseUrl, mode } = await resolveBaseUrl();

  console.log(`New Era v3 Agent session/memory smoke against ${baseUrl} (${mode})`);
  console.log(
    `Smoke database: ${smokeDatabase.description}${
      smokeDatabase.path ? ` (${smokeDatabase.path})` : ""
    }`,
  );

  const { jar, ownerWasCreated } = await ensureSmokeOwnerAndLogin(baseUrl);

  console.log(
    `[ok] smoke authenticated as local owner (${ownerWasCreated ? "created" : "existing"})`,
  );

  const session = await createSession(baseUrl, jar);

  await runSessionMessage(baseUrl, jar, session.id, `请记住这段测试线索：${marker}。不需要读取本地数据。`);
  const hydratedSession = await getSession(baseUrl, jar, session.id);

  assert(
    hydratedSession.messages.length >= 2,
    "session should persist user and assistant messages after agent run",
  );
  assert(
    hydratedSession.memoryDigest?.includes(marker),
    "session memoryDigest should include the unique smoke marker",
  );

  const memoryItem = await getWorkingDigestMemory(baseUrl, jar, session.id);

  assert(
    memoryItem.content.includes(marker),
    "working_digest memory should include the unique smoke marker",
  );

  const secondRun = await runSessionMessage(
    baseUrl,
    jar,
    session.id,
    "请调用一个不存在的工具来验证会话摘要注入。",
  );
  const secondRunText = collectTextContent(secondRun.events);

  assert(
    secondRunText.includes("本次已注入未删除的可见记忆") &&
      secondRunText.includes(marker),
    "second run should inject visible non-deleted memory into the local answer",
  );

  await deleteMemory(baseUrl, jar, memoryItem.id);

  const afterDelete = await runSessionMessage(
    baseUrl,
    jar,
    session.id,
    "删除记忆后，请调用一个不存在的工具来验证摘要不再注入。",
  );
  const afterDeleteText = collectTextContent(afterDelete.events);

  assert(
    !afterDeleteText.includes(marker),
    "deleted memory marker should not be injected into later agent runs",
  );

  await assertExportIncludesAgentData(baseUrl, jar);

  console.log("[ok] Agent session/memory smoke passed");
} catch (error) {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await stopSpawnedServer();
}

async function createSession(baseUrl, jar) {
  const response = await requestJson(baseUrl, {
    body: {
      title: `Session memory smoke ${smokeSuffix}`,
    },
    jar,
    method: "POST",
    path: "/api/agent/sessions",
  });

  assert(
    response.status === 201,
    `session create expected HTTP 201, got ${response.status}`,
  );
  expectOkEnvelope(response.body, "session create");
  expectObject(response.body.session, "session create.session");
  expectNumber(response.body.session.id, "session create.session.id");

  console.log("[ok] /api/agent/sessions create passed");

  return response.body.session;
}

async function getSession(baseUrl, jar, sessionId) {
  const response = await requestJson(baseUrl, {
    jar,
    path: `/api/agent/sessions/${sessionId}`,
  });

  assert(
    response.status === 200,
    `session detail expected HTTP 200, got ${response.status}`,
  );
  expectOkEnvelope(response.body, "session detail");
  expectObject(response.body.session, "session detail.session");
  expectArray(response.body.session.messages, "session detail.session.messages");

  console.log("[ok] /api/agent/sessions/[id] detail passed");

  return response.body.session;
}

async function runSessionMessage(baseUrl, jar, sessionId, message) {
  const response = await requestSse(baseUrl, {
    body: {
      context: {
        sessionId,
      },
      message,
      source: "agent-session-memory-smoke",
    },
    jar,
    path: "/api/agent/run",
  });

  assert(
    response.status === 200,
    `agent run expected HTTP 200, got ${response.status}`,
  );
  assertTextEventStream(response, "agent run session memory");
  expectEvent(response.events, "agent_selected", "agent run agent_selected");
  expectEvent(response.events, "text", "agent run text");
  expectEvent(response.events, "done", "agent run done");

  console.log("[ok] /api/agent/run session append passed");

  return response;
}

async function getWorkingDigestMemory(baseUrl, jar, sessionId) {
  const response = await requestJson(baseUrl, {
    jar,
    path: `/api/agent/memory?sessionId=${sessionId}&limit=20`,
  });

  assert(
    response.status === 200,
    `memory list expected HTTP 200, got ${response.status}`,
  );
  expectOkEnvelope(response.body, "memory list");
  expectArray(response.body.memoryItems, "memory list.memoryItems");

  const item = response.body.memoryItems.find(
    (memoryItem) =>
      memoryItem.memoryType === "working_digest" &&
      memoryItem.deletedAt === null &&
      memoryItem.sessionId === sessionId,
  );

  assert(item, "memory list should include active working_digest for the session");
  expectNumber(item.id, "working_digest.id");

  console.log("[ok] /api/agent/memory list passed");

  return item;
}

async function deleteMemory(baseUrl, jar, memoryId) {
  const response = await requestJson(baseUrl, {
    jar,
    method: "DELETE",
    path: `/api/agent/memory/${memoryId}`,
  });

  assert(
    response.status === 200,
    `memory delete expected HTTP 200, got ${response.status}`,
  );
  expectOkEnvelope(response.body, "memory delete");
  assert(response.body.deleted === true, "memory delete should return deleted: true");
  expectObject(response.body.memoryItem, "memory delete.memoryItem");
  assert(
    typeof response.body.memoryItem.deletedAt === "string",
    "memory delete should return deletedAt",
  );

  console.log("[ok] /api/agent/memory/[id] delete passed");
}

async function assertExportIncludesAgentData(baseUrl, jar) {
  const response = await requestJson(baseUrl, {
    jar,
    path: "/api/export",
  });

  assert(response.status === 200, `export expected HTTP 200, got ${response.status}`);
  expectObject(response.body, "data export");
  expectObject(response.body.tables, "data export.tables");
  expectArray(response.body.tables.agent_sessions, "data export.tables.agent_sessions");
  expectArray(
    response.body.tables.agent_memory_items,
    "data export.tables.agent_memory_items",
  );
  expectArray(
    response.body.tables.agent_action_proposals,
    "data export.tables.agent_action_proposals",
  );

  console.log("[ok] /api/export includes Agent session and memory tables");
}

async function requestSse(baseUrl, check) {
  const cookieHeader = check.jar?.header();
  const response = await fetchSseWithTimeout(`${baseUrl}${check.path}`, {
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

async function fetchSseWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
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
  const event = events.find((item) => item.type === type);

  assert(event, `${label} should include ${type} event`);
  expectObject(event, label);

  return event;
}

function collectTextContent(events) {
  return events
    .filter((item) => item.type === "text")
    .map((item) => item.content)
    .join("");
}
