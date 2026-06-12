import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "node:process";

import type { JsonObject, JsonValue } from "./types";

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  sourceName: string | null;
  publishedAt: string | null;
};

export type WebSearchResponse = {
  provider: "brave" | "mock" | "tavily";
  query: string;
  fetchedAt: string;
  results: WebSearchResult[];
  warnings: string[];
};

export type WebSearchErrorCode =
  | "missing_api_key"
  | "invalid_config"
  | "invalid_mock"
  | "timeout"
  | "aborted"
  | "network_error"
  | "http_error"
  | "invalid_response";

export type WebSearchError = {
  code: WebSearchErrorCode;
  message: string;
  status?: number;
  details?: JsonValue;
};

export type WebSearchSuccess = {
  ok: true;
  data: WebSearchResponse;
};

export type WebSearchFailure = {
  ok: false;
  error: WebSearchError;
};

export type WebSearchResultEnvelope = WebSearchSuccess | WebSearchFailure;

export type WebSearchInput = {
  query: string;
  limit?: number;
};

export type WebSearchOptions = {
  fetcher?: typeof fetch;
  now?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

type WebSearchConfig = {
  apiKey: string;
  endpoint: string;
  provider: "brave" | "tavily";
  timeoutMs: number;
};

const DEFAULT_BRAVE_SEARCH_ENDPOINT =
  "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_TAVILY_SEARCH_ENDPOINT = "https://api.tavily.com/search";
const DEFAULT_WEB_SEARCH_TIMEOUT_MS = 12_000;
const MAX_SEARCH_RESULTS = 8;
const MAX_QUERY_LENGTH = 400;
const MAX_SNIPPET_LENGTH = 500;
const MAX_TITLE_LENGTH = 180;
const MAX_URL_LENGTH = 2_000;
const MAX_ERROR_BODY_LENGTH = 1_200;
const PROJECT_ENV_FILE_NAMES = [
  ".env.development.local",
  ".env.production.local",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env",
];

let projectEnvCache: Record<string, string> | undefined;

export async function searchWeb(
  input: WebSearchInput,
  options: WebSearchOptions = {},
): Promise<WebSearchResultEnvelope> {
  const query = normalizeQuery(input.query);
  const limit = clampLimit(input.limit);
  const fetchedAt = options.now ?? new Date().toISOString();
  const mockResult = readMockSearch(query, limit, fetchedAt);

  if (mockResult) {
    return mockResult;
  }

  const configResult = readWebSearchConfig(options.timeoutMs);

  if (!configResult.ok) {
    return configResult;
  }

  const timeout = createTimeoutSignal(
    configResult.config.timeoutMs,
    options.signal,
  );

  try {
    const request = buildSearchRequest(configResult.config, query, limit);

    if (!request.ok) {
      return request;
    }

    const response = await (options.fetcher ?? fetch)(request.url, {
      body: request.body,
      headers: request.headers,
      method: request.method,
      signal: timeout.signal,
    });
    const bodyText = await response.text();

    if (!response.ok) {
      return failure("http_error", "联网搜索服务返回错误。", {
        status: response.status,
        details: {
          body: truncateText(bodyText, MAX_ERROR_BODY_LENGTH),
        },
      });
    }

    return configResult.config.provider === "tavily"
      ? parseTavilySearchResponse(bodyText, query, fetchedAt, limit)
      : parseBraveSearchResponse(bodyText, query, fetchedAt, limit);
  } catch (error) {
    if (options.signal?.aborted) {
      return failure("aborted", "联网搜索请求已取消。");
    }

    if (timeout.signal.aborted) {
      return failure("timeout", "联网搜索超时，请稍后重试。");
    }

    return failure("network_error", "联网搜索请求失败，请检查网络或搜索服务配置。", {
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    timeout.cleanup();
  }
}

function readWebSearchConfig(
  timeoutMs?: number,
): { ok: true; config: WebSearchConfig } | WebSearchFailure {
  const requestedProvider = readConfigValue(["WEB_SEARCH_PROVIDER"], {
    preferProjectEnv: true,
  }).toLowerCase();
  const configuredTimeoutMs =
    timeoutMs ?? readPositiveIntegerConfig("WEB_SEARCH_TIMEOUT_MS") ??
    DEFAULT_WEB_SEARCH_TIMEOUT_MS;

  if (requestedProvider && !["brave", "tavily"].includes(requestedProvider)) {
    return failure(
      "invalid_config",
      "WEB_SEARCH_PROVIDER must be either tavily or brave.",
    );
  }

  if (requestedProvider === "tavily") {
    return readTavilySearchConfig(configuredTimeoutMs);
  }

  if (requestedProvider === "brave") {
    return readBraveSearchConfig(configuredTimeoutMs);
  }

  const tavilyConfig = readTavilySearchConfig(configuredTimeoutMs, {
    allowMissingApiKey: true,
  });

  if (tavilyConfig.ok) {
    return tavilyConfig;
  }

  const braveConfig = readBraveSearchConfig(configuredTimeoutMs, {
    allowMissingApiKey: true,
  });

  if (braveConfig.ok) {
    return braveConfig;
  }

  return failure(
    "missing_api_key",
    "TAVILY_API_KEY or BRAVE_SEARCH_API_KEY is not configured on the server.",
  );
}

function readTavilySearchConfig(
  timeoutMs: number,
  options: { allowMissingApiKey?: boolean } = {},
): { ok: true; config: WebSearchConfig } | WebSearchFailure {
  const apiKey = readConfigValue(["TAVILY_API_KEY"]);
  const endpoint =
    readConfigValue(["TAVILY_SEARCH_ENDPOINT", "WEB_SEARCH_ENDPOINT"], {
      preferProjectEnv: true,
    }) || DEFAULT_TAVILY_SEARCH_ENDPOINT;

  if (!apiKey) {
    return options.allowMissingApiKey
      ? failure("missing_api_key", "TAVILY_API_KEY is not configured on the server.")
      : failure(
          "missing_api_key",
          "TAVILY_API_KEY is not configured on the server.",
        );
  }

  const endpointResult = validateSearchEndpoint(
    endpoint,
    "TAVILY_SEARCH_ENDPOINT",
  );

  if (!endpointResult.ok) {
    return endpointResult;
  }

  return {
    ok: true,
    config: {
      apiKey,
      endpoint,
      provider: "tavily",
      timeoutMs,
    },
  };
}

function readBraveSearchConfig(
  timeoutMs: number,
  options: { allowMissingApiKey?: boolean } = {},
): { ok: true; config: WebSearchConfig } | WebSearchFailure {
  const apiKey = readConfigValue(["BRAVE_SEARCH_API_KEY", "BRAVE_API_KEY"]);
  const endpoint =
    readConfigValue(["BRAVE_SEARCH_ENDPOINT", "WEB_SEARCH_ENDPOINT"], {
      preferProjectEnv: true,
    }) || DEFAULT_BRAVE_SEARCH_ENDPOINT;

  if (!apiKey) {
    return options.allowMissingApiKey
      ? failure(
          "missing_api_key",
          "BRAVE_SEARCH_API_KEY is not configured on the server.",
        )
      : failure(
          "missing_api_key",
          "BRAVE_SEARCH_API_KEY is not configured on the server.",
        );
  }

  const endpointResult = validateSearchEndpoint(
    endpoint,
    "BRAVE_SEARCH_ENDPOINT",
  );

  if (!endpointResult.ok) {
    return endpointResult;
  }

  return {
    ok: true,
    config: {
      apiKey,
      endpoint,
      provider: "brave",
      timeoutMs,
    },
  };
}

function readMockSearch(
  query: string,
  limit: number,
  fetchedAt: string,
): WebSearchResultEnvelope | null {
  const mockJson = readConfigValue(["NEW_ERA_WEB_SEARCH_MOCK_JSON"], {
    preferProjectEnv: true,
  });

  if (!mockJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(mockJson);
    const sourceResults = Array.isArray(parsed)
      ? parsed
      : isJsonObject(parsed) && Array.isArray(parsed.results)
        ? parsed.results
        : null;

    if (!sourceResults) {
      return failure(
        "invalid_mock",
        "NEW_ERA_WEB_SEARCH_MOCK_JSON must be a JSON array or an object with results.",
      );
    }

    return {
      ok: true,
      data: {
        fetchedAt,
        provider: "mock",
        query,
        results: sourceResults
          .map((item) => normalizeResult(item))
          .filter(isDefined)
          .slice(0, limit),
        warnings: ["当前使用备用搜索结果。"],
      },
    };
  } catch {
    return failure(
      "invalid_mock",
      "NEW_ERA_WEB_SEARCH_MOCK_JSON must be valid JSON.",
    );
  }
}

function buildBraveSearchUrl(
  endpoint: string,
  query: string,
  limit: number,
): { ok: true; url: string } | WebSearchFailure {
  try {
    const url = new URL(endpoint);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(limit));
    url.searchParams.set("safesearch", "moderate");
    url.searchParams.set("text_decorations", "false");
    url.searchParams.set("result_filter", "web");

    return {
      ok: true,
      url: url.toString(),
    };
  } catch {
    return failure(
      "invalid_config",
      "BRAVE_SEARCH_ENDPOINT must be a valid URL.",
    );
  }
}

function buildSearchRequest(
  config: WebSearchConfig,
  query: string,
  limit: number,
):
  | {
      ok: true;
      body?: string;
      headers: Record<string, string>;
      method: "GET" | "POST";
      url: string;
    }
  | WebSearchFailure {
  if (config.provider === "tavily") {
    return {
      ok: true,
      body: JSON.stringify({
        include_answer: false,
        include_images: false,
        include_raw_content: false,
        max_results: limit,
        query,
        search_depth: "basic",
        topic: "news",
      }),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "NewEraWebSearch/1.0",
      },
      method: "POST",
      url: config.endpoint,
    };
  }

  const requestUrl = buildBraveSearchUrl(config.endpoint, query, limit);

  if (!requestUrl.ok) {
    return requestUrl;
  }

  return {
    ok: true,
    headers: {
      Accept: "application/json",
      "User-Agent": "NewEraWebSearch/1.0",
      "X-Subscription-Token": config.apiKey,
    },
    method: "GET",
    url: requestUrl.url,
  };
}

function parseBraveSearchResponse(
  bodyText: string,
  query: string,
  fetchedAt: string,
  limit: number,
): WebSearchResultEnvelope {
  let parsed: unknown;

  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return failure(
      "invalid_response",
      "联网搜索服务返回了无法解析的 JSON。",
      {
        details: {
          body: truncateText(bodyText, MAX_ERROR_BODY_LENGTH),
        },
      },
    );
  }

  if (!isJsonObject(parsed)) {
    return failure("invalid_response", "联网搜索响应必须是 JSON object。");
  }

  const web = isJsonObject(parsed.web) ? parsed.web : undefined;
  const rawResults = Array.isArray(web?.results) ? web.results : [];
  const results = rawResults
    .map((item) => normalizeResult(item))
    .filter(isDefined)
    .slice(0, limit);

  return {
    ok: true,
    data: {
      fetchedAt,
      provider: "brave",
      query,
      results,
      warnings:
        results.length > 0
          ? []
          : ["联网搜索没有返回可用网页结果。"],
    },
  };
}

