import {
  callDeepSeekJson,
  type DeepSeekCallOptions,
  type DeepSeekClientError,
} from "./deepseek-client";
import { scanRisks } from "./risk-engine";
import {
  applySemanticRiskLayer,
  type SemanticRiskWarning,
} from "./semantic-risk-engine";
import {
  TRADITIONAL_DEV_STACK_KEYWORDS,
  TRUE_AI_TECH_STACK_WHITELIST,
} from "./risk-rules";
import { createReport } from "./server-db";
import { evaluationReportSchema, reportCreateInputSchema } from "./schemas";
import type {
  AiEcosystemDomain,
  AiEcosystemProfile,
  EvaluationDimension,
  EvaluationDimensionScore,
  EvaluationDimensionScores,
  EvaluationReport,
  EvaluationReportSection,
  JobExtract,
  JsonObject,
  JsonValue,
  RiskLevel,
  RiskScanResult,
  SalaryPeriod,
  SalaryRange,
} from "./types";

export type EvaluateJobOptions = {
  company?: string;
  role?: string;
  sourceUrl?: string;
  resumeText?: string;
  generatedAt?: Date;
  useDeepSeek?: boolean | "auto";
  deepSeek?: DeepSeekCallOptions;
  onDeepSeekFailure?: (error: DeepSeekClientError) => void;
  onSemanticRiskWarning?: (warning: SemanticRiskWarning) => void;
  semanticRisk?: {
    enabled?: boolean;
    expectedRiskSignals?: unknown[];
    force?: boolean;
  };
};

export type EvaluateAndSaveReportResult = {
  id: number | null;
  report: EvaluationReport;
  deepSeekError?: DeepSeekClientError;
  semanticRiskWarnings?: SemanticRiskWarning[];
  saveError?: {
    code: "REPORT_SAVE_FAILED";
    message: string;
  };
};

type DimensionMeta = {
  title: string;
  weight: number;
};

type DomainAnalysis = {
  profile: AiEcosystemProfile;
  matchedByDomain: Record<AiEcosystemDomain, string[]>;
  trueAiTerms: string[];
  traditionalTerms: string[];
};

type LocalEvaluationContext = {
  jdText: string;
  normalizedText: string;
  job: JobExtract;
  domain: DomainAnalysis;
  risks: RiskScanResult;
  hasAiTitle: boolean;
  productionSignals: string[];
  growthSignals: string[];
  experienceSignals: string[];
};

type SectionEnhancement = {
  summary?: string;
  evidence?: string[];
  suggestions?: string[];
};

type DeepSeekEnhancement = {
  extract?: {
    company?: string;
    role?: string;
    salaryRange?: string;
    location?: string;
    aiDirection?: string;
    techStack?: string[];
    experienceLevel?: string;
    keywords?: string[];
  };
  dimensions?: Partial<Record<EvaluationDimension, SectionEnhancement>>;
  recommendation?: string;
};

const DIMENSION_META: Record<EvaluationDimension, DimensionMeta> = {
  A: { title: "岗位定位", weight: 15 },
  B: { title: "技术栈匹配", weight: 25 },
  C: { title: "经验要求", weight: 20 },
  D: { title: "成长价值", weight: 15 },
  E: { title: "薪酬竞争力", weight: 10 },
  F: { title: "风险合规", weight: 15 },
};

const DIMENSIONS: EvaluationDimension[] = ["A", "B", "C", "D", "E", "F"];

const DOMAIN_LABELS: Record<AiEcosystemDomain, string> = {
  llm_application: "LLM应用层",
  ai_infra: "AI Infra",
  algorithm_research: "算法研究",
  embodied_ai: "具身智能",
  ai_safety: "AI安全",
};

const DOMAIN_SIGNAL_TERMS: Record<AiEcosystemDomain, string[]> = {
  llm_application: [
    "LLM",
    "大模型应用",
    "知识库",
    "智能客服",
    "检索增强",
    "多轮对话",
    "工具调用",
    "提示词",
  ],
  ai_infra: [
    "推理平台",
    "模型服务",
    "GPU",
    "多租户",
    "灰度",
    "回滚",
    "监控告警",
    "成本看板",
  ],
  algorithm_research: [
    "算法",
    "训练",
    "微调",
    "偏好数据",
    "论文",
    "实验",
    "评测集",
    "数据配比",
  ],
  embodied_ai: [
    "具身智能",
    "机器人",
    "机械臂",
    "仿真",
    "导航",
    "控制",
    "轨迹规划",
  ],
  ai_safety: [
    "AI 安全",
    "大模型安全",
    "安全评测",
    "越狱",
    "红队",
    "对抗样本",
    "模型对齐",
  ],
};

const GENERAL_TECH_STACK_KEYWORDS = [
  "Python",
  "TypeScript",
  "JavaScript",
  "FastAPI",
  "Node.js",
  "Redis",
  "SQL",
  "MySQL",
  "PostgreSQL",
  "pandas",
  "Linux",
  "Kubernetes",
  "Prometheus",
  "Grafana",
  "Java",
  "Spring Boot",
  "Spring Cloud",
  "MyBatis",
  "RabbitMQ",
  "Vue",
  "Element UI",
  "ChatGPT",
  "DeepSeek",
  "Qwen",
  "Llama",
  "OpenAI",
];

const PRODUCTION_SIGNAL_TERMS = [
  "上线",
  "线上",
  "灰度",
  "发布",
  "回滚",
  "监控",
  "告警",
  "A/B",
  "延迟",
  "成本",
  "召回率",
  "幻觉率",
  "稳定性",
  "高并发",
  "交付",
];

const EXPERIENCE_SIGNAL_TERMS = [
  "0 到 1",
  "0-1",
  "落地",
  "上线经验",
  "真实训练",
  "开源贡献",
  "论文",
  "专利",
  "ACL",
  "NeurIPS",
  "ICML",
  "EMNLP",
  "GitHub",
  "主导",
];

