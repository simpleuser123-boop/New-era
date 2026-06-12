import {
  AI_ROLE_TITLE_KEYWORDS,
  RISK_RULES,
  RISK_RULE_CHANGELOG,
  RISK_RULE_VERSION,
  RISK_SEVERITY_WEIGHTS,
  TRADITIONAL_DEV_STACK_KEYWORDS,
  TRADITIONAL_NON_AI_ROLE_KEYWORDS,
  TRADITIONAL_NON_AI_WORK_KEYWORDS,
  TRUE_AI_TECH_STACK_KEYWORDS,
} from "./risk-rules";
import type {
  RiskLevel,
  RiskScanResult,
  RiskSeverity,
  RiskSignal,
} from "./types";

export type ScanRisksOptions = {
  company?: string;
  role?: string;
  sourceUrl?: string;
};

type LocalRiskSignal = RiskSignal & {
  severity: RiskSeverity;
  source: "regex" | "dictionary";
  explanation: string;
};

const MAX_EXCERPT_LENGTH = 180;
const CONTEXT_RADIUS = 56;
const MAX_MATCH_TERM_LENGTH = 120;
const LOCAL_CONTEXT_RADIUS = 80;

const SEVERITY_RANK: Record<RiskSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const LLM_SEVERITY_WEIGHTS: Record<Exclude<RiskSeverity, "critical">, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const GENERIC_AI_TITLE_PATTERN =
  /((AI|人工智能|大模型|LLM|算法|机器学习|深度学习).{0,20}(工程师|开发|研究员|实习|储备|训练师|架构师|平台|产品|评测|专员|销售|客服|运营|客户经理|BD|商务))|((工程师|开发|研究员|实习|储备|训练师|架构师|平台|产品|评测|专员|销售|客服|运营|客户经理|BD|商务).{0,20}(AI|人工智能|大模型|LLM|算法|机器学习|深度学习))/i;

const TITLE_LINE_PATTERN =
  /(职位名称|岗位名称|职位名|岗位名|title|role|职位：|岗位：)/i;

const AI_ROLE_CONTEXT_KEYWORDS = [
  "AI",
  "AIGC",
  "人工智能",
  "大模型",
  "LLM",
  "算法",
  "机器学习",
  "智能体",
  "Agent",
] as const;

const EDUCATION_COMPANY_KEYWORDS = [
  "教育",
  "培训",
  "学院",
  "学校",
  "职校",
  "职业技能培训",
  "教育咨询",
] as const;

const COURSE_WORK_KEYWORDS = [
  "课程",
  "授课",
  "教学",
  "讲师",
  "老师",
  "助教",
  "学员",
  "招生",
  "公开课",
  "试听课",
  "课件",
  "实训",
  "培训方向",
] as const;

const LOW_BAR_KEYWORDS = [
  "零基础",
  "无经验",
  "经验不限",
  "小白",
  "新手",
  "无需经验",
  "无需基础",
  "可培养",
  "接受转行",
  "可零基础",
] as const;

const HIGH_PAY_PROMISE_KEYWORDS = [
  "高薪",
  "月入",
  "日薪",
  "收入稳定",
  "上不封顶",
  "不封顶",
  "多劳多得",
  "收益稳定",
  "想赚米",
  "变现模式",
  "账号起量",
  "日350",
  "350+",
] as const;

const TRAINING_FUNNEL_KEYWORDS = [
  "岗前培训",
  "培训机制",
  "免费教学",
  "全程免费教学",
  "一对一教学",
  "手把手教学",
  "带教",
  "导师",
  "老师指导",
  "教学步骤",
  "教学流程",
  "课程报名",
  "课程咨询",
  "推荐就业",
  "包就业",
  "先培训后上岗",
] as const;

const FAKE_AI_CONTENT_WORK_KEYWORDS = [
  "短视频",
  "AI短视频",
  "漫剧",
  "短剧",
  "剪辑",
  "图文转视频",
  "AI绘画",
  "AI生图",
  "AI生视频",
  "数字人",
  "账号运营",
  "内容发布",
] as const;

const BASIC_DATA_TASK_KEYWORDS = [
  "打字",
  "录入",
  "复制粘贴",
  "标注",
  "审核",
  "质检",
  "清洗",
  "分类",
  "整理",
  "拉框",
  "描点",
  "转写",
  "规则执行",
] as const;

const BORDERLINE_ROLE_KEYWORDS = [
  "标注",
  "审核",
  "质检",
  "数据采集",
  "训练师",
  "BPO",
  "供应商",
  "外包",
  "众包",
  "运营",
  "商务",
  "销售",
  "产品经理",
  "项目管理",
] as const;

