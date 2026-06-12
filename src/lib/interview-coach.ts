import { z } from "zod";

import { callDeepSeekJson, type DeepSeekMessage } from "./deepseek-client";
import { getDeepSeekFallbackMessage } from "./deepseek-errors";
import {
  careerProfileSettingsSchema,
  interviewAnswerScoreSchema,
  interviewQuestionsSchema,
} from "./schemas";
import {
  getDefaultResume,
  getReportById,
  getResumeById,
  getSetting,
} from "./server-db";
import type {
  CareerProfileSettings,
  InterviewAiProvider,
  InterviewAnswerCreateInput,
  InterviewAnswerScore,
  InterviewMode,
  InterviewQuestion,
  InterviewQuestionType,
  InterviewSessionDto,
  JsonObject,
  ReportDto,
  ResumeDto,
} from "./types";

export type InterviewQuestionGenerationResult = {
  fallbackCode?: string;
  fallbackMessage?: string;
  fallbackUsed: boolean;
  provider: InterviewAiProvider;
  questions: InterviewQuestion[];
};

export type InterviewAnswerScoreResult = {
  fallbackCode?: string;
  fallbackMessage?: string;
  fallbackUsed: boolean;
  provider: InterviewAiProvider;
  score: InterviewAnswerScore;
};

type InterviewCoachContext = {
  careerProfile: CareerProfileSettings | null;
  focusAreas: string[];
  report: ReportDto | null;
  resume: ResumeDto | null;
  session: InterviewSessionDto;
};

const QUESTION_MODEL_TIMEOUT_MS = 20_000;
const SCORE_MODEL_TIMEOUT_MS = 18_000;
const questionResponseSchema = z.strictObject({
  questions: interviewQuestionsSchema,
});

export async function generateInterviewQuestionsForSession(
  session: InterviewSessionDto,
): Promise<InterviewQuestionGenerationResult> {
  const context = buildInterviewCoachContext(session);
  const fallbackQuestions = buildLocalQuestions(context);
  const modelResult = await callDeepSeekJson<JsonObject>(
    buildQuestionMessages(context, fallbackQuestions),
    "InterviewQuestionsResponse",
    {
      maxTokens: 2_200,
      temperature: 0.25,
      thinking: "disabled",
      timeoutMs: QUESTION_MODEL_TIMEOUT_MS,
    },
  );

  if (!modelResult.ok) {
    return buildQuestionFallback(
      fallbackQuestions,
      modelResult.error.code,
      getDeepSeekFallbackMessage(modelResult.error.code),
    );
  }

  const parsed = questionResponseSchema.safeParse(modelResult.data);

  if (!parsed.success) {
    return buildQuestionFallback(
      fallbackQuestions,
      "invalid_response",
      "AI 返回的问题格式未通过校验，已切换到本地模板。",
    );
  }

  const questions = mergeQuestions(parsed.data.questions, fallbackQuestions);

  return {
    fallbackUsed: false,
    provider: "deepseek_enhanced",
    questions,
  };
}

export async function scoreInterviewAnswerForSession(
  session: InterviewSessionDto,
  input: InterviewAnswerCreateInput,
): Promise<InterviewAnswerScoreResult> {
  const context = buildInterviewCoachContext(session);
  const question = findQuestion(session.questions, input.questionId);
  const fallbackScore = scoreAnswerLocally(context, input, question);
  const modelResult = await callDeepSeekJson<JsonObject>(
    buildScoreMessages(context, input, question, fallbackScore),
    "InterviewAnswerScore",
    {
      maxTokens: 1_200,
      temperature: 0.2,
      timeoutMs: SCORE_MODEL_TIMEOUT_MS,
    },
  );

  if (!modelResult.ok) {
    return buildScoreFallback(
      fallbackScore,
      modelResult.error.code,
      getDeepSeekFallbackMessage(modelResult.error.code),
    );
  }

  const rawScore = isRecord(modelResult.data.score)
    ? modelResult.data.score
    : modelResult.data;
  const parsed = interviewAnswerScoreSchema.safeParse({
    ...rawScore,
    provider: "deepseek_enhanced",
  });

  if (!parsed.success) {
    return buildScoreFallback(
      fallbackScore,
      "invalid_response",
      "AI 返回的评分格式未通过校验，已切换到本地规则评分。",
    );
  }

  return {
    fallbackUsed: false,
    provider: "deepseek_enhanced",
    score: parsed.data,
  };
}

