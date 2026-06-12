import {
  callDeepSeekJson,
  type DeepSeekCallOptions,
  type DeepSeekClientError,
} from "./deepseek-client";
import type {
  AiEcosystemLabel,
  ParsedAiTechStack,
  ParsedResumeOverview,
  ParsedResumeProfile,
} from "./resume-parser";
import { resumeProfileSchema } from "./schemas";
import type {
  AiEcosystemDomain,
  AiEcosystemProfile,
  AiEcosystemVector,
  JsonObject,
  JsonValue,
  ResumeContact,
  ResumeContent,
  ResumeEducation,
  ResumeExperience,
  ResumeMatchResult,
  ResumeProfile,
  ResumeProject,
  ResumeSkill,
  ResumeSkillCategory,
  ResumeSkillLevel,
} from "./types";

export type ResumeAiProvider = "deepseek_enhanced" | "local_fallback";

export type ResumeParseAiResult = {
  profile: ParsedResumeProfile;
  provider: ResumeAiProvider;
  fallbackUsed: boolean;
  deepSeekError?: DeepSeekClientError;
  model?: string;
};

export type ResumeOptimizeAiResult = {
  suggestions: string[];
  provider: ResumeAiProvider;
  fallbackUsed: boolean;
  deepSeekError?: DeepSeekClientError;
  model?: string;
};

type ResumeParseAiInput = {
  resumeText: string;
  localProfile: ParsedResumeProfile;
  targetRole?: string;
  targetJdText?: string;
  deepSeek?: DeepSeekCallOptions;
};

type ResumeOptimizeAiInput = {
  resumeText: string;
  jdText: string;
  resumeProfile: ResumeProfile;
  match: ResumeMatchResult;
  localSuggestions: string[];
  deepSeek?: DeepSeekCallOptions;
};

const MAX_PROMPT_RESUME_LENGTH = 18_000;
const MAX_PROMPT_JD_LENGTH = 10_000;
const MAX_PROMPT_CONTEXT_LENGTH = 12_000;
const PARSE_DEEPSEEK_TIMEOUT_MS = 90_000;
const PARSE_DEEPSEEK_MAX_TOKENS = 8_000;
const OPTIMIZE_DEEPSEEK_TIMEOUT_MS = 75_000;
const OPTIMIZE_DEEPSEEK_MAX_TOKENS = 6_000;

const DOMAIN_ORDER: AiEcosystemDomain[] = [
  "llm_application",
  "ai_infra",
  "algorithm_research",
  "embodied_ai",
  "ai_safety",
];

const DOMAIN_LABELS: Record<AiEcosystemDomain, AiEcosystemLabel> = {
  llm_application: "LLM应用层",
  ai_infra: "AI Infra",
  algorithm_research: "算法研究",
  embodied_ai: "具身智能",
  ai_safety: "AI安全",
};

const SKILL_CATEGORIES = new Set<ResumeSkillCategory>([
  "framework",
  "tool",
  "domain",
  "language",
  "infrastructure",
  "evaluation",
  "other",
]);

const SKILL_LEVELS = new Set<ResumeSkillLevel>([
  "beginner",
  "proficient",
  "expert",
]);

export async function enhanceResumeParseWithAi(
  input: ResumeParseAiInput,
): Promise<ResumeParseAiResult> {
  const result = await callDeepSeekJson<JsonObject>(
    buildResumeParseMessages(input),
    "ResumeParseEnhancement",
    {
      timeoutMs: PARSE_DEEPSEEK_TIMEOUT_MS,
      temperature: 0.1,
      maxTokens: PARSE_DEEPSEEK_MAX_TOKENS,
      ...input.deepSeek,
    },
  );

  if (!result.ok) {
    return parseFallback(input.localProfile, result.error);
  }

  try {
    const profile = applyResumeParseEnhancement(
      input.localProfile,
      result.data,
      input.resumeText,
    );

    return {
      profile,
      provider: "deepseek_enhanced",
      fallbackUsed: false,
      model: result.model,
    };
  } catch {
    return parseFallback(
      input.localProfile,
      invalidResponseError("DeepSeek resume parse enhancement had an invalid shape."),
    );
  }
}

