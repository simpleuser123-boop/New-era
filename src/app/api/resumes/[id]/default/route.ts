import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import {
  ArchivedResumeCannotBeDefaultError,
  setDefaultResume,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resumeIdParamSchema = z
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

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requireApiAuth(_request);
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

  try {
    const resume = setDefaultResume(parsedId.data);

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
    if (error instanceof ArchivedResumeCannotBeDefaultError) {
      return apiError(
        {
          code: "ARCHIVED_RESUME_CANNOT_BE_DEFAULT",
          message: "已归档简历不能设为默认简历。",
        },
        { status: 409 },
      );
    }

    return apiError(
      {
        code: "DEFAULT_RESUME_UPDATE_FAILED",
        message: "默认简历设置失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