const GROWTH_SIGNAL_TERMS = [
  "平台",
  "实验室",
  "研究院",
  "团队协作",
  "二次开发",
  "前沿",
  "持续优化",
  "沉淀",
  "评测流程",
  "训练平台",
  "产品迭代",
];

const AI_TITLE_PATTERN =
  /(AI|人工智能|大模型|LLM|算法|机器学习|深度学习|模型|AIGC)/i;

const ROLE_TITLE_PATTERN =
  /(工程师|产品经理|研究员|架构师|开发|训练师|评测|专员|实习|储备|平台)/;

const MAX_PROMPT_JD_LENGTH = 8_000;

export async function evaluateJob(
  jdText: string,
  options: EvaluateJobOptions = {},
): Promise<EvaluationReport> {
  const normalizedText = normalizeWhitespace(jdText);

  if (normalizedText.length < 20) {
    throw new Error("JD text must contain at least 20 characters.");
  }

  const localReport = await buildLocalReport(jdText, normalizedText, options);

  if (options.useDeepSeek === false) {
    return evaluationReportSchema.parse(localReport);
  }

  const enhancementResult = await fetchDeepSeekEnhancement(
    localReport,
    jdText,
    options,
  );
  const enhancement = enhancementResult.enhancement;

  if (enhancementResult.error) {
    options.onDeepSeekFailure?.(enhancementResult.error);
  }

  const enhancedReport = enhancement
    ? applyDeepSeekEnhancement(localReport, enhancement)
    : localReport;

  return evaluationReportSchema.parse(enhancedReport);
}

export async function evaluateAndSaveReport(
  jdText: string,
  options: EvaluateJobOptions = {},
): Promise<EvaluateAndSaveReportResult> {
  let deepSeekError: DeepSeekClientError | undefined;
  const semanticRiskWarnings: SemanticRiskWarning[] = [];
  const onDeepSeekFailure = options.onDeepSeekFailure;
  const onSemanticRiskWarning = options.onSemanticRiskWarning;
  const report = await evaluateJob(jdText, {
    ...options,
    onDeepSeekFailure: (error) => {
      deepSeekError = error;
      onDeepSeekFailure?.(error);
    },
    onSemanticRiskWarning: (warning) => {
      semanticRiskWarnings.push(warning);
      onSemanticRiskWarning?.(warning);
    },
  });

  try {
    const savedReport = saveEvaluationReport(jdText, report);

    return {
      id: savedReport.id,
      report: savedReport.report,
      deepSeekError,
      semanticRiskWarnings,
    };
  } catch {
    return {
      id: null,
      report,
      deepSeekError,
      semanticRiskWarnings,
      saveError: {
        code: "REPORT_SAVE_FAILED",
        message: "结果已生成，但保存失败。报告内容已保留，可稍后重试保存。",
      },
    };
  }
}

export function saveEvaluationReport(jdText: string, report: EvaluationReport) {
  const reportInput = reportCreateInputSchema.parse({
    company: report.job.company,
    role: report.job.role,
    jdText,
    score: report.score,
    risks: report.risks.signals,
    report,
  });

  return createReport(reportInput);
}

async function buildLocalReport(
  jdText: string,
  normalizedText: string,
  options: EvaluateJobOptions,
): Promise<EvaluationReport> {
  const job = extractJob(jdText, normalizedText, options);
  let risks = sanitizeRiskScanResult(
    scanRisks(jdText, {
      company: job.company,
      role: job.role,
      sourceUrl: options.sourceUrl,
    }),
  );

  if (shouldUseSemanticRiskLayer(options)) {
    const semanticLayer = await applySemanticRiskLayer({
      jdText,
      localResult: risks,
      company: job.company,
      role: job.role,
      sourceUrl: options.sourceUrl,
      expectedRiskSignals: options.semanticRisk?.expectedRiskSignals,
      force: options.semanticRisk?.force,
      deepSeek: options.deepSeek,
    });

    for (const warning of semanticLayer.warnings) {
      options.onSemanticRiskWarning?.(warning);
    }

    risks = sanitizeRiskScanResult(semanticLayer.result);
  }

  const context = buildEvaluationContext(jdText, normalizedText, job, risks);
  const dimensions = buildDimensionScores(context);
  const overall = applyRiskAdjustment(calculateWeightedOverall(dimensions), risks);
  const score = {
    overall,
    maxScore: 5,
    dimensions,
  };
  const sections = buildReportSections(dimensions);

  return {
    job: context.job,
    score,
    risks,
    sections,
    recommendation: buildOverallRecommendation(overall, risks),
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
  };
}

function shouldUseSemanticRiskLayer(options: EvaluateJobOptions): boolean {
  if (options.useDeepSeek === false) {
    return false;
  }

  if (options.semanticRisk?.enabled === false) {
    return false;
  }

  return true;
}

function extractJob(
  jdText: string,
  normalizedText: string,
  options: EvaluateJobOptions,
): JobExtract {
  const domain = analyzeDomains(normalizedText);
  const salaryRange =
    extractSalaryRange(jdText) ?? extractSalaryRange(normalizedText);
  const salary = salaryRange ? parseSalaryRange(salaryRange) : undefined;
  const company =
    cleanShortValue(options.company) ??
    extractLabeledValue(jdText, ["公司名称", "公司", "企业", "招聘主体", "雇主"]) ??
    "未识别公司";
  const role =
    cleanShortValue(options.role) ??
    extractLabeledValue(jdText, [
      "职位名称",
      "岗位名称",
      "职位名",
      "岗位名",
      "Title",
      "Role",
      "职位",
      "岗位",
    ]) ??
    extractRoleFromLines(jdText) ??
    "未识别岗位";
  const location =
    extractLabeledValue(jdText, ["工作地点", "办公地点", "地点", "城市"]) ??
    extractLocationFallback(jdText);
  const experienceLevel = extractExperienceLevel(jdText);
  const techStack = extractTechStack(normalizedText);
  const aiDirection =
    domain.trueAiTerms.length > 0
      ? DOMAIN_LABELS[domain.profile.primaryDomain]
      : "AI方向未识别";
  const keywords = extractKeywords({
    role,
    aiDirection,
    techStack,
    experienceLevel,
    risks: [],
  });

  return {
    company,
    role,
    ...(location ? { location } : {}),
    ...(salaryRange ? { salaryRange } : {}),
    ...(salary ? { salary } : {}),
    aiDirection,
    ...(experienceLevel ? { experienceLevel } : {}),
    techStack,
    keywords,
    ecosystem: domain.profile,
  };
}