export async function enhanceResumeOptimizationWithAi(
  input: ResumeOptimizeAiInput,
): Promise<ResumeOptimizeAiResult> {
  const fallbackSuggestions = normalizeSuggestions(input.localSuggestions);
  const result = await callDeepSeekJson<JsonObject>(
    buildResumeOptimizeMessages(input, fallbackSuggestions),
    "ResumeOptimizationSuggestions",
    {
      timeoutMs: OPTIMIZE_DEEPSEEK_TIMEOUT_MS,
      temperature: 0.2,
      maxTokens: OPTIMIZE_DEEPSEEK_MAX_TOKENS,
      ...input.deepSeek,
    },
  );

  if (!result.ok) {
    return optimizationFallback(fallbackSuggestions, result.error);
  }

  const aiSuggestions = extractOptimizationSuggestions(result.data);

  if (aiSuggestions.length < 3) {
    return optimizationFallback(
      fallbackSuggestions,
      invalidResponseError(
        "DeepSeek resume optimization enhancement did not include enough suggestions.",
      ),
    );
  }

  return {
    suggestions: mergeUniqueStrings([...aiSuggestions, ...fallbackSuggestions]).slice(
      0,
      5,
    ),
    provider: "deepseek_enhanced",
    fallbackUsed: false,
    model: result.model,
  };
}

function buildResumeParseMessages(input: ResumeParseAiInput) {
  return [
    {
      role: "system" as const,
      content:
        "你是简历结构化解析增强器。只能基于 localProfile 这个本地结构化画像做轻量校准，不要编造公司、项目、学校、技能、证书或量化结果。仅输出一个 JSON 对象。",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        task:
          "只基于 localProfile 补强关键画像字段，不要重新完整解析简历。项目、工作经历和教育经历由本地解析器保留，不要输出 projects、experiences 或 education。",
        outputRules:
          "只返回 JSON 对象，顶层字段只允许 content/ecosystemProfile/parsedProfile；不要 Markdown、解释、null 或外层包装。content 可含 name、yearsOfExperience、currentRole、summary、contact、skills。skills 最多 20 项，category 枚举为 framework/tool/domain/language/infrastructure/evaluation/other，level 枚举为 beginner/proficient/expert。ecosystemProfile.primaryDomain 枚举为 llm_application/ai_infra/algorithm_research/embodied_ai/ai_safety，vector 五项值均为 0 到 1。",
        allowedShape: {
          content: {
            name: "string optional",
            yearsOfExperience: "number optional",
            currentRole: "string optional",
            summary: "string optional",
            contact: "object optional",
            skills: [
              {
                name: "string",
                category:
                  "framework|tool|domain|language|infrastructure|evaluation|other",
                level: "beginner|proficient|expert optional",
                evidence: ["string optional"],
              },
            ],
          },
          ecosystemProfile: {
            primaryDomain:
              "llm_application|ai_infra|algorithm_research|embodied_ai|ai_safety",
            vector: {
              llm_application: "0..1",
              ai_infra: "0..1",
              algorithm_research: "0..1",
              embodied_ai: "0..1",
              ai_safety: "0..1",
            },
            evidence: ["string"],
          },
          parsedProfile: {
            currentRole: "string optional",
            targetDirection: "LLM应用层|AI Infra|算法研究|具身智能|AI安全 optional",
            preferredRoles: ["string optional"],
          },
        },
        targetRole: input.targetRole ?? undefined,
        targetJdText: truncate(input.targetJdText ?? "", 3_000),
        localProfile: compactParseProfile(input.localProfile),
      }),
    },
  ];
}

