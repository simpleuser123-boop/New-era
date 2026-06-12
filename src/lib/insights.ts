import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { callDeepSeekJson } from "./deepseek-client";
import type { JsonObject, JsonValue } from "./types";
import {
  searchWeb,
  type WebSearchResponse,
  type WebSearchResult,
} from "./web-search";

const briefTextSchema = z.string().trim().min(1).max(2_000);

const marketBriefHighlightSchema = z
  .strictObject({
    id: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(240),
    detail: briefTextSchema,
    impact: briefTextSchema,
    estimateLabel: z.string().trim().min(1).max(240).optional(),
  })
  .passthrough();

export const marketBriefSchema = z
  .strictObject({
    id: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(240),
    period: z
      .strictObject({
        start: z.string().trim().min(1).max(40),
        end: z.string().trim().min(1).max(40),
        timezone: z.string().trim().min(1).max(80),
      })
      .passthrough(),
    generatedBy: z.string().trim().min(1).max(80),
    estimateLabel: z.string().trim().min(1).max(240).optional(),
    summary: briefTextSchema,
    highlights: z.array(marketBriefHighlightSchema).min(1).max(8),
    recommendedActions: z.array(briefTextSchema).min(1).max(8),
    disclaimer: briefTextSchema,
  })
  .passthrough();

const insightsDatasetSchema = z
  .strictObject({
    dataset: z.record(z.string(), z.unknown()),
    apiContract: z.record(z.string(), z.unknown()).optional(),
    overviewMetrics: z.array(z.unknown()),
    techTrends: z.array(z.unknown()),
    latestNews: z.array(z.unknown()).optional(),
    trendTags: z.array(z.unknown()),
    domainDistribution: z.array(z.unknown()),
    salaryBenchmarks: z.unknown(),
    recommendedCompanies: z.array(z.unknown()),
    weeklyBrief: marketBriefSchema,
    dataSources: z.unknown(),
    fallbackStates: z.unknown().optional(),
  })
  .passthrough();

type PresetInsights = JsonObject & {
  weeklyBrief: JsonObject;
};

type MarketBriefResult = {
  brief: JsonObject;
  provider: "deepseek" | "preset_demo_data";
  fallbackUsed: boolean;
  fallbackReason?: string;
  fallbackCode?: string;
  model?: string;
};

type IndustryInsightsResult = {
  insights: JsonObject;
  provider: "deepseek_web_search" | "preset_demo_data";
  fallbackUsed: boolean;
  fallbackReason?: string;
  fallbackCode?: string;
  model?: string;
  search?: JsonObject;
};

type LiveIndustryInsightsOptions = {
  signal?: AbortSignal;
};

type JsonRecord = Record<string, JsonValue>;

const LIVE_INDUSTRY_SEARCH_QUERY =
  "2026 人工智能 大模型 AI Agent RAG MCP AI 编程 招聘 岗位 技术趋势 最新 新闻";
const LIVE_INDUSTRY_SEARCH_LIMIT = 5;
const LIVE_INSIGHTS_SEARCH_TIMEOUT_MS = 15_000;
const LIVE_INSIGHTS_MODEL_TIMEOUT_MS = 55_000;
const LIVE_INSIGHTS_MODEL_MAX_TOKENS = 1_800;
const LIVE_INSIGHTS_PROMPT_RESULT_LIMIT = 3;
const LIVE_INSIGHTS_PROMPT_SNIPPET_MAX_LENGTH = 160;
const LIVE_INSIGHTS_CONTEXT_MAX_LENGTH = 5_500;

let cachedInsights: PresetInsights | undefined;

export function getPresetInsights(): PresetInsights {
  if (cachedInsights) {
    return cachedInsights;
  }

  const filePath = path.join(process.cwd(), "demo-data", "insights.json");
  const raw = readFileSync(filePath, "utf8");
  const parsedJson = JSON.parse(raw) as unknown;
  const parsedInsights = insightsDatasetSchema.parse(parsedJson);

  cachedInsights = parsedInsights as PresetInsights;

  return cachedInsights;
}

