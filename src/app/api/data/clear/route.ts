import type { NextRequest } from "next/server";
import { type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import {
  DATA_CLEAR_CONFIRMATION_TEXT,
  dataClearRequestSchema,
} from "@/lib/data-export";
import { clearDataCategories } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
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
        message: "请求体必须是合法 JSON。",
      },
      { status: 400 },
    );
  }

  const input = dataClearRequestSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_DATA_CLEAR_INPUT",
        message: `清除数据前必须选择类别，并输入确认文本：${DATA_CLEAR_CONFIRMATION_TEXT}`,
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const result = clearDataCategories(input.data.categories);

    return apiSuccess({
      result,
    });
  } catch {
    return apiError(
      {
        code: "DATA_CLEAR_FAILED",
        message: "本地数据清除失败，当前数据未完成清除，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
