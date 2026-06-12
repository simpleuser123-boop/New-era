import type { NextRequest } from "next/server";
import type { ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { resumeSaveInputSchema } from "@/lib/schemas";
import { saveResume } from "@/lib/server-db";

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
        message:
          "请求体必须是合法 JSON，格式为 { name, content, skills, ecosystem, direction? }。",
      },
      { status: 400 },
    );
  }

  const input = resumeSaveInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_RESUME_SAVE_INPUT",
        message: "简历保存参数不正确，请重新解析或重试保存。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const resume = saveResume(input.data);

    return apiSuccess({
      resumeId: resume.id,
      resume,
      saveStatus: "saved",
    });
  } catch {
    return apiError(
      {
        code: "RESUME_SAVE_FAILED",
        message: "结果已生成，但保存失败。结构化简历已保留，可稍后重试保存。",
      },
      { status: 500 },
    );
  }
}
