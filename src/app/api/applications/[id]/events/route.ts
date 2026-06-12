import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { applicationEventCreateInputSchema } from "@/lib/schemas";
import {
  createApplicationEvent,
  getApplicationById,
  listApplicationEvents,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const applicationIdParamSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(Number.isSafeInteger);

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

async function parseApplicationId(
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;

  return applicationIdParamSchema.safeParse(params.id);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requireApiAuth(_request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsedId = await parseApplicationId(context);

  if (!parsedId.success) {
    return apiError(
      {
        code: "INVALID_APPLICATION_ID",
        message: "投递记录 id 必须是正整数。",
        details: zodErrorDetails(parsedId.error),
      },
      { status: 400 },
    );
  }

  try {
    const application = getApplicationById(parsedId.data);

    if (!application) {
      return apiError(
        {
          code: "APPLICATION_NOT_FOUND",
          message: `未找到 id 为 ${parsedId.data} 的投递记录。`,
        },
        { status: 404 },
      );
    }

    const events = listApplicationEvents(parsedId.data);

    return apiSuccess({ events });
  } catch {
    return apiError(
      {
        code: "APPLICATION_EVENTS_READ_FAILED",
        message: "投递时间线读取失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsedId = await parseApplicationId(context);

  if (!parsedId.success) {
    return apiError(
      {
        code: "INVALID_APPLICATION_ID",
        message: "投递记录 id 必须是正整数。",
        details: zodErrorDetails(parsedId.error),
      },
      { status: 400 },
    );
  }

  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return apiError(
      {
        code: "INVALID_JSON",
        message: "请求体必须是合法 JSON。",
      },
      { status: 400 },
    );
  }

  const input = applicationEventCreateInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_APPLICATION_EVENT_INPUT",
        message: "时间线事件参数不正确，请检查事件类型、标题、备注和时间。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const event = createApplicationEvent(parsedId.data, input.data);

    if (!event) {
      return apiError(
        {
          code: "APPLICATION_NOT_FOUND",
          message: `未找到 id 为 ${parsedId.data} 的投递记录。`,
        },
        { status: 404 },
      );
    }

    const events = listApplicationEvents(parsedId.data);

    return apiSuccess({ event, events }, { status: 201 });
  } catch {
    return apiError(
      {
        code: "APPLICATION_EVENT_CREATE_FAILED",
        message: "时间线事件新增失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