function buildEvaluationContext(
  jdText: string,
  normalizedText: string,
  job: JobExtract,
  risks: RiskScanResult,
): LocalEvaluationContext {
  const domain = analyzeDomains(normalizedText);
  const hasAiTitle = AI_TITLE_PATTERN.test(job.role) || AI_TITLE_PATTERN.test(jdText);
  const productionSignals = findMatchedKeywords(
    normalizedText,
    PRODUCTION_SIGNAL_TERMS,
  );
  const growthSignals = findMatchedKeywords(normalizedText, GROWTH_SIGNAL_TERMS);
  const experienceSignals = findMatchedKeywords(
    normalizedText,
    EXPERIENCE_SIGNAL_TERMS,
  );

  return {
    jdText,
    normalizedText,
    job: {
      ...job,
      keywords: extractKeywords({
        role: job.role,
        aiDirection: job.aiDirection,
        techStack: job.techStack,
        experienceLevel: job.experienceLevel,
        risks: risks.signals.flatMap((signal) => signal.matchTerms ?? []),
      }),
    },
    domain,
    risks,
    hasAiTitle,
    productionSignals,
    growthSignals,
    experienceSignals,
  };
}

function buildDimensionScores(
  context: LocalEvaluationContext,
): EvaluationDimensionScores {
  const dimensions = {} as EvaluationDimensionScores;

  dimensions.A = scorePositioning(context);
  dimensions.B = scoreTechStack(context);
  dimensions.C = scoreExperience(context);
  dimensions.D = scoreGrowth(context);
  dimensions.E = scoreSalary(context);
  dimensions.F = scoreRisk(context);

  return dimensions;
}

function scorePositioning(
  context: LocalEvaluationContext,
): EvaluationDimensionScore {
  const trueAiCount = context.domain.trueAiTerms.length;
  let score = 2.5;

  if (trueAiCount >= 8) {
    score += 1.4;
  } else if (trueAiCount >= 4) {
    score += 1;
  } else if (trueAiCount >= 2) {
    score += 0.6;
  } else if (trueAiCount === 0 && context.hasAiTitle) {
    score -= 0.8;
  } else if (trueAiCount === 0) {
    score -= 1.3;
  }

  if (context.domain.profile.evidence.length >= 3) {
    score += 0.4;
  }

  if (context.productionSignals.length >= 3) {
    score += 0.3;
  }

  score -= riskPenalty(context.risks.level, {
    critical: 1.6,
    high: 0.9,
    medium: 0.3,
    low: 0,
  });

  const aiDirection = context.job.aiDirection ?? "AI方向未明确";
  const lacksAiEvidenceSummary = context.hasAiTitle
    ? "岗位标题包含 AI 信号，但正文缺少足够的 AI 生态位证据。"
    : "该 JD 更像通用或传统岗位，未呈现 AI 岗位定位和核心技术证据。";

  return makeDimensionScore("A", score, {
    summary:
      trueAiCount > 0
        ? `岗位定位为${aiDirection}，JD 中存在可核验的 AI 技术与交付场景。`
        : lacksAiEvidenceSummary,
    evidence: [
      `AI 方向：${aiDirection}`,
      ...context.domain.profile.evidence,
      ...makeTermEvidence("交付信号", context.productionSignals),
    ],
    suggestions:
      trueAiCount > 0
        ? ["面试时继续确认该方向在公司业务中的优先级、团队规模和项目路线图。"]
        : context.hasAiTitle
          ? ["要求招聘方补充模型、数据、评测、上线链路和团队分工，避免只看岗位标题。"]
          : ["若目标是 AI 岗，不建议把该岗位按 AI 机会推进；除非招聘方能补充明确 AI 职责。"],
  });
}

function scoreTechStack(
  context: LocalEvaluationContext,
): EvaluationDimensionScore {
  const trueAiCount = context.domain.trueAiTerms.length;
  const traditionalCount = context.domain.traditionalTerms.length;
  let score = 1.2;

  if (trueAiCount >= 10) {
    score = 4.7;
  } else if (trueAiCount >= 7) {
    score = 4.4;
  } else if (trueAiCount >= 4) {
    score = 3.9;
  } else if (trueAiCount >= 2) {
    score = 3.3;
  } else if (trueAiCount === 1) {
    score = 2.6;
  }

  if (context.productionSignals.length >= 3 && trueAiCount >= 3) {
    score += 0.2;
  }

  if (traditionalCount >= 4 && traditionalCount > trueAiCount) {
    score -= 0.9;
  }

  if (context.risks.level === "critical") {
    score = Math.min(score, 2);
  } else if (context.risks.level === "high") {
    score = Math.min(score, 2.8);
  }

  return makeDimensionScore("B", score, {
    summary:
      trueAiCount > 0
        ? `识别到 ${trueAiCount} 个真实 AI 技术关键词，技术栈与${context.job.aiDirection ?? "目标方向"}基本对齐。`
        : "未识别到模型、向量库、推理服务、训练或评测等关键 AI 技术栈。",
    evidence: [
      ...makeTermEvidence("AI 技术栈", context.domain.trueAiTerms),
      ...makeTermEvidence("传统开发栈", context.domain.traditionalTerms),
    ],
    suggestions:
      trueAiCount > 0
        ? ["追问技术栈的实际使用深度、线上指标、团队 owner 和候选人入职后的职责边界。"]
        : context.hasAiTitle
          ? ["不要仅凭 AI 标题判断岗位质量，优先核实是否有 RAG、模型部署、训练或评测链路。"]
          : ["该 JD 缺少 AI 技术栈证据，优先级应低于能说明模型、数据和评测链路的岗位。"],
  });
}