function buildResumeOptimizeMessages(
  input: ResumeOptimizeAiInput,
  localSuggestions: string[],
) {
  return [
    {
      role: "system" as const,
      content:
        "你是简历优化顾问。根据简历、目标 JD 和本地匹配结果给出可执行建议。不要编造候选人没有的经历，不要承诺虚构指标。仅输出一个 JSON 对象。",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        task: "生成 3 到 5 条针对目标 JD 的简历优化建议。",
        outputRules: [
          "只返回 { suggestions: string[] }，不要 Markdown、注释、解释文字或外层 data/result 包装。",
          "每条建议必须具体到简历区域、目标关键词或证据表达方式，不要写空泛建议。",
          "可以建议补充真实指标或验证项目，但不能伪造候选人没有提供的数据。",
          "每条建议不超过 180 个中文字符。",
        ],
        allowedShape: {
          suggestions: ["string"],
        },
        localContext: truncateJson(
          {
            resumeProfile: compactProfile(input.resumeProfile),
            matchSummary: {
              directionMatch: input.match.directionMatch,
              skillCoverage: input.match.skillCoverage,
              overallMatch: input.match.overallMatch,
              matchLevel: input.match.matchLevel,
            },
            matchedSkills: input.match.matchedSkills.slice(0, 10),
            quickGaps: input.match.quickGaps.slice(0, 8),
            longTermGaps: input.match.longTermGaps.slice(0, 5),
            localSuggestions,
          },
          MAX_PROMPT_CONTEXT_LENGTH,
        ),
        resumeText: truncate(input.resumeText, MAX_PROMPT_RESUME_LENGTH),
        jdText: truncate(input.jdText, MAX_PROMPT_JD_LENGTH),
      }),
    },
  ];
}

function applyResumeParseEnhancement(
  fallback: ParsedResumeProfile,
  data: JsonObject,
  resumeText: string,
): ParsedResumeProfile {
  const payload = unwrapResumePayload(data);

  if (Object.keys(payload).length === 0) {
    throw new Error("Resume parse enhancement was empty.");
  }

  const contentPayload =
    readObject(payload.content) ??
    readObject(payload.structuredResume) ??
    readObject(payload.resume) ??
    (hasResumeContentFields(payload) ? payload : null);
  const profilePayload =
    readObject(payload.ecosystemProfile) ??
    readObject(payload.ecosystem_profile);
  const overviewPayload =
    readObject(payload.parsedProfile) ?? readObject(payload.overview) ?? payload;

  const skills = mergeSkills(
    normalizeSkills(payload.skills),
    normalizeSkills(contentPayload?.skills),
    fallback.skills,
    fallback.content.skills,
  ).slice(0, 200);
  const projects = preferEnhancedList(
    normalizeProjects(contentPayload?.projects ?? payload.projects),
    fallback.content.projects,
  );
  const experiences = preferEnhancedList(
    normalizeExperiences(
      contentPayload?.experiences ??
        contentPayload?.workExperience ??
        payload.experiences,
    ),
    fallback.content.experiences,
  );
  const education = preferEnhancedList(
    normalizeEducation(contentPayload?.education ?? payload.education),
    fallback.content.education,
  );
  const contact = normalizeContact(
    readObject(contentPayload?.contact) ?? readObject(payload.contact),
    fallback.content.contact,
  );
  const yearsOfExperience =
    readExperienceYears(
      contentPayload?.yearsOfExperience ??
        contentPayload?.experienceYears ??
        overviewPayload?.yearsOfExperience,
    ) ?? fallback.content.yearsOfExperience;
  const content: ResumeContent = {
    name:
      readString(contentPayload?.name) ??
      readString(overviewPayload?.name) ??
      fallback.content.name,
    ...(yearsOfExperience === undefined ? {} : { yearsOfExperience }),
    ...optionalStringField(
      "currentRole",
      readString(contentPayload?.currentRole) ??
        readString(overviewPayload?.currentRole) ??
        fallback.content.currentRole,
    ),
    ...optionalStringField(
      "summary",
      readLongString(contentPayload?.summary) ??
        readLongString(overviewPayload?.summary) ??
        fallback.content.summary,
    ),
    ...(contact ? { contact } : {}),
    skills,
    projects,
    experiences,
    education,
    rawText: resumeText.trim(),
  };

  const ecosystem = normalizeEcosystemVector(
    readObject(payload.ecosystem) ?? readObject(profilePayload?.vector),
    fallback.ecosystem,
  );
  const ecosystemProfile: AiEcosystemProfile = {
    primaryDomain:
      readDomain(profilePayload?.primaryDomain) ??
      readDomain(payload.primaryDomain) ??
      pickPrimaryDomain(ecosystem),
    vector: ecosystem,
    evidence: mergeUniqueStrings([
      ...readStringArray(profilePayload?.evidence, 20),
      ...(fallback.ecosystemProfile?.evidence ?? []),
    ]).slice(0, 20),
  };
  const profile = resumeProfileSchema.parse({
    content,
    skills,
    ecosystem,
    ecosystemProfile,
  });
  const finalEcosystemProfile = profile.ecosystemProfile ?? ecosystemProfile;
  const overview = buildOverview(profile, finalEcosystemProfile, overviewPayload);

  return {
    ...profile,
    ...overview,
    projects: profile.content.projects,
    experiences: profile.content.experiences,
    parsedProfile: overview,
    aiTechStack: buildAiTechStack(profile.skills),
    ecosystemPosition: toLabelVector(profile.ecosystem),
    ecosystemProfile: finalEcosystemProfile,
  };
}

