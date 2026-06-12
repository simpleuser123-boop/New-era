#!/usr/bin/env node

const mockSearchResults = [
  {
    title: "AI agents move from pilots to production workflows",
    url: "https://example.com/ai-agent-production",
    description:
      "Enterprise teams are hiring for agent orchestration, tool calling, evaluation, and reliability as AI agents move beyond demos.",
    sourceName: "Example AI News",
    publishedAt: "2026-06-05",
  },
  {
    title: "RAG and model evaluation remain core AI hiring signals",
    url: "https://example.com/rag-evaluation-hiring",
    description:
      "Recent AI job posts emphasize retrieval quality, eval pipelines, observability, and governance around LLM applications.",
    sourceName: "Example Hiring Brief",
    publishedAt: "2026-06-04",
  },
  {
    title: "MCP and AI coding tools reshape application engineering roles",
    url: "https://example.com/mcp-ai-coding-roles",
    description:
      "AI application teams increasingly expect MCP integration, workflow automation, and AI coding tool fluency.",
    sourceName: "Example Developer Trends",
    publishedAt: "2026-06-03",
  },
];

process.env.SMOKE_REQUEST_TIMEOUT_MS ??= "90000";
process.env.NEW_ERA_WEB_SEARCH_MOCK_JSON ??= JSON.stringify({
  results: mockSearchResults,
});

if (process.env.SMOKE_INSIGHTS_ALLOW_REAL_DEEPSEEK !== "1") {
  process.env.DEEPSEEK_API_KEY = "new-era-smoke-disabled";
}

const {
  assert,
  configureSmokeDatabaseEnv,
  ensureSmokeOwnerAndLogin,
  expectArray,
  expectObject,
  expectOkEnvelope,
  installSmokeSignalHandlers,
  requestJson,
  resolveBaseUrl,
  runCheck,
  stopSpawnedServer,
} = await import("./smoke-support.mjs");

installSmokeSignalHandlers();

const dbConfig = configureSmokeDatabaseEnv();

try {
  const { baseUrl, mode } = await resolveBaseUrl();
  const { jar } = await ensureSmokeOwnerAndLogin(baseUrl);

  console.log(`[info] insights refresh smoke using ${mode}`);
  console.log(`[info] database: ${dbConfig.description}`);

  await runCheck(baseUrl, {
    expectedStatus: 200,
    jar,
    name: "insights trends preset load",
    path: "/api/insights/trends",
    expect: ({ body }) => {
      expectOkEnvelope(body, "insights trends preset");
      assert(
        body.provider === "preset_demo_data",
        "preset load should use preset_demo_data provider.",
      );
      expectArray(body.techTrends, "insights trends preset.techTrends");
      expectObject(body.weeklyBrief, "insights trends preset.weeklyBrief");
    },
  });

  const refresh = await requestJson(baseUrl, {
    jar,
    path: "/api/insights/trends?refresh=1",
  });

  assert(
    refresh.status === 200,
    `insights trends refresh expected HTTP 200, got ${refresh.status}.`,
  );
  expectOkEnvelope(refresh.body, "insights trends refresh");
  expectObject(refresh.body.search, "insights trends refresh.search");
  assert(
    refresh.body.search.resultCount === mockSearchResults.length,
    `refresh search should read ${mockSearchResults.length} mock results.`,
  );
  expectArray(refresh.body.latestNews, "insights trends refresh.latestNews");
  assert(
    refresh.body.latestNews.length === mockSearchResults.length,
    "refresh should expose the latest news items returned by web search.",
  );

  if (refresh.body.provider === "deepseek_web_search") {
    assert(
      refresh.body.fallbackUsed === false,
      "live refresh should not be marked fallback when DeepSeek succeeds.",
    );
  } else {
    assert(
      refresh.body.provider === "preset_demo_data",
      "refresh fallback provider should be preset_demo_data.",
    );
    assert(
      refresh.body.fallbackUsed === true,
      "refresh fallback should be marked fallbackUsed.",
    );
    assert(
      typeof refresh.body.fallbackCode === "string" &&
        refresh.body.fallbackCode.length > 0,
      "refresh fallback should expose a fallbackCode.",
    );
  }

  console.log("[ok] insights refresh smoke passed");
} finally {
  await stopSpawnedServer();
}