const BORDERLINE_SOFT_ROLE_KEYWORDS = [
  "评测",
  "评估",
  "测试",
  "内容",
] as const;

const BORDERLINE_DELIVERY_CONTEXT_KEYWORDS = [
  "人工评测",
  "人工评价",
  "评估规则",
  "评分依据",
  "评估报告",
  "测试用例",
  "自动化测试",
  "标注规范",
  "标注平台",
  "标注任务",
  "内容审核",
] as const;

const FORMAL_EMPLOYMENT_KEYWORDS = [
  "不收费",
  "无培训费",
  "不收培训费",
  "不涉及贷款",
  "无需贷款",
  "无贷款",
  "非培训",
  "不是培训",
  "直接入职",
  "正式劳动合同",
  "签订正式劳动合同",
  "直签合同",
  "公司直签",
] as const;

const STRONG_TRAINING_LOAN_TERMS = [
  "培训费",
  "课程费",
  "学费",
  "服务费",
  "报名费",
  "押金",
  "材料费",
  "保证金",
  "分期",
  "贷款",
  "培训贷",
  "学费贷",
  "包就业",
  "保offer",
  "保 offer",
  "不过退费",
  "未就业退费",
] as const;

export function scanRisks(
  jdText: string,
  options: ScanRisksOptions = {},
): RiskScanResult {
  const searchText = buildSearchText(jdText, options);
  const signals: LocalRiskSignal[] = [];

  for (const rule of RISK_RULES) {
    if (rule.id === "traditional-dev-missing-ai-stack") {
      const missingAiStackSignal = detectMissingAiStack(rule, jdText, options);

      if (missingAiStackSignal) {
        signals.push(missingAiStackSignal);
      }

      continue;
    }

    if (rule.source === "regex") {
      const match = matchRegexRule(searchText, rule.pattern);

      if (!match) {
        continue;
      }

      const signal = adjustSignalForLocalContext(
        {
          id: rule.id,
          signal: rule.signal,
          excerpt: excerptAround(searchText, match.index, match.text.length),
          severity: rule.severity,
          source: rule.source,
          category: rule.category,
          explanation: rule.explanation,
          weight: RISK_SEVERITY_WEIGHTS[rule.severity],
          matchTerms: buildRegexMatchTerms(match.text),
        },
        searchText,
        match.index,
        match.text.length,
      );

      if (signal) {
        signals.push(signal);
      }

      continue;
    }

    const dictionaryMatch = matchDictionaryRule(searchText, rule.keywords);

    if (!dictionaryMatch) {
      continue;
    }

    const signal = adjustSignalForLocalContext(
      {
        id: rule.id,
        signal: rule.signal,
        excerpt: excerptAround(
          searchText,
          dictionaryMatch.index,
          dictionaryMatch.term.length,
        ),
        severity: rule.severity,
        source: rule.source,
        category: rule.category,
        explanation: rule.explanation,
        weight: RISK_SEVERITY_WEIGHTS[rule.severity],
        matchTerms: dictionaryMatch.terms,
      },
      searchText,
      dictionaryMatch.index,
      dictionaryMatch.term.length,
    );

    if (signal) {
      signals.push(signal);
    }
  }

  signals.push(...detectCompositeRiskSignals(jdText, options, searchText));

  const nonAiRoleSignal = detectTraditionalRoleMissingAiStack(jdText, options);

  if (nonAiRoleSignal) {
    signals.push(nonAiRoleSignal);
  }

  const mergedSignals = applyDominanceSuppressions(
    mergeSignals(signals),
    searchText,
  );
  const totalWeight = mergedSignals.reduce(
    (sum, signal) => sum + RISK_SEVERITY_WEIGHTS[signal.severity],
    0,
  );
  const level = resolveRiskLevel(mergedSignals, totalWeight);
  const scoreCap = resolveScoreCap(level);

  return {
    level,
    summary: buildSummary(level, mergedSignals, totalWeight),
    recommendation: buildRecommendation(level, mergedSignals),
    totalWeight,
    ...(scoreCap === undefined ? {} : { scoreCap }),
    ruleVersion: RISK_RULE_VERSION,
    ruleVersionNotes: getLatestRuleVersionNotes(),
    signals: mergedSignals,
  };
}