function unwrapResumePayload(data: JsonObject): JsonObject {
  for (const key of [
    "resumeProfile",
    "profile",
    "parsedResume",
    "enhancement",
    "result",
    "data",
  ]) {
    const wrapped = readObject(data[key]);

    if (
      wrapped &&
      (readObject(wrapped.content) ||
        readObject(wrapped.structuredResume) ||
        hasResumeContentFields(wrapped))
    ) {
      return wrapped;
    }
  }

  return data;
}

function hasResumeContentFields(value: JsonObject): boolean {
  return Boolean(
    value.name ||
      value.skills ||
      value.projects ||
      value.experiences ||
      value.education,
  );
}

function normalizeSkills(value: JsonValue | undefined): ResumeSkill[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const skills: ResumeSkill[] = [];

  for (const item of value) {
    if (typeof item === "string") {
      const name = readString(item);

      if (name) {
        skills.push({
          name,
          category: inferSkillCategory(name),
        });
      }

      continue;
    }

    const object = readObject(item);
    const name =
      readString(object?.name) ??
      readString(object?.skill) ??
      readString(object?.title);

    if (!name) {
      continue;
    }

    const evidence = readStringArray(
      object?.evidence ?? object?.examples ?? object?.excerpts,
      20,
    );
    const level = readSkillLevel(object?.level);

    skills.push({
      name,
      category:
        readSkillCategory(object?.category) ?? inferSkillCategory(name),
      ...(level ? { level } : {}),
      ...(evidence.length > 0 ? { evidence } : {}),
    });
  }

  return skills;
}

function mergeSkills(...lists: ResumeSkill[][]): ResumeSkill[] {
  const skills = new Map<string, ResumeSkill>();

  for (const skill of lists.flat()) {
    const key = normalizeKey(skill.name);
    const existing = skills.get(key);

    if (!existing) {
      skills.set(key, skill);
      continue;
    }

    const evidence = mergeUniqueStrings([
      ...(existing.evidence ?? []),
      ...(skill.evidence ?? []),
    ]).slice(0, 20);

    skills.set(key, {
      ...skill,
      ...existing,
      ...(existing.level || skill.level
        ? { level: existing.level ?? skill.level }
        : {}),
      ...(evidence.length > 0 ? { evidence } : {}),
    });
  }

  return [...skills.values()];
}