export function getPresetMarketBrief(): JsonObject {
  return getPresetInsights().weeklyBrief as JsonObject;
}

export async function getLiveIndustryInsights(
  options: LiveIndustryInsightsOptions = {},
): Promise<IndustryInsightsResult> {
  const fallbackInsights = getPresetInsights();
  const searchResult = await searchWeb(
    {
      limit: LIVE_INDUSTRY_SEARCH_LIMIT,
      query: LIVE_INDUSTRY_SEARCH_QUERY,
    },
    {
      signal: options.signal,
      timeoutMs: LIVE_INSIGHTS_SEARCH_TIMEOUT_MS,
    },
  );

  if (!searchResult.ok) {
    return presetInsightsResult(
      fallbackInsights,
      "web_search_unavailable",
      `web_search_${searchResult.error.code}`,
      {
        error: {
          code: searchResult.error.code,
          message: searchResult.error.message,
          ...(searchResult.error.status
            ? { status: searchResult.error.status }
            : {}),
        },
        query: LIVE_INDUSTRY_SEARCH_QUERY,
      },
    );
  }

  if (searchResult.data.results.length === 0) {
    return presetInsightsResult(
      fallbackInsights,
      "web_search_empty",
      "web_search_empty_results",
      buildSearchMeta(searchResult.data),
    );
  }

  const modelResult = await callDeepSeekJson<JsonObject>(
    buildLiveIndustryInsightsMessages(fallbackInsights, searchResult.data),
    "New Era live industry insights",
    {
      maxTokens: LIVE_INSIGHTS_MODEL_MAX_TOKENS,
      signal: options.signal,
      temperature: 0.35,
      timeoutMs: LIVE_INSIGHTS_MODEL_TIMEOUT_MS,
    },
  );

  if (!modelResult.ok) {
    return presetInsightsResultWithSearchNews(
      fallbackInsights,
      "deepseek_unavailable",
      modelResult.error.code,
      searchResult.data,
    );
  }

  const normalizedInsights = normalizeLiveIndustryInsights(
    modelResult.data,
    fallbackInsights,
    searchResult.data,
  );
  const parsedInsights = insightsDatasetSchema.safeParse(normalizedInsights);

  if (!parsedInsights.success) {
    return presetInsightsResultWithSearchNews(
      fallbackInsights,
      "deepseek_invalid_response",
      "invalid_live_insights_shape",
      searchResult.data,
    );
  }

  return {
    insights: parsedInsights.data as JsonObject,
    model: modelResult.model,
    provider: "deepseek_web_search",
    fallbackUsed: false,
    search: buildSearchMeta(searchResult.data),
  };
}

export async function getMarketBrief(options: {
  focus?: string;
  signal?: AbortSignal;
} = {}): Promise<MarketBriefResult> {
  const insights = getPresetInsights();
  const fallbackBrief = insights.weeklyBrief;
  const result = await callDeepSeekJson<JsonObject>(
    buildMarketBriefMessages(insights, options.focus),
    "New Era market weekly brief",
    {
      signal: options.signal,
      timeoutMs: 45_000,
      temperature: 0.6,
      maxTokens: 2_400,
    },
  );

  if (!result.ok) {
    return presetBriefResult(
      fallbackBrief,
      "deepseek_unavailable",
      result.error.code,
    );
  }

  const generatedBrief = marketBriefSchema.safeParse(
    normalizeMarketBrief(result.data),
  );

  if (!generatedBrief.success) {
    return presetBriefResult(
      fallbackBrief,
      "deepseek_invalid_response",
      "invalid_market_brief_shape",
    );
  }

  return {
    brief: {
      ...generatedBrief.data,
      generatedBy: "deepseek",
    } as JsonObject,
    provider: "deepseek",
    fallbackUsed: false,
    model: result.model,
  };
}

function presetInsightsResult(
  fallbackInsights: PresetInsights,
  reason: string,
  code: string,
  search?: JsonObject,
): IndustryInsightsResult {
  return {
    insights: fallbackInsights,
    provider: "preset_demo_data",
    fallbackUsed: true,
    fallbackReason: reason,
    fallbackCode: code,
    ...(search ? { search } : {}),
  };
}

