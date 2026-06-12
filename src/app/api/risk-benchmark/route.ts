import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { createRiskBenchmarkOverview } from "@/lib/risk-benchmark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const overview = await createRiskBenchmarkOverview();

    return apiSuccess({ ...overview });
  } catch (error) {
    return apiError(
      {
        code: "RISK_BENCHMARK_READ_FAILED",
        message: "风险 benchmark 读取失败，请确认本地 benchmark 数据可用。",
        details: {
          reason: sanitizeBenchmarkError(error),
        },
      },
      { status: 500 },
    );
  }
}

function sanitizeBenchmarkError(error: unknown) {
  const message = error instanceof Error ? error.message : "未知错误";

  return message
    .replaceAll(process.cwd(), "[project]")
    .replace(/[A-Za-z]:\\[^\n\r，。；;]*/g, "[local path]");
}