function scoreExperience(
  context: LocalEvaluationContext,
): EvaluationDimensionScore {
  const experienceLevel = context.job.experienceLevel;
  let score = experienceLevel ? 3.1 : 2.7;

  if (experienceLevel && !/(不限|无经验|零基础|热爱\s?AI\s?即可)/i.test(experienceLevel)) {
    score += 0.4;
  }

  if (context.experienceSignals.length >= 3) {
    score += 0.7;
  } else if (context.experienceSignals.length > 0) {
    score += 0.35;
  }

  if (/(论文|开源贡献|专利|NeurIPS|ICML|ACL|EMNLP|GitHub)/i.test(context.normalizedText)) {
    score += 0.25;
  }

  if (/(经验不限|学历不限|零基础|热爱\s?AI\s?即可|小白)/i.test(context.normalizedText)) {
    score -= context.domain.trueAiTerms.length >= 3 ? 0.4 : 1.1;
  }

  score -= riskPenalty(context.risks.level, {
    critical: 1.2,
    high: 0.6,
    medium: 0.2,
    low: 0,
  });

  return makeDimensionScore("C", score, {
    summary: experienceLevel
      ? `经验要求为${experienceLevel}，并结合落地、论文、开源或训练经验信号判断要求质量。`
      : "JD 未给出清晰经验层级，需要在沟通中确认岗位职级和能力门槛。",
    evidence: [
      experienceLevel ? `经验层级：${experienceLevel}` : "未提取到明确经验层级",
      ...makeTermEvidence("经验信号", context.experienceSignals),
    ],
    suggestions: [
      "面试前确认该岗位更看重工程落地、算法训练、评测体系、论文开源还是业务协作。",
    ],
  });
}

function scoreGrowth(context: LocalEvaluationContext): EvaluationDimensionScore {
  let score = 2.8;

  if (context.domain.trueAiTerms.length >= 5) {
    score += 0.8;
  } else if (context.domain.trueAiTerms.length >= 2) {
    score += 0.4;
  }

  if (context.growthSignals.length >= 3) {
    score += 0.5;
  } else if (context.growthSignals.length > 0) {
    score += 0.25;
  }

  if (context.productionSignals.length >= 3) {
    score += 0.35;
  }

  if (/(驻场|外包|验收材料|内容审核|质检|标注团队|权限有限|不涉及算法|项目包装)/i.test(
    context.normalizedText,
  )) {
    score -= 0.7;
  }

  score -= riskPenalty(context.risks.level, {
    critical: 1.5,
    high: 0.8,
    medium: 0.35,
    low: 0,
  });

  return makeDimensionScore("D", score, {
    summary:
      context.growthSignals.length > 0 || context.productionSignals.length > 0
        ? "JD 描述了平台、上线、优化或团队协作信号，具备进一步核实成长空间的基础。"
        : "成长价值信号偏少，需要确认入职后是否能接触核心模型、数据和工程闭环。",
    evidence: [
      ...makeTermEvidence("成长信号", context.growthSignals),
      ...makeTermEvidence("生产信号", context.productionSignals),
    ],
    suggestions: [
      "重点追问团队中资深 AI 人员配置、代码和数据权限、项目周期、评价指标与晋升路径。",
    ],
  });
}

function scoreSalary(context: LocalEvaluationContext): EvaluationDimensionScore {
  const salary = context.job.salary;
  const benchmark = getSalaryBenchmark(context.job.ecosystem?.primaryDomain);
  let score = 3;

  if (salary?.min !== undefined && salary.max !== undefined) {
    const average = (salary.min + salary.max) / 2;
    const ratio = average / benchmark.mid;

    if (ratio >= 1.25) {
      score = 4.7;
    } else if (ratio >= 1) {
      score = 4.2;
    } else if (ratio >= 0.8) {
      score = 3.5;
    } else if (ratio >= 0.65) {
      score = 2.8;
    } else {
      score = 2.2;
    }
  }

  if (/(上不封顶|不封顶|无上限|月入|高薪)/i.test(context.job.salaryRange ?? "")) {
    score -= 0.7;
  }

  if (
    context.risks.signals.some((signal) =>
      ["overpromise", "training_loan"].includes(signal.category ?? ""),
    )
  ) {
    score = Math.min(score, context.risks.level === "critical" ? 1.8 : 2.8);
  }

  return makeDimensionScore("E", score, {
    summary: context.job.salaryRange
      ? `薪资为${context.job.salaryRange}，按${benchmark.label}月薪基准进行相对判断。`
      : "JD 未给出清晰薪资范围，薪酬竞争力只能按中性处理。",
    evidence: [
      context.job.salaryRange
        ? `薪资范围：${context.job.salaryRange}`
        : "未提取到薪资范围",
      `参考基准：${benchmark.label} ${formatK(benchmark.min)}-${formatK(
        benchmark.max,
      )}/月`,
    ],
    suggestions: [
      "确认薪资结构、绩效比例、年终月数、试用期折扣、社保公积金基数和是否存在培训收费。",
    ],
  });
}

function scoreRisk(context: LocalEvaluationContext): EvaluationDimensionScore {
  const scoreByLevel: Record<RiskLevel, number> = {
    low: 4.6,
    medium: 3.1,
    high: 1.8,
    critical: 0.8,
  };
  const riskSignals = context.risks.signals.map(
    (signal) => `${signal.signal}：${signal.excerpt}`,
  );

  return makeDimensionScore("F", scoreByLevel[context.risks.level], {
    summary: context.risks.summary,
    evidence:
      riskSignals.length > 0
        ? riskSignals
        : ["未命中本地风险规则，当前按低风险处理。"],
    suggestions: [context.risks.recommendation],
  });
}

