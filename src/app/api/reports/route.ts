import type { NextRequest } from "next/server";
import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { saveEvaluationReport } from "@/lib/evaluate-engine";
import { evaluationReportSchema, reportCreateInputSchema } from "@/lib/schemas";
import { listReports } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_REPORT_LIMIT = 20;
const MAX_REPORT_LIMIT = 100;

const reportsQuerySchema = z.strictObject({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_REPORT_LIMIT)
    .default(DEFAULT_REPORT_LIMIT),
});
const reportSaveRequestSchema = z.strictObject({
  jdText: reportCreateInputSchema.shape.jdText,
  report: evaluationReportSchema,
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

  const query = reportsQuerySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });

  if (!query.success) {
    return apiError(
      {
        code: "INVALID_REPORTS_QUERY",
        message: `limit 必须是 1 到 ${MAX_REPORT_LIMIT} 之间的整数。`,
        details: zodErrorDetails(query.error),
      },
      { status: 400 },
    );
  }

  try {
    const reports = listReports(query.data.limit);

    return apiSuccess({
      reports,
      count: reports.length,
      limit: query.data.limit,
    });
  } catch {
    return apiError(
      {
        code: "REPORTS_LIST_FAILED",
        message: "评估历史读取失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
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
        message: "请求体必须是合法 JSON，格式为 { jdText: string, report: object }。",
      },
      { status: 400 },
    );
  }

  const input = reportSaveRequestSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_REPORT_SAVE_INPUT",
        message: "报告保存参数不正确，请重新生成或重试保存。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const savedReport = saveEvaluationReport(input.data.jdText, input.data.report);

    return apiSuccess({
      reportId: savedReport.id,
      report: savedReport,
      saveStatus: "saved",
    });
  } catch {
    return apiError(
      {
        code: "REPORT_SAVE_FAILED",
        message: "结果已生成，但保存失败。报告内容已保留，可稍后重试保存。",
      },
      { status: 500 },
    );
  }
}
