import type { NextRequest } from "next/server";
import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import {
  createEmptyCareerProfile,
  getCareerProfileSetting,
  saveCareerProfileSetting,
} from "@/lib/career-profile";
import { careerProfileSettingsSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const careerProfilePutRequestSchema = z.union([
  z.strictObject({
    profile: careerProfileSettingsSchema,
  }),
  careerProfileSettingsSchema,
]);

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function normalizePutProfile(payload: z.infer<typeof careerProfilePutRequestSchema>) {
  return "profile" in payload ? payload.profile : payload;
}

export function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { defaultsApplied, profile, setting } = getCareerProfileSetting();

    return apiSuccess({
      defaults: createEmptyCareerProfile(profile.updatedAt),
      defaultsApplied,
      profile,
      updatedAt: setting?.updatedAt ?? null,
    });
  } catch {
    return apiError(
      {
        code: "CAREER_PROFILE_READ_FAILED",
        message: "Career DNA 读取失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
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

  const input = careerProfilePutRequestSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_CAREER_PROFILE_INPUT",
        message: "Career DNA 格式不正确，请检查目标、偏好、优势和建议状态。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const saved = saveCareerProfileSetting(normalizePutProfile(input.data));

    return apiSuccess({
      profile: careerProfileSettingsSchema.parse(saved.value),
      savedAt: saved.updatedAt,
    });
  } catch {
    return apiError(
      {
        code: "CAREER_PROFILE_SAVE_FAILED",
        message: "Career DNA 保存失败，当前更改未保存。",
      },
      { status: 500 },
    );
  }
}