function presetInsightsResultWithSearchNews(
  fallbackInsights: PresetInsights,
  reason: string,
  code: string,
  search: WebSearchResponse,
): IndustryInsightsResult {
  return presetInsightsResult(
    withSearchNewsFallback(fallbackInsights, search),
    reason,
    code,
    buildSearchMeta(search),
  );
}

function withSearchNewsFallback(
  fallbackInsights: PresetInsights,
  search: WebSearchResponse,
): PresetInsights {
  const fallbackRecord = fallbackInsights as JsonRecord;
  const fallbackDataSources = readObject(fallbackRecord.dataSources) ?? {};
  const fallbackItems = readArray(fallbackDataSources.items) ?? [];
  const fallbackLimitations = readStringArray(fallbackDataSources.limitations);
  const sourceItems = search.results.map((result) => ({
    name: result.sourceName
      ? `${result.sourceName}：${result.title}`
      : result.title,
    usage: "本次联网刷新新闻摘要",
  }));

  return {
    ...fallbackInsights,
    dataSources: {
      ...fallbackDataSources,
      displayText: `本次刷新于 ${search.fetchedAt}，当前展示已整理的行业趋势内容。`,
      items: [...sourceItems, ...fallbackItems].slice(0, 10),
      limitations: [
        "部分趋势暂不可用时，会保留当前可用内容。",
        "岗位数量、薪资、占比和热度均为趋势估算，不应作为统计口径。",
        ...fallbackLimitations,
      ].slice(0, 8),
      statementTitle: "行业趋势说明",
    },
    latestNews: search.results.map(toLatestNewsItem),
  } as PresetInsights;
}

function buildLiveIndustryInsightsMessages(
  fallbackInsights: PresetInsights,
  search: WebSearchResponse,
) {
  const context = buildLiveIndustryInsightsPromptContext(
    fallbackInsights,
    search,
  );

  return [
    {
      role: "system" as const,
      content:
        "你是 New Era 的 AI 招聘市场分析助手。你会基于本次联网搜索返回的公开网页标题、摘要、来源和时间，生成面向中国 AI 求职者的行业趋势快照。优先输出最重要的变化字段，不要重写静态模板，也不要声称接入实时招聘平台后台、账号数据或未提供的原文全文。",
    },
    {
      role: "user" as const,
      content: [
        "请仅输出一个 JSON 对象，不要输出 Markdown、注释、解释文字或外层 data/result 包装。",
        "输出必须以 { 开头，以 } 结尾；不要使用 ```json 代码块；不要输出尾随逗号。",
        "这是极简补丁 JSON，只输出 weeklyBrief/trendTags/dataSources。不要输出 dataset/overviewMetrics/techTrends/domainDistribution/salaryBenchmarks/recommendedCompanies，服务端会用本地模板补齐。",
        "trendTags 输出 6-8 项。",
        "weeklyBrief 必须包含 id/title/period/generatedBy/summary/highlights/recommendedActions/disclaimer；period 必须包含 start/end/timezone；highlights 为 3 项，每项必须包含 id/title/detail/impact。",
        "请用简洁中文：weeklyBrief.summary 不超过 100 字；每个 highlight.detail 和 impact 不超过 70 字；recommendedActions 每条不超过 45 字。",
        "所有岗位数量、薪资、占比、热度和增长率只能作为模型趋势估算或指数，不要写成精确实时统计；estimateLabel/disclaimer 必须说明这是行业趋势估算。",
        "dataSources.displayText 必须使用产品化说明，不要展示实现细节或内部占位说明。",
        `上下文：${truncateJson(context, LIVE_INSIGHTS_CONTEXT_MAX_LENGTH)}`,
      ].join("\n"),
    },
  ];
}

