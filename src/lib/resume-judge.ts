import type {
  AtsCheckItem,
  AtsCheckResult,
  AtsCheckStatus,
  EvaluationReport,
  ReportDto,
  ResumeDto,
  ResumeExperience,
  ResumeMatchResult,
  ResumeOptimizationEffort,
  ResumeOptimizationMode,
  ResumeOptimizationResult,
  ResumeOptimizationSuggestion,
  ResumeProject,
  SkillGap,
} from "./types";

type ResumeJudgeTarget = {
  company?: string;
  jdText: string;
  report?: EvaluationReport;
  reportId: number | null;
  role?: string;
};

type ResumeJudgeInput = {
  effort: ResumeOptimizationEffort;
  match: ResumeMatchResult;
  mode: ResumeOptimizationMode;
  resume: ResumeDto;
  target: ResumeJudgeTarget;
};

type AtsCheckInput = {
  match: ResumeMatchResult;
  resume: ResumeDto;
  target: ResumeJudgeTarget;
};

const EFFORT_LIMITS: Record<ResumeOptimizationEffort, number> = {
  deep: 7,
  light: 3,
  standard: 5,
};

const SAFETY_NOTE =
  "仅基于原简历和目标 JD；缺失的指标、公司、项目、学历不得补写，需由用户用真实经历确认。";

const GUARDRAILS = [
  "不自动覆盖原简历。",
  "不编造公司、项目、学历、证书或量化结果。",
  "未在原简历出现的能力只能作为待验证补充，不能写成已掌握。",
  "所有建议都需要用户查看后再复制、采纳或拒绝。",
];

export function buildResumeJudgeResult(
  input: ResumeJudgeInput,
): ResumeOptimizationResult {
  const atsCheck =
    input.mode === "ats_check" ? buildAtsCheckResult(input) : undefined;
  const suggestions = atsCheck
    ? buildAtsSuggestions(input, atsCheck)
    : buildModeSuggestions(input);

  return {
    generatedAt: new Date().toISOString(),
    mode: input.mode,
    effort: input.effort,
    resume: {
      id: input.resume.id,
      name: input.resume.name,
      updatedAt: input.resume.updatedAt,
    },
    target: {
      reportId: input.target.reportId,
      ...(input.target.company ? { company: input.target.company } : {}),
      ...(input.target.role ? { role: input.target.role } : {}),
      jdPreview: shorten(input.target.jdText, 800),
    },
    matchSummary: {
      directionMatch: input.match.directionMatch,
      skillCoverage: input.match.skillCoverage,
      overallMatch: input.match.overallMatch,
      matchLevel: input.match.matchLevel,
    },
    suggestions: suggestions.slice(0, EFFORT_LIMITS[input.effort]),
    ...(atsCheck ? { atsCheck } : {}),
    guardrails: GUARDRAILS,
    provider: "local_fallback",
    fallbackUsed: true,
  };
}

export function buildAtsCheckResult(input: AtsCheckInput): AtsCheckResult {
  const resumeText = buildResumeText(input.resume);
  const covered = uniqueStrings(input.match.matchedSkills.map((skill) => skill.skill));
  const missing = uniqueStrings([
    ...input.match.quickGaps.map((gap) => gap.skill),
    ...input.match.longTermGaps.map((gap) => gap.skill),
  ]);
  const coverageTotal = covered.length + missing.length;
  const coverageRate =
    coverageTotal === 0 ? 0 : Math.round((covered.length / coverageTotal) * 100);
  const checks: AtsCheckItem[] = [
    buildKeywordCoverageCheck(coverageRate, covered, missing),
    buildContactCheck(input.resume),
    buildSectionCheck(input.resume, resumeText),
    buildFormatCheck(resumeText),
    buildMetricsCheck(input.resume, resumeText),
    buildTargetFocusCheck(input.resume, input.match, input.target),
  ];
  const warningCount = checks.filter((check) => check.status === "warning").length;
  const failCount = checks.filter((check) => check.status === "fail").length;
  const score = clampScore(100 - failCount * 18 - warningCount * 8 - missing.length * 2);
  const suggestions = checks
    .filter((check) => check.status !== "pass")
    .map((check) => check.fix)
    .filter((fix): fix is string => Boolean(fix))
    .slice(0, 8);

  return {
    score,
    summary:
      score >= 80
        ? "ATS 基础兼容性较好，重点补齐少量 JD 关键词和真实量化证据。"
        : score >= 60
          ? "ATS 兼容性中等，建议先处理关键词覆盖、章节结构和可检索证据。"
          : "ATS 兼容性偏弱，建议先整理结构化章节，再补充与 JD 直接相关的真实证据。",
    keywordCoverage: {
      covered,
      missing,
      coverageRate,
    },
    checks,
    suggestions:
      suggestions.length > 0
        ? suggestions
        : ["保持当前结构，针对目标 JD 继续前置最相关项目和真实结果。"],
    generatedAt: new Date().toISOString(),
  };
}

