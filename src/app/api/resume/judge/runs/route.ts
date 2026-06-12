import type { NextRequest } from "next/server";
import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { listResumeOptimizationRuns } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().positive().max(100).default(20),
  resumeId: z.coerce.number().int().positive().optional(),
});

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export function GET(request: NextRequest) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const query = runsQuerySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    resumeId: request.nextUrl.searchParams.get("resumeId") ?? undefined,
  });

  if (!query.success) {
    return apiError(
      {
        code: "INVALID_RESUME_JUDGE_RUNS_QUERY",
        message: "Resume Judge 历史查询参数不正确。",
        details: zodErrorDetails(query.error),
      },
      { status: 400 },
    );
  }

  try {
    const runs = listResumeOptimizationRuns(query.data);

    return apiSuccess({
      runs,
      count: runs.length,
      limit: query.data.limit,
    });
  } catch {
    return apiError(
      {
        code: "RESUME_JUDGE_RUNS_FAILED",
        message: "Resume Judge 历史读取失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