export function mergeRiskScanResultWithSignals(
  localResult: RiskScanResult,
  additionalSignals: RiskSignal[],
): RiskScanResult {
  if (additionalSignals.length === 0 || localResult.level === "critical") {
    return localResult;
  }

  const mergedSignals = applyDominanceSuppressions(
    mergeSignals([...localResult.signals, ...additionalSignals]),
    "",
  );
  const totalWeight = mergedSignals.reduce(
    (sum, signal) => sum + resolveSignalWeight(signal),
    0,
  );
  const level = resolveRiskLevel(mergedSignals, totalWeight);
  const scoreCap = resolveScoreCap(level);

  return {
    level,
    summary: buildSummary(level, mergedSignals, totalWeight),
    recommendation: buildRecommendation(level, mergedSignals),
    totalWeight,
    ...(scoreCap === undefined ? {} : { scoreCap }),
    ruleVersion: localResult.ruleVersion ?? RISK_RULE_VERSION,
    ruleVersionNotes: localResult.ruleVersionNotes ?? getLatestRuleVersionNotes(),
    signals: mergedSignals,
  };
}

function getLatestRuleVersionNotes(): string[] {
  const latest = RISK_RULE_CHANGELOG.find(
    (entry) => entry.version === RISK_RULE_VERSION,
  );

  return latest ? [latest.summary, ...latest.changes] : [];
}

function buildSearchText(jdText: string, options: ScanRisksOptions): string {
  return [options.role, options.company, options.sourceUrl, jdText]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");
}

function matchRegexRule(
  text: string,
  pattern: RegExp,
): { index: number; text: string } | null {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  const match = matcher.exec(text);

  if (!match || match.index < 0) {
    return null;
  }

  return {
    index: match.index,
    text: match[0],
  };
}

