import type { NextRequest } from "next/server";
import type { ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { getDeepSeekFallbackMessage } from "@/lib/deepseek-errors";
import {
  ResumeFileExtractError,
  extractResumeTextFromUpload,
  type ResumeUploadFileMeta,
} from "@/lib/resume-file";
import { enhanceResumeParseWithAi } from "@/lib/resume-ai";
import { parseResumeText } from "@/lib/resume-parser";
import { resumeParseInputSchema } from "@/lib/schemas";
import { saveResume } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function isResumeTextTooShort(error: ZodError): boolean {
  return error.issues.some(
    (issue) =>
      issue.path.join(".") === "resumeText" && issue.code === "too_small",
  );
}

function isMultipartRequest(request: NextRequest): boolean {
  return (
    request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data") ??
    false
  );
}

function readOptionalFormString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function resolveResumeName(parsedName: string, fileName?: string): string {
  if (parsedName !== "未识别候选人") {
    return parsedName;
  }

  const fileBaseName = fileName?.replace(/\.[^.]+$/, "").trim();

  return fileBaseName && fileBaseName.length > 0 ? fileBaseName : parsedName;
}

export async function POST(request: NextRequest) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let requestBody: unknown;
  let uploadedFile: ResumeUploadFileMeta | null = null;

  if (isMultipartRequest(request)) {
    let formData: FormData;

    try {
      formData = await request.formData();
    } catch {
      return apiError(
        {
          code: "INVALID_FORM_DATA",
          message: "上传请求必须是合法 multipart/form-data。",
        },
        { status: 400 },
      );
    }

    const file = formData.get("file");

    if (!(file instanceof File)) {
      return apiError(
        {
          code: "RESUME_FILE_REQUIRED",
          message: "请在 file 字段上传简历文件。",
        },
        { status: 400 },
      );
    }

    try {
      const upload = await extractResumeTextFromUpload(file);

      uploadedFile = upload.file;
      requestBody = {
        direction: readOptionalFormString(formData, "direction"),
        fileName: upload.file.name,
        resumeText: upload.resumeText,
        targetJdText: readOptionalFormString(formData, "targetJdText"),
        targetRole: readOptionalFormString(formData, "targetRole"),
      };
    } catch (error) {
      if (error instanceof ResumeFileExtractError) {
        return apiError(
          {
            code: error.code,
            message: error.message,
            details: error.details,
          },
          { status: error.status },
        );
      }

      return apiError(
        {
          code: "RESUME_FILE_PARSE_FAILED",
          message: "简历文件解析失败，请换一个文件或粘贴文本后重试。",
          details: {
            reason: error instanceof Error ? error.message : "unknown_error",
          },
        },
        { status: 422 },
      );
    }
  } else {
    try {
      requestBody = await request.json();
    } catch {
      return apiError(
        {
          code: "INVALID_JSON",
          message:
            "请求体必须是合法 JSON，格式为 { resumeText: string, direction?: string }。",
        },
        { status: 400 },
      );
    }
  }

  const input = resumeParseInputSchema.safeParse(requestBody);

  if (!input.success) {
    const textTooShort = isResumeTextTooShort(input.error);

    return apiError(
      {
        code: textTooShort
          ? "RESUME_TEXT_TOO_SHORT"
          : "INVALID_RESUME_PARSE_INPUT",
        message: textTooShort
          ? "简历文本过短，至少需要 20 个字符。"
          : "请求体格式不正确，格式为 { resumeText: string, direction?: string }。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const localProfile = parseResumeText(input.data.resumeText);
    const aiResult = await enhanceResumeParseWithAi({
      resumeText: input.data.resumeText,
      targetRole: input.data.targetRole,
      targetJdText: input.data.targetJdText,
      localProfile,
      deepSeek: {
        signal: request.signal,
      },
    });
    const profile = aiResult.profile;
    let savedResume: ReturnType<typeof saveResume> | null = null;
    let saveError: {
      code: "RESUME_SAVE_FAILED";
      message: string;
    } | null = null;

    try {
      savedResume = saveResume({
        name: resolveResumeName(profile.content.name, input.data.fileName),
        content: profile.content,
        skills: profile.skills,
        ecosystem: profile.ecosystem,
        direction: input.data.direction,
      });
    } catch {
      saveError = {
        code: "RESUME_SAVE_FAILED",
        message: "结果已生成，但保存失败。结构化简历已保留，可稍后重试保存。",
      };
    }

    return apiSuccess({
      resumeId: savedResume?.id ?? null,
      resume: savedResume,
      structuredResume: profile.content,
      parsedProfile: profile.parsedProfile,
      skills: profile.skills,
      aiTechStack: profile.aiTechStack,
      ecosystem: profile.ecosystem,
      ecosystemProfile: profile.ecosystemProfile ?? null,
      ecosystemPosition: profile.ecosystemPosition,
      saveStatus: saveError ? "failed" : "saved",
      saveError,
      uploadedFile,
      provider: aiResult.provider,
      fallbackUsed: aiResult.fallbackUsed,
      fallbackCode: aiResult.deepSeekError?.code ?? null,
      fallbackReason: aiResult.deepSeekError ? "deepseek_unavailable" : null,
      fallbackMessage: aiResult.deepSeekError
        ? getDeepSeekFallbackMessage(aiResult.deepSeekError.code)
        : null,
      model: aiResult.model ?? null,
    });
  } catch {
    return apiError(
      {
        code: "RESUME_PARSE_FAILED",
        message: "简历解析失败，请检查文本内容后重试。",
      },
      { status: 500 },
    );
  }
}