function makeDimensionScore(
  dimension: EvaluationDimension,
  rawScore: number,
  content: {
    summary: string;
    evidence: string[];
    suggestions: string[];
  },
): EvaluationDimensionScore {
  return {
    dimension,
    title: DIMENSION_META[dimension].title,
    weight: DIMENSION_META[dimension].weight,
    score: clampScore(rawScore),
    summary: shorten(content.summary, 1_800),
    evidence: sanitizeTextList(content.evidence, "暂无明确证据"),
    suggestions: sanitizeTextList(content.suggestions, "继续核实关键岗位信息"),
  };
}

function buildReportSections(
  dimensions: EvaluationDimensionScores,
): EvaluationReportSection[] {
  return DIMENSIONS.map((dimension) => ({
    dimension,
    title: dimensions[dimension].title,
    score: dimensions[dimension].score,
    summary: dimensions[dimension].summary,
    findings: dimensions[dimension].evidence,
    suggestions: dimensions[dimension].suggestions,
  }));
}

function calculateWeightedOverall(dimensions: EvaluationDimensionScores): number {
  const score = DIMENSIONS.reduce(
    (sum, dimension) =>
      sum + (dimensions[dimension].score * dimensions[dimension].weight) / 100,
    0,
  );

  return clampScore(score);
}

function applyRiskAdjustment(
  rawOverall: number,
  risks: RiskScanResult,
): number {
  const mediumPenalty = risks.level === "medium" ? Math.min(0.45, risks.totalWeight * 0.08) : 0;
  const lowPenalty = risks.level === "low" ? Math.min(0.1, risks.totalWeight * 0.03) : 0;
  const adjusted = clampScore(rawOverall - mediumPenalty - lowPenalty);

  return risks.scoreCap !== undefined
    ? clampScore(Math.min(adjusted, risks.scoreCap))
    : adjusted;
}

function sanitizeRiskScanResult(risks: RiskScanResult): RiskScanResult {
  return {
    ...risks,
    summary: shorten(risks.summary, 1_800),
    recommendation: shorten(risks.recommendation, 1_800),
    signals: risks.signals.map((signal) => {
      const matchTerms = sanitizeOptionalTextList(signal.matchTerms, 50);

      return {
        ...signal,
        signal: cleanShortValue(signal.signal) ?? "未命名风险信号",
        excerpt: shorten(signal.excerpt || signal.signal, 900),
        category: cleanShortValue(signal.category),
        explanation:
          signal.explanation === undefined
            ? undefined
            : shorten(signal.explanation, 1_800),
        advice:
          signal.advice === undefined ? undefined : shorten(signal.advice, 1_800),
        ...(matchTerms.length > 0 ? { matchTerms } : {}),
      };
    }),
  };
}

function buildOverallRecommendation(
  overall: number,
  risks: RiskScanResult,
): string {
  if (risks.level === "critical") {
    return "建议放弃：岗位命中高危虚假 AI 岗信号，优先核实收费、培训、贷款和真实用工主体。";
  }

  if (risks.level === "high") {
    return "不太推荐：风险信号已明显影响岗位可信度，除非招聘方能补充明确的 AI 研发职责和合同信息。";
  }

  if (overall >= 4.5) {
    return "强烈建议投递：AI 生态位清晰，技术栈、经验要求、成长价值和风险合规表现较好。";
  }

  if (overall >= 4) {
    return "建议投递：岗位整体质量较高，面试时继续确认团队投入和实际职责边界。";
  }

  if (overall >= 3.5) {
    return "可以投递但需关注短板：重点核实成长空间、技术深度、薪酬结构和潜在风险。";
  }

  if (overall >= 3) {
    return "谨慎推进：岗位可能存在 AI 含量不足、成长价值有限或信息不透明问题。";
  }

  return "建议放弃：综合评分偏低，可能存在岗位包装、风险信号或核心 AI 能力缺失。";
}

function analyzeDomains(text: string): DomainAnalysis {
  const matchedByDomain = emptyDomainMatches();
  const rawScores = emptyDomainScores();

  for (const [domain, config] of domainEntries()) {
    const whitelistTerms = findMatchedKeywords(text, [...config.keywords]);
    const signalTerms = findMatchedKeywords(text, DOMAIN_SIGNAL_TERMS[domain]);
    const terms = uniqueStrings([...whitelistTerms, ...signalTerms]);

    matchedByDomain[domain] = terms;
    rawScores[domain] = whitelistTerms.length * 2 + signalTerms.length;
  }

  if (rawScores.llm_application === 0 && /(RAG|Agent|Prompt|ChatGPT|OpenAI|大模型)/i.test(text)) {
    rawScores.llm_application = 1;
  }

  const totalScore = Object.values(rawScores).reduce((sum, value) => sum + value, 0);
  const primaryDomain =
    totalScore > 0 ? pickPrimaryDomain(rawScores) : "llm_application";
  const vector = emptyDomainScores();

  for (const domain of Object.keys(vector) as AiEcosystemDomain[]) {
    vector[domain] =
      totalScore > 0 ? Math.round((rawScores[domain] / totalScore) * 100) : 0;
  }

  const trueAiTerms = uniqueStrings(
    domainEntries().flatMap(([domain]) => matchedByDomain[domain]),
  );
  const traditionalTerms = findMatchedKeywords(text, [
    ...TRADITIONAL_DEV_STACK_KEYWORDS,
  ]);
  const evidence = sanitizeTextList(
    [
      ...makeTermEvidence(DOMAIN_LABELS[primaryDomain], matchedByDomain[primaryDomain]),
      ...makeTermEvidence("可核验 AI 技术", trueAiTerms),
    ],
    `${DOMAIN_LABELS[primaryDomain]}证据不足，按弱信号处理`,
    8,
  );

  return {
    profile: {
      primaryDomain,
      vector,
      evidence,
    },
    matchedByDomain,
    trueAiTerms,
    traditionalTerms,
  };
}

