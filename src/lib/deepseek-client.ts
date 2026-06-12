import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "node:process";

import type { JsonObject, JsonValue } from "./types";

export type DeepSeekMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type DeepSeekErrorCode =
  | "missing_api_key"
  | "missing_base_url"
  | "missing_model"
  | "invalid_config"
  | "invalid_messages"
  | "timeout"
  | "aborted"
  | "network_error"
  | "http_error"
  | "invalid_response"
  | "json_parse_error";

export type DeepSeekClientError = {
  code: DeepSeekErrorCode;
  message: string;
  status?: number;
  details?: JsonValue;
};

export type DeepSeekUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  raw?: JsonObject;
};

export type DeepSeekSuccess<TData> = {
  ok: true;
  data: TData;
  content: string;
  model: string;
  usage?: DeepSeekUsage;
};

export type DeepSeekFailure = {
  ok: false;
  error: DeepSeekClientError;
};

export type DeepSeekResult<TData> = DeepSeekSuccess<TData> | DeepSeekFailure;

export type DeepSeekContentDeltaHandler = (
  content: string,
) => void | Promise<void>;

export type DeepSeekCallOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  temperature?: number;
  maxTokens?: number;
  onContentDelta?: DeepSeekContentDeltaHandler;
  thinking?: "disabled" | "enabled";
};

export type DeepSeekAgentStepData = JsonObject;

type DeepSeekConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

type DeepSeekChatRequest = {
  model: string;
  messages: DeepSeekMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: {
    type: "json_object";
  };
  stream?: boolean;
  thinking?: {
    type: "disabled" | "enabled";
  };
};

type DeepSeekCompletionOptions = DeepSeekCallOptions & {
  responseFormat?: "json_object";
};

type JsonParseResult<TJson extends JsonValue> =
  | { ok: true; data: TJson }
  | DeepSeekFailure;

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ERROR_BODY_LENGTH = 2_000;
const PROJECT_ENV_FILE_NAMES = [
  ".env.development.local",
  ".env.production.local",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env",
];
const VALID_ROLES = new Set<DeepSeekMessage["role"]>([
  "system",
  "user",
  "assistant",
]);

let projectEnvCache: Record<string, string> | undefined;

export async function callDeepSeekJson<TJson extends JsonValue = JsonObject>(
  messages: DeepSeekMessage[],
  schemaName?: string,
  options: DeepSeekCallOptions = {},
): Promise<DeepSeekResult<TJson>> {
  const messageValidation = validateMessages(messages);

  if (!messageValidation.ok) {
    return messageValidation;
  }

  const rawResult = await callDeepSeekCompletion(
    buildJsonMessages(messages, schemaName),
    {
      ...options,
      responseFormat: "json_object",
    },
  );

  if (!rawResult.ok) {
    return rawResult;
  }

  const parsed = parseJsonContent(rawResult.content, schemaName);

  if (!parsed.ok) {
    return parsed;
  }

  return {
    ...rawResult,
    data: parsed.data as TJson,
  };
}

export async function callDeepSeekText(
  messages: DeepSeekMessage[],
  options: DeepSeekCallOptions = {},
): Promise<DeepSeekResult<string>> {
  return callDeepSeekCompletion(messages, options);
}

export async function callDeepSeekAgentStep(
  messages: DeepSeekMessage[],
  options: DeepSeekCallOptions = {},
): Promise<DeepSeekResult<DeepSeekAgentStepData>> {
  return callDeepSeekJson<DeepSeekAgentStepData>(
    messages,
    "AgentLoopStep",
    options,
  );
}

async function callDeepSeekCompletion(
  messages: DeepSeekMessage[],
  options: DeepSeekCompletionOptions,
): Promise<DeepSeekResult<string>> {
  const messageValidation = validateMessages(messages);

  if (!messageValidation.ok) {
    return messageValidation;
  }

  const configResult = readDeepSeekConfig();

  if (!configResult.ok) {
    return configResult;
  }

  const endpointResult = buildChatCompletionsUrl(configResult.config.baseUrl);

  if (!endpointResult.ok) {
    return endpointResult;
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return failure(
      "invalid_config",
      "DeepSeek request timeout must be a positive number of milliseconds.",
    );
  }

  const fetcher = options.fetcher ?? fetch;
  const abort = createAbortSignal(timeoutMs, options.signal);

  try {
    const response = await fetcher(endpointResult.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configResult.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        buildRequestBody(messages, configResult.config, options),
      ),
      signal: abort.signal,
    });

    if (!response.ok) {
      const responseText = await response.text();

      return failure(
        "http_error",
        `DeepSeek request failed with HTTP ${response.status}.`,
        {
          status: response.status,
          details: {
            body: truncate(responseText, MAX_ERROR_BODY_LENGTH),
          },
        },
      );
    }

    if (options.onContentDelta) {
      return readChatCompletionStream(
        response,
        configResult.config.model,
        options.onContentDelta,
      );
    }

    const responseText = await response.text();

    return parseChatCompletionResponse(
      responseText,
      configResult.config.model,
    );
  } catch (error) {
    if (abort.didTimeout()) {
      return failure(
        "timeout",
        `DeepSeek request timed out after ${timeoutMs}ms.`,
      );
    }

    if (options.signal?.aborted || isAbortError(error)) {
      return failure("aborted", "DeepSeek request was aborted.");
    }

    return failure("network_error", "DeepSeek request failed before a response.", {
      details: {
        cause: getErrorMessage(error),
      },
    });
  } finally {
    abort.cleanup();
  }
}