function buildInterviewCoachContext(
  session: InterviewSessionDto,
): InterviewCoachContext {
  const report = session.reportId ? getReportById(session.reportId) : null;
  const resume = session.resumeId
    ? getResumeById(session.resumeId)
    : getDefaultResume();
  const careerProfile = readCareerProfile();
  const focusAreas = uniqueStrings([
    ...(report?.report.job.techStack ?? []),
    ...(report?.report.job.keywords ?? []),
    ...(report?.risks.slice(0, 5).map((risk) => risk.signal) ?? []),
    ...(report?.report.sections.flatMap((section) => section.suggestions.slice(0, 1)) ??
      []),
    ...(resume?.skills.slice(0, 8).map((skill) => skill.name) ?? []),
    ...(careerProfile?.strengths.map((strength) => strength.title) ?? []),
  ]).slice(0, 14);

  return {
    careerProfile,
    focusAreas,
    report,
    resume: resume?.archivedAt ? null : resume,
    session,
  };
}

function readCareerProfile(): CareerProfileSettings | null {
  const setting = getSetting("career_profile");

  if (!setting) {
    return null;
  }

  const parsed = careerProfileSettingsSchema.safeParse(setting.value);

  return parsed.success ? parsed.data : null;
}

function buildQuestionMessages(
  context: InterviewCoachContext,
  fallbackQuestions: InterviewQuestion[],
): DeepSeekMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是 New Era 的 Interview Coach。只能基于用户本地报告、简历和 Career DNA 生成面试准备问题。",
        "不要搜索外部面经，不要声称已联系 HR、已自动投递或已接入招聘平台。",
        "输出中文 JSON object，字段只有 questions。",
        "questions 数量保持 8 到 12 个；每个问题必须包含 id、type、question、focus、expectedSignals、source。",
        "type 只能是 technical、product、behavioral、project、risk、motivation。",
        "source 优先使用 report、resume、career_profile 或 deepseek。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `面试模式：${context.session.mode}`,
        "本地上下文：",
        JSON.stringify(buildModelContext(context), null, 2),
        "本地兜底问题模板，可作为质量和格式参考：",
        JSON.stringify(fallbackQuestions, null, 2),
      ].join("\n"),
    },
  ];
}

function buildScoreMessages(
  context: InterviewCoachContext,
  input: InterviewAnswerCreateInput,
  question: InterviewQuestion | null,
  fallbackScore: InterviewAnswerScore,
): DeepSeekMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是 New Era 的面试回答评分器。只基于本地报告、简历、问题和用户回答评分。",
        "不要添加外部公司面经或平台信息。不要把建议写入数据库。",
        "输出中文 JSON object，字段为 overall、structure、evidence、jdRelevance、aiAccuracy、riskHandling、summary、strengths、weaknesses、suggestions。",
        "所有分数字段使用 0 到 5 的数字。summary、strengths、weaknesses、suggestions 要具体且可执行。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "面试上下文：",
        JSON.stringify(buildModelContext(context), null, 2),
        "问题：",
        JSON.stringify(question, null, 2),
        "用户回答：",
        input.answerText,
        "本地规则评分，可作为保底参考：",
        JSON.stringify(fallbackScore, null, 2),
      ].join("\n"),
    },
  ];
}

function buildModelContext(context: InterviewCoachContext): JsonObject {
  const report = context.report;
  const resume = context.resume;
  const careerProfile = context.careerProfile;

  return {
    careerProfile: careerProfile
      ? {
          currentStrategy: careerProfile.currentStrategy ?? "",
          strengths: careerProfile.strengths.slice(0, 8),
          targetDirections: careerProfile.targetDirections,
          targetRoles: careerProfile.targetRoles.slice(0, 8),
          weaknesses: careerProfile.weaknesses.slice(0, 8),
        }
      : null,
    focusAreas: context.focusAreas,
    report: report
      ? {
          company: report.company,
          jdText: truncate(report.jdText, 4_000),
          recommendation: report.report.recommendation,
          risks: {
            level: report.report.risks.level,
            signals: report.risks.slice(0, 8).map((risk) => ({
              advice: risk.advice ?? "",
              category: risk.category ?? "",
              severity: risk.severity,
              signal: risk.signal,
            })),
            summary: report.report.risks.summary,
          },
          role: report.role,
          score: report.score.overall,
          sections: report.report.sections.map((section) => ({
            findings: section.findings.slice(0, 4),
            score: section.score,
            suggestions: section.suggestions.slice(0, 4),
            title: section.title,
          })),
          techStack: report.report.job.techStack.slice(0, 16),
        }
      : null,
    resume: resume
      ? {
          currentRole: resume.content.currentRole ?? "",
          direction: resume.direction,
          experiences: resume.content.experiences.slice(0, 4).map((experience) => ({
            company: experience.company,
            highlights: experience.highlights.slice(0, 4),
            role: experience.role,
            techStack: experience.techStack.slice(0, 8),
          })),
          name: resume.name,
          projects: resume.content.projects.slice(0, 5).map((project) => ({
            impact: project.impact ?? "",
            name: project.name,
            summary: project.summary ?? "",
            techStack: project.techStack.slice(0, 8),
          })),
          skills: resume.skills.slice(0, 20).map((skill) => skill.name),
          summary: resume.content.summary ?? "",
        }
      : null,
    session: {
      id: context.session.id,
      mode: context.session.mode,
      title: context.session.title,
    },
  } as JsonObject;
}

