#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import {
  assert,
  configureSmokeDatabaseEnv,
  ensureSmokeOwnerAndLogin,
  expectErrorEnvelope,
  fetchWithTimeout,
  installSmokeSignalHandlers,
  isObject,
  newEraDbPathEnvName,
  requestJson,
  resolveBaseUrl,
  rootDir,
  smokeUseRealDbEnvName,
  stopSpawnedServer,
} from "./smoke-support.mjs";

const agentSmokeScripts = [
  "smoke-agent-routing.mjs",
  "smoke-agent-tools.mjs",
  "smoke-agent-actions.mjs",
  "smoke-agent-run.mjs",
  "smoke-agent-session-memory.mjs",
];

const copyScanRoots = ["src", "docs"];
const copyScanExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".md"]);
const riskyCopyPhrases = [
  "已自动投递",
  "已投递到平台",
  "已联系 HR",
  "已自动联系 HR",
  "已访问招聘平台",
  "已接入招聘平台",
  "招聘平台授权已接入",
  "已接入招聘平台授权",
  "自动投递已接入",
  "自动联系 HR 已接入",
  "平台状态已同步",
  "已同步真实投递",
];
const boundaryTokens = [
  "不",
  "未",
  "无",
  "不得",
  "不会",
  "不能",
  "不要",
  "不接",
  "不做",
  "不出现",
  "不暗示",
  "不声称",
  "避免",
  "禁止",
  "暂未接入",
  "未接入",
  "不能说成",
  "不得声称",
];
const deepSeekApiKeyEnvNames = [
  "DEEPSEEK_API_KEY",
  "DEEPSEEKAPIKEY",
  "DEEPSEEK_APIKEY",
  "deepseekapikey",
];
const webSearchMockUrl = "https://example.com/new-era-agent-run-web-search";

installSmokeSignalHandlers();

try {
  configureDeterministicAgentFallbackEnv();
  await configureAgentSmokeDatabase();

  const smokeDatabase = configureSmokeDatabaseEnv();
  const { baseUrl, mode } = await resolveBaseUrl();

  console.log(`New Era v3 aggregate Agent smoke against ${baseUrl} (${mode})`);
  console.log(
    `Smoke database: ${smokeDatabase.description}${
      smokeDatabase.path ? ` (${smokeDatabase.path})` : ""
    }`,
  );

  const { jar, ownerWasCreated } = await ensureSmokeOwnerAndLogin(baseUrl);

  console.log(
    `[ok] smoke authenticated as local owner (${ownerWasCreated ? "created" : "existing"})`,
  );

  await runAgentSmokeScripts(baseUrl);
  await assertUnauthenticatedAgentApi(baseUrl);
  await assertAgentApiErrorStates(baseUrl, jar);
  await assertCopyBoundaries();

  console.log("[ok] New Era v3 aggregate Agent smoke passed");
} catch (error) {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await stopSpawnedServer();
}

function configureDeterministicAgentFallbackEnv() {
  if (process.env.SMOKE_BASE_URL) {
    return;
  }

  for (const name of deepSeekApiKeyEnvNames) {
    delete process.env[name];
  }

  process.env.NEW_ERA_WEB_SEARCH_MOCK_JSON ??= JSON.stringify({
    results: [
      {
        description: "Agent Run smoke mocked web search result.",
        sourceName: "Example Search",
        title: "New Era Agent Run Web Search Smoke",
        url: webSearchMockUrl,
      },
    ],
  });
}

async function configureAgentSmokeDatabase() {
  if (
    process.env.SMOKE_BASE_URL ||
    process.env[smokeUseRealDbEnvName] === "1" ||
    process.env[newEraDbPathEnvName]
  ) {
    return;
  }

  const smokeDbPath = path.join(
    rootDir,
    "data",
    "smoke-agent",
    "new-era-smoke.db",
  );

  await fs.mkdir(path.dirname(smokeDbPath), { recursive: true });
  process.env[newEraDbPathEnvName] = smokeDbPath;
}

async function runAgentSmokeScripts(baseUrl) {
  for (const scriptName of agentSmokeScripts) {
    await runAgentSmokeScript(scriptName, baseUrl);
  }
}

