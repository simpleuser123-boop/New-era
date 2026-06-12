import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { buildCareerProfileSuggestions } from "@/lib/career-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const result = buildCareerProfileSuggestions();

    return apiSuccess({
      count: result.suggestions.length,
      generatedAt: result.generatedAt,
      sources: result.sources,
      suggestions: result.suggestions,
    });
  } catch {
    return apiError(
      {
        code: "CAREER_PROFILE_SUGGESTIONS_FAILED",
        message: "画像建议生成失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