function parseTavilySearchResponse(
  bodyText: string,
  query: string,
  fetchedAt: string,
  limit: number,
): WebSearchResultEnvelope {
  let parsed: unknown;

  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return failure(
      "invalid_response",
      "联网搜索服务返回了无法解析的 JSON。",
      {
        details: {
          body: truncateText(bodyText, MAX_ERROR_BODY_LENGTH),
        },
      },
    );
  }

  if (!isJsonObject(parsed)) {
    return failure("invalid_response", "联网搜索响应必须是 JSON object。");
  }

  const rawResults = Array.isArray(parsed.results) ? parsed.results : [];
  const results = rawResults
    .map((item) => normalizeTavilyResult(item))
    .filter(isDefined)
    .slice(0, limit);

  return {
    ok: true,
    data: {
      fetchedAt,
      provider: "tavily",
      query,
      results,
      warnings:
        results.length > 0
          ? []
          : ["联网搜索没有返回可用网页结果。"],
    },
  };
}

function normalizeResult(value: unknown): WebSearchResult | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const title = truncateText(readString(value.title), MAX_TITLE_LENGTH);
  const url = truncateText(readString(value.url), MAX_URL_LENGTH);
  const snippet = truncateText(
    readString(value.description) || readString(value.snippet),
    MAX_SNIPPET_LENGTH,
  );

  if (!title || !isHttpUrl(url)) {
    return null;
  }

  const profile = isJsonObject(value.profile) ? value.profile : undefined;
  const sourceName =
    readString(value.sourceName) ||
    readString(value.source) ||
    readString(profile?.name) ||
    hostnameFromUrl(url);

  return {
    publishedAt: readString(value.age) || readString(value.publishedAt) || null,
    snippet,
    sourceName: sourceName || null,
    title,
    url,
  };
}