function normalizeProjects(value: JsonValue | undefined): ResumeProject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const projects: ResumeProject[] = [];

  for (const item of value) {
    const object = readObject(item);
    const name =
      readString(object?.name) ??
      readString(object?.project) ??
      readString(object?.title);

    if (!name) {
      continue;
    }

    const role = readString(object?.role);
    const domain = readDomain(object?.domain);
    const summary =
      readLongString(object?.summary) ??
      readLongString(object?.description) ??
      readLongString(object?.highlights);
    const impact =
      readLongString(object?.impact) ?? readLongString(object?.result);

    projects.push({
      name,
      ...(role ? { role } : {}),
      ...(domain ? { domain } : {}),
      techStack: readStringArray(
        object?.techStack ?? object?.tech_stack ?? object?.skills,
        80,
      ),
      ...(summary ? { summary } : {}),
      ...(impact ? { impact } : {}),
    });
  }

  return projects.slice(0, 80);
}

function normalizeExperiences(value: JsonValue | undefined): ResumeExperience[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const experiences: ResumeExperience[] = [];

  for (const item of value) {
    const object = readObject(item);
    const company =
      readString(object?.company) ??
      readString(object?.employer) ??
      readString(object?.organization);
    const role =
      readString(object?.role) ??
      readString(object?.position) ??
      readString(object?.title);

    if (!company || !role) {
      continue;
    }

    const period =
      readString(object?.period) ??
      readString(object?.duration) ??
      readString(object?.dateRange);
    const domain = readDomain(object?.domain);

    experiences.push({
      company,
      role,
      ...(period ? { period } : {}),
      ...(domain ? { domain } : {}),
      techStack: readStringArray(
        object?.techStack ?? object?.tech_stack ?? object?.skills,
        80,
      ),
      highlights: readStringArray(
        object?.highlights ??
          object?.responsibilities ??
          object?.bullets ??
          object?.summary,
        30,
      ),
    });
  }

  return experiences.slice(0, 80);
}

function normalizeEducation(value: JsonValue | undefined): ResumeEducation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const education: ResumeEducation[] = [];

  for (const item of value) {
    const object = readObject(item);
    const school =
      readString(object?.school) ??
      readString(object?.university) ??
      readString(object?.institution);

    if (!school) {
      continue;
    }

    education.push({
      school,
      ...optionalStringField(
        "major",
        readString(object?.major) ?? readString(object?.field),
      ),
      ...optionalStringField("degree", readString(object?.degree)),
      ...optionalStringField(
        "period",
        readString(object?.period) ?? readString(object?.dateRange),
      ),
    });
  }

  return education.slice(0, 20);
}

function normalizeContact(
  value: JsonObject | null,
  fallback: ResumeContact | undefined,
): ResumeContact | undefined {
  const contact: ResumeContact = {
    ...optionalStringField(
      "email",
      readEmail(value?.email) ?? fallback?.email,
    ),
    ...optionalStringField(
      "phone",
      readString(value?.phone, 40) ?? fallback?.phone,
    ),
    ...optionalStringField(
      "website",
      readHttpUrl(value?.website ?? value?.url) ?? fallback?.website,
    ),
    ...optionalStringField(
      "location",
      readString(value?.location) ?? fallback?.location,
    ),
  };

  return Object.keys(contact).length > 0 ? contact : undefined;
}

function normalizeEcosystemVector(
  value: JsonObject | null,
  fallback: AiEcosystemVector,
): AiEcosystemVector {
  const vector = { ...fallback };
  let hasValidScore = false;

  for (const domain of DOMAIN_ORDER) {
    const score = readScore(value?.[domain] ?? value?.[DOMAIN_LABELS[domain]]);

    if (score === undefined) {
      continue;
    }

    vector[domain] = score;
    hasValidScore = true;
  }

  return hasValidScore ? vector : fallback;
}