function buildLiveIndustryInsightsPromptContext(
  fallbackInsights: PresetInsights,
  search: WebSearchResponse,
): JsonObject {
  const fallbackRecord = fallbackInsights as JsonRecord;
  const weeklyBrief = readObject(fallbackRecord.weeklyBrief) ?? {};
  const weeklyBriefHighlights = readArray(weeklyBrief.highlights) ?? [];
  const weeklyBriefActions = readArray(weeklyBrief.recommendedActions) ?? [];
  const dataSources = readObject(fallbackRecord.dataSources) ?? {};
  const dataSourceItems = readArray(dataSources.items) ?? [];
  const dataSourceLimitations = readArray(dataSources.limitations) ?? [];

  return {
    currentDate: search.fetchedAt,
    search: {
      fetchedAt: search.fetchedAt,
      provider: search.provider,
      query: search.query,
      results: search.results
        .slice(0, LIVE_INSIGHTS_PROMPT_RESULT_LIMIT)
        .map((result, index) => ({
          rank: index + 1,
          title: result.title,
          sourceName: result.sourceName,
          publishedAt: result.publishedAt,
          snippet: truncateText(
            result.snippet,
            LIVE_INSIGHTS_PROMPT_SNIPPET_MAX_LENGTH,
          ),
          url: result.url,
        })),
      warnings: search.warnings,
    },
    outputGuide: {
      preferredFields: [
        "weeklyBrief",
        "trendTags",
        "dataSources",
      ],
      localFallbackFields: [
        "dataset",
        "overviewMetrics",
        "techTrends",
        "domainDistribution",
        "salaryBenchmarks",
        "recommendedCompanies",
      ],
      counts: {
        trendTags: "6-8",
        weeklyBriefHighlights: 3,
        recommendedActions: "3-5",
      },
      sampleShape: {
        trendTag: sampleArrayItem(fallbackRecord.trendTags) ?? null,
        weeklyBrief: {
          id: weeklyBrief.id ?? null,
          title: weeklyBrief.title ?? null,
          period: weeklyBrief.period ?? null,
          generatedBy: "deepseek_web_search",
          summary: weeklyBrief.summary ?? null,
          highlight: sampleArrayItem(weeklyBriefHighlights) ?? null,
          recommendedAction: firstStringFromArray(weeklyBriefActions) ?? null,
          disclaimer: weeklyBrief.disclaimer ?? null,
        },
        dataSources: {
          statementTitle: dataSources.statementTitle ?? null,
          displayText: dataSources.displayText ?? null,
          item: sampleArrayItem(dataSourceItems) ?? null,
          limitation: firstStringFromArray(dataSourceLimitations) ?? null,
        },
      },
    },
  };
}

function normalizeLiveIndustryInsights(
  data: JsonObject,
  fallbackInsights: PresetInsights,
  search: WebSearchResponse,
): JsonObject {
  const payload = unwrapInsightsPayload(data);
  const fallbackRecord = fallbackInsights as JsonRecord;
  const searchDate = search.fetchedAt.slice(0, 10);
  const latestNews = search.results.map(toLatestNewsItem);

  return {
    ...fallbackRecord,
    ...payload,
    dataset: normalizeLiveDataset(payload.dataset, fallbackRecord.dataset, search),
    overviewMetrics: readArrayOrFallback(
      payload.overviewMetrics,
      fallbackRecord.overviewMetrics,
    ),
    techTrends: readArrayOrFallback(payload.techTrends, fallbackRecord.techTrends),
    trendTags: readArrayOrFallback(payload.trendTags, fallbackRecord.trendTags),
    domainDistribution: readArrayOrFallback(
      payload.domainDistribution,
      fallbackRecord.domainDistribution,
    ),
    salaryBenchmarks: readObjectOrFallback(
      payload.salaryBenchmarks,
      fallbackRecord.salaryBenchmarks,
    ),
    recommendedCompanies: readArrayOrFallback(
      payload.recommendedCompanies,
      fallbackRecord.recommendedCompanies,
    ),
    weeklyBrief: normalizeLiveWeeklyBrief(
      payload.weeklyBrief,
      fallbackRecord.weeklyBrief,
      searchDate,
    ),
    dataSources: normalizeLiveDataSources(
      payload.dataSources,
      fallbackRecord.dataSources,
      search,
    ),
    latestNews,
    fallbackStates: {
      ...(readObject(fallbackRecord.fallbackStates) ?? {}),
      ...(readObject(payload.fallbackStates) ?? {}),
      loadingText: "正在联网搜索最新 AI 行业新闻并生成趋势快照...",
      briefGeneratingText: "AI 正在基于最新搜索摘要生成周报...",
    },
  } as JsonObject;
}

