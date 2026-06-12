#!/usr/bin/env node

import {
  assert,
  configureSmokeDatabaseEnv,
  ensureSmokeOwnerAndLogin,
  expectArray,
  expectOkEnvelope,
  expectString,
  installSmokeSignalHandlers,
  requestJson,
  resolveBaseUrl,
  rootDir,
  stopSpawnedServer,
} from "./smoke-support.mjs";
import http from "node:http";
import path from "node:path";

const cases = [
  {
    expectedCode: "missing_api_key",
    expectedWarningIncludes: "DeepSeek 不可用",
    name: "missing api key",
    async setupEnv() {
      process.env.NEW_ERA_DEEPSEEK_DISABLED = "1";
    },
  },
  {
    expectedCode: "http_error",
    expectedWarningIncludes: "DeepSeek 不可用",
    name: "model unavailable",
    async setupEnv() {
      const server = await startFakeDeepSeekServer((_request, response) => {
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: { message: "service unavailable" } }));
      });

      process.env.NEW_ERA_DEEPSEEK_API_KEY = "smoke-test-key";
      process.env.NEW_ERA_DEEPSEEK_BASE_URL = server.baseUrl;
      process.env.NEW_ERA_DEEPSEEK_MODEL = "deepseek-chat";

      return server.close;
    },
  },
  {
    expectedCode: "timeout",
    expectedWarningIncludes: "DeepSeek 不可用",
    name: "model timeout",
    async setupEnv() {
      const server = await startFakeDeepSeekServer((_request, response) => {
        setTimeout(() => {
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      actions: [],
                      answer: "slow model response",
                      citations: [
                        {
                          label: "Analytics",
                          type: "analytics",
                        },
                      ],
                      warnings: [],
                    }),
                  },
                },
              ],
              model: "deepseek-chat",
            }),
          );
        }, 2_000);
      });

      process.env.ASSISTANT_MODEL_TIMEOUT_MS = "500";
      process.env.NEW_ERA_DEEPSEEK_API_KEY = "smoke-test-key";
      process.env.NEW_ERA_DEEPSEEK_BASE_URL = server.baseUrl;
      process.env.NEW_ERA_DEEPSEEK_MODEL = "deepseek-chat";

      return server.close;
    },
  },
];

const originalEnv = snapshotEnv();

installSmokeSignalHandlers();

try {
  if (process.env.SMOKE_BASE_URL) {
    throw new Error(
      "smoke:assistant-fallback starts isolated Next servers so it can vary DeepSeek env. Unset SMOKE_BASE_URL.",
    );
  }

  for (const testCase of cases) {
    restoreEnv(originalEnv);
    process.env.NEW_ERA_DB_PATH = path.join(
      rootDir,
      "data",
      "smoke-assistant-fallback",
      `${testCase.name.replace(/\s+/g, "-")}.db`,
    );

    const cleanup = await testCase.setupEnv();

    try {
      const smokeDatabase = configureSmokeDatabaseEnv();
      const { baseUrl, mode } = await resolveBaseUrl();

      console.log(`New Era assistant fallback smoke against ${baseUrl} (${mode})`);
      console.log(
        `Smoke database: ${smokeDatabase.description}${
          smokeDatabase.path ? ` (${smokeDatabase.path})` : ""
        }`,
      );

      const { jar, ownerWasCreated } = await ensureSmokeOwnerAndLogin(baseUrl);

      console.log(
        `[ok] smoke authenticated as local owner (${ownerWasCreated ? "created" : "existing"})`,
      );

      await runAssistantFallbackCase(baseUrl, jar, testCase);
    } finally {
      await stopSpawnedServer();
      await cleanup?.();
    }
  }

  console.log(`[ok] Assistant fallback smoke passed (${cases.length}/${cases.length})`);
} catch (error) {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await stopSpawnedServer();
  restoreEnv(originalEnv);
}

async function runAssistantFallbackCase(baseUrl, jar, testCase) {
  const response = await requestJson(baseUrl, {
    body: {
      message: `请总结当前本地求职数据，并说明你的限制。${testCase.name}`,
    },
    jar,
    method: "POST",
    path: "/api/assistant",
  });

  assert(
    response.status === 200,
    `${testCase.name} expected HTTP 200, got ${response.status}.`,
  );
  expectOkEnvelope(response.body, testCase.name);
  expectString(response.body.answer, `${testCase.name}.answer`);
  expectArray(response.body.citations, `${testCase.name}.citations`);
  expectArray(response.body.actions, `${testCase.name}.actions`);
  expectArray(response.body.warnings, `${testCase.name}.warnings`);

  assert(
    response.body.provider === "local_fallback",
    `${testCase.name} should return provider local_fallback.`,
  );
  assert(
    response.body.fallbackUsed === true,
    `${testCase.name} should return fallbackUsed true.`,
  );
  assert(
    response.body.fallbackCode === testCase.expectedCode,
    `${testCase.name} should return fallbackCode ${testCase.expectedCode}, got ${String(response.body.fallbackCode)}.`,
  );
  assert(
    response.body.fallbackReason === "deepseek_unavailable",
    `${testCase.name} should return fallbackReason deepseek_unavailable.`,
  );
  assert(
    response.body.warnings.some((warning) => warning.includes(testCase.expectedWarningIncludes)),
    `${testCase.name} should include fallback warning.`,
  );

  console.log(`[ok] assistant fallback ${testCase.name}`);
}

function startFakeDeepSeekServer(handler) {
  const server = http.createServer(handler);

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Could not determine fake DeepSeek server address."));
        return;
      }

      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }

              closeResolve();
            });
          }),
      });
    });
  });
}

function snapshotEnv() {
  return { ...process.env };
}

function restoreEnv(snapshot) {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, snapshot);
}