function buildLocalQuestions(context: InterviewCoachContext): InterviewQuestion[] {
  const role = context.report?.role ?? "目标岗位";
  const company = context.report?.company ?? "目标公司";
  const techStack = context.report?.report.job.techStack ?? [];
  const keywords = context.report?.report.job.keywords ?? [];
  const firstTech = firstNonEmpty([...techStack, ...keywords], "RAG / Agent / 模型应用");
  const secondTech = firstNonEmpty([...techStack.slice(1), ...keywords], "评测、工程化或数据闭环");
  const risk = context.report?.risks[0]?.signal ?? "岗位职责和团队边界不清晰";
  const project =
    context.resume?.content.projects[0]?.name ??
    context.resume?.content.experiences[0]?.role ??
    "你最能代表 AI 落地能力的项目";
  const strength =
    context.careerProfile?.strengths[0]?.title ??
    context.resume?.skills[0]?.name ??
    "你最稳定的核心优势";

  const allQuestions: InterviewQuestion[] = [
    localQuestion(
      "technical",
      `这个 ${role} 岗位提到 ${firstTech}。请说明你会如何设计端到端方案，并解释关键技术取舍。`,
      "技术方案设计",
      ["方案边界清楚", "技术取舍有理由", "能结合岗位场景"],
      "local-technical-1",
    ),
    localQuestion(
      "technical",
      `如果线上 ${firstTech} 效果不稳定，你会如何定位问题、设计评测指标并推动修复？`,
      "问题定位和评测",
      ["有排查路径", "指标可观测", "能说明验证方法"],
      "local-technical-2",
    ),
    localQuestion(
      "product",
      `如果你负责 ${company} 的 ${role} 方向，前三个月你会如何定义 MVP、验证用户价值和判断是否继续投入？`,
      "产品判断",
      ["目标用户清晰", "验证方式具体", "知道如何收敛范围"],
      "local-product-1",
    ),
    localQuestion(
      "product",
      `请把 ${secondTech} 转化成一个业务可理解的指标体系，并说明你会如何向非技术团队同步进展。`,
      "业务沟通",
      ["指标不空泛", "能跨团队沟通", "能连接业务结果"],
      "local-product-2",
    ),
    localQuestion(
      "behavioral",
      `讲一个你在资源不足或目标不清晰时推动 AI 项目落地的经历。请用 STAR 结构回答。`,
      "STAR 结构",
      ["背景和任务分开", "行动有个人贡献", "结果可验证"],
      "local-behavioral-1",
    ),
    localQuestion(
      "behavioral",
      `讲一次你和算法、工程、产品或业务团队产生分歧的经历。你如何处理，最后学到了什么？`,
      "协作冲突",
      ["冲突具体", "处理方式成熟", "复盘有洞察"],
      "local-behavioral-2",
    ),
    localQuestion(
      "project",
      `请深挖项目「${project}」：你负责哪一段，最难的问题是什么，最终指标或业务结果是什么？`,
      "项目深挖",
      ["个人职责明确", "难点真实", "结果量化或可验证"],
      "local-project-1",
    ),
    localQuestion(
      "project",
      `如果让你把「${project}」迁移到 ${role} 的业务环境，你会保留什么、重做什么、优先补什么？`,
      "迁移能力",
      ["能识别上下文差异", "优先级合理", "不生搬硬套"],
      "local-project-2",
    ),
    localQuestion(
      "risk",
      `报告提示「${risk}」。面试时你会如何追问团队、职责和交付边界，同时不显得对抗？`,
      "风险追问",
      ["问题具体", "语气专业", "能保护求职决策"],
      "local-risk-1",
    ),
    localQuestion(
      "risk",
      `如果面试官追问你在 ${secondTech} 上的短板，你会如何承认边界并给出补齐计划？`,
      "短板处理",
      ["不回避短板", "补齐路径可执行", "能连接岗位需求"],
      "local-risk-2",
    ),
    localQuestion(
      "motivation",
      `你为什么适合 ${company} 的 ${role}？请把「${strength}」和岗位需求连接起来。`,
      "动机匹配",
      ["动机具体", "优势有证据", "和 JD 相关"],
      "local-motivation-1",
    ),
    localQuestion(
      "motivation",
      `如果拿到 offer，你会如何规划入职后 30 天，证明自己能在 ${firstTech} 方向创造价值？`,
      "入职计划",
      ["计划现实", "节奏清楚", "能体现交付意识"],
      "local-motivation-2",
    ),
  ];

  return pickQuestionsForMode(allQuestions, context.session.mode);
}

