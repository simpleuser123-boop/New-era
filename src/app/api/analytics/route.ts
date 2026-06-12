import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { analyticsOverviewSchema } from "@/lib/schemas";
import { getAnalyticsOverview } from "@/lib/server-db";
import type { JsonObject } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const overview = analyticsOverviewSchema.parse(getAnalyticsOverview());

    return apiSuccess(overview as unknown as JsonObject);
  } catch {
    return apiError(
      {
        code: "ANALYTICS_READ_FAILED",
        message: "求职分析读取失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