export function toJudgeTarget(
  input: { jdText?: string; report?: ReportDto | null },
): ResumeJudgeTarget {
  if (input.report) {
    return {
      company: input.report.company,
      jdText: input.report.jdText,
      report: input.report.report,
      reportId: input.report.id,
      role: input.report.role,
    };
  }

  return {
    jdText: input.jdText ?? "",
    reportId: null,
  };
}

function buildModeSuggestions(
  input: ResumeJudgeInput,
): ResumeOptimizationSuggestion[] {
  switch (input.mode) {
    case "full_tailor":
      return buildFullTailorSuggestions(input);
    case "keyword_alignment":
      return buildKeywordAlignmentSuggestions(input);
    case "quantify_impact":
      return buildQuantifyImpactSuggestions(input);
    case "star_rewrite":
      return buildStarRewriteSuggestions(input);
    case "ats_check":
      return buildAtsSuggestions(input, buildAtsCheckResult(input));
  }
}

function buildKeywordAlignmentSuggestions(
  input: ResumeJudgeInput,
): ResumeOptimizationSuggestion[] {
  const keywords = collectTargetKeywords(input);
  const covered = input.match.matchedSkills.slice(0, 5).map((skill) => skill.skill);
  const gaps = collectGaps(input.match).slice(0, 5);
  const project = input.resume.content.projects[0];
  const skillsEvidence = collectResumeSkillNames(input.resume).slice(0, 12);

  return compactSuggestions([
    suggestion(input, 1, {
      title: "重排核心技能顺序",
      targetSection: "核心技能",
      originalEvidence: skillsEvidence.length
        ? `原技能清单：${skillsEvidence.join("、")}`
        : "原简历未识别到稳定技能清单。",
      jdEvidence: keywords.length ? `JD 关键词：${keywords.slice(0, 8).join("、")}` : undefined,
      recommendation:
        "把原简历中已经出现、且目标 JD 明确需要的技能前置；未在原简历出现的词不要直接写入“熟练掌握”。",
      rewriteDraft: `核心技能可按 JD 顺序改为：${covered.length ? covered.join(" / ") : "从原简历中挑选已验证技能"}${
        gaps.length ? `；待补证据：${gaps.map((gap) => gap.skill).join(" / ")}` : ""
      }。`,
      copyText: `核心技能：${covered.length ? covered.join(" / ") : "请放入原简历已有技能"}${
        gaps.length ? `；${gaps.map((gap) => gap.skill).join(" / ")} 仅在已有真实项目证据后补入。` : ""
      }`,
      rationale: "ATS 和招聘方通常先扫核心关键词，但关键词必须能被项目或经历证据支撑。",
      tags: ["关键词", "技能区"],
    }),
    suggestion(input, 2, {
      title: "把已匹配技能落到项目证据",
      targetSection: "项目经历",
      originalEvidence: project
        ? formatProjectEvidence(project)
        : "原简历未识别到可用项目经历。",
      jdEvidence: firstEvidence(input.match.matchedSkills.map((skill) => skill.jdEvidence)),
      recommendation:
        "把已匹配技能写进最相关项目的职责、动作和结果中，不要只停留在技能列表。",
      rewriteDraft: project
        ? `${project.name}：围绕 ${covered.slice(0, 3).join("、") || "目标 JD 关键词"}，补充你负责的模块、输入输出和真实交付结果。`
        : undefined,
      copyText: project
        ? `${project.name}：基于原简历已有技术栈 ${project.techStack.slice(0, 6).join("、") || "相关技术"}，补充与 ${covered.slice(0, 3).join("、") || "目标岗位"} 对齐的职责、动作和真实结果。`
        : "请先在原简历中确认一个真实项目，再补充与目标 JD 关键词对应的职责、动作和结果。",
      rationale: "关键词只有落到具体项目，才更容易通过人工筛选并降低“堆词”感。",
      tags: ["项目证据", "JD 对齐"],
    }),
    suggestion(input, 3, {
      title: "缺口关键词改为待验证补充",
      targetSection: "补充计划",
      originalEvidence: gaps.length
        ? `当前缺口：${gaps.map((gap) => gap.skill).join("、")}`
        : "当前未识别到明显快速缺口。",
      jdEvidence: gaps.map((gap) => gap.evidence).filter(Boolean).slice(0, 2).join("；") || undefined,
      recommendation:
        "对 JD 要求但原简历没有证据的能力，写成补充计划或学习验证，不要写成已有经验。",
      copyText: gaps.length
        ? `待补充验证：${gaps.map((gap) => gap.skill).join("、")}。仅在完成真实项目、实验或上线验证后写入核心经历。`
        : "当前关键词覆盖较完整，继续检查每个关键词是否都有项目证据支撑。",
      rationale: "这样既保留求职行动项，也避免生成虚假经历。",
      tags: ["缺口", "防编造"],
    }),
  ]);
}

