import * as cheerio from "cheerio";
import type { NextRequest } from "next/server";
import type { ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { jdFetchInputSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 8_000;
const MIN_EXTRACTED_TEXT_LENGTH = 80;
const MAX_EXTRACTED_TEXT_LENGTH = 50_000;

const IRRELEVANT_SELECTORS = [
  "script",
  "style",
  "noscript",
  "nav",
  "footer",
  "header",
  "aside",
  "iframe",
  "svg",
  "canvas",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "link",
  "meta",
  "[aria-hidden='true']",
  "[hidden]",
  ".nav",
  ".navbar",
  ".footer",
  ".header",
  ".sidebar",
  ".breadcrumb",
  ".breadcrumbs",
  ".advertisement",
  ".ads",
  ".ad",
].join(",");

const MAIN_CONTENT_SELECTORS = [
  "main",
  "article",
  "[role='main']",
  ".job-detail",
  ".job-detail-content",
  ".job-description",
  ".job-desc",
  ".job-sec",
  ".position-content",
  ".position-detail",
  ".detail-content",
  ".content",
  "body",
];

const BLOCK_TEXT_SELECTORS = [
  "p",
  "li",
  "dt",
  "dd",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "section",
  "article",
  "div",
].join(",");

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout),
  };
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractReadableText($: cheerio.CheerioAPI): string {
  $(IRRELEVANT_SELECTORS).remove();
  $("br").replaceWith("\n");
  $(BLOCK_TEXT_SELECTORS).append("\n");

  for (const selector of MAIN_CONTENT_SELECTORS) {
    const content = normalizeWhitespace($(selector).first().text());

    if (content.length >= MIN_EXTRACTED_TEXT_LENGTH) {
      return content.slice(0, MAX_EXTRACTED_TEXT_LENGTH);
    }
  }

  return normalizeWhitespace($("body").text()).slice(0, MAX_EXTRACTED_TEXT_LENGTH);
}

function extractTitle($: cheerio.CheerioAPI): string {
  const title =
    $("h1").first().text() ||
    $("[property='og:title']").attr("content") ||
    $("title").first().text();

  return normalizeWhitespace(title).slice(0, 240);
}

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function invalidUrlResponse(details?: ReturnType<typeof zodErrorDetails>) {
  return apiError(
    {
      code: "INVALID_JD_URL",
      message: "请输入有效的 http 或 https 招聘页面 URL。",
      details,
    },
    { status: 400 },
  );
}

export async function POST(request: NextRequest) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return apiError(
      {
        code: "INVALID_JSON",
        message: "请求体必须是合法 JSON，格式为 { url: string }。",
      },
      { status: 400 },
    );
  }

  let input: ReturnType<typeof jdFetchInputSchema.safeParse>;

  try {
    input = jdFetchInputSchema.safeParse(requestBody);
  } catch {
    return invalidUrlResponse();
  }

  if (!input.success) {
    return invalidUrlResponse(zodErrorDetails(input.error));
  }

  const timeout = createTimeoutSignal(FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(input.data.url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (compatible; NewEraJdFetcher/1.0; +https://new-era.local)",
      },
      redirect: "follow",
      signal: timeout.signal,
    });

    if (!response.ok) {
      return apiError(
        {
          code: "JD_FETCH_FAILED",
          message: "抓取失败，请手动粘贴 JD 文本。",
          details: {
            status: response.status,
            statusText: response.statusText,
          },
        },
        { status: 502 },
      );
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType && !contentType.toLowerCase().includes("html")) {
      return apiError(
        {
          code: "JD_FETCH_UNSUPPORTED_CONTENT",
          message: "该链接不是可解析的招聘网页，请手动粘贴 JD 文本。",
          details: { contentType },
        },
        { status: 415 },
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const title = extractTitle($);
    const text = extractReadableText($);

    if (text.length < MIN_EXTRACTED_TEXT_LENGTH) {
      return apiError(
        {
          code: "JD_TEXT_NOT_FOUND",
          message: "未能从页面中识别出完整 JD 内容，请手动粘贴 JD 文本。",
        },
        { status: 422 },
      );
    }

    return apiSuccess({
      title,
      text,
      sourceUrl: input.data.url,
    });
  } catch (error) {
    const isTimeout =
      error instanceof DOMException && error.name === "AbortError";

    return apiError(
      {
        code: isTimeout ? "JD_FETCH_TIMEOUT" : "JD_FETCH_FAILED",
        message: isTimeout
          ? "抓取超时，请稍后重试或手动粘贴 JD 文本。"
          : "抓取失败，请手动粘贴 JD 文本。",
      },
      { status: isTimeout ? 504 : 502 },
    );
  } finally {
    timeout.cleanup();
  }
}