function localQuestion(
  type: InterviewQuestionType,
  question: string,
  focus: string,
  expectedSignals: string[],
  id: string,
): InterviewQuestion {
  return {
    expectedSignals,
    focus,
    id,
    question,
    source: "local_template",
    type,
  };
}

function pickQuestionsForMode(
  questions: InterviewQuestion[],
  mode: InterviewMode,
): InterviewQuestion[] {
  if (mode === "mixed") {
    return questions.slice(0, 10);
  }

  const modeType: Record<Exclude<InterviewMode, "mixed">, InterviewQuestionType[]> = {
    behavioral: ["behavioral", "motivation", "risk"],
    product: ["product", "motivation", "risk"],
    project: ["project", "technical", "behavioral"],
    technical: ["technical", "project", "risk"],
  };
  const preferredTypes = new Set(modeType[mode]);
  const preferred = questions.filter((question) => preferredTypes.has(question.type));
  const backup = questions.filter((question) => !preferredTypes.has(question.type));

  return [...preferred, ...backup].slice(0, 8);
}

function mergeQuestions(
  modelQuestions: InterviewQuestion[],
  fallbackQuestions: InterviewQuestion[],
): InterviewQuestion[] {
  const merged: InterviewQuestion[] = [];
  const seen = new Set<string>();

  for (const question of [
    ...modelQuestions.map((item, index) => ({
      ...item,
      id: item.id || `deepseek-${index + 1}`,
      source: item.source ?? "deepseek",
    })),
    ...fallbackQuestions,
  ]) {
    const key = normalizeText(question.question);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(question);
  }

  return interviewQuestionsSchema.parse(merged.slice(0, 12));
}

function buildQuestionFallback(
  questions: InterviewQuestion[],
  code: string,
  message: string,
): InterviewQuestionGenerationResult {
  return {
    fallbackCode: code,
    fallbackMessage: message,
    fallbackUsed: true,
    provider: "local_fallback",
    questions,
  };
}

function buildScoreFallback(
  score: InterviewAnswerScore,
  code: string,
  message: string,
): InterviewAnswerScoreResult {
  return {
    fallbackCode: code,
    fallbackMessage: message,
    fallbackUsed: true,
    provider: "local_fallback",
    score,
  };
}

function findQuestion(
  questions: InterviewQuestion[],
  questionId: string,
): InterviewQuestion | null {
  return questions.find((question) => question.id === questionId) ?? null;
}