function unwrapInsightsPayload(data: JsonObject): JsonObject {
  for (const key of ["insights", "industryInsights", "result", "data"]) {
    const wrapped = readObject(data[key]);

    if (wrapped) {
      return wrapped;
    }
  }

  return data;
}

function normalizeLiveDataset(
  value: JsonValue | undefined,
  fallbackValue: JsonValue | undefined,
  search: WebSearchResponse,
): JsonObject {
  const dataset = readObject(value) ?? {};
  const fallbackDataset = readObject(fallbackValue) ?? {};
  const searchDate = search.fetchedAt.slice(0, 10);

  return {
    ...fallbackDataset,
    ...dataset,
    dataNature: "live_web_search_synthesis",
    id: normalizeText(dataset.id) ?? `industry-insights-live-${searchDate}`,
    isCompetitionDemoEstimate: false,
    name: normalizeText(dataset.name) ?? "行业洞察页联网刷新数据",
    numberPolicy:
      "所有岗位数、占比、薪资、热度、增长率和公司招聘数量均为趋势估算，不是实时招聘平台统计。",
    offlineReady: false,
    snapshotDate: searchDate,
    snapshotPeriod:
      normalizeText(dataset.snapshotPeriod) ?? `联网刷新 ${searchDate}`,
    timezone: normalizeText(dataset.timezone) ?? "Asia/Shanghai",
  };
}

function normalizeLiveWeeklyBrief(
  value: JsonValue | undefined,
  fallbackValue: JsonValue | undefined,
  searchDate: string,
): JsonObject {
  const brief = readObject(value) ?? {};
  const fallbackBrief = readObject(fallbackValue) ?? {};
  const fallbackPeriod = readObject(fallbackBrief.period) ?? {};
  const period = readObject(brief.period) ?? {};
  const highlights = readArray(brief.highlights);
  const recommendedActions = readArray(brief.recommendedActions);

  return {
    ...fallbackBrief,
    ...brief,
    disclaimer:
      normalizeText(brief.disclaimer) ??
      "本周报为行业趋势估算，不代表实时招聘平台统计。",
    generatedBy: "deepseek_web_search",
    highlights:
      highlights && highlights.length > 0
        ? highlights
        : readArray(fallbackBrief.highlights) ?? [],
    id: normalizeText(brief.id) ?? `live-brief-${searchDate}`,
    period: {
      ...fallbackPeriod,
      ...period,
      end: normalizeText(period.end) ?? searchDate,
      start: normalizeText(period.start) ?? searchDate,
      timezone: normalizeText(period.timezone) ?? "Asia/Shanghai",
    },
    recommendedActions:
      recommendedActions && recommendedActions.length > 0
        ? recommendedActions
        : readArray(fallbackBrief.recommendedActions) ?? [],
    summary:
      normalizeText(brief.summary) ??
      "基于本次联网搜索摘要生成的 AI 招聘市场趋势快照。",
    title: normalizeText(brief.title) ?? "AI 招聘市场联网周报",
  };
}