function normalizeTavilyResult(value: unknown): WebSearchResult | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const title = truncateText(readString(value.title), MAX_TITLE_LENGTH);
  const url = truncateText(readString(value.url), MAX_URL_LENGTH);
  const snippet = truncateText(
    readString(value.content) || readString(value.snippet),
    MAX_SNIPPET_LENGTH,
  );
  const sourceName =
    readString(value.sourceName) ||
    readString(value.source) ||
    hostnameFromUrl(url);

  if (!title || !isHttpUrl(url)) {
    return null;
  }

  return {
    publishedAt:
      readString(value.published_date) ||
      readString(value.publishedAt) ||
      null,
    snippet,
    sourceName: sourceName || null,
    title,
    url,
  };
}

function createTimeoutSignal(timeoutMs: number, parentSignal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (parentSignal?.aborted) {
    controller.abort();
  }

  const abort = () => controller.abort();
  parentSignal?.addEventListener("abort", abort, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abort);
    },
  };
}

function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return 5;
  }

  return Math.min(Math.max(Math.trunc(limit ?? 5), 1), MAX_SEARCH_RESULTS);
}

function readPositiveIntegerConfig(name: string): number | undefined {
  const value = Number(readConfigValue([name]));

  if (Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  return undefined;
}

function readConfigValue(
  names: string[],
  options: { preferProjectEnv?: boolean } = {},
): string {
  if (options.preferProjectEnv) {
    return (
      readConfigValueFrom(names, readProjectEnvValue) ||
      readConfigValueFrom(names, readProcessEnvValue)
    );
  }

  return (
    readConfigValueFrom(names, readProcessEnvValue) ||
    readConfigValueFrom(names, readProjectEnvValue)
  );
}

function readConfigValueFrom(
  names: string[],
  reader: (name: string) => string,
): string {
  for (const name of names) {
    const value = reader(name);

    if (value) {
      return value;
    }
  }

  return "";
}

function readProcessEnvValue(name: string): string {
  return trimConfigValue(env[name]);
}

function readProjectEnvValue(name: string): string {
  return trimConfigValue(readProjectEnv()[name]);
}

function readProjectEnv(): Record<string, string> {
  if (projectEnvCache) {
    return projectEnvCache;
  }

  const values: Record<string, string> = {};

  for (const fileName of getProjectEnvFileNames()) {
    const filePath = join(/*turbopackIgnore: true*/ process.cwd(), fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    for (const [key, value] of Object.entries(parseEnvFile(filePath))) {
      if (values[key] === undefined) {
        values[key] = value;
      }
    }
  }

  projectEnvCache = values;

  return values;
}

function getProjectEnvFileNames(): string[] {
  const nodeEnv = env.NODE_ENV;
  const names = PROJECT_ENV_FILE_NAMES.filter((name) => {
    if (name.includes(".development") && nodeEnv && nodeEnv !== "development") {
      return false;
    }

    if (name.includes(".production") && nodeEnv && nodeEnv !== "production") {
      return false;
    }

    return true;
  });

  return [...new Set(names)];
}

function parseEnvFile(filePath: string): Record<string, string> {
  const values: Record<string, string> = {};

  try {
    const content = readFileSync(filePath, "utf8");

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        continue;
      }

      const equalsIndex = line.indexOf("=");

      if (equalsIndex <= 0) {
        continue;
      }

      const key = line.slice(0, equalsIndex).trim();
      const value = line.slice(equalsIndex + 1).trim();

      if (!key) {
        continue;
      }

      values[key] = trimConfigValue(value);
    }
  } catch {
    return values;
  }

  return values;
}

function validateSearchEndpoint(
  endpoint: string,
  variableName: "BRAVE_SEARCH_ENDPOINT" | "TAVILY_SEARCH_ENDPOINT",
): { ok: true } | WebSearchFailure {
  try {
    const url = new URL(endpoint);

    if (!["http:", "https:"].includes(url.protocol)) {
      return failure(
        "invalid_config",
        `${variableName} must be an http or https URL.`,
      );
    }
  } catch {
    return failure(
      "invalid_config",
      `${variableName} must be a valid URL.`,
    );
  }

  return {
    ok: true,
  };
}

function trimConfigValue(value: string | undefined): string {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isDefined<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function failure(
  code: WebSearchErrorCode,
  message: string,
  extra: Partial<Omit<WebSearchError, "code" | "message">> = {},
): WebSearchFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      ...extra,
    },
  };
}