function buildStarRewriteSuggestions(
  input: ResumeJudgeInput,
): ResumeOptimizationSuggestion[] {
  const project = input.resume.content.projects[0];
  const experience = input.resume.content.experiences[0];
  const covered = input.match.matchedSkills.slice(0, 4).map((skill) => skill.skill);

  return compactSuggestions([
    suggestion(input, 1, {
      title: "项目经历改成 STAR 结构",
      targetSection: "项目经历",
      originalEvidence: project
        ? formatProjectEvidence(project)
        : "原简历未识别到可重写项目。",
      jdEvidence: firstEvidence(input.match.matchedSkills.map((skill) => skill.jdEvidence)),
      recommendation:
        "用 Situation / Task / Action / Result 重写一条最相关项目，但 Result 只能使用已有或可核验结果。",
      rewriteDraft: project ? buildProjectStarDraft(project, covered) : undefined,
      copyText: project
        ? buildProjectStarDraft(project, covered)
        : "请先选择原简历中的真实项目，再按 STAR 写清场景、任务、行动和可核验结果。",
      rationale: "STAR 能让招聘方快速判断你在真实项目中的职责边界和产出。",
      tags: ["STAR", "项目"],
    }),
    suggestion(input, 2, {
      title: "工作经历补职责边界",
      targetSection: "工作经历",
      originalEvidence: experience
        ? formatExperienceEvidence(experience)
        : "原简历未识别到可重写工作经历。",
      jdEvidence: firstEvidence(collectGaps(input.match).map((gap) => gap.evidence)),
      recommendation:
        "把岗位职责写成“场景-负责范围-动作-结果”，避免只写泛泛职责。",
      rewriteDraft: experience ? buildExperienceStarDraft(experience, covered) : undefined,
      copyText: experience
        ? buildExperienceStarDraft(experience, covered)
        : "请先确认一段真实工作经历，再写清业务场景、负责范围、具体动作和可核验结果。",
      rationale: "职责边界越清楚，越能减少面试追问时的可信度风险。",
      tags: ["STAR", "职责"],
    }),
  ]);
}

function buildQuantifyImpactSuggestions(
  input: ResumeJudgeInput,
): ResumeOptimizationSuggestion[] {
  const project = input.resume.content.projects[0];
  const experience = input.resume.content.experiences[0];
  const resumeText = buildResumeText(input.resume);
  const hasMetrics = containsMetric(resumeText);

  return compactSuggestions([
    suggestion(input, 1, {
      title: hasMetrics ? "前置已有量化结果" : "补充真实量化字段",
      targetSection: "项目/工作结果",
      originalEvidence: project
        ? formatProjectEvidence(project)
        : experience
          ? formatExperienceEvidence(experience)
          : "原简历未识别到项目或工作结果。",
      jdEvidence: firstEvidence(input.match.matchedSkills.map((skill) => skill.jdEvidence)),
      recommendation: hasMetrics
        ? "把原简历中已有的真实数字前移到项目第一句，保留原始口径。"
        : "先补真实指标口径，例如用户量、调用量、准确率、成本、延迟、转化率；没有数据时不要估算。",
      rewriteDraft: hasMetrics
        ? "将已有数字写到句首：在[原项目/经历]中，围绕[JD 关键词]实现[原简历已有真实指标]。"
        : "可补充字段：指标名称 / 统计周期 / 基线 / 结果 / 你的贡献。没有真实数字时写“完成验证/上线/交付物”，不要填写估算值。",
      copyText: hasMetrics
        ? "把原简历已有真实指标前置到项目第一句，并说明统计口径与个人贡献。"
        : "待补真实指标：指标名称、统计周期、基线、结果、个人贡献。未核实前不要写百分比或规模数字。",
      rationale: "量化结果能提升说服力，但虚假数字会在背调或面试追问中形成风险。",
      tags: ["量化", "真实指标"],
    }),
    suggestion(input, 2, {
      title: "为缺口技能设计可验证结果",
      targetSection: "能力补证",
      originalEvidence: collectGaps(input.match).length
        ? `缺口：${collectGaps(input.match).slice(0, 4).map((gap) => gap.skill).join("、")}`
        : "当前未识别到明显技能缺口。",
      jdEvidence: firstEvidence(collectGaps(input.match).map((gap) => gap.evidence)),
      recommendation:
        "如果要补缺口技能，先用小项目或实验形成真实结果，再决定是否写进简历。",
      copyText: "补证路径：选择一个 JD 缺口技能，完成小型验证项目，记录输入数据、技术方案、评测指标和真实结果后再写入简历。",
      rationale: "这能把“不会的关键词”转为可执行行动，而不是直接编造成经历。",
      tags: ["补证", "缺口"],
    }),
  ]);
}