function normalizeLiveDataSources(
  value: JsonValue | undefined,
  fallbackValue: JsonValue | undefined,
  search: WebSearchResponse,
): JsonObject {
  const dataSources = readObject(value) ?? {};
  const fallbackDataSources = readObject(fallbackValue) ?? {};
  const sourceItems = search.results.map((result) => ({
    name: result.sourceName
      ? `${result.sourceName}：${result.title}`
      : result.title,
    usage: "本次联网刷新新闻摘要",
  }));
  const generatedItems = readArray(dataSources.items) ?? [];
  const fallbackLimitations = readStringArray(fallbackDataSources.limitations);
  const generatedLimitations = readStringArray(dataSources.limitations);

  return {
    ...fallbackDataSources,
    ...dataSources,
    displayText:
      normalizeText(dataSources.displayText) ??
      `本次刷新于 ${search.fetchedAt}，当前展示已整理的行业趋势内容。`,
    items: [...generatedItems, ...sourceItems].slice(0, 10),
    limitations: [
      "当前内容用于趋势观察，不代表招聘平台完整实时统计。",
      "模型输出中的岗位数量、薪资、占比和热度均为趋势估算，不应作为统计口径。",
      ...generatedLimitations,
      ...fallbackLimitations,
    ].slice(0, 8),
    statementTitle:
      normalizeText(dataSources.statementTitle) ?? "行业趋势说明",
  };
}

function toLatestNewsItem(result: WebSearchResult, index: number): JsonObject {
  return {
    id: `live-news-${index + 1}`,
    publishedAt: result.publishedAt,
    snippet: result.snippet,
    sourceName: result.sourceName,
    title: result.title,
    url: result.url,
  };
}

function buildSearchMeta(search: WebSearchResponse): JsonObject {
  return {
    fetchedAt: search.fetchedAt,
    provider: search.provider,
    query: search.query,
    resultCount: search.results.length,
    warnings: search.warnings,
  };
}

function readArrayOrFallback(
  value: JsonValue | undefined,
  fallbackValue: JsonValue | undefined,
): JsonValue[] {
  return readArray(value) ?? readArray(fallbackValue) ?? [];
}

function readObjectOrFallback(
  value: JsonValue | undefined,
  fallbackValue: JsonValue | undefined,
): JsonObject {
  return readObject(value) ?? readObject(fallbackValue) ?? {};
}

function readArray(value: JsonValue | undefined): JsonValue[] | null {
  return Array.isArray(value) ? value : null;
}

function readStringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function presetBriefResult(
  fallbackBrief: JsonObject,
  reason: string,
  code: string,
): MarketBriefResult {
  return {
    brief: fallbackBrief as JsonObject,
    provider: "preset_demo_data",
    fallbackUsed: true,
    fallbackReason: reason,
    fallbackCode: code,
  };
}

function buildMarketBriefMessages(
  insights: PresetInsights,
  focus: string | undefined,
) {
  const context = {
    dataset: insights.dataset,
    overviewMetrics: insights.overviewMetrics,
    techTrends: insights.techTrends,
    domainDistribution: insights.domainDistribution,
    salaryBenchmarks: insights.salaryBenchmarks,
    recommendedCompanies: insights.recommendedCompanies,
    dataSources: insights.dataSources,
    requestedFocus: focus ?? null,
  };

  return [
    {
      role: "system" as const,
      content:
        "你是 New Era 的 AI 招聘市场分析助手。基于提供的行业趋势内容生成中文市场周报，不要声称接入实时招聘数据。",
    },
    {
      role: "user" as const,
      content: [
        "请仅输出一个 JSON 对象，不要输出 Markdown、注释、解释文字或外层 data/result 包装。",
        "字段必须为 id/title/period/generatedBy/summary/highlights/recommendedActions/disclaimer。",
        "period 必须包含 start/end/timezone。",
        "highlights 为 3-5 项，每项必须包含 id/title/detail/impact。",
        "recommendedActions 为 3-5 条字符串数组，面向求职者给出可执行建议。",
        "generatedBy 使用 deepseek；disclaimer 必须说明这是行业趋势估算，不是实时统计。",
        `上下文：${truncateJson(context, 12_000)}`,
      ].join("\n"),
    },
  ];
}

