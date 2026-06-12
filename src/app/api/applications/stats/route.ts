import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { getApplicationStats } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const stats = getApplicationStats();

    return apiSuccess(stats);
  } catch {
    return apiError(
      {
        code: "APPLICATION_STATS_READ_FAILED",
        message: "投递统计读取失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