function matchDictionaryRule(
  text: string,
  keywords: readonly string[],
): { index: number; term: string; terms: string[] } | null {
  const lowerText = text.toLocaleLowerCase();
  const matches = keywords
    .map((keyword) => ({
      term: keyword,
      index: lowerText.indexOf(keyword.toLocaleLowerCase()),
    }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => left.index - right.index);

  const firstMatch = matches[0];

  if (!firstMatch) {
    return null;
  }

  return {
    index: firstMatch.index,
    term: firstMatch.term,
    terms: [...new Set(matches.map((match) => match.term))],
  };
}

function buildRegexMatchTerms(matchText: string): string[] {
  const normalized = normalizeWhitespace(matchText);

  return normalized.length > 0 && normalized.length <= MAX_MATCH_TERM_LENGTH
    ? [normalized]
    : [];
}

function adjustSignalForLocalContext(
  signal: LocalRiskSignal,
  text: string,
  index: number,
  length: number,
): LocalRiskSignal | null {
  if (signal.category !== "training_loan") {
    return signal;
  }

  const context = localContextAround(text, index, length);

  if (isNegatedTrainingLoanContext(context)) {
    return null;
  }

  if (
    signal.id === "training-loan-train-before-work" &&
    isInternalOnboardingTrainingContext(context)
  ) {
    return null;
  }

  return signal;
}

function detectCompositeRiskSignals(
  jdText: string,
  options: ScanRisksOptions,
  searchText: string,
): LocalRiskSignal[] {
  return [
    detectEducationCompanyAiTrainingDisguise(jdText, options, searchText),
    detectLowBarrierTrainingPayTrap(jdText, options, searchText),
    detectAiCourseSalesOrToolOnlyRole(jdText, options, searchText),
    detectAiDataBoundaryRole(jdText, options, searchText),
  ].filter((signal): signal is LocalRiskSignal => Boolean(signal));
}

function detectEducationCompanyAiTrainingDisguise(
  jdText: string,
  options: ScanRisksOptions,
  searchText: string,
): LocalRiskSignal | null {
  const titleText = buildTitleText(jdText, options);
  const companyText = uniqueTextParts([
    options.company,
    ...jdText.split(/\r?\n/).slice(0, 8),
  ]);
  const educationTerms = findMatchedKeywords(
    companyText,
    EDUCATION_COMPANY_KEYWORDS,
  );
  const aiTerms = findMatchedKeywords(
    uniqueTextParts([titleText, searchText]),
    AI_ROLE_CONTEXT_KEYWORDS,
  );
  const trainingTerms = [
    ...findMatchedKeywords(searchText, COURSE_WORK_KEYWORDS),
    ...findMatchedKeywords(searchText, TRAINING_FUNNEL_KEYWORDS),
    ...findMatchedKeywords(searchText, LOW_BAR_KEYWORDS),
  ];

  if (
    educationTerms.length === 0 ||
    aiTerms.length === 0 ||
    trainingTerms.length === 0
  ) {
    return null;
  }

  return createCompositeSignal({
    id: "training-company-ai-course-disguise",
    signal: "教育培训主体包装 AI 岗",
    category: "training_company_disguise",
    severity: "critical",
    sourceText: searchText,
    matchTerms: [
      ...educationTerms,
      ...aiTerms,
      ...trainingTerms,
      "培训",
      "课程",
    ],
    explanation:
      "公司主体带教育、培训、学校或学院特征，同时用 AI 课程、学员、招生、零基础或岗前培训包装岗位，需按教育机构伪装招聘高危处理。",
  });
}

function detectLowBarrierTrainingPayTrap(
  jdText: string,
  options: ScanRisksOptions,
  searchText: string,
): LocalRiskSignal | null {
  const titleText = buildTitleText(jdText, options);
  const aiTerms = findMatchedKeywords(
    uniqueTextParts([titleText, searchText]),
    AI_ROLE_CONTEXT_KEYWORDS,
  );
  const lowBarTerms = findMatchedKeywords(searchText, LOW_BAR_KEYWORDS);
  const highPayTerms = [
    ...findMatchedKeywords(searchText, HIGH_PAY_PROMISE_KEYWORDS),
    ...findSalaryPromiseTerms(searchText),
  ];
  const trainingTerms = [
    ...findMatchedKeywords(searchText, TRAINING_FUNNEL_KEYWORDS),
    ...findMatchedKeywords(searchText, COURSE_WORK_KEYWORDS),
  ];
  const contentWorkTerms = findMatchedKeywords(
    searchText,
    FAKE_AI_CONTENT_WORK_KEYWORDS,
  );

  if (
    aiTerms.length === 0 ||
    lowBarTerms.length === 0 ||
    highPayTerms.length === 0 ||
    (trainingTerms.length === 0 && contentWorkTerms.length === 0)
  ) {
    return null;
  }

  if (hasStrongTrueAiStack(searchText) && trainingTerms.length === 0) {
    return null;
  }

  const hardLoanTerms = findMatchedKeywords(searchText, STRONG_TRAINING_LOAN_TERMS);
  const severity: RiskSeverity =
    hardLoanTerms.length > 0 ||
    trainingTerms.some((term) => /免费教学|一对一教学|手把手教学|课程报名/.test(term))
      ? "critical"
      : "high";

  return createCompositeSignal({
    id: "overpromise-low-bar-high-pay-training",
    signal: "低门槛与高薪承诺绑定",
    category: severity === "critical" ? "training_loan" : "overpromise",
    severity,
    sourceText: searchText,
    matchTerms: [
      ...aiTerms,
      ...lowBarTerms,
      ...highPayTerms,
      ...trainingTerms,
      ...contentWorkTerms,
    ],
    explanation:
      "AI 岗位同时强调零基础/无经验、快速教学或内容变现，并绑定高薪收益承诺，这比单个关键词更接近招转培或虚假兼职漏斗。",
  });
}

function detectAiCourseSalesOrToolOnlyRole(
  jdText: string,
  options: ScanRisksOptions,
  searchText: string,
): LocalRiskSignal | null {
  const titleText = buildTitleText(jdText, options);
  const roleContext = uniqueTextParts([
    options.role,
    titleText,
    ...jdText.split(/\r?\n/).slice(0, 12),
  ]);
  const aiTerms = findMatchedKeywords(
    uniqueTextParts([roleContext, searchText]),
    AI_ROLE_CONTEXT_KEYWORDS,
  );
  const roleTerms = findMatchedKeywords(roleContext, [
    "课程顾问",
    "招生",
    "销售",
    "客服",
    "客户",
    "商务",
    "BD",
    "运营",
    "推广",
    "短视频剪辑",
    "内容生成",
  ]);
  const workTerms = findMatchedKeywords(searchText, [
    "课程报名",
    "客户维护",
    "精准客户",
    "企业微信",
    "促成",
    "转化",
    "成交",
    "提成",
    "客服经验",
    "销售经验",
    "账号运营",
    "内容发布",
    "只需会使用",
    "AI工具一键上手",
  ]);
  const courseTerms = findMatchedKeywords(searchText, COURSE_WORK_KEYWORDS);

  if (
    aiTerms.length === 0 ||
    roleTerms.length === 0 ||
    (workTerms.length === 0 && courseTerms.length === 0)
  ) {
    return null;
  }

  if (hasStrongTrueAiStack(searchText)) {
    return null;
  }

  return createCompositeSignal({
    id: "non-ai-ai-title-sales-course",
    signal: "标题含 AI 但正文偏传统开发/销售/客服/课程",
    category: "non_ai_positioning",
    severity: "high",
    sourceText: searchText,
    matchTerms: [...aiTerms, ...roleTerms, ...workTerms, ...courseTerms],
    explanation:
      "标题使用 AI 吸引求职者，但职责集中在销售、客服、课程转化、内容发布或 AI 工具操作，没有模型、数据、评测或上线链路。",
  });
}

function detectAiDataBoundaryRole(
  jdText: string,
  options: ScanRisksOptions,
  searchText: string,
): LocalRiskSignal | null {
  const titleText = buildTitleText(jdText, options);
  const roleContext = uniqueTextParts([
    options.role,
    titleText,
    ...jdText.split(/\r?\n/).slice(0, 12),
  ]);
  const aiTerms = findMatchedKeywords(
    uniqueTextParts([roleContext, searchText]),
    AI_ROLE_CONTEXT_KEYWORDS,
  );
  const hardBoundaryTerms = findMatchedKeywords(
    searchText,
    BORDERLINE_ROLE_KEYWORDS,
  );
  const softBoundaryTerms = findMatchedKeywords(
    searchText,
    BORDERLINE_SOFT_ROLE_KEYWORDS,
  );
  const deliveryContextTerms = findMatchedKeywords(
    searchText,
    BORDERLINE_DELIVERY_CONTEXT_KEYWORDS,
  );
  const roleBoundaryTerms = findMatchedKeywords(roleContext, [
    ...BORDERLINE_ROLE_KEYWORDS,
    ...BORDERLINE_SOFT_ROLE_KEYWORDS,
  ]);
  const basicDataTerms = findMatchedKeywords(searchText, BASIC_DATA_TASK_KEYWORDS);
  const hasSoftDeliveryBoundary =
    softBoundaryTerms.length > 0 &&
    (deliveryContextTerms.length > 0 ||
      (roleBoundaryTerms.some((term) => /评测|评估|测试/.test(term)) &&
        basicDataTerms.length > 0));

  if (
    aiTerms.length === 0 ||
    (hardBoundaryTerms.length === 0 && !hasSoftDeliveryBoundary)
  ) {
    return null;
  }

  const strongLoanTerms = findMatchedKeywords(searchText, STRONG_TRAINING_LOAN_TERMS);

  if (strongLoanTerms.length > 0) {
    return null;
  }

  return createCompositeSignal({
    id: "data-boundary-ai-evaluation-ops",
    signal: "AI 数据/评测边界职责",
    category: "data_labeling_disguise",
    severity: "medium",
    sourceText: searchText,
    matchTerms: [
      ...aiTerms,
      ...hardBoundaryTerms,
      ...softBoundaryTerms,
      ...deliveryContextTerms,
      ...basicDataTerms,
    ],
    explanation:
      "岗位处在 AI 数据、标注、审核、评测、供应商或运营交付边界，通常应继续核实职责深度，但没有收费/贷款/包就业时不应直接判 critical。",
  });
}

function createCompositeSignal({
  id,
  signal,
  category,
  severity,
  sourceText,
  matchTerms,
  explanation,
}: {
  id: string;
  signal: string;
  category: NonNullable<RiskSignal["category"]>;
  severity: RiskSeverity;
  sourceText: string;
  matchTerms: string[];
  explanation: string;
}): LocalRiskSignal {
  const uniqueTerms = [...new Set(matchTerms.filter(Boolean))];
  const firstTerm = uniqueTerms[0] ?? signal;
  const index = Math.max(0, sourceText.indexOf(firstTerm));

  return {
    id,
    signal,
    excerpt: excerptAround(sourceText, index, firstTerm.length),
    severity,
    source: "dictionary",
    category,
    explanation,
    weight: RISK_SEVERITY_WEIGHTS[severity],
    matchTerms: uniqueTerms.slice(0, 20),
  };
}

function findSalaryPromiseTerms(text: string): string[] {
  const terms = new Set<string>();
  const patterns = [
    /日\s?\d{3,4}\+?/gi,
    /\d{3,4}\s?-\s?\d{3,4}\s?元\/时/gi,
    /\d+(?:\.\d+)?\s?-\s?\d+(?:\.\d+)?\s?万/gi,
    /\d+(?:\.\d+)?\s?-\s?\d+(?:\.\d+)?\s?w/gi,
    /\d+(?:\.\d+)?w/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[0]) {
        terms.add(match[0]);
      }
    }
  }

  return [...terms];
}

function localContextAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - LOCAL_CONTEXT_RADIUS);
  const end = Math.min(text.length, index + length + LOCAL_CONTEXT_RADIUS);

  return normalizeWhitespace(text.slice(start, end));
}

function isNegatedTrainingLoanContext(context: string): boolean {
  return (
    containsAnyKeyword(context, FORMAL_EMPLOYMENT_KEYWORDS) &&
    !hasPositiveTrainingLoanContext(context)
  );
}

function isInternalOnboardingTrainingContext(context: string): boolean {
  if (hasPositiveTrainingLoanContext(context)) {
    return false;
  }

  return /员工实行|入职培训|新人培训|内部培训|培训体系|培训内容包括|工具使用|标注规范|案例练习|公司直签|直签合同|正式劳动合同/.test(
    context,
  );
}

function hasPositiveTrainingLoanContext(context: string): boolean {
  return /(收取|缴纳|支付|承担|办理|支持|提供|可办|报名|缴费).{0,12}(培训费|课程费|学费|服务费|报名费|押金|保证金|分期|贷款|培训贷|学费贷)|(培训费|课程费|学费|服务费).{0,16}(扣|抵扣|代扣)|包就业|保\s?offer|不过退费|未就业退费/i.test(
    context,
  );
}

function hasStrongTrueAiStack(text: string): boolean {
  return findMatchedKeywords(text, TRUE_AI_TECH_STACK_KEYWORDS).length >= 3;
}