function readDeepSeekConfig(
):
  | { ok: true; config: DeepSeekConfig }
  | DeepSeekFailure {
  if (readProcessEnvValue("NEW_ERA_DEEPSEEK_DISABLED") === "1") {
    return failure(
      "missing_api_key",
      "DeepSeek is disabled by NEW_ERA_DEEPSEEK_DISABLED.",
    );
  }

  const apiKey =
    readProcessEnvValue("NEW_ERA_DEEPSEEK_API_KEY") ||
    readConfigValue(
      [
        "NEW_ERA_DEEPSEEK_API_KEY",
        "DEEPSEEK_API_KEY",
        "DEEPSEEKAPIKEY",
        "DEEPSEEK_APIKEY",
        "deepseekapikey",
      ],
      { preferProjectEnv: true },
    );
  const baseUrl =
    readProcessEnvValue("NEW_ERA_DEEPSEEK_BASE_URL") ||
    readConfigValue(
      [
        "NEW_ERA_DEEPSEEK_BASE_URL",
        "DEEPSEEK_BASE_URL",
        "DEEPSEEK_API_BASE",
        "DEEPSEEK_BASEURL",
        "DEEPSEEKBASEURL",
        "base_url",
      ],
      { preferProjectEnv: true },
    );
  const model =
    readProcessEnvValue("NEW_ERA_DEEPSEEK_MODEL") ||
    readConfigValue(
      [
        "NEW_ERA_DEEPSEEK_MODEL",
        "DEEPSEEK_MODEL",
        "DEEPSEEK_MODEL_NAME",
      ],
      {
        preferProjectEnv: true,
      },
    );

  if (!apiKey) {
    return failure(
      "missing_api_key",
      "DEEPSEEK_API_KEY is not configured on the server.",
    );
  }

  if (!baseUrl) {
    return failure(
      "missing_base_url",
      "DEEPSEEK_BASE_URL is not configured on the server.",
    );
  }

  if (!model) {
    return failure(
      "missing_model",
      "DEEPSEEK_MODEL is not configured on the server.",
    );
  }

  return {
    ok: true,
    config: {
      apiKey,
      baseUrl,
      model,
    },
  };
}

function buildChatCompletionsUrl(
  baseUrl: string,
): { ok: true; url: string } | DeepSeekFailure {
  try {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const url = new URL(normalizedBaseUrl);

    if (!url.pathname.endsWith("/chat/completions")) {
      url.pathname = `${url.pathname.replace(/\/+$/, "")}/chat/completions`;
    }

    return {
      ok: true,
      url: url.toString(),
    };
  } catch {
    return failure("invalid_config", "DEEPSEEK_BASE_URL must be a valid URL.");
  }
}

function buildRequestBody(
  messages: DeepSeekMessage[],
  config: DeepSeekConfig,
  options: DeepSeekCompletionOptions,
): DeepSeekChatRequest {
  const requestBody: DeepSeekChatRequest = {
    model: config.model,
    messages,
    temperature: options.temperature ?? 0.2,
  };

  if (options.maxTokens !== undefined) {
    requestBody.max_tokens = options.maxTokens;
  }

  if (options.responseFormat === "json_object") {
    requestBody.response_format = {
      type: "json_object",
    };
  }

  if (options.onContentDelta) {
    requestBody.stream = true;
  }

  if (options.thinking) {
    requestBody.thinking = {
      type: options.thinking,
    };
  }

  return requestBody;
}

function buildJsonMessages(
  messages: DeepSeekMessage[],
  schemaName?: string,
): DeepSeekMessage[] {
  const schemaHint = schemaName?.trim();
  const target = schemaHint ? ` for ${schemaHint}` : "";

  return [
    {
      role: "system",
      content: `Return exactly one valid JSON value${target}. Start with { or [ and end with the matching closing character. Do not wrap the JSON in Markdown, quote it as a string, or add explanatory text.`,
    },
    ...messages,
  ];
}