function buildOverview(
  profile: ResumeProfile,
  ecosystemProfile: AiEcosystemProfile,
  value: JsonObject | null,
): ParsedResumeOverview {
  const content = profile.content;
  const currentRole =
    readString(value?.currentRole) ??
    content.currentRole ??
    DOMAIN_LABELS[ecosystemProfile.primaryDomain];
  const preferredRoles = readStringArray(value?.preferredRoles, 10);

  return {
    name: readString(value?.name) ?? content.name,
    currentRole,
    targetDirection:
      readEcosystemLabel(value?.targetDirection) ??
      DOMAIN_LABELS[ecosystemProfile.primaryDomain],
    ...(content.yearsOfExperience === undefined
      ? {}
      : { yearsOfExperience: content.yearsOfExperience }),
    ...(content.contact?.location ? { location: content.contact.location } : {}),
    education: content.education,
    workExperience: content.experiences.map((experience) => ({
      company: experience.company,
      role: experience.role,
      ...(experience.period ? { period: experience.period } : {}),
      focus:
        experience.highlights[0] ??
        experience.techStack.slice(0, 5).join("、") ??
        "工作职责与项目交付",
    })),
    ...(content.summary ? { summary: content.summary } : {}),
    preferredRoles:
      preferredRoles.length > 0 ? preferredRoles : [currentRole],
  };
}

function buildAiTechStack(skills: ResumeSkill[]): ParsedAiTechStack {
  const grouped: ParsedAiTechStack = {
    languages: [],
    frameworks: [],
    tools: [],
    domains: [],
    infrastructure: [],
    evaluation: [],
    all: skills.map((skill) => skill.name),
  };

  for (const skill of skills) {
    switch (skill.category) {
      case "language":
        grouped.languages.push(skill.name);
        break;
      case "framework":
        grouped.frameworks.push(skill.name);
        break;
      case "domain":
        grouped.domains.push(skill.name);
        break;
      case "infrastructure":
        grouped.infrastructure.push(skill.name);
        break;
      case "evaluation":
        grouped.evaluation.push(skill.name);
        break;
      default:
        grouped.tools.push(skill.name);
    }
  }

  return {
    languages: mergeUniqueStrings(grouped.languages),
    frameworks: mergeUniqueStrings(grouped.frameworks),
    tools: mergeUniqueStrings(grouped.tools),
    domains: mergeUniqueStrings(grouped.domains),
    infrastructure: mergeUniqueStrings(grouped.infrastructure),
    evaluation: mergeUniqueStrings(grouped.evaluation),
    all: mergeUniqueStrings(grouped.all),
  };
}

function toLabelVector(
  vector: AiEcosystemVector,
): Record<AiEcosystemLabel, number> {
  return {
    LLM应用层: vector.llm_application,
    "AI Infra": vector.ai_infra,
    算法研究: vector.algorithm_research,
    具身智能: vector.embodied_ai,
    AI安全: vector.ai_safety,
  };
}

function extractOptimizationSuggestions(data: JsonObject): string[] {
  const payload = unwrapOptimizationPayload(data);

  return normalizeSuggestions(
    readSuggestionArray(
      payload.suggestions ??
        payload.optimizationSuggestions ??
        payload.recommendations ??
        payload.actions,
    ),
  ).slice(0, 5);
}

function unwrapOptimizationPayload(data: JsonObject): JsonObject {
  for (const key of ["optimization", "result", "data"]) {
    const wrapped = readObject(data[key]);

    if (wrapped) {
      return wrapped;
    }
  }

  return data;
}

function readSuggestionArray(value: JsonValue | undefined): string[] {
  if (typeof value === "string") {
    return value
      .split(/\r?\n+/)
      .map((item) => item.replace(/^\s*(?:[-*]|\d+[.、)])\s*/, ""));
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      const object = readObject(item);

      return (
        readString(object?.suggestion, 360) ??
        readString(object?.text, 360) ??
        readString(object?.content, 360) ??
        readString(object?.action, 360) ??
        readString(object?.advice, 360)
      );
    })
    .filter((item): item is string => Boolean(item));
}

