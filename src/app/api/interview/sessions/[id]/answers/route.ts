import type { NextRequest } from "next/server";
import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { scoreInterviewAnswerForSession } from "@/lib/interview-coach";
import { interviewAnswerCreateInputSchema } from "@/lib/schemas";
import {
  createInterviewAnswer,
  getInterviewSessionById,
  listInterviewAnswers,
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
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requireApiAuth(request);
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

  const input = interviewAnswerCreateInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_INTERVIEW_ANSWER_INPUT",
        message: "回答参数不正确，请选择问题并输入至少 10 个字符的回答。",
        details: zodErrorDetails(input.error),
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

    if (!session.questions.some((question) => question.id === input.data.questionId)) {
      return apiError(
        {
          code: "INTERVIEW_QUESTION_NOT_FOUND",
          message: "该会话中未找到对应问题，请先重新生成问题。",
        },
        { status: 404 },
      );
    }

    const scoring = await scoreInterviewAnswerForSession(session, input.data);
    const answer = createInterviewAnswer(session.id, input.data, scoring.score);

    if (!answer) {
      return apiError(
        {
          code: "INTERVIEW_ANSWER_SAVE_FAILED",
          message: "回答评分完成，但保存失败，请稍后重试。",
        },
        { status: 500 },
      );
    }

    return apiSuccess(
      {
        answer,
        answers: listInterviewAnswers(session.id),
        fallbackCode: scoring.fallbackCode ?? null,
        fallbackMessage: scoring.fallbackMessage ?? null,
        fallbackUsed: scoring.fallbackUsed,
        provider: scoring.provider,
      },
      { status: 201 },
    );
  } catch {
    return apiError(
      {
        code: "INTERVIEW_ANSWER_SCORE_FAILED",
        message: "回答保存或评分失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