function validateMessages(messages: DeepSeekMessage[]): DeepSeekFailure | { ok: true } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return failure(
      "invalid_messages",
      "DeepSeek messages must be a non-empty array.",
    );
  }

  for (const [index, message] of messages.entries()) {
    if (
      !message ||
      !VALID_ROLES.has(message.role) ||
      typeof message.content !== "string" ||
      message.content.trim().length === 0
    ) {
      return failure(
        "invalid_messages",
        `DeepSeek message at index ${index} must include a valid role and non-empty content.`,
      );
    }
  }

  return { ok: true };
}

async function readChatCompletionStream(
  response: Response,
  fallbackModel: string,
  onContentDelta: DeepSeekContentDeltaHandler,
): Promise<DeepSeekResult<string>> {
  if (!response.body) {
    return failure(
      "invalid_response",
      "DeepSeek streaming response did not include a readable body.",
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let model = fallbackModel;
  let usage: DeepSeekUsage | undefined;
  let streamFailure: DeepSeekFailure | undefined;

  const consumeEvent = async (rawEvent: string) => {
    const dataLines = rawEvent
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());

    if (dataLines.length === 0) {
      return;
    }

    const data = dataLines.join("\n").trim();

    if (!data || data === "[DONE]") {
      return;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(data);
    } catch {
      streamFailure = failure(
        "invalid_response",
        "DeepSeek streaming response included invalid JSON.",
        {
          details: {
            body: truncate(data, MAX_ERROR_BODY_LENGTH),
          },
        },
      );
      return;
    }

    if (!isJsonObject(parsed)) {
      streamFailure = failure(
        "invalid_response",
        "DeepSeek streaming event must be a JSON object.",
      );
      return;
    }

    if (typeof parsed.model === "string" && parsed.model.trim()) {
      model = parsed.model;
    }

    usage = extractUsage(parsed) ?? usage;

    const delta = extractAssistantContent(parsed);

    if (delta) {
      content += delta;
      await onContentDelta(delta);
    }
  };

  try {
    while (!streamFailure) {
      const { done, value } = await reader.read();

      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      const events = buffer.split(/\n\n/);
      buffer = events.pop() ?? "";

      for (const event of events) {
        await consumeEvent(event);

        if (streamFailure) {
          break;
        }
      }
    }

    if (!streamFailure && buffer.trim()) {
      await consumeEvent(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  if (streamFailure) {
    return streamFailure;
  }

  if (!content) {
    return failure(
      "invalid_response",
      "DeepSeek streaming response did not include assistant content.",
    );
  }

  return {
    ok: true,
    content,
    data: content,
    model,
    ...(usage ? { usage } : {}),
  };
}

function parseChatCompletionResponse(
  responseText: string,
  fallbackModel: string,
): DeepSeekResult<string> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(responseText);
  } catch {
    return failure(
      "invalid_response",
      "DeepSeek response was not valid JSON.",
      {
        details: {
          body: truncate(responseText, MAX_ERROR_BODY_LENGTH),
        },
      },
    );
  }

  if (!isJsonObject(parsed)) {
    return failure("invalid_response", "DeepSeek response must be a JSON object.");
  }

  const content = extractAssistantContent(parsed);

  if (!content) {
    return failure(
      "invalid_response",
      "DeepSeek response did not include assistant message content.",
      {
        details: {
          response: parsed,
        },
      },
    );
  }

  return {
    ok: true,
    data: content,
    content,
    model: typeof parsed.model === "string" ? parsed.model : fallbackModel,
    usage: extractUsage(parsed),
  };
}

function parseJsonContent<TJson extends JsonValue = JsonValue>(
  content: string,
  schemaName?: string,
): JsonParseResult<TJson> {
  const candidates = getJsonParseCandidates(content);

  for (const jsonText of candidates) {
    const parsed = parseJsonCandidate(jsonText);

    if (parsed.ok) {
      return {
        ok: true,
        data: parsed.data as TJson,
      };
    }
  }

  const schemaHint = schemaName?.trim();
  const suffix = schemaHint ? ` for ${schemaHint}` : "";

  return failure(
    "json_parse_error",
    `DeepSeek returned content that could not be parsed as JSON${suffix}.`,
    {
      details: {
        content: truncate(content, MAX_ERROR_BODY_LENGTH),
      },
    },
  );
}

function parseJsonCandidate(
  jsonText: string,
): { ok: true; data: JsonValue } | { ok: false } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false };
  }

  if (typeof parsed === "string") {
    const nested = parsed.trim();

    if (nested && nested !== jsonText.trim() && /^[{\[]/.test(nested)) {
      for (const nestedJsonText of getJsonParseCandidates(nested)) {
        try {
          const nestedParsed = JSON.parse(nestedJsonText);

          if (isJsonValue(nestedParsed)) {
            return {
              ok: true,
              data: nestedParsed,
            };
          }
        } catch {
          // Try the next nested candidate.
        }
      }
    }
  }

  if (!isJsonValue(parsed)) {
    return { ok: false };
  }

  return {
    ok: true,
    data: parsed,
  };
}

function getJsonParseCandidates(content: string): string[] {
  const stripped = stripJsonCodeFence(content).trim();
  const candidates = [stripped];
  const extracted = extractFirstJsonValue(stripped);

  if (extracted && extracted !== stripped) {
    candidates.push(extracted);
  }

  return candidates;
}

function extractFirstJsonValue(text: string): string | null {
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);

  if (starts.length === 0) {
    return null;
  }

  const start = Math.min(...starts);
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      stack.push("}");
      continue;
    }

    if (char === "[") {
      stack.push("]");
      continue;
    }

    if (char !== "}" && char !== "]") {
      continue;
    }

    if (stack.pop() !== char) {
      return null;
    }

    if (stack.length === 0) {
      return text.slice(start, index + 1);
    }
  }

  return null;
}

