import type { NextRequest } from "next/server";
import type { ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { buildResumeJudgeResult, toJudgeTarget } from "@/lib/resume-judge";
import { matchResumeToJob } from "@/lib/resume-match";
import { resumeAtsCheckInputSchema } from "@/lib/schemas";
import {
  createResumeOptimizationRun,
  getReportById,
  getResumeById,
} from "@/lib/server-db";
import type { ResumeDto, ResumeProfile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function toResumeProfile(resume: ResumeDto): ResumeProfile {
  return {
    content: resume.content,
    skills: resume.skills,
    ecosystem: resume.ecosystem,
  };
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
        message: "请求体必须是合法 JSON，格式为 { resumeId, reportId|jdText }。",
      },
      { status: 400 },
    );
  }

  const input = resumeAtsCheckInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_ATS_CHECK_INPUT",
        message: "ATS 检查参数不正确，必须提供 resumeId，并在 reportId 或 jdText 中二选一。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const resume = getResumeById(input.data.resumeId);

    if (!resume) {
      return apiError(
        {
          code: "RESUME_NOT_FOUND",
          message: `未找到 id 为 ${input.data.resumeId} 的简历。`,
        },
        { status: 404 },
      );
    }

    if (resume.archivedAt) {
      return apiError(
        {
          code: "ARCHIVED_RESUME_CANNOT_ATS_CHECK",
          message: "已归档简历不能用于 ATS 检查，请选择未归档简历。",
        },
        { status: 409 },
      );
    }

    const report =
      input.data.reportId === undefined
        ? null
        : getReportById(input.data.reportId);

    if (input.data.reportId !== undefined && !report) {
      return apiError(
        {
          code: "REPORT_NOT_FOUND",
          message: `未找到 id 为 ${input.data.reportId} 的评估报告。`,
        },
        { status: 404 },
      );
    }

    const target = toJudgeTarget({
      jdText: input.data.jdText,
      report,
    });
    const match = matchResumeToJob(
      toResumeProfile(resume),
      report ? report.report : target.jdText,
    );
    const result = buildResumeJudgeResult({
      effort: "standard",
      match,
      mode: "ats_check",
      resume,
      target,
    });
    const run = createResumeOptimizationRun({
      resumeId: resume.id,
      reportId: target.reportId,
      mode: "ats_check",
      result,
    });

    return apiSuccess({
      atsCheck: run.result.atsCheck ?? null,
      run,
    });
  } catch {
    return apiError(
      {
        code: "ATS_CHECK_FAILED",
        message: "ATS 检查失败，请检查简历和目标 JD 后重试。",
      },
      { status: 500 },
    );
  }
}