function extractTechStack(text: string): string[] {
  const trueAiTerms = domainEntries().flatMap(([, config]) =>
    findMatchedKeywords(text, [...config.keywords]),
  );
  const generalTerms = findMatchedKeywords(text, GENERAL_TECH_STACK_KEYWORDS);
  const traditionalTerms = findMatchedKeywords(text, [
    ...TRADITIONAL_DEV_STACK_KEYWORDS,
  ]);

  return uniqueStrings([...trueAiTerms, ...generalTerms, ...traditionalTerms]).slice(
    0,
    80,
  );
}

function extractKeywords(input: {
  role: string;
  aiDirection?: string;
  techStack: string[];
  experienceLevel?: string;
  risks: string[];
}): string[] {
  const roleTerms = findMatchedKeywords(input.role, [
    "AI",
    "大模型",
    "LLM",
    "算法",
    "推理",
    "平台",
    "评测",
    "安全",
    "Agent",
    "RAG",
  ]);

  return uniqueStrings([
    input.aiDirection,
    input.experienceLevel,
    ...roleTerms,
    ...input.techStack,
    ...input.risks,
  ]).slice(0, 120);
}

function extractLabeledValue(
  text: string,
  labels: string[],
): string | undefined {
  const labelPattern = labels.map(escapeRegex).join("|");
  const pattern = new RegExp(`^\\s*(?:${labelPattern})\\s*[:：]\\s*(.+)$`, "i");

  for (const line of text.split(/\r?\n/).slice(0, 40)) {
    const match = line.match(pattern);
    const value = cleanShortValue(match?.[1]);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function extractRoleFromLines(text: string): string | undefined {
  for (const line of text.split(/\r?\n/).slice(0, 12)) {
    const normalized = cleanShortValue(
      line.replace(/^(职位|岗位|招聘)\s*[:：]?\s*/i, ""),
    );

    if (
      normalized &&
      ROLE_TITLE_PATTERN.test(normalized) &&
      !/(岗位职责|任职要求|职位描述|薪资|工作地点|公司)/.test(normalized)
    ) {
      return normalized;
    }
  }

  return undefined;
}

function extractSalaryRange(text: string): string | undefined {
  const labeled = extractLabeledValue(text, [
    "薪资范围",
    "薪资待遇",
    "薪酬范围",
    "薪酬",
    "薪资",
    "工资",
    "待遇",
  ]);

  if (labeled) {
    return labeled;
  }

  const match = text.match(
    /((?:\d+(?:\.\d+)?\s*(?:[Kk]|千|万)?\s*(?:-|~|至|到)\s*\d+(?:\.\d+)?\s*(?:[Kk]|千|万)?\s*(?:\/?\s*(?:月|年|天|日|小时|h))?(?:[，,]\s*\d{1,2}\s*薪)?)|(?:月入|年薪|日薪|时薪).{0,24}\d+(?:\.\d+)?\s*(?:[Kk]|千|万)?)/i,
  );

  return cleanShortValue(match?.[1]);
}

function parseSalaryRange(raw: string): SalaryRange | undefined {
  const rangeMatch = raw.match(
    /(\d+(?:\.\d+)?)\s*([Kk]|千|万)?\s*(?:-|~|至|到)\s*(\d+(?:\.\d+)?)\s*([Kk]|千|万)?/,
  );

  if (!rangeMatch) {
    return {
      raw,
      currency: "CNY",
      period: inferSalaryPeriod(raw),
    };
  }

  const minUnit = rangeMatch[2] || rangeMatch[4];
  const maxUnit = rangeMatch[4] || rangeMatch[2];
  const min = normalizeSalaryNumber(Number(rangeMatch[1]), minUnit);
  const max = normalizeSalaryNumber(Number(rangeMatch[3]), maxUnit);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return {
      raw,
      currency: "CNY",
      period: inferSalaryPeriod(raw),
    };
  }

  return {
    raw,
    currency: "CNY",
    period: inferSalaryPeriod(raw),
    min,
    max,
  };
}

function inferSalaryPeriod(raw: string): SalaryPeriod {
  if (/(年薪|\/年|每年)/i.test(raw)) {
    return "yearly";
  }

  if (/(日薪|\/天|\/日|每天)/i.test(raw)) {
    return "daily";
  }

  if (/(时薪|小时|\/h|\/小时)/i.test(raw)) {
    return "hourly";
  }

  return "monthly";
}

function normalizeSalaryNumber(value: number, unit: string | undefined): number {
  if (/万/i.test(unit ?? "")) {
    return value * 10_000;
  }

  if (/k|千/i.test(unit ?? "")) {
    return value * 1_000;
  }

  return value;
}

function extractExperienceLevel(text: string): string | undefined {
  const explicitMatch = text.match(
    /(经验不限|不限经验|无经验可培养|学历不限|热爱\s?AI\s?即可|应届(?:生)?|校招|(?:\d+(?:\.\d+)?\s*(?:-|~|至|到)\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:年及以上|年以上|年经验|年)))/i,
  );

  return cleanShortValue(explicitMatch?.[1]?.replace(/\s+/g, ""));
}

function extractLocationFallback(text: string): string | undefined {
  const match = text.match(
    /(北京|上海|深圳|广州|杭州|成都|南京|武汉|苏州|西安|厦门|重庆|天津|远程|全国)/,
  );

  return cleanShortValue(match?.[1]);
}