function extractAssistantContent(response: JsonObject): string | null {
  const choices = response.choices;

  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }

  const firstChoice = choices[0];

  if (!isJsonObject(firstChoice)) {
    return null;
  }

  const message = firstChoice.message;

  if (isJsonObject(message) && typeof message.content === "string") {
    return message.content;
  }

  const delta = firstChoice.delta;

  if (isJsonObject(delta) && typeof delta.content === "string") {
    return delta.content;
  }

  return null;
}

function extractUsage(response: JsonObject): DeepSeekUsage | undefined {
  const usage = response.usage;

  if (!isJsonObject(usage)) {
    return undefined;
  }

  return {
    promptTokens: getNumber(usage.prompt_tokens),
    completionTokens: getNumber(usage.completion_tokens),
    totalTokens: getNumber(usage.total_tokens),
    raw: usage,
  };
}

function createAbortSignal(timeoutMs: number, externalSignal?: AbortSignal) {
  const controller = new AbortController();
  let timeoutReached = false;

  const timeout = setTimeout(() => {
    timeoutReached = true;
    controller.abort();
  }, timeoutMs);

  const abortFromExternalSignal = () => {
    controller.abort();
  };

  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternalSignal, {
      once: true,
    });
  }

  return {
    signal: controller.signal,
    didTimeout: () => timeoutReached,
    cleanup: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    },
  };
}

function stripJsonCodeFence(content: string): string {
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function trimConfigValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

function readConfigValue(
  names: string[],
  options: { preferProjectEnv?: boolean } = {},
): string {
  const readers = options.preferProjectEnv
    ? [readProjectEnvValue, readProcessEnvValue]
    : [readProcessEnvValue, readProjectEnvValue];

  for (const reader of readers) {
    const value = readConfigValueFrom(names, reader);

    if (value) {
      return value;
    }
  }

  return "";
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

    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);

      if (parsed) {
        values[parsed.key] = parsed.value;
      }
    }
  } catch {
    return values;
  }

  return values;
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const assignment = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trim()
    : trimmed;
  const separatorIndex = assignment.indexOf("=");

  if (separatorIndex <= 0) {
    return null;
  }

  const key = assignment.slice(0, separatorIndex).trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  return {
    key,
    value: parseEnvValue(assignment.slice(separatorIndex + 1).trim()),
  };
}

function parseEnvValue(rawValue: string): string {
  const commentIndex = rawValue.search(/\s#/);
  const value =
    commentIndex >= 0 ? rawValue.slice(0, commentIndex).trimEnd() : rawValue;
  const first = value[0];
  const last = value[value.length - 1];

  if (
    value.length >= 2 &&
    ((first === "\"" && last === "\"") || (first === "'" && last === "'"))
  ) {
    const unquoted = value.slice(1, -1);

    return first === "\""
      ? unquoted
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, "\"")
          .replace(/\\\\/g, "\\")
      : unquoted;
  }

  return value;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function getNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }

  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (isJsonObject(value)) {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failure(
  code: DeepSeekErrorCode,
  message: string,
  extra: {
    status?: number;
    details?: JsonValue;
  } = {},
): DeepSeekFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      ...extra,
    },
  };
}