function buildFullTailorSuggestions(
  input: ResumeJudgeInput,
): ResumeOptimizationSuggestion[] {
  return compactSuggestions([
    ...buildKeywordAlignmentSuggestions(input).slice(0, 2),
    ...buildStarRewriteSuggestions(input).slice(0, 2),
    ...buildQuantifyImpactSuggestions(input).slice(0, 2),
  ]).map((item, index) => ({
    ...item,
    id: buildSuggestionId(input, "full_tailor", index + 1),
    mode: "full_tailor",
  }));
}

function buildAtsSuggestions(
  input: ResumeJudgeInput,
  atsCheck: AtsCheckResult,
): ResumeOptimizationSuggestion[] {
  return compactSuggestions(
    atsCheck.checks
      .filter((check) => check.status !== "pass")
      .slice(0, EFFORT_LIMITS[input.effort])
      .map((check, index) =>
        suggestion(input, index + 1, {
          title: check.title,
          targetSection: "ATS 检查",
          originalEvidence: check.detail,
          recommendation: check.fix ?? check.detail,
          copyText: check.fix ?? check.detail,
          rationale: "ATS 检查只处理可检索结构、关键词和格式兼容性，不改写事实。",
          tags: ["ATS", statusLabel(check.status)],
        }),
      ),
  );
}

function suggestion(
  input: ResumeJudgeInput,
  index: number,
  data: Omit<
    ResumeOptimizationSuggestion,
    "id" | "mode" | "safetyNote"
  >,
): ResumeOptimizationSuggestion {
  const { jdEvidence, ...rest } = data;

  return {
    id: buildSuggestionId(input, input.mode, index),
    mode: input.mode,
    safetyNote: SAFETY_NOTE,
    jdEvidence: joinEvidence([buildTargetContextEvidence(input), jdEvidence]),
    ...rest,
  };
}

function buildSuggestionId(
  input: ResumeJudgeInput,
  mode: ResumeOptimizationMode,
  index: number,
): string {
  const targetKey =
    input.target.reportId !== null
      ? `report-${input.target.reportId}`
      : `jd-${hashText(input.target.jdText)}`;

  return `${mode}-resume-${input.resume.id}-${targetKey}-${index}`;
}

function buildTargetContextEvidence(input: ResumeJudgeInput): string {
  const targetLabel =
    [input.target.company, input.target.role].filter(Boolean).join(" · ") ||
    shorten(input.target.jdText, 80);
  const keywords = collectTargetKeywords(input).slice(0, 6);

  return keywords.length
    ? `当前目标：${targetLabel}；目标关键词：${keywords.join("、")}`
    : `当前目标：${targetLabel}`;
}

function joinEvidence(values: Array<string | undefined>): string {
  return shorten(values.filter(Boolean).join("；"), 2_000);
}