function getSalaryBenchmark(domain: AiEcosystemDomain | undefined): {
  label: string;
  min: number;
  max: number;
  mid: number;
} {
  const benchmarks: Record<AiEcosystemDomain, { label: string; min: number; max: number }> = {
    llm_application: { label: "LLM应用层 3-5 年", min: 25_000, max: 45_000 },
    ai_infra: { label: "AI Infra 5 年以上", min: 35_000, max: 60_000 },
    algorithm_research: { label: "算法研究岗位", min: 20_000, max: 45_000 },
    embodied_ai: { label: "具身智能 3-5 年", min: 30_000, max: 50_000 },
    ai_safety: { label: "AI安全评测岗位", min: 22_000, max: 40_000 },
  };
  const benchmark = benchmarks[domain ?? "llm_application"];

  return {
    ...benchmark,
    mid: (benchmark.min + benchmark.max) / 2,
  };
}

async function fetchDeepSeekEnhancement(
  report: EvaluationReport,
  jdText: string,
  options: EvaluateJobOptions,
): Promise<{ enhancement: DeepSeekEnhancement | null; error?: DeepSeekClientError }> {
  const result = await callDeepSeekJson<JsonObject>(
    [
      {
        role: "system",
        content:
          "你是 AI 岗位评估增强器。只能补充结构化 JSON 字段，不要输出 Markdown，不要改写分数，不要依赖原始文本供页面解析。",
      },
      {
        role: "user",
        content: JSON.stringify({
          task:
            "基于 JD 和本地规则报告，补充 extract、dimensions(A-F) 的 summary/evidence/suggestions 和 recommendation。只返回一个 JSON 对象，不要输出 Markdown、注释、解释文字或外层 data/result 包装。",
          outputRules: [
            "dimensions 必须是对象，且必须只包含 A、B、C、D、E、F 六个键。",
            "每个 evidence/suggestions 数组保留 1-3 条，每条不超过 80 个中文字符。",
            "recommendation 不超过 180 个中文字符。",
            "不确定的信息用空字符串或空数组，不要编造招聘方未写明的信息。",
          ],
          allowedShape: {
            extract: {
              company: "string",
              role: "string",
              salaryRange: "string",
              location: "string",
              aiDirection: "string",
              techStack: ["string"],
              experienceLevel: "string",
              keywords: ["string"],
            },
            dimensions: {
              A: { summary: "string", evidence: ["string"], suggestions: ["string"] },
              B: { summary: "string", evidence: ["string"], suggestions: ["string"] },
              C: { summary: "string", evidence: ["string"], suggestions: ["string"] },
              D: { summary: "string", evidence: ["string"], suggestions: ["string"] },
              E: { summary: "string", evidence: ["string"], suggestions: ["string"] },
              F: { summary: "string", evidence: ["string"], suggestions: ["string"] },
            },
            recommendation: "string",
          },
          localReport: {
            job: report.job,
            score: report.score,
            risks: report.risks,
          },
          jdText: jdText.slice(0, MAX_PROMPT_JD_LENGTH),
        }),
      },
    ],
    "EvaluateJobEnhancement",
    {
      timeoutMs: 45_000,
      temperature: 0.1,
      maxTokens: 3_500,
      ...options.deepSeek,
    },
  );

  if (!result.ok) {
    return {
      enhancement: null,
      error: result.error,
    };
  }

  return {
    enhancement: parseDeepSeekEnhancement(result.data),
  };
}

function applyDeepSeekEnhancement(
  report: EvaluationReport,
  enhancement: DeepSeekEnhancement,
): EvaluationReport {
  const job = {
    ...report.job,
    ...pickEnhancedExtract(report.job, enhancement.extract),
  };
  const dimensions = { ...report.score.dimensions } as EvaluationDimensionScores;

  for (const dimension of DIMENSIONS) {
    const section = enhancement.dimensions?.[dimension];

    if (!section) {
      continue;
    }

    dimensions[dimension] = {
      ...dimensions[dimension],
      summary: cleanEnhancedText(section.summary) ?? dimensions[dimension].summary,
      evidence: mergeEnhancedList(dimensions[dimension].evidence, section.evidence),
      suggestions: mergeEnhancedList(
        dimensions[dimension].suggestions,
        section.suggestions,
      ),
    };
  }

  return {
    ...report,
    job,
    score: {
      ...report.score,
      dimensions,
    },
    sections: buildReportSections(dimensions),
    recommendation:
      cleanEnhancedText(enhancement.recommendation) ?? report.recommendation,
  };
}

function pickEnhancedExtract(
  fallback: JobExtract,
  extract: DeepSeekEnhancement["extract"],
): Partial<JobExtract> {
  if (!extract) {
    return {};
  }

  const techStack = mergeEnhancedList(fallback.techStack, extract.techStack, 80);
  const keywords = mergeEnhancedList(fallback.keywords, extract.keywords, 120);

  return {
    company: cleanEnhancedText(extract.company) ?? fallback.company,
    role: cleanEnhancedText(extract.role) ?? fallback.role,
    location: cleanEnhancedText(extract.location) ?? fallback.location,
    salaryRange: cleanEnhancedText(extract.salaryRange) ?? fallback.salaryRange,
    aiDirection: cleanEnhancedText(extract.aiDirection) ?? fallback.aiDirection,
    experienceLevel:
      cleanEnhancedText(extract.experienceLevel) ?? fallback.experienceLevel,
    techStack,
    keywords,
  };
}

function parseDeepSeekEnhancement(data: JsonObject): DeepSeekEnhancement | null {
  const payload = unwrapEnhancementPayload(data);
  const extractValue = readObject(payload.extract);
  const dimensionsValue = readObject(payload.dimensions);

  return {
    ...(extractValue
      ? {
          extract: {
            company: readString(extractValue.company),
            role: readString(extractValue.role),
            salaryRange: readString(extractValue.salaryRange),
            location: readString(extractValue.location),
            aiDirection: readString(extractValue.aiDirection),
            techStack: readStringArray(extractValue.techStack),
            experienceLevel: readString(extractValue.experienceLevel),
            keywords: readStringArray(extractValue.keywords),
          },
        }
      : {}),
    ...(dimensionsValue ? { dimensions: parseDimensionEnhancements(dimensionsValue) } : {}),
    recommendation: readString(payload.recommendation),
  };
}

