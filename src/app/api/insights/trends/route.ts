import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { getLiveIndustryInsights, getPresetInsights } from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const shouldRefresh = new URL(request.url).searchParams.get("refresh") === "1";

    if (shouldRefresh) {
      const result = await getLiveIndustryInsights({
        signal: request.signal,
      });

      return apiSuccess({
        ...result.insights,
        insights: result.insights,
        provider: result.provider,
        fallbackUsed: result.fallbackUsed,
        fallbackReason: result.fallbackReason ?? null,
        fallbackCode: result.fallbackCode ?? null,
        model: result.model ?? null,
        search: result.search ?? null,
      });
    }

    const insights = getPresetInsights();

    return apiSuccess({
      ...insights,
      insights,
      provider: "preset_demo_data",
      fallbackUsed: true,
    });
  } catch {
    return apiError(
      {
        code: "INSIGHTS_TRENDS_FAILED",
        message: "行业趋势数据读取失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
