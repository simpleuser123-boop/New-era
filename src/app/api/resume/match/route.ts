import type { NextRequest } from "next/server";
import type { ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { matchResumeToJob } from "@/lib/resume-match";
import { parseResumeText } from "@/lib/resume-parser";
import { resumeMatchInputSchema } from "@/lib/schemas";
import { getReportById, getResumeById } from "@/lib/server-db";
import type { EvaluationReport, ResumeDto, ResumeProfile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function isTooShort(error: ZodError, path: "resumeText" | "jdText"): boolean {
  return error.issues.some(
    (issue) => issue.path.join(".") === path && issue.code === "too_small",
  );
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
        message:
          "请求体必须是合法 JSON，格式为 { resumeId|resumeText, jdText|reportId }。",
      },
      { status: 400 },
    );
  }

  const input = resumeMatchInputSchema.safeParse(requestBody);

  if (!input.success) {
    const resumeTextTooShort = isTooShort(input.error, "resumeText");
    const jdTextTooShort = isTooShort(input.error, "jdText");

    return apiError(
      {
        code: resumeTextTooShort
          ? "RESUME_TEXT_TOO_SHORT"
          : jdTextTooShort
            ? "JD_TEXT_TOO_SHORT"
            : "INVALID_RESUME_MATCH_INPUT",
        message: resumeTextTooShort
          ? "简历文本过短，至少需要 20 个字符。"
          : jdTextTooShort
            ? "JD 文本过短，至少需要 20 个字符。"
            : "请求体格式不正确，必须提供 resumeId 或 resumeText，并提供 jdText 或 reportId。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    let resumeProfile: ResumeProfile;
    let savedResume: ResumeDto | null = null;

    if (input.data.resumeId !== undefined) {
      savedResume = getResumeById(input.data.resumeId);

      if (!savedResume) {
        return apiError(
          {
            code: "RESUME_NOT_FOUND",
            message: `未找到 id 为 ${input.data.resumeId} 的简历。`,
          },
          { status: 404 },
        );
      }

      if (savedResume.archivedAt) {
        return apiError(
          {
            code: "ARCHIVED_RESUME_CANNOT_MATCH",
            message: "已归档简历不能用于匹配，请选择未归档简历。",
          },
          { status: 409 },
        );
      }

      resumeProfile = toResumeProfile(savedResume);
    } else {
      const parsedProfile = parseResumeText(input.data.resumeText ?? "");

      resumeProfile = {
        content: parsedProfile.content,
        skills: parsedProfile.skills,
        ecosystem: parsedProfile.ecosystem,
        ecosystemProfile: parsedProfile.ecosystemProfile,
      };
    }

    let jobInput: EvaluationReport | string;
    let matchedReport: ReturnType<typeof getReportById> = null;

    if (input.data.reportId !== undefined) {
      matchedReport = getReportById(input.data.reportId);

      if (!matchedReport) {
        return apiError(
          {
            code: "REPORT_NOT_FOUND",
            message: `未找到 id 为 ${input.data.reportId} 的评估报告。`,
          },
          { status: 404 },
        );
      }

      jobInput = matchedReport.report;
    } else {
      jobInput = input.data.jdText ?? "";
    }

    const match = matchResumeToJob(resumeProfile, jobInput);

    return apiSuccess({
      match,
      scores: {
        directionMatch: match.directionMatch,
        skillCoverage: match.skillCoverage,
        overallMatch: match.overallMatch,
        matchLevel: match.matchLevel,
      },
      matchedSkills: match.matchedSkills,
      skillGaps: {
        quickFix: match.quickGaps,
        longTerm: match.longTermGaps,
        all: match.gaps,
      },
      optimizationSuggestions: match.optimizationSuggestions,
      resume: savedResume
        ? {
            id: savedResume.id,
            name: savedResume.name,
            updatedAt: savedResume.updatedAt,
          }
        : {
            id: null,
            name: resumeProfile.content.name,
            updatedAt: null,
          },
      report: matchedReport
        ? {
            id: matchedReport.id,
            company: matchedReport.company,
            role: matchedReport.role,
            createdAt: matchedReport.createdAt,
          }
        : null,
      provider: "local_fallback",
      fallbackUsed: true,
    });
  } catch {
    return apiError(
      {
        code: "RESUME_MATCH_FAILED",
        message: "简历匹配失败，请检查简历和 JD 文本后重试。",
      },
      { status: 500 },
    );
  }
}