function detectMissingAiStack(
  rule: (typeof RISK_RULES)[number],
  jdText: string,
  options: ScanRisksOptions,
): LocalRiskSignal | null {
  if (rule.id !== "traditional-dev-missing-ai-stack") {
    return null;
  }

  const titleText = buildTitleText(jdText, options);
  const bodyText = stripTitleLines(jdText);
  const hasAiTitle = containsAiRoleTitle(titleText);
  const hasTrueAiStack = containsAnyKeyword(bodyText, TRUE_AI_TECH_STACK_KEYWORDS);

  if (!hasAiTitle || hasTrueAiStack) {
    return null;
  }

  const traditionalTerms = findMatchedKeywords(
    bodyText,
    TRADITIONAL_DEV_STACK_KEYWORDS,
  );
  const matchTerms =
    traditionalTerms.length > 0
      ? traditionalTerms
      : findMatchedKeywords(titleText, AI_ROLE_TITLE_KEYWORDS);

  return {
    id: rule.id,
    signal: rule.signal,
    excerpt: makeMissingAiStackExcerpt(titleText, bodyText),
    severity: rule.severity,
    source: rule.source,
    category: rule.category,
    explanation: rule.explanation,
    weight: RISK_SEVERITY_WEIGHTS[rule.severity],
    matchTerms,
  };
}

function detectTraditionalRoleMissingAiStack(
  jdText: string,
  options: ScanRisksOptions,
): LocalRiskSignal | null {
  const searchText = buildSearchText(jdText, options);
  const titleText = buildTitleText(jdText, options);
  const leadingLines = jdText.split(/\r?\n/).slice(0, 12);
  const roleContext = uniqueTextParts([options.role, titleText, ...leadingLines]);
  const hasAiTitle = containsAiRoleTitle(roleContext);
  const hasTrueAiStack = containsAnyKeyword(searchText, TRUE_AI_TECH_STACK_KEYWORDS);

  if (hasAiTitle || hasTrueAiStack) {
    return null;
  }

  const roleTerms = findMatchedKeywords(roleContext, TRADITIONAL_NON_AI_ROLE_KEYWORDS);
  const workTerms = findMatchedKeywords(searchText, TRADITIONAL_NON_AI_WORK_KEYWORDS);
  const hasTraditionalRole =
    roleTerms.length > 0 ||
    /(产品|销售|客服|客户经理|商务|BD|运营).{0,8}(经理|专员|代表|顾问|负责人)?/i.test(
      roleContext,
    );

  if (!hasTraditionalRole && workTerms.length < 3) {
    return null;
  }

  const matchTerms = [...new Set([...roleTerms, ...workTerms])];

  return {
    id: "non-ai-traditional-role",
    signal: "传统非 AI 岗缺少 AI 岗位证据",
    excerpt: makeNonAiRoleExcerpt(roleContext, jdText),
    severity: "high",
    source: "dictionary",
    category: "non_ai_positioning",
    explanation:
      "JD 更像传统非 AI 职能岗位，未出现模型、RAG、Agent、向量库、评测或训练链路，不应被当作低风险 AI 岗。",
    advice:
      "不建议按 AI 岗推进；要求招聘方补充模型、数据、评测、上线链路和 AI 团队分工后再判断。",
    weight: RISK_SEVERITY_WEIGHTS.high,
    matchTerms,
  };
}

function buildTitleText(jdText: string, options: ScanRisksOptions): string {
  const titleLines = jdText
    .split(/\r?\n/)
    .slice(0, 12)
    .filter((line) => TITLE_LINE_PATTERN.test(line));

  return [options.role, ...titleLines]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");
}

function uniqueTextParts(values: Array<string | undefined>): string {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = normalizeWhitespace(value ?? "");

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output.join("\n");
}

function stripTitleLines(jdText: string): string {
  return jdText
    .split(/\r?\n/)
    .filter((line) => !TITLE_LINE_PATTERN.test(line))
    .join("\n");
}

