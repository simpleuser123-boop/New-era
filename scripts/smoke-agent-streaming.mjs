#!/usr/bin/env node

import { rmSync } from "node:fs";
import http from "node:http";
import path from "node:path";

import {
  assert,
  configureSmokeDatabaseEnv,
  defaultHost,
  ensureSmokeOwnerAndLogin,
  expectArray,
  expectObject,
  installSmokeSignalHandlers,
  requestJson,
  resolveBaseUrl,
  rootDir,
  stopSpawnedServer,
} from "./smoke-support.mjs";

const smokeSuffix = `${Date.now()}`;
const expectedAnswer = "真正的模型流式输出已经生效。";
const smokeDbDir = path.join(
  rootDir,
  "data",
  "smoke-agent-streaming",
  smokeSuffix,
);
const previousEnv = captureEnvironment([
  "NEW_ERA_DB_PATH",
  "NEW_ERA_DEEPSEEK_API_KEY",
  "NEW_ERA_DEEPSEEK_BASE_URL",
  "NEW_ERA_DEEPSEEK_DISABLED",
  "NEW_ERA_DEEPSEEK_MODEL",
]);
const modelState = {
  finalChunkSentAt: 0,
  requestBody: null,
};
let mockModelServer;

installSmokeSignalHandlers();

try {
  mockModelServer = await startMockModelServer(modelState);
  const mockAddress = mockModelServer.address();

  assert(
    mockAddress && typeof mockAddress === "object",
    "mock model server should expose a TCP address",
  );

  process.env.NEW_ERA_DB_PATH = path.join(smokeDbDir, "new-era-smoke.db");
  process.env.NEW_ERA_DEEPSEEK_API_KEY = "new-era-stream-smoke-key";
  process.env.NEW_ERA_DEEPSEEK_BASE_URL =
    `http://${defaultHost}:${mockAddress.port}/v1`;
  process.env.NEW_ERA_DEEPSEEK_DISABLED = "0";
  process.env.NEW_ERA_DEEPSEEK_MODEL = "new-era-stream-smoke-model";

  const smokeDatabase = configureSmokeDatabaseEnv();
  const { baseUrl, mode } = await resolveBaseUrl();

  console.log(`New Era Agent native streaming smoke against ${baseUrl} (${mode})`);
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
  const stream = await requestAgentStream(baseUrl, jar, session.id);
  const textEvents = stream.events.filter((event) => event.type === "text");
  const answer = textEvents.map((event) => event.content).join("");
  const firstTextEvent = textEvents[0];

  assert(stream.status === 200, `stream expected HTTP 200, got ${stream.status}`);
  assert(
    stream.contentType.includes("text/event-stream"),
    `stream expected text/event-stream, got ${stream.contentType}`,
  );
  assert(firstTextEvent, "stream should emit at least one text event");
  assert(
    firstTextEvent.receivedAt < modelState.finalChunkSentAt,
    "first assistant text must arrive before the mock model sends its final chunk",
  );
  assert(
    answer === expectedAnswer,
    `streamed answer mismatch: expected ${expectedAnswer}, got ${answer}`,
  );
  assert(
    !stream.events.some((event) => event.type === "text_reset"),
    "successful native stream should not reset assistant text",
  );
  assert(
    stream.events.some((event) => event.type === "done"),
    "stream should emit done",
  );

  expectObject(modelState.requestBody, "mock model request body");
  assert(
    modelState.requestBody.stream === true,
    "DeepSeek-compatible request should set stream: true",
  );
  assert(
    modelState.requestBody.response_format?.type === "json_object",
    "Agent model request should preserve response_format: json_object",
  );

  const hydrated = await getSession(baseUrl, jar, session.id);
  const assistantMessages = hydrated.messages.filter(
    (message) => message.role === "assistant",
  );
  const persistedAnswer = assistantMessages.at(-1)?.content;

  assert(
    persistedAnswer === expectedAnswer,
    "persisted session answer should match the streamed assistant content",
  );

  console.log("[ok] model request enabled native SSE streaming");
  console.log("[ok] first text arrived before model completion");
  console.log("[ok] streamed answer persisted without duplication");
} catch (error) {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await stopSpawnedServer();
  await closeServer(mockModelServer);
  restoreEnvironment(previousEnv);
  rmSync(smokeDbDir, { force: true, recursive: true });
}

async function createSession(baseUrl, jar) {
  const response = await requestJson(baseUrl, {
    body: {
      title: `Streaming smoke ${smokeSuffix}`,
    },
    jar,
    method: "POST",
    path: "/api/agent/sessions",
  });

  assert(
    response.status === 201,
    `session create expected HTTP 201, got ${response.status}`,
  );
  expectObject(response.body.session, "session create.session");

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
  expectObject(response.body.session, "session detail.session");
  expectArray(response.body.session.messages, "session detail.messages");

  return response.body.session;
}

async function requestAgentStream(baseUrl, jar, sessionId) {
  const response = await fetch(`${baseUrl}/api/agent/run`, {
    body: JSON.stringify({
      context: {
        sessionId,
      },
      message: "请直接用一句话说明流式输出状态，不需要读取本地数据。",
      source: "smoke-agent-streaming",
    }),
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      Cookie: jar.header(),
    },
    method: "POST",
  });
  const reader = response.body?.getReader();

  assert(reader, "agent stream should include a readable response body");

  const decoder = new TextDecoder();
  const events = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    const blocks = buffer.split(/\n\n/);
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const event = parseSseEvent(block);

      if (event) {
        events.push({
          ...event,
          receivedAt: Date.now(),
        });
      }
    }
  }

  if (buffer.trim()) {
    const event = parseSseEvent(buffer);

    if (event) {
      events.push({
        ...event,
        receivedAt: Date.now(),
      });
    }
  }

  return {
    contentType: response.headers.get("content-type") ?? "",
    events,
    status: response.status,
  };
}

function parseSseEvent(block) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();

  return data ? JSON.parse(data) : null;
}

async function startMockModelServer(state) {
  const server = http.createServer(async (request, response) => {
    if (
      request.method !== "POST" ||
      !request.url?.endsWith("/chat/completions")
    ) {
      response.writeHead(404).end();
      return;
    }

    const requestBody = await readJsonBody(request);
    state.requestBody = requestBody;

    if (requestBody.stream !== true) {
      response
        .writeHead(400, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: { message: "stream must be true" } }));
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    });

    const chunks = [
      '{"answer":"真正',
      "的模型流式输出",
      '已经生效。","citations":[],"warnings":[]}',
    ];

    writeModelEvent(response, chunks[0]);
    await delay(180);
    writeModelEvent(response, chunks[1]);
    await delay(180);
    state.finalChunkSentAt = Date.now();
    writeModelEvent(response, chunks[2]);
    response.write("data: [DONE]\n\n");
    response.end();
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, defaultHost, resolve);
  });

  return server;
}

function writeModelEvent(response, content) {
  response.write(
    `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            content,
          },
          finish_reason: null,
          index: 0,
        },
      ],
      id: `chatcmpl-stream-smoke-${smokeSuffix}`,
      model: "new-era-stream-smoke-model",
      object: "chat.completion.chunk",
    })}\n\n`,
  );
}

async function readJsonBody(request) {
  let body = "";

  for await (const chunk of request) {
    body += chunk;
  }

  return JSON.parse(body);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function closeServer(server) {
  if (!server?.listening) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function captureEnvironment(names) {
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

function restoreEnvironment(previous) {
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}
