import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { generateInterviewQuestionsForSession } from "@/lib/interview-coach";
import {
  getInterviewSessionById,
  updateInterviewSessionQuestions,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sessionIdParamSchema = z
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

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requireApiAuth(_request);
  if (!auth.ok) {
    return auth.response;
  }

  const params = await context.params;
  const parsedId = sessionIdParamSchema.safeParse(params.id);

  if (!parsedId.success) {
    return apiError(
      {
        code: "INVALID_INTERVIEW_SESSION_ID",
        message: "面试准备会话 id 必须是正整数。",
        details: zodErrorDetails(parsedId.error),
      },
      { status: 400 },
    );
  }

  try {
    const session = getInterviewSessionById(parsedId.data);

    if (!session) {
      return apiError(
        {
          code: "INTERVIEW_SESSION_NOT_FOUND",
          message: `未找到 id 为 ${parsedId.data} 的面试准备会话。`,
        },
        { status: 404 },
      );
    }

    const generated = await generateInterviewQuestionsForSession(session);
    const updatedSession = updateInterviewSessionQuestions(
      session.id,
      generated.questions,
    );

    if (!updatedSession) {
      return apiError(
        {
          code: "INTERVIEW_QUESTIONS_SAVE_FAILED",
          message: "面试问题生成成功，但保存失败，请稍后重试。",
        },
        { status: 500 },
      );
    }

    return apiSuccess({
      fallbackCode: generated.fallbackCode ?? null,
      fallbackMessage: generated.fallbackMessage ?? null,
      fallbackUsed: generated.fallbackUsed,
      provider: generated.provider,
      session: updatedSession,
    });
  } catch {
    return apiError(
      {
        code: "INTERVIEW_QUESTIONS_GENERATE_FAILED",
        message: "面试问题生成失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
