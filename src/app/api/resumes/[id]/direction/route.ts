import type { NextRequest } from "next/server";
import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { resumeDirectionSchema } from "@/lib/schemas";
import {
  ArchivedResumeCannotUpdateDirectionError,
  updateResumeDirection,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resumeIdParamSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(Number.isSafeInteger);

const directionUpdateInputSchema = z.strictObject({
  direction: resumeDirectionSchema,
});

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const params = await context.params;
  const parsedId = resumeIdParamSchema.safeParse(params.id);

  if (!parsedId.success) {
    return apiError(
      {
        code: "INVALID_RESUME_ID",
        message: "简历 id 必须是正整数。",
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
        message: "请求体必须是合法 JSON，格式为 { direction }。",
      },
      { status: 400 },
    );
  }

  const input = directionUpdateInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_RESUME_DIRECTION",
        message: "简历方向不正确，请从固定方向中选择。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const resume = updateResumeDirection(parsedId.data, input.data.direction);

    if (!resume) {
      return apiError(
        {
          code: "RESUME_NOT_FOUND",
          message: `未找到 id 为 ${parsedId.data} 的简历。`,
        },
        { status: 404 },
      );
    }

    return apiSuccess({ resume });
  } catch (error) {
    if (error instanceof ArchivedResumeCannotUpdateDirectionError) {
      return apiError(
        {
          code: "ARCHIVED_RESUME_CANNOT_UPDATE_DIRECTION",
          message: "已归档简历不能修改方向。",
        },
        { status: 409 },
      );
    }

    return apiError(
      {
        code: "RESUME_DIRECTION_UPDATE_FAILED",
        message: "简历方向更新失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
