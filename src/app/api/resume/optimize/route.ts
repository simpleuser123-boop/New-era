import type { NextRequest } from "next/server";
import type { ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { getDeepSeekFallbackMessage } from "@/lib/deepseek-errors";
import { enhanceResumeOptimizationWithAi } from "@/lib/resume-ai";
import { matchResumeToJob } from "@/lib/resume-match";
import { parseResumeText } from "@/lib/resume-parser";
import { resumeOptimizeInputSchema } from "@/lib/schemas";
import type {
  AiEcosystemDomain,
  ResumeMatchResult,
  ResumeProfile,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOMAIN_LABELS: Record<AiEcosystemDomain, string> = {
  llm_application: "LLM应用层",
  ai_infra: "AI Infra",
  algorithm_research: "算法研究",
  embodied_ai: "具身智能",
  ai_safety: "AI安全",
};

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

function buildConcreteSuggestions(input: {
  resumeProfile: ResumeProfile;
  jdText: string;
  match: ResumeMatchResult;
}): string[] {
  const suggestions: string[] = [];
  const projectName =
    input.resumeProfile.content.projects[0]?.name ?? "最相关项目";
  const targetRole = extractTargetRole(input.jdText);
  const primaryDomain = input.resumeProfile.ecosystemProfile?.primaryDomain;
  const targetSummary = [
    targetRole,
    primaryDomain ? DOMAIN_LABELS[primaryDomain] : undefined,
    input.resumeProfile.content.yearsOfExperience !== undefined
      ? `${input.resumeProfile.content.yearsOfExperience} 年经验`
      : undefined,
  ]
    .filter(Boolean)
    .join(" / ");

  for (const suggestion of input.match.optimizationSuggestions) {
    pushUnique(suggestions, suggestion);
  }

  for (const skill of input.match.matchedSkills.slice(0, 2)) {
    pushUnique(
      suggestions,
      `把已匹配的「${skill.skill}」从技能清单前移到「${projectName}」项目描述中：补充你负责的模块、上线场景和一个量化指标，呼应 JD 证据「${skill.jdEvidence ?? skill.skill}」。`,
    );
  }

  for (const gap of input.match.quickGaps.slice(0, 2)) {
    pushUnique(
      suggestions,
      gap.suggestion ??
        `针对 JD 缺口「${gap.skill}」补一个短项目证据：写清使用场景、输入输出、你负责的部分和可在 1-2 周内补齐的验证结果。`,
    );
  }

  for (const gap of input.match.longTermGaps.slice(0, 1)) {
    pushUnique(
      suggestions,
      gap.suggestion ??
        `「${gap.skill}」属于长期能力缺口，不要只写“了解”：如果确有经历，补充训练/部署/评测过程和样本规模；如果没有，放到学习计划而不是核心能力。`,
    );
  }

  const orderedSkills = [
    ...input.match.matchedSkills.map((skill) => skill.skill),
    ...input.match.quickGaps.map((gap) => gap.skill),
    ...input.match.longTermGaps.map((gap) => gap.skill),
  ].slice(0, 6);

  if (orderedSkills.length > 0) {
    pushUnique(
      suggestions,
      `按 JD 顺序重排核心技能区：前两行优先写 ${orderedSkills.join("、")}，弱化与目标岗位无关的通用后端或平台细节。`,
    );
  }

  pushUnique(
    suggestions,
    `把简历摘要改成目标岗位版本：开头直接写「${targetSummary || targetRole}」，随后用 1 句话说明最相关项目、技术栈和量化结果。`,
  );

  return suggestions.slice(0, 5);
}

function extractTargetRole(jdText: string): string {
  const labeledMatch = jdText.match(
    /^\s*(?:职位名称|岗位名称|职位|岗位|Role|Title)\s*[:：]\s*(.+)$/im,
  );
  const labeledRole = cleanShortValue(labeledMatch?.[1]);

  if (labeledRole) {
    return labeledRole;
  }

  const firstRoleLine = jdText
    .split(/\r?\n/)
    .slice(0, 12)
    .map((line) =>
      cleanShortValue(line.replace(/^(?:招聘|职位|岗位)\s*[:：]?\s*/i, "")),
    )
    .find(
      (line) =>
        line &&
        /(工程师|产品经理|研究员|架构师|开发|训练师|评测|平台)/.test(
          line,
        ) &&
        !/(岗位职责|任职要求|职位描述|薪资|工作地点|公司)/.test(line),
    );

  return firstRoleLine ?? "目标岗位";
}

function pushUnique(suggestions: string[], value: string | undefined) {
  const suggestion = cleanShortValue(value, 360);

  if (!suggestion) {
    return;
  }

  const key = suggestion.toLocaleLowerCase().replace(/\s+/g, "");

  if (
    suggestions.some(
      (item) => item.toLocaleLowerCase().replace(/\s+/g, "") === key,
    )
  ) {
    return;
  }

  suggestions.push(suggestion);
}

function cleanShortValue(
  value: string | undefined,
  maxLength = 240,
): string | undefined {
  const normalized = value
    ?.replace(/^[\s:：,，。；;|-]+/, "")
    .replace(/[\s,，。；;]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
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
          "请求体必须是合法 JSON，格式为 { resumeText: string, jdText: string }。",
      },
      { status: 400 },
    );
  }

  const input = resumeOptimizeInputSchema.safeParse(requestBody);

  if (!input.success) {
    const resumeTextTooShort = isTooShort(input.error, "resumeText");
    const jdTextTooShort = isTooShort(input.error, "jdText");

    return apiError(
      {
        code: resumeTextTooShort
          ? "RESUME_TEXT_TOO_SHORT"
          : jdTextTooShort
            ? "JD_TEXT_TOO_SHORT"
            : "INVALID_RESUME_OPTIMIZE_INPUT",
        message: resumeTextTooShort
          ? "简历文本过短，至少需要 20 个字符。"
          : jdTextTooShort
            ? "JD 文本过短，至少需要 20 个字符。"
            : "请求体格式不正确，格式为 { resumeText: string, jdText: string }。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const parsedProfile = parseResumeText(input.data.resumeText);
    const resumeProfile: ResumeProfile = {
      content: parsedProfile.content,
      skills: parsedProfile.skills,
      ecosystem: parsedProfile.ecosystem,
      ecosystemProfile: parsedProfile.ecosystemProfile,
    };
    const match = matchResumeToJob(resumeProfile, input.data.jdText);
    const suggestions = buildConcreteSuggestions({
      resumeProfile,
      jdText: input.data.jdText,
      match,
    });
    const aiResult = await enhanceResumeOptimizationWithAi({
      resumeText: input.data.resumeText,
      jdText: input.data.jdText,
      resumeProfile,
      match,
      localSuggestions: suggestions,
      deepSeek: {
        signal: request.signal,
      },
    });

    return apiSuccess({
      suggestions: aiResult.suggestions,
      count: aiResult.suggestions.length,
      matchSummary: {
        directionMatch: match.directionMatch,
        skillCoverage: match.skillCoverage,
        overallMatch: match.overallMatch,
        matchLevel: match.matchLevel,
      },
      referencedGaps: {
        quickFix: match.quickGaps.slice(0, 5),
        longTerm: match.longTermGaps.slice(0, 5),
      },
      provider: aiResult.provider,
      fallbackUsed: aiResult.fallbackUsed,
      fallbackCode: aiResult.deepSeekError?.code ?? null,
      fallbackReason: aiResult.deepSeekError ? "deepseek_unavailable" : null,
      fallbackMessage: aiResult.deepSeekError
        ? getDeepSeekFallbackMessage(aiResult.deepSeekError.code)
        : null,
      model: aiResult.model ?? null,
    });
  } catch {
    return apiError(
      {
        code: "RESUME_OPTIMIZE_FAILED",
        message: "简历优化建议生成失败，请检查简历和 JD 文本后重试。",
      },
      { status: 500 },
    );
  }
}
