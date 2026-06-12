import type { NextRequest } from "next/server";
import { z, type ZodError } from "zod";

import { getDeepSeekFallbackMessage } from "@/lib/deepseek-errors";
import { getOrStartSavedEvaluation } from "@/lib/evaluate-idempotency";
import { scanRisks } from "@/lib/risk-engine";
import { jdEvaluationInputSchema, riskScanResultSchema } from "@/lib/schemas";
import type { JdEvaluationInput } from "@/lib/schemas";
import type { EvaluationDimension, JsonObject, JsonValue } from "@/lib/types";
import { requireApiAuth } from "@/lib/auth/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const dimensions: EvaluationDimension[] = ["A", "B", "C", "D", "E", "F"];

const evaluateStreamRequestSchema = jdEvaluationInputSchema.extend({
  clientRequestId: z.string().trim().min(8).max(120).optional(),
});

type EvaluateStreamInput = JdEvaluationInput & {
  clientRequestId?: string;
};

type SseEvent = JsonObject & {
  type: string;
};

function normalizeRequestBody(body: unknown): unknown {
  if (!isRecord(body)) {
    return body;
  }

  return {
    jdText: body.jdText ?? body.jd_text,
    company: body.company,
    role: body.role,
    sourceUrl: body.sourceUrl ?? body.source_url,
    resumeText: body.resumeText ?? body.resume_text,
    clientRequestId: body.clientRequestId ?? body.client_request_id,
  };
}

function zodErrorDetails(error: ZodError): JsonValue {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function isJdTextTooShort(error: ZodError): boolean {
  return error.issues.some(
    (issue) => issue.path.join(".") === "jdText" && issue.code === "too_small",
  );
}

function makeErrorEvent(error: {
  code: string;
  message: string;
  details?: JsonValue;
}): SseEvent {
  return {
    ok: false,
    type: "error",
    error,
  };
}

function formatSseEvent(event: SseEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

function enqueueEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: SseEvent,
) {
  controller.enqueue(formatSseEvent(event));
}

function createSseResponse(
  start: (controller: ReadableStreamDefaultController<Uint8Array>) => Promise<void>,
  init?: ResponseInit,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await start(controller);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    ...init,
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
      ...init?.headers,
    },
  });
}

function createErrorSseResponse(
  error: Parameters<typeof makeErrorEvent>[0],
  init?: ResponseInit,
): Response {
  return createSseResponse(async (controller) => {
    enqueueEvent(controller, makeErrorEvent(error));
  }, init);
}

function buildInvalidInputError(error: ZodError) {
  const textTooShort = isJdTextTooShort(error);

  return {
    code: textTooShort ? "JD_TEXT_TOO_SHORT" : "INVALID_EVALUATE_INPUT",
    message: textTooShort
      ? "JD 文本过短，至少需要 20 个字符。"
      : "请求体格式不正确，格式为 { jdText: string, resumeText?: string } 或 { jd_text: string, resume_text?: string }。",
    details: zodErrorDetails(error),
  };
}

async function runEvaluationStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  input: EvaluateStreamInput,
) {
  enqueueEvent(controller, { type: "phase", phase: "scanning_risks" });

  const risks = riskScanResultSchema.parse(
    scanRisks(input.jdText, {
      company: input.company,
      role: input.role,
      sourceUrl: input.sourceUrl,
    }),
  );

  enqueueEvent(controller, {
    type: "risks",
    risks: risks.signals,
  });
  enqueueEvent(controller, {
    type: "phase",
    phase: "evaluating",
    section: "A",
  });

  const saved = await getOrStartSavedEvaluation(
    input.clientRequestId,
    input.jdText,
    {
      company: input.company,
      role: input.role,
      sourceUrl: input.sourceUrl,
      resumeText: input.resumeText,
    },
  );

  if (saved.deepSeekError) {
    enqueueEvent(controller, {
      type: "fallback",
      provider: "local_fallback",
      fallbackUsed: true,
      fallbackCode: saved.deepSeekError.code,
      fallbackReason: "deepseek_unavailable",
      fallbackMessage: getDeepSeekFallbackMessage(saved.deepSeekError.code),
    });
  }

  for (const dimension of dimensions) {
    const section =
      saved.report.sections.find((item) => item.dimension === dimension) ??
      saved.report.score.dimensions[dimension];

    enqueueEvent(controller, {
      type: "section",
      section: dimension,
      data: section,
    });
  }

  enqueueEvent(controller, {
    type: "score",
    overall: saved.report.score.overall,
  });
  enqueueEvent(controller, {
    type: "done",
    report_id: saved.id,
    report: saved.report,
    save_status: saved.saveError ? "failed" : "saved",
    save_error: saved.saveError ?? null,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    return createErrorSseResponse(
      {
        code: "INVALID_JSON",
        message:
          "请求体必须是合法 JSON，格式为 { jdText: string, resumeText?: string }。",
      },
      { status: 400 },
    );
  }

  const input = evaluateStreamRequestSchema.safeParse(
    normalizeRequestBody(requestBody),
  );

  if (!input.success) {
    return createErrorSseResponse(buildInvalidInputError(input.error), {
      status: 400,
    });
  }

  return createSseResponse(async (controller) => {
    try {
      await runEvaluationStream(controller, input.data);
    } catch {
      enqueueEvent(
        controller,
        makeErrorEvent({
          code: "EVALUATE_STREAM_FAILED",
          message: "岗位流式评估失败，请稍后重试。",
        }),
      );
    }
  });
}