function runAgentSmokeScript(scriptName, baseUrl) {
  const scriptPath = path.join(rootDir, "scripts", scriptName);
  const env = {
    ...process.env,
    SMOKE_BASE_URL: baseUrl,
  };

  return new Promise((resolve, reject) => {
    console.log(`[run] node scripts/${scriptName}`);

    const child = spawn(process.execPath, [scriptPath], {
      cwd: rootDir,
      env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${scriptName} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`,
        ),
      );
    });
  });
}

async function assertUnauthenticatedAgentApi(baseUrl) {
  const checks = [
    {
      method: "POST",
      name: "unauthenticated /api/agent/run",
      path: "/api/agent/run",
      body: {
        message: "未登录请求应被拒绝。",
      },
    },
    {
      name: "unauthenticated /api/agent/sessions",
      path: "/api/agent/sessions?limit=1",
    },
    {
      name: "unauthenticated /api/agent/actions",
      path: "/api/agent/actions?limit=1",
    },
    {
      name: "unauthenticated /api/agent/memory",
      path: "/api/agent/memory?limit=1",
    },
  ];

  for (const check of checks) {
    const response = await requestJson(baseUrl, {
      body: check.body,
      method: check.method,
      path: check.path,
    });

    assert(
      response.status === 401,
      `${check.name} expected HTTP 401, got ${response.status}.`,
    );
    expectAuthError(response.body, check.name);
  }

  console.log(`[ok] unauthenticated Agent API checks passed (${checks.length})`);
}

function expectAuthError(body, label) {
  assert(isObject(body), `${label} should return JSON object.`);
  assert(body.ok === false, `${label} should return ok:false.`);
  assert(isObject(body.error), `${label}.error should be object.`);
  assert(
    body.error.code === "UNAUTHENTICATED" ||
      body.error.code === "SESSION_EXPIRED",
    `${label} should return UNAUTHENTICATED or SESSION_EXPIRED, got ${String(
      body.error.code,
    )}.`,
  );
}

async function assertAgentApiErrorStates(baseUrl, jar) {
  const invalidRun = await requestSse(baseUrl, {
    body: {
      message: "",
    },
    jar,
    path: "/api/agent/run",
  });

  expectSseError(
    invalidRun,
    400,
    "INVALID_AGENT_RUN_INPUT",
    "agent run invalid input",
  );

  const missingSessionRun = await requestSse(baseUrl, {
    body: {
      context: {
        sessionId: 999_999_999,
      },
      message: "这个会话不存在，应返回受控错误。",
    },
    jar,
    path: "/api/agent/run",
  });

  expectSseError(
    missingSessionRun,
    404,
    "AGENT_SESSION_NOT_FOUND",
    "agent run missing session",
  );

  const invalidSessions = await requestJson(baseUrl, {
    jar,
    path: "/api/agent/sessions?limit=0",
  });

  assert(
    invalidSessions.status === 400,
    `invalid sessions query expected HTTP 400, got ${invalidSessions.status}.`,
  );
  expectErrorEnvelope(
    invalidSessions.body,
    "INVALID_AGENT_SESSIONS_QUERY",
    "invalid sessions query",
  );

  const invalidActions = await requestJson(baseUrl, {
    jar,
    path: "/api/agent/actions?status=bad",
  });

  assert(
    invalidActions.status === 400,
    `invalid actions query expected HTTP 400, got ${invalidActions.status}.`,
  );
  expectErrorEnvelope(
    invalidActions.body,
    "INVALID_AGENT_ACTIONS_QUERY",
    "invalid actions query",
  );

  const invalidMemory = await requestJson(baseUrl, {
    jar,
    path: "/api/agent/memory?sessionId=bad",
  });

  assert(
    invalidMemory.status === 400,
    `invalid memory query expected HTTP 400, got ${invalidMemory.status}.`,
  );
  expectErrorEnvelope(
    invalidMemory.body,
    "INVALID_AGENT_MEMORY_QUERY",
    "invalid memory query",
  );

  console.log("[ok] Agent API error-state checks passed");
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

function expectSseError(response, status, code, label) {
  const contentType = response.headers.get("content-type") ?? "";

  assert(response.status === status, `${label} expected HTTP ${status}, got ${response.status}.`);
  assert(
    contentType.includes("text/event-stream"),
    `${label} should return text/event-stream, got ${contentType}.`,
  );

  const event = response.events.find((item) => item.type === "error");

  assert(event, `${label} should emit an error SSE event.`);
  assert(event.error?.code === code, `${label} expected ${code}, got ${event.error?.code}.`);
}

async function assertCopyBoundaries() {
  const findings = [];

  for (const root of copyScanRoots) {
    findings.push(...(await scanRiskyCopy(path.join(rootDir, root))));
  }

  assert(
    findings.length === 0,
    `Copy boundary scan found risky claims:\n${findings.join("\n")}`,
  );

  console.log("[ok] Agent copy boundary scan passed");
}

async function scanRiskyCopy(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const findings = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if ([".next", "node_modules", "output", "tmp"].includes(entry.name)) {
        continue;
      }

      findings.push(...(await scanRiskyCopy(entryPath)));
      continue;
    }

    if (!entry.isFile() || !copyScanExtensions.has(path.extname(entry.name))) {
      continue;
    }

    const content = await fs.readFile(entryPath, "utf8");
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      for (const phrase of riskyCopyPhrases) {
        if (!line.includes(phrase) || isBoundaryStatement(line, phrase)) {
          continue;
        }

        findings.push(
          `${path.relative(rootDir, entryPath)}:${index + 1} contains "${phrase}"`,
        );
      }
    }
  }

  return findings;
}

function isBoundaryStatement(line, phrase) {
  const phraseIndex = line.indexOf(phrase);
  const prefix = line.slice(Math.max(0, phraseIndex - 24), phraseIndex);

  return boundaryTokens.some(
    (token) => prefix.includes(token) || line.includes(token),
  );
}