function scoreAnswerLocally(
  context: InterviewCoachContext,
  input: InterviewAnswerCreateInput,
  question: InterviewQuestion | null,
): InterviewAnswerScore {
  const answer = input.answerText.trim();
  const normalized = normalizeText(answer);
  const charCount = Array.from(answer).length;
  const focusTerms = uniqueStrings([
    ...(question?.expectedSignals ?? []),
    ...(question ? [question.focus] : []),
    ...context.focusAreas,
    context.report?.role ?? "",
    context.report?.company ?? "",
  ]).filter(Boolean);
  const matchedFocusTerms = focusTerms.filter((term) =>
    normalized.includes(normalizeText(term)),
  );
  const structureSignals = countMatches(normalized, [
    "背景",
    "任务",
    "行动",
    "结果",
    "目标",
    "star",
    "situation",
    "task",
    "action",
    "result",
  ]);
  const evidenceSignals = countMatches(answer, [
    "%",
    "倍",
    "万",
    "千",
    "上线",
    "增长",
    "降低",
    "提升",
    "节省",
    "用户",
    "收入",
  ]) + (/\d/.test(answer) ? 1 : 0);
  const aiSignals = countMatches(normalized, [
    "rag",
    "agent",
    "llm",
    "模型",
    "向量",
    "评测",
    "推理",
    "召回",
    "微调",
    "embedding",
    "提示词",
    "数据",
  ]);
  const riskSignals = countMatches(normalized, [
    "风险",
    "短板",
    "边界",
    "权衡",
    "不确定",
    "追问",
    "验证",
    "复盘",
  ]);
  const lengthScore =
    charCount >= 500 ? 5 : charCount >= 320 ? 4 : charCount >= 180 ? 3 : 2;
  const structure = clampScore(lengthScore * 0.45 + Math.min(5, structureSignals) * 0.55);
  const evidence = clampScore(Math.min(5, evidenceSignals + (charCount >= 240 ? 1 : 0)));
  const jdRelevance = clampScore(
    matchedFocusTerms.length >= 5
      ? 5
      : matchedFocusTerms.length >= 3
        ? 4
        : matchedFocusTerms.length >= 1
          ? 3
          : 2,
  );
  const aiAccuracy = clampScore(Math.min(5, aiSignals + (question?.type === "technical" ? 1 : 0)));
  const riskHandling = clampScore(Math.min(5, riskSignals + (question?.type === "risk" ? 1 : 0)));
  const overall = roundToOne(
    (structure + evidence + jdRelevance + aiAccuracy + riskHandling) / 5,
  );
  const strengths = uniqueStrings([
    structure >= 4 ? "回答结构较清楚，便于面试官追问。" : "",
    evidence >= 4 ? "包含了可验证的结果或量化证据。" : "",
    jdRelevance >= 4 ? "能把回答和目标岗位需求连接起来。" : "",
    aiAccuracy >= 4 ? "AI 技术表达覆盖了岗位关注点。" : "",
  ]).slice(0, 4);
  const weaknesses = uniqueStrings([
    structure < 4 ? "STAR 层次还不够清晰，背景、任务、行动和结果需要拆开。" : "",
    evidence < 4 ? "证据偏泛，需要补充指标、规模、上线结果或业务影响。" : "",
    jdRelevance < 4 ? "和 JD 的连接不够强，需要点名岗位技术栈或业务场景。" : "",
    riskHandling < 4 ? "对短板、风险或边界的处理还可以更主动。" : "",
  ]).slice(0, 4);
  const suggestions = uniqueStrings([
    "按 STAR 重写一版：先用 1 句话交代背景，再说明你的任务、关键行动和结果。",
    "补 1-2 个数字，例如用户规模、延迟、准确率、成本、转化率或交付周期。",
    "把回答结尾收束到目标岗位：说明这段经历为什么能迁移到当前 JD。",
    riskHandling < 4
      ? "补一句风险处理：哪些地方你不确定，面试中会如何验证。"
      : "",
  ]).slice(0, 5);

  return interviewAnswerScoreSchema.parse({
    aiAccuracy,
    evidence,
    jdRelevance,
    overall,
    provider: "local_fallback",
    riskHandling,
    strengths: strengths.length > 0 ? strengths : ["回答已经覆盖了部分核心问题。"],
    structure,
    suggestions,
    summary:
      overall >= 4
        ? "回答整体可用，建议继续补充更具体的业务结果和岗位迁移表达。"
        : "回答还偏粗，需要增强 STAR 结构、具体证据和对目标 JD 的连接。",
    weaknesses: weaknesses.length > 0 ? weaknesses : ["可以继续压缩表达，让重点更聚焦。"],
  });
}

function firstNonEmpty(values: string[], fallback: string): string {
  return values.find((value) => value.trim().length > 0)?.trim() ?? fallback;
}

function countMatches(value: string, terms: string[]): number {
  return terms.reduce((count, term) => {
    return value.includes(normalizeText(term)) ? count + 1 : count;
  }, 0);
}

function clampScore(value: number): number {
  return roundToOne(Math.max(0, Math.min(5, value)));
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, "");
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    const key = normalizeText(normalized);

    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