function containsAiRoleTitle(text: string): boolean {
  if (!text.trim()) {
    return false;
  }

  return (
    containsAnyKeyword(text, AI_ROLE_TITLE_KEYWORDS) ||
    GENERIC_AI_TITLE_PATTERN.test(text)
  );
}

function containsAnyKeyword(
  text: string,
  keywords: readonly string[],
): boolean {
  return findMatchedKeywords(text, keywords).length > 0;
}

function findMatchedKeywords(
  text: string,
  keywords: readonly string[],
): string[] {
  const lowerText = text.toLocaleLowerCase();

  return keywords.filter((keyword) =>
    lowerText.includes(keyword.toLocaleLowerCase()),
  );
}

function mergeSignals(signals: RiskSignal[]): RiskSignal[] {
  const signalMap = new Map<string, RiskSignal>();

  for (const signal of signals) {
    const existingSignal = signalMap.get(signal.signal);

    if (!existingSignal) {
      signalMap.set(signal.signal, signal);
      continue;
    }

    if (shouldPreferExistingSignal(existingSignal, signal)) {
      signalMap.set(signal.signal, mergeSameSignalMatchTerms(existingSignal, signal));
      continue;
    }

    if (SEVERITY_RANK[signal.severity] > SEVERITY_RANK[existingSignal.severity]) {
      signalMap.set(signal.signal, signal);
      continue;
    }

    if (SEVERITY_RANK[signal.severity] === SEVERITY_RANK[existingSignal.severity]) {
      signalMap.set(signal.signal, mergeEqualSeveritySignal(existingSignal, signal));
    }
  }

  return [...signalMap.values()]
    .map((signal) => ({
      ...signal,
      weight: resolveSignalWeight(signal),
    }))
    .sort((left, right) => {
      const severityDiff =
        SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];

      if (severityDiff !== 0) {
        return severityDiff;
      }

      return left.signal.localeCompare(right.signal, "zh-Hans-CN");
    });
}

function shouldPreferExistingSignal(
  existingSignal: RiskSignal,
  nextSignal: RiskSignal,
): boolean {
  if (existingSignal.source !== "llm" && nextSignal.source === "llm") {
    return true;
  }

  return false;
}

function mergeSameSignalMatchTerms(
  existingSignal: RiskSignal,
  nextSignal: RiskSignal,
): RiskSignal {
  return {
    ...existingSignal,
    matchTerms: [
      ...new Set([
        ...(existingSignal.matchTerms ?? []),
        ...(nextSignal.matchTerms ?? []),
      ]),
    ],
  };
}

function applyDominanceSuppressions(
  signals: RiskSignal[],
  searchText: string,
): RiskSignal[] {
  let nextSignals = [...signals];
  const criticalTrainingLoanSignals = nextSignals.filter(
    (signal) =>
      signal.category === "training_loan" && signal.severity === "critical",
  );

  if (criticalTrainingLoanSignals.length >= 3) {
    return criticalTrainingLoanSignals;
  }

  if (hasStrongTrueAiStack(searchText)) {
    nextSignals = nextSignals.filter(
      (signal) => !isGenericTraditionalDevFalsePositive(signal),
    );
  }

  const hasNonAiTraditionalRole = nextSignals.some(
    (signal) => signal.id === "non-ai-traditional-role",
  );

  if (hasNonAiTraditionalRole) {
    return nextSignals.filter(
      (signal) => signal.id !== "traditional-dev-crud-business-system",
    );
  }

  const hasAiTitleJavaStack = nextSignals.some(
    (signal) => signal.id === "traditional-dev-ai-title-java-stack",
  );
  const hasMissingAiStack = nextSignals.some(
    (signal) => signal.id === "traditional-dev-missing-ai-stack",
  );

  if (hasAiTitleJavaStack && hasMissingAiStack) {
    return nextSignals.filter(
      (signal) => signal.id !== "traditional-dev-crud-business-system",
    );
  }

  return nextSignals;
}

function isGenericTraditionalDevFalsePositive(signal: RiskSignal): boolean {
  return (
    signal.category === "traditional_dev_disguise" &&
    [
      "traditional-dev-ai-title-java-stack",
      "traditional-dev-crud-business-system",
      "traditional-dev-maintain-existing-system",
      "traditional-dev-missing-ai-stack",
    ].includes(signal.id ?? "")
  );
}

function mergeEqualSeveritySignal(
  existingSignal: RiskSignal,
  nextSignal: RiskSignal,
): RiskSignal {
  return {
    ...existingSignal,
    excerpt:
      nextSignal.excerpt.length > existingSignal.excerpt.length
        ? nextSignal.excerpt
        : existingSignal.excerpt,
    matchTerms: [
      ...new Set([
        ...(existingSignal.matchTerms ?? []),
        ...(nextSignal.matchTerms ?? []),
      ]),
    ],
  };
}