function normalizeSuggestions(values: string[]): string[] {
  return mergeUniqueStrings(
    values
      .map((value) => readString(value, 360))
      .filter((value): value is string => Boolean(value)),
  ).slice(0, 5);
}

function parseFallback(
  profile: ParsedResumeProfile,
  deepSeekError: DeepSeekClientError,
): ResumeParseAiResult {
  return {
    profile,
    provider: "local_fallback",
    fallbackUsed: true,
    deepSeekError,
  };
}

function optimizationFallback(
  suggestions: string[],
  deepSeekError: DeepSeekClientError,
): ResumeOptimizeAiResult {
  return {
    suggestions,
    provider: "local_fallback",
    fallbackUsed: true,
    deepSeekError,
  };
}

function invalidResponseError(message: string): DeepSeekClientError {
  return {
    code: "invalid_response",
    message,
  };
}

function compactProfile(profile: ResumeProfile): JsonObject {
  return {
    content: {
      ...profile.content,
      rawText: undefined,
    },
    skills: profile.skills,
    ecosystem: profile.ecosystem,
    ...(profile.ecosystemProfile
      ? { ecosystemProfile: profile.ecosystemProfile }
      : {}),
  } as unknown as JsonObject;
}

function compactParseProfile(profile: ParsedResumeProfile): JsonObject {
  return {
    name: profile.content.name,
    yearsOfExperience: profile.content.yearsOfExperience,
    currentRole: profile.content.currentRole,
    summary: profile.content.summary,
    contact: profile.content.contact,
    skills: profile.content.skills.slice(0, 20),
    projects: profile.content.projects.slice(0, 5).map((project) => ({
      name: project.name,
      techStack: project.techStack.slice(0, 10),
    })),
    experiences: profile.content.experiences.slice(0, 5).map((experience) => ({
      company: experience.company,
      role: experience.role,
      period: experience.period,
    })),
    education: profile.content.education.slice(0, 3).map((education) => ({
      school: education.school,
      major: education.major,
      degree: education.degree,
    })),
    ecosystemProfile: profile.ecosystemProfile,
    preferredRoles: profile.parsedProfile.preferredRoles.slice(0, 5),
  } as unknown as JsonObject;
}

function preferEnhancedList<T>(enhanced: T[], fallback: T[]): T[] {
  return enhanced.length > 0 ? enhanced : fallback;
}

function readObject(value: JsonValue | undefined): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}

function readString(
  value: JsonValue | undefined,
  maxLength = 240,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return undefined;
  }

  return truncate(normalized, maxLength);
}

function readLongString(
  value: JsonValue | undefined,
  maxLength = 2_000,
): string | undefined {
  if (Array.isArray(value)) {
    return readStringArray(value, 10, 360).join("；") || undefined;
  }

  return readString(value, maxLength);
}

function readStringArray(
  value: JsonValue | undefined,
  limit = 30,
  maxLength = 240,
): string[] {
  if (typeof value === "string") {
    return [readString(value, maxLength)].filter(
      (item): item is string => Boolean(item),
    );
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return mergeUniqueStrings(
    value
      .map((item) => {
        if (typeof item === "string") {
          return readString(item, maxLength);
        }

        const object = readObject(item);

        return (
          readString(object?.name, maxLength) ??
          readString(object?.skill, maxLength) ??
          readString(object?.text, maxLength) ??
          readString(object?.content, maxLength) ??
          readString(object?.title, maxLength) ??
          readString(object?.summary, maxLength) ??
          readString(object?.suggestion, maxLength)
        );
      })
      .filter((item): item is string => Boolean(item)),
  ).slice(0, limit);
}

function readExperienceYears(value: JsonValue | undefined): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 80) {
    return undefined;
  }

  return Math.round(parsed * 10) / 10;
}

