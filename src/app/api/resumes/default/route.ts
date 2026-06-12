import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { getDefaultResume } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return apiSuccess({
      resume: getDefaultResume(),
    });
  } catch {
    return apiError(
      {
        code: "DEFAULT_RESUME_READ_FAILED",
        message: "默认简历读取失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