function resolveSignalWeight(signal: RiskSignal): number {
  if (signal.source === "llm") {
    if (signal.severity === "critical") {
      return LLM_SEVERITY_WEIGHTS.high;
    }

    return LLM_SEVERITY_WEIGHTS[signal.severity];
  }

  return RISK_SEVERITY_WEIGHTS[signal.severity];
}

function resolveRiskLevel(
  signals: RiskSignal[],
  totalWeight: number,
): RiskLevel {
  if (signals.some((signal) => signal.severity === "critical")) {
    return "critical";
  }

  if (signals.some((signal) => signal.severity === "high")) {
    return "high";
  }

  if (totalWeight >= 6) {
    return "high";
  }

  if (totalWeight >= 2) {
    return "medium";
  }

  return "low";
}

function resolveScoreCap(level: RiskLevel): number | undefined {
  if (level === "critical") {
    return 1.5;
  }

  if (level === "high") {
    return 2.5;
  }

  return undefined;
}

function buildSummary(
  level: RiskLevel,
  signals: RiskSignal[],
  totalWeight: number,
): string {
  const signalCount = signals.length;
  const hasNonAiPositioning = signals.some(
    (signal) => signal.category === "non_ai_positioning",
  );

  if (level === "critical") {
    return `命中 ${signalCount} 个风险信号，其中包含 critical 级别高危信号；风险总分 ${totalWeight}，判定为虚假 AI 岗风险。`;
  }

  if (hasNonAiPositioning) {
    return `命中 ${signalCount} 个风险信号，其中包含非 AI 岗位定位信号；风险总分 ${totalWeight}，不应按低风险 AI 岗处理。`;
  }

  if (level === "high") {
    return `命中 ${signalCount} 个风险信号，风险总分 ${totalWeight}；未触发 critical，但整体达到高风险阈值。`;
  }

  if (level === "medium") {
    return `命中 ${signalCount} 个风险信号，风险总分 ${totalWeight}；岗位存在需要进一步核实的中风险描述。`;
  }

  return signalCount === 0
    ? "未命中本地风险规则，当前按低风险处理。"
    : `命中 ${signalCount} 个低风险信号，风险总分 ${totalWeight}；当前按低风险处理。`;
}

function buildRecommendation(level: RiskLevel, signals: RiskSignal[]): string {
  if (level === "critical") {
    return "建议停止投递，并优先核实是否存在培训收费、贷款分期、包就业承诺或招聘主体不一致问题。";
  }

  if (signals.some((signal) => signal.category === "non_ai_positioning")) {
    return "不建议按 AI 岗推进；除非招聘方能补充模型、数据、评测、上线链路和 AI 团队分工，否则应视为通用产品岗位。";
  }

  if (level === "high") {
    return "建议谨慎推进，面试前要求对方明确 AI 研发职责占比、真实技术栈、劳动合同主体和交付模式。";
  }

  if (level === "medium") {
    return "建议继续沟通，但重点追问模型、数据、评测、上线权限和团队分工，避免岗位内容被泛化包装。";
  }

  return "可进入正常评估流程，继续结合技术栈深度、团队背景和成长空间判断岗位质量。";
}

function makeMissingAiStackExcerpt(titleText: string, bodyText: string): string {
  const titleExcerpt = normalizeWhitespace(titleText);
  const bodyExcerpt = normalizeWhitespace(bodyText).slice(0, MAX_EXCERPT_LENGTH);

  return clampExcerpt(
    `标题包含 AI 岗描述：${titleExcerpt || "未提取到明确标题"}；正文未发现可核验 AI 技术栈。${bodyExcerpt}`,
  );
}

function makeNonAiRoleExcerpt(roleText: string, bodyText: string): string {
  const roleExcerpt = normalizeWhitespace(roleText);
  const bodyExcerpt = normalizeWhitespace(bodyText).slice(0, MAX_EXCERPT_LENGTH);

  return clampExcerpt(
    `岗位线索：${roleExcerpt || "未提取到明确岗位名称"}；正文未发现可核验 AI 技术栈。${bodyExcerpt}`,
  );
}

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - CONTEXT_RADIUS);
  const end = Math.min(text.length, index + length + CONTEXT_RADIUS);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";

  return clampExcerpt(`${prefix}${normalizeWhitespace(text.slice(start, end))}${suffix}`);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clampExcerpt(excerpt: string): string {
  if (excerpt.length <= MAX_EXCERPT_LENGTH) {
    return excerpt;
  }

  return `${excerpt.slice(0, MAX_EXCERPT_LENGTH - 3)}...`;
}