function readScore(value: JsonValue | undefined): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return undefined;
  }

  return Math.round(Math.min(1, parsed > 1 ? parsed / 100 : parsed) * 100) / 100;
}

function readDomain(value: JsonValue | undefined): AiEcosystemDomain | undefined {
  const normalized = readString(value);

  return DOMAIN_ORDER.find(
    (domain) =>
      normalized === domain || normalized === DOMAIN_LABELS[domain],
  );
}

function readEcosystemLabel(
  value: JsonValue | undefined,
): AiEcosystemLabel | undefined {
  const normalized = readString(value);

  return DOMAIN_ORDER.map((domain) => DOMAIN_LABELS[domain]).find(
    (label) => normalized === label,
  );
}

function readSkillCategory(
  value: JsonValue | undefined,
): ResumeSkillCategory | undefined {
  const normalized = readString(value)?.toLocaleLowerCase() as
    | ResumeSkillCategory
    | undefined;

  return normalized && SKILL_CATEGORIES.has(normalized) ? normalized : undefined;
}

function readSkillLevel(
  value: JsonValue | undefined,
): ResumeSkillLevel | undefined {
  const normalized = readString(value)?.toLocaleLowerCase() as
    | ResumeSkillLevel
    | undefined;

  return normalized && SKILL_LEVELS.has(normalized) ? normalized : undefined;
}

function readEmail(value: JsonValue | undefined): string | undefined {
  const email = readString(value, 254);

  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

function readHttpUrl(value: JsonValue | undefined): string | undefined {
  const raw = readString(value, 240);

  if (!raw) {
    return undefined;
  }

  try {
    const url = new URL(raw);

    return ["http:", "https:"].includes(url.protocol) ? raw : undefined;
  } catch {
    return undefined;
  }
}

function optionalStringField<TKey extends string>(
  key: TKey,
  value: string | undefined,
): Partial<Record<TKey, string>> {
  return value ? ({ [key]: value } as Record<TKey, string>) : {};
}

function inferSkillCategory(name: string): ResumeSkillCategory {
  if (/(Python|TypeScript|JavaScript|Java|Go|Shell|SQL|C\+\+|Rust)/i.test(name)) {
    return "language";
  }

  if (
    /(LangChain|LlamaIndex|PyTorch|TensorFlow|FastAPI|Next\.js|Node\.js|React|Transformers)/i.test(
      name,
    )
  ) {
    return "framework";
  }

  if (
    /(Milvus|pgvector|Kubernetes|Docker|Helm|Redis|PostgreSQL|vLLM|Triton|TensorRT|ONNX|CUDA|GPU|Ray|MLflow|MLOps)/i.test(
      name,
    )
  ) {
    return "infrastructure";
  }

  if (
    /(RAGAS|LangSmith|LangFuse|DeepEval|Phoenix|Prometheus|Grafana|OpenTelemetry|评测|观测)/i.test(
      name,
    )
  ) {
    return "evaluation";
  }

  if (
    /(RAG|Agent|Prompt|Function Calling|Embedding|rerank|KV Cache|SFT|RLHF|DPO|LoRA|量化|安全|红队|越狱)/i.test(
      name,
    )
  ) {
    return "domain";
  }

  return "other";
}

function pickPrimaryDomain(vector: AiEcosystemVector): AiEcosystemDomain {
  return DOMAIN_ORDER.slice().sort((left, right) => {
    const scoreDiff = vector[right] - vector[left];

    return scoreDiff || DOMAIN_ORDER.indexOf(left) - DOMAIN_ORDER.indexOf(right);
  })[0];
}

function mergeUniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = readString(value);

    if (!normalized) {
      continue;
    }

    const key = normalizeKey(normalized);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(normalized);
  }

  return output;
}

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, "");
}

function truncateJson(value: unknown, maxLength: number): string {
  return truncate(JSON.stringify(value), maxLength);
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}