function unwrapEnhancementPayload(data: JsonObject): JsonObject {
  for (const key of ["enhancement", "result", "data", "report"]) {
    const wrapped = readObject(data[key]);

    if (wrapped && (readObject(wrapped.dimensions) || readObject(wrapped.extract))) {
      return wrapped;
    }
  }

  return data;
}

function parseDimensionEnhancements(
  data: JsonObject,
): Partial<Record<EvaluationDimension, SectionEnhancement>> {
  const dimensions: Partial<Record<EvaluationDimension, SectionEnhancement>> = {};

  for (const dimension of DIMENSIONS) {
    const section =
      readObject(data[dimension]) ??
      readObject(data[dimension.toLowerCase()]) ??
      findDimensionSection(data, dimension);

    if (!section) {
      continue;
    }

    dimensions[dimension] = {
      summary: readString(section.summary),
      evidence: readStringArray(section.evidence),
      suggestions: readStringArray(section.suggestions),
    };
  }

  return dimensions;
}

function findDimensionSection(
  data: JsonObject,
  dimension: EvaluationDimension,
): JsonObject | null {
  const expectedTitle = DIMENSION_META[dimension].title;

  for (const value of Object.values(data)) {
    const section = readObject(value);

    if (!section) {
      continue;
    }

    const key = readString(section.dimension) ?? readString(section.key) ?? readString(section.id);
    const title = readString(section.title);

    if (
      key?.toLocaleUpperCase() === dimension ||
      title === expectedTitle ||
      title?.includes(expectedTitle)
    ) {
      return section;
    }
  }

  return null;
}

function mergeEnhancedList(
  fallback: string[],
  enhanced: string[] | undefined,
  limit = 30,
): string[] {
  if (!enhanced || enhanced.length === 0) {
    return sanitizeTextList(fallback, "暂无明确证据", limit);
  }

  return sanitizeTextList([...fallback, ...enhanced], "暂无明确证据", limit);
}

function readObject(value: JsonValue | undefined): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}

function readString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? cleanEnhancedText(value) : undefined;
}

function readStringArray(value: JsonValue | undefined): string[] | undefined {
  if (typeof value === "string") {
    return sanitizeTextList([value], "暂无明确证据");
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  return sanitizeTextList(
    value
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        const object = readObject(item);

        return object
          ? readString(object.text) ??
              readString(object.content) ??
              readString(object.detail) ??
              readString(object.summary) ??
              readString(object.suggestion)
          : undefined;
      })
      .filter((item): item is string => typeof item === "string"),
    "暂无明确证据",
  );
}

function cleanEnhancedText(value: string | undefined): string | undefined {
  return cleanShortValue(value);
}

function makeTermEvidence(label: string, terms: string[], limit = 8): string[] {
  if (terms.length === 0) {
    return [];
  }

  return [`${label}：${terms.slice(0, limit).join("、")}`];
}

function findMatchedKeywords(text: string, keywords: readonly string[]): string[] {
  const lowerText = text.toLocaleLowerCase();
  const matches = keywords
    .map((keyword) => ({
      label: keyword,
      index: lowerText.indexOf(keyword.toLocaleLowerCase()),
    }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => left.index - right.index);

  return uniqueStrings(matches.map((match) => match.label));
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = cleanShortValue(value);

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

function sanitizeTextList(
  values: Array<string | undefined>,
  fallback: string,
  limit = 30,
): string[] {
  const list = uniqueStrings(values)
    .map((value) => shorten(value, 230))
    .filter((value) => value.length > 0)
    .slice(0, limit);

  return list.length > 0 ? list : [fallback];
}

function sanitizeOptionalTextList(
  values: Array<string | undefined> | undefined,
  limit = 30,
): string[] {
  return uniqueStrings(values ?? [])
    .map((value) => shorten(value, 230))
    .filter((value) => value.length > 0)
    .slice(0, limit);
}

function cleanShortValue(value: string | undefined): string | undefined {
  const normalized = value
    ?.replace(/^[\s:：,，。；;|-]+/, "")
    .replace(/[\s,，。；;]+$/, "")
    .trim();

  if (!normalized) {
    return undefined;
  }

  return shorten(normalized, 240);
}

function shorten(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clampScore(value: number): number {
  return Math.round(Math.min(5, Math.max(0, value)) * 10) / 10;
}

function riskPenalty(
  level: RiskLevel,
  penalties: Record<RiskLevel, number>,
): number {
  return penalties[level];
}

function formatK(value: number): string {
  return `${Math.round(value / 1_000)}K`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function emptyDomainScores(): Record<AiEcosystemDomain, number> {
  return {
    llm_application: 0,
    ai_infra: 0,
    algorithm_research: 0,
    embodied_ai: 0,
    ai_safety: 0,
  };
}

function emptyDomainMatches(): Record<AiEcosystemDomain, string[]> {
  return {
    llm_application: [],
    ai_infra: [],
    algorithm_research: [],
    embodied_ai: [],
    ai_safety: [],
  };
}

function pickPrimaryDomain(
  scores: Record<AiEcosystemDomain, number>,
): AiEcosystemDomain {
  return (Object.entries(scores) as Array<[AiEcosystemDomain, number]>).sort(
    ([leftDomain, leftScore], [rightDomain, rightScore]) => {
      const scoreDiff = rightScore - leftScore;

      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return DOMAIN_LABELS[leftDomain].localeCompare(
        DOMAIN_LABELS[rightDomain],
        "zh-Hans-CN",
      );
    },
  )[0][0];
}

function domainEntries(): Array<
  [
    AiEcosystemDomain,
    {
      label: string;
      keywords: readonly string[];
    },
  ]
> {
  return Object.entries(TRUE_AI_TECH_STACK_WHITELIST) as Array<
    [
      AiEcosystemDomain,
      {
        label: string;
        keywords: readonly string[];
      },
    ]
  >;
}
