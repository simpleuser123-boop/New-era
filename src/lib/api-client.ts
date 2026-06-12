export type ApiClientErrorKind = "api" | "http" | "network" | "parse" | "timeout";

export type ApiClientErrorOptions = {
  cause?: unknown;
  code?: string;
  details?: unknown;
  kind: ApiClientErrorKind;
  status?: number;
};

export type ApiRequestInit = Omit<RequestInit, "body"> & {
  body?: BodyInit | null;
  errorMessage?: string;
  json?: unknown;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_ERROR_MESSAGE = "请求失败，请稍后重试。";

export class ApiClientError extends Error {
  readonly code?: string;
  readonly details?: unknown;
  readonly kind: ApiClientErrorKind;
  readonly status?: number;

  constructor(message: string, options: ApiClientErrorOptions) {
    super(message);
    this.name = "ApiClientError";
    this.code = options.code;
    this.cause = options.cause;
    this.details = options.details;
    this.kind = options.kind;
    this.status = options.status;
  }
}

export async function apiRequest<TBody>(
  input: RequestInfo | URL,
  init: ApiRequestInit = {},
): Promise<TBody> {
  const fallbackMessage = init.errorMessage ?? DEFAULT_ERROR_MESSAGE;
  const response = await fetchApi(input, init);
  const body = await readResponseBody(response, fallbackMessage);

  if (!response.ok) {
    const apiError = readApiError(body);

    throw new ApiClientError(
      apiError?.message ?? buildHttpErrorMessage(response, fallbackMessage),
      {
        code: apiError?.code,
        details: apiError?.details ?? readHttpErrorDetails(response, body),
        kind: "http",
        status: response.status,
      },
    );
  }

  const apiError = readApiError(body);

  if (apiError) {
    throw new ApiClientError(apiError.message ?? fallbackMessage, {
      code: apiError.code,
      details: apiError.details ?? body,
      kind: "api",
      status: response.status,
    });
  }

  return body as TBody;
}

export async function fetchApi(
  input: RequestInfo | URL,
  init: ApiRequestInit = {},
): Promise<Response> {
  const {
    errorMessage = DEFAULT_ERROR_MESSAGE,
    headers,
    json,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    ...requestInit
  } = init;
  const controller = new AbortController();
  let didTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (signal?.aborted) {
    throw createAbortError();
  }

  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);
  }

  try {
    const requestHeaders = new Headers(headers);
    const body =
      json === undefined
        ? requestInit.body
        : JSON.stringify(json);

    if (json !== undefined && !requestHeaders.has("Content-Type")) {
      requestHeaders.set("Content-Type", "application/json");
    }

    if (!requestHeaders.has("Accept")) {
      requestHeaders.set("Accept", "application/json");
    }

    return await fetch(input, {
      ...requestInit,
      body,
      headers: requestHeaders,
      signal: controller.signal,
    });
  } catch (error) {
    if (didTimeout) {
      throw new ApiClientError("请求超时，请稍后重试。", {
        cause: error,
        kind: "timeout",
      });
    }

    if (signal?.aborted || isAbortError(error)) {
      throw createAbortError();
    }

    throw new ApiClientError(errorMessage, {
      cause: error,
      kind: "network",
    });
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function readApiErrorFromResponse(
  response: Response,
  fallbackMessage = DEFAULT_ERROR_MESSAGE,
): Promise<string> {
  try {
    const body = await readResponseBody(response, fallbackMessage);
    const responseFallback = response.ok
      ? fallbackMessage
      : buildHttpErrorMessage(response, fallbackMessage);

    return readApiErrorMessage(body, responseFallback);
  } catch (error) {
    if (error instanceof ApiClientError) {
      return error.message;
    }

    throw error;
  }
}

export function readApiErrorMessage(body: unknown, fallback: string): string {
  return readApiError(body)?.message ?? fallback;
}

export function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function readApiError(body: unknown) {
  const record = toRecord(body);

  if (record?.ok !== false) {
    return undefined;
  }

  const error = toRecord(record.error);
  const message = readString(error?.message);

  return {
    code: readString(error?.code),
    details: error?.details,
    message,
  };
}

async function readResponseBody(
  response: Response,
  fallbackMessage: string,
): Promise<unknown> {
  let text: string;

  try {
    text = await response.text();
  } catch (error) {
    if (!response.ok) {
      throw new ApiClientError(buildHttpErrorMessage(response, fallbackMessage), {
        cause: error,
        details: readHttpErrorDetails(response),
        kind: "http",
        status: response.status,
      });
    }

    throw new ApiClientError(
      `${fallbackMessage} 接口返回内容无法解析。`,
      {
        cause: error,
        kind: "parse",
        status: response.status,
      },
    );
  }

  if (text.trim().length === 0) {
    if (!response.ok) {
      throw new ApiClientError(buildHttpErrorMessage(response, fallbackMessage), {
        details: readHttpErrorDetails(response),
        kind: "http",
        status: response.status,
      });
    }

    throw new ApiClientError(`${fallbackMessage} 接口返回内容为空。`, {
      kind: "parse",
      status: response.status,
    });
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    if (!response.ok) {
      throw new ApiClientError(buildHttpErrorMessage(response, fallbackMessage), {
        cause: error,
        details: readHttpErrorDetails(response, text),
        kind: "http",
        status: response.status,
      });
    }

    throw new ApiClientError(
      `${fallbackMessage} 接口返回内容无法解析。`,
      {
        cause: error,
        details: { preview: text.slice(0, 240) },
        kind: "parse",
        status: response.status,
      },
    );
  }
}

function buildHttpErrorMessage(
  response: Response,
  fallbackMessage: string,
): string {
  return `${fallbackMessage}（HTTP ${response.status}）`;
}

function readHttpErrorDetails(response: Response, body?: unknown) {
  return {
    ...(body === undefined ? {} : { body }),
    status: response.status,
    statusText: response.statusText,
  };
}

function createAbortError() {
  return new DOMException("请求已取消。", "AbortError");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