function normalizeMarketBrief(data: JsonObject): JsonObject {
  const payload = unwrapMarketBriefPayload(data);
  const period = normalizePeriod(readObject(payload.period), payload);
  const highlights = normalizeHighlights(payload.highlights);
  const recommendedActions = normalizeStringArray(
    payload.recommendedActions ??
      payload.actions ??
      payload.suggestions ??
      payload.recommendations,
  );

  return {
    ...payload,
    id: normalizeText(payload.id) ?? buildBriefId(period),
    title: normalizeText(payload.title) ?? "AI 招聘市场周报",
    period,
    generatedBy: "deepseek",
    summary:
      normalizeText(payload.summary) ??
      normalizeText(payload.overview) ??
      normalizeText(payload.description) ??
      "基于行业趋势内容生成的 AI 招聘市场简报。",
    highlights:
      highlights.length > 0
        ? highlights
        : [
            {
              id: "market-summary",
              title: "市场信号概览",
              detail: "行业趋势显示，AI 应用落地、RAG 与 Agent 能力仍是岗位关注重点。",
              impact: "求职者应优先准备可演示的项目证据和指标说明。",
            },
          ],
    recommendedActions:
      recommendedActions.length > 0
        ? recommendedActions
        : ["准备一个可演示的 AI 应用项目，说明目标、流程、指标和边界。"],
    disclaimer:
      normalizeText(payload.disclaimer) ??
      "此内容为行业趋势估算，不是实时招聘平台统计。",
  };
}

function unwrapMarketBriefPayload(data: JsonObject): JsonObject {
  for (const key of ["brief", "weeklyBrief", "marketBrief", "result", "data"]) {
    const wrapped = readObject(data[key]);

    if (wrapped) {
      return wrapped;
    }
  }

  return data;
}

function normalizePeriod(
  period: JsonObject | null,
  payload: JsonObject,
): { start: string; end: string; timezone: string } {
  const start =
    normalizeText(period?.start) ??
    normalizeText(payload.startDate) ??
    normalizeText(payload.start) ??
    "2026-05-22";
  const end =
    normalizeText(period?.end) ??
    normalizeText(payload.endDate) ??
    normalizeText(payload.end) ??
    "2026-05-28";

  return {
    start,
    end,
    timezone: normalizeText(period?.timezone) ?? "Asia/Shanghai",
  };
}

function normalizeHighlights(value: JsonValue | undefined): JsonObject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const highlights: JsonObject[] = [];

  for (const [index, item] of value.entries()) {
    const object = readObject(item);

    if (!object) {
      const text = normalizeText(item);

      if (text) {
        highlights.push({
          id: `highlight-${index + 1}`,
          title: text.slice(0, 40),
          detail: text,
          impact: "建议结合自身经历补充可验证的项目证据。",
        });
      }

      continue;
    }

    const detail =
      normalizeText(object.detail) ??
      normalizeText(object.description) ??
      normalizeText(object.summary) ??
      normalizeText(object.content);
    const estimateLabel = normalizeText(object.estimateLabel);

    highlights.push({
      id: normalizeText(object.id) ?? `highlight-${index + 1}`,
      title: normalizeText(object.title) ?? `市场信号 ${index + 1}`,
      detail: detail ?? "该信号来自行业趋势综合估算。",
      impact:
        normalizeText(object.impact) ??
        normalizeText(object.implication) ??
        normalizeText(object.advice) ??
        "建议求职者补充相关项目证据和量化指标。",
      ...(estimateLabel ? { estimateLabel } : {}),
    });
  }

  return highlights.slice(0, 5);
}

function normalizeStringArray(value: JsonValue | undefined): string[] {
  if (typeof value === "string") {
    return [value.trim()].filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      const object = readObject(item);

      return object
        ? normalizeText(object.text) ??
            normalizeText(object.content) ??
            normalizeText(object.action) ??
            normalizeText(object.suggestion) ??
            normalizeText(object.title)
        : undefined;
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, 5);
}

function normalizeText(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readObject(value: JsonValue | undefined): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}

function buildBriefId(period: { start: string; end: string }): string {
  return `deepseek-brief-${period.start}-${period.end}`
    .toLocaleLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function sampleArrayItem(value: JsonValue | undefined): JsonValue | undefined {
  return Array.isArray(value) && value.length > 0 ? value[0] : undefined;
}

function firstStringFromArray(value: JsonValue[]): string | undefined {
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }
  }

  return undefined;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function truncateJson(value: JsonValue, maxLength: number): string {
  const serialized = JSON.stringify(value);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}