function hashText(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function compactSuggestions(
  suggestions: ResumeOptimizationSuggestion[],
): ResumeOptimizationSuggestion[] {
  return suggestions.filter((item) => item.copyText.trim().length > 0);
}

function buildKeywordCoverageCheck(
  coverageRate: number,
  covered: string[],
  missing: string[],
): AtsCheckItem {
  const status: AtsCheckStatus =
    coverageRate >= 70 ? "pass" : coverageRate >= 40 ? "warning" : "fail";

  return {
    id: "keyword_coverage",
    title: "JD 关键词覆盖",
    status,
    detail: `已覆盖 ${covered.length} 个关键词，缺少 ${missing.length} 个关键词，覆盖率 ${coverageRate}%。`,
    ...(status === "pass"
      ? {}
      : {
          fix: missing.length
            ? `优先补充真实证据支撑的关键词：${missing.slice(0, 8).join("、")}。没有项目证据的词不要写成已掌握。`
            : "继续确认每个关键词是否都有项目或经历证据。",
        }),
  };
}

function buildContactCheck(resume: ResumeDto): AtsCheckItem {
  const contact = resume.content.contact;
  const hasContact = Boolean(contact?.email || contact?.phone);

  return {
    id: "contact",
    title: "联系方式可检索",
    status: hasContact ? "pass" : "warning",
    detail: hasContact
      ? "原简历已包含邮箱或电话。"
      : "原简历未识别到邮箱或电话，ATS 和招聘方可能无法快速联系。",
    ...(hasContact
      ? {}
      : { fix: "在页眉或基础信息区补充真实邮箱或电话，避免放在图片中。" }),
  };
}

function buildSectionCheck(resume: ResumeDto, resumeText: string): AtsCheckItem {
  const sectionCount = [
    resume.content.skills.length > 0 || /技能|技术栈|核心能力/.test(resumeText),
    resume.content.projects.length > 0 || /项目经历|项目经验/.test(resumeText),
    resume.content.experiences.length > 0 || /工作经历|工作经验|实习经历/.test(resumeText),
    resume.content.education.length > 0 || /教育背景|教育经历/.test(resumeText),
  ].filter(Boolean).length;
  const status: AtsCheckStatus =
    sectionCount >= 3 ? "pass" : sectionCount >= 2 ? "warning" : "fail";

  return {
    id: "sections",
    title: "标准章节结构",
    status,
    detail: `已识别 ${sectionCount} 类标准章节。`,
    ...(status === "pass"
      ? {}
      : {
          fix: "使用清晰文本标题：核心技能、项目经历、工作经历、教育背景；避免把核心内容放入图片或复杂表格。",
        }),
  };
}

function buildFormatCheck(resumeText: string): AtsCheckItem {
  const pipeCount = (resumeText.match(/\|/g) ?? []).length;
  const longLineCount = resumeText
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 180).length;
  const hasFormatRisk = pipeCount > 20 || longLineCount > 5;

  return {
    id: "format",
    title: "ATS 文本格式",
    status: hasFormatRisk ? "warning" : "pass",
    detail: hasFormatRisk
      ? `检测到 ${pipeCount} 个表格分隔符、${longLineCount} 行超长文本，可能影响解析。`
      : "未发现明显表格化或超长行风险。",
    ...(hasFormatRisk
      ? { fix: "将关键经历改为普通文本项目符号，减少复杂表格、合并单元格和超长行。" }
      : {}),
  };
}

function buildMetricsCheck(resume: ResumeDto, resumeText: string): AtsCheckItem {
  const hasMetrics =
    containsMetric(resumeText) ||
    resume.content.projects.some((project) => containsMetric(project.impact ?? "")) ||
    resume.content.experiences.some((experience) =>
      experience.highlights.some(containsMetric),
    );

  return {
    id: "metrics",
    title: "真实量化结果",
    status: hasMetrics ? "pass" : "warning",
    detail: hasMetrics
      ? "原简历已包含可检索数字或结果表达。"
      : "原简历缺少明显量化结果，项目影响力不够可检索。",
    ...(hasMetrics
      ? {}
      : {
          fix: "补充真实可核验指标，例如调用量、准确率、成本、延迟、用户规模或评测结果；没有数据时不要估算。",
        }),
  };
}

function buildTargetFocusCheck(
  resume: ResumeDto,
  match: ResumeMatchResult,
  target: ResumeJudgeTarget,
): AtsCheckItem {
  const focusText = normalizeWhitespace(
    [resume.content.currentRole, resume.content.summary].filter(Boolean).join(" "),
  );
  const keywords = collectTargetKeywords({ match, target });
  const hasFocus = keywords.some((keyword) =>
    focusText.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()),
  );
  const status: AtsCheckStatus =
    hasFocus || match.overallMatch >= 0.7 ? "pass" : "warning";

  return {
    id: "target_focus",
    title: "目标岗位聚焦",
    status,
    detail: status === "pass"
      ? "摘要或匹配结果已体现目标岗位方向。"
      : `摘要中没有明显出现目标岗位关键词${target.role ? `「${target.role}」` : ""}。`,
    ...(status === "pass"
      ? {}
      : { fix: "在摘要第一句写明目标方向和原简历已有的最相关项目，不加入未验证经历。" }),
  };
}

function collectTargetKeywords(input: {
  match: ResumeMatchResult;
  target: ResumeJudgeTarget;
}): string[] {
  return uniqueStrings([
    ...(input.target.report?.job.techStack ?? []),
    ...(input.target.report?.job.keywords ?? []),
    ...input.match.matchedSkills.map((skill) => skill.skill),
    ...collectGaps(input.match).map((gap) => gap.skill),
  ]).slice(0, 20);
}

function collectGaps(match: ResumeMatchResult): SkillGap[] {
  return [...match.quickGaps, ...match.longTermGaps];
}

function collectResumeSkillNames(resume: ResumeDto): string[] {
  return uniqueStrings([
    ...resume.skills.map((skill) => skill.name),
    ...resume.content.skills.map((skill) => skill.name),
  ]);
}

function buildProjectStarDraft(project: ResumeProject, skills: string[]): string {
  const skillText = skills.slice(0, 4).join("、") || project.techStack.slice(0, 4).join("、") || "目标岗位相关技术";
  const resultText = project.impact
    ? `结果：${project.impact}`
    : "结果：如有真实上线、评测或业务指标，请补入原始口径；没有数字时写清交付物和验证方式。";

  return `S：${project.name} 面向 ${skillText} 相关场景；T：负责${project.role ?? "相关模块"}；A：基于原简历已有技术栈 ${project.techStack.slice(0, 6).join("、") || "相关技术"} 展开方案、实现和验证；${resultText}`;
}

function buildExperienceStarDraft(
  experience: ResumeExperience,
  skills: string[],
): string {
  const highlight = experience.highlights[0] ?? "原简历已有职责";
  const skillText = skills.slice(0, 4).join("、") || experience.techStack.slice(0, 4).join("、") || "目标岗位相关能力";

  return `S：${experience.company} 的 ${experience.role} 场景；T：围绕 ${skillText} 明确负责范围；A：基于原经历「${shorten(highlight, 180)}」补充关键动作；R：只填写真实可核验结果，没有数据时写交付物、上线范围或验证结论。`;
}

function formatProjectEvidence(project: ResumeProject): string {
  return shorten(
    [
      `项目「${project.name}」`,
      project.role ? `角色：${project.role}` : undefined,
      project.techStack.length ? `技术栈：${project.techStack.join("、")}` : undefined,
      project.summary,
      project.impact,
    ]
      .filter(Boolean)
      .join("；"),
    1_000,
  );
}

function formatExperienceEvidence(experience: ResumeExperience): string {
  return shorten(
    [
      `经历「${experience.company} · ${experience.role}」`,
      experience.period,
      experience.techStack.length ? `技术栈：${experience.techStack.join("、")}` : undefined,
      experience.highlights.join("；"),
    ]
      .filter(Boolean)
      .join("；"),
    1_000,
  );
}

function buildResumeText(resume: ResumeDto): string {
  return normalizeWhitespace(
    [
      resume.content.rawText,
      resume.content.name,
      resume.content.currentRole,
      resume.content.summary,
      ...collectResumeSkillNames(resume),
      ...resume.content.projects.map(formatProjectEvidence),
      ...resume.content.experiences.map(formatExperienceEvidence),
      ...resume.content.education.map((education) =>
        [education.school, education.major, education.degree].filter(Boolean).join(" "),
      ),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

function firstEvidence(values: Array<string | undefined>): string | undefined {
  return values.find((value) => value && value.trim().length > 0);
}

function containsMetric(value: string): boolean {
  return /(?:\d+(?:\.\d+)?\s*(?:%|k|K|w|W|万|千|百|ms|s|秒|分钟|小时|天|QPS|TPS|P95|P99|人|次|条|个|元|￥|\+)|提升|降低|减少|增长|覆盖|上线|准确率|召回率|延迟|成本)/i.test(
    value,
  );
}

function statusLabel(status: AtsCheckStatus): string {
  if (status === "pass") {
    return "通过";
  }

  if (status === "warning") {
    return "需检查";
  }

  return "需修复";
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = normalizeWhitespace(value ?? "");

    if (!normalized) {
      continue;
    }

    const key = normalized.toLocaleLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(normalized);
  }

  return output;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function shorten(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value);

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}
