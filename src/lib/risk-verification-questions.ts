import type {
  RiskLevel,
  RiskScanResult,
  RiskSignal,
  RiskVerificationQuestion,
  RiskVerificationQuestionResult,
} from "./types";

export const RISK_VERIFICATION_QUESTION_RULE_VERSION =
  "risk-verification-questions.v1";

export const RISK_VERIFICATION_QUESTION_DISCLAIMER =
  "这些问题只用于辅助你向 HR 或面试官核实岗位真实性、职责边界和用工安排，不代表招聘方一定存在违规，也不会自动发送给任何外部对象。";

type RiskVerificationQuestionGeneratorInput = {
  jdText: string;
  company?: string;
  role?: string;
  riskScan: RiskScanResult;
};

type QuestionDraft = Omit<RiskVerificationQuestion, "relatedEvidence"> & {
  relatedEvidence?: string | null;
};

const severityRank: Record<RiskLevel, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const priorityRank: Record<RiskVerificationQuestion["priority"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const decisionLabels: Record<RiskLevel, string> = {
  critical: "虚假 AI 岗倾向，需要先核实收费、协议和劳动关系",
  high: "高风险 AI 岗，需要核实岗位真实性和职责边界",
  medium: "边界岗，需要核实 AI 技术含金量和团队边界",
  low: "低风险，但建议继续核实 AI 技术含金量",
};

const trainingCategories = new Set([
  "training_loan",
  "training_company_disguise",
]);
const traditionalAiDisguiseCategories = new Set([
  "traditional_dev_disguise",
  "non_ai_positioning",
]);
const overpromiseCategories = new Set(["overpromise"]);
const dataLabelingCategories = new Set(["data_labeling_disguise"]);

export function createRiskVerificationQuestionResult({
  jdText,
  riskScan,
}: RiskVerificationQuestionGeneratorInput): RiskVerificationQuestionResult {
  const sortedSignals = [...riskScan.signals].sort(compareSignalsByRisk);
  const questions: QuestionDraft[] = [];
  const hasObviousHighRisk =
    riskScan.level === "critical" ||
    riskScan.level === "high" ||
    sortedSignals.some(
      (signal) => signal.severity === "critical" || signal.severity === "high",
    );

  const hasTrainingRisk = hasAnyCategory(sortedSignals, trainingCategories);
  const hasTraditionalAiDisguise = hasAnyCategory(
    sortedSignals,
    traditionalAiDisguiseCategories,
  );
  const hasOverpromise = hasAnyCategory(sortedSignals, overpromiseCategories);
  const hasDataLabeling = hasAnyCategory(sortedSignals, dataLabelingCategories);

  if (hasTrainingRisk) {
    questions.push(...buildTrainingQuestions(sortedSignals, jdText));
  }

  if (hasTraditionalAiDisguise) {
    questions.push(...buildTraditionalAiDisguiseQuestions(sortedSignals, jdText));
  }

  if (hasDataLabeling) {
    questions.push(...buildDataLabelingQuestions(sortedSignals, jdText));
  }

  if (hasOverpromise) {
    questions.push(...buildOverpromiseQuestions(sortedSignals, jdText));
  }

  if (!hasObviousHighRisk || questions.length === 0) {
    questions.push(...buildBaselineQuestions(sortedSignals, jdText));
  }

  return {
    decisionLabel: decisionLabels[riskScan.level],
    riskLevel: riskScan.level,
    ruleVersion: buildRuleVersion(riskScan.ruleVersion),
    questions: normalizeQuestions(questions),
    disclaimer: RISK_VERIFICATION_QUESTION_DISCLAIMER,
  };
}

function buildTrainingQuestions(
  signals: RiskSignal[],
  jdText: string,
): QuestionDraft[] {
  const evidence = findEvidence(signals, jdText, trainingCategories, [
    "培训费",
    "服务费",
    "押金",
    "贷款",
    "分期",
    "先培训",
    "包就业",
  ]);
  const reason = buildReason(
    signals,
    trainingCategories,
    "JD 命中了培训贷、收费或招转培相关信号，必须先确认是否存在候选人付费或培训筛选安排。",
  );

  return [
    {
      id: "training-fees",
      category: "培训贷 / 收费",
      question:
        "这个岗位在入职前、培训期或试用期是否需要候选人支付培训费、服务费、押金、设备费，或从工资中扣除任何费用？",
      reason,
      relatedEvidence: evidence,
      priority: "high",
    },
    {
      id: "training-agreements",
      category: "培训贷 / 协议",
      question:
        "候选人是否需要签署培训协议、服务期协议、借款协议、分期协议或第三方贷款文件？如果需要，协议名称、签署主体和解除条件分别是什么？",
      reason:
        "收费和培训承诺常通过协议或分期文件体现，确认文件名称和签署主体可以避免把招聘流程误当成培训消费。",
      relatedEvidence: evidence,
      priority: "high",
    },
    {
      id: "training-employment-relationship",
      category: "招转培 / 劳动关系",
      question:
        "这是正式岗位招聘还是培训筛选？劳动合同的签署主体是谁，社保从什么时候缴纳，培训未通过时是否仍建立劳动关系？",
      reason:
        "招转培风险的核心在于招聘主体、培训主体和劳动关系不清，需要把合同、社保和录用条件问清楚。",
      relatedEvidence: evidence,
      priority: "high",
    },
    {
      id: "training-placement",
      category: "招转培 / 安置承诺",
      question:
        "如果提到合作企业、统一安排或包就业，能否说明实际入职公司、岗位地点、薪资结构和不录用时的处理方式？",
      reason:
        "包就业或合作企业安置不等同于明确 offer，需要核实最终用工主体和不能录用时的责任边界。",
      relatedEvidence: evidence,
      priority: "high",
    },
  ];
}

function buildTraditionalAiDisguiseQuestions(
  signals: RiskSignal[],
  jdText: string,
): QuestionDraft[] {
  const evidence = findEvidence(signals, jdText, traditionalAiDisguiseCategories, [
    "Java",
    "CRUD",
    "业务系统",
    "维护",
    "驻场",
    "AI",
    "ChatGPT",
  ]);
  const reason = buildReason(
    signals,
    traditionalAiDisguiseCategories,
    "JD 命中了传统开发包装 AI 或 AI 技术栈缺失信号，需要确认真实工作是否围绕模型、RAG、Agent 或算法闭环。",
  );

  return [
    {
      id: "traditional-ai-work-ratio",
      category: "传统岗位包装 AI / AI 占比",
      question:
        "这个岗位日常工作中，模型、RAG、Agent、算法实验或模型工程相关任务大约占比多少？传统业务开发、维护或外包交付占比多少？",
      reason,
      relatedEvidence: evidence,
      priority: "high",
    },
    {
      id: "traditional-ai-deliverables",
      category: "传统岗位包装 AI / 交付物",
      question:
        "前三个月希望候选人交付哪些可验收成果？这些交付物里哪些直接涉及模型链路、数据链路、评测或线上 AI 功能？",
      reason:
        "明确前三个月交付物可以判断岗位是 AI 工程岗位，还是只把传统系统开发换成 AI 标题。",
      relatedEvidence: evidence,
      priority: "high",
    },
    {
      id: "traditional-ai-production-users",
      category: "传统岗位包装 AI / 生产环境",
      question:
        "相关 AI 功能是否已经进入生产环境？是否有真实用户、业务方或客户在使用，候选人会负责哪些线上链路？",
      reason:
        "真实 AI 岗通常能说明生产环境、真实用户和候选人负责的线上链路，而不是只停留在概念或工具体验。",
      relatedEvidence: evidence,
      priority: "high",
    },
    {
      id: "traditional-ai-evaluation-metrics",
      category: "传统岗位包装 AI / 评测指标",
      question:
        "团队如何评估 AI 功能效果？是否有召回率、准确率、幻觉率、延迟、成本、用户转化或人工质检等明确指标？",
      reason:
        "评测指标能验证岗位是否真的参与 AI 系统迭代，而不是只做通用开发或简单工具调用。",
      relatedEvidence: evidence,
      priority: "high",
    },
    {
      id: "traditional-ai-technical-loop",
      category: "传统岗位包装 AI / 技术闭环",
      question:
        "候选人是否会参与数据采集、特征或检索设计、提示词/模型迭代、实验评测和上线监控的完整技术闭环？",
      reason:
        "技术闭环能区分真实 AI 产品/工程岗位和只接触少量 AI 概念的传统岗位。",
      relatedEvidence: evidence,
      priority: "high",
    },
  ];
}

function buildDataLabelingQuestions(
  signals: RiskSignal[],
  jdText: string,
): QuestionDraft[] {
  const evidence = findEvidence(signals, jdText, dataLabelingCategories, [
    "标注",
    "质检",
    "校对",
    "数据运营",
    "AI 训练师",
    "评测",
  ]);
  const reason = buildReason(
    signals,
    dataLabelingCategories,
    "JD 命中了数据标注或评测执行伪装 AI 研发的信号，需要确认岗位核心产出和权限边界。",
  );

  return [
    {
      id: "data-labeling-core-work",
      category: "数据标注边界",
      question:
        "这个岗位的核心工作是标注、质检和数据运营，还是会参与模型训练、算法实验、误差分析和评测方案设计？两类工作各占多少？",
      reason,
      relatedEvidence: evidence,
      priority: "medium",
    },
    {
      id: "data-labeling-model-access",
      category: "数据标注边界",
      question:
        "候选人是否有权限查看模型指标、调整评测集、参与实验复盘或推动模型/检索/策略迭代？",
      reason:
        "能否接触模型指标和实验复盘，是判断岗位是否有 AI 技术含金量的重要边界。",
      relatedEvidence: evidence,
      priority: "medium",
    },
  ];
}

function buildOverpromiseQuestions(
  signals: RiskSignal[],
  jdText: string,
): QuestionDraft[] {
  const evidence = findEvidence(signals, jdText, overpromiseCategories, [
    "高薪",
    "保 offer",
    "包就业",
    "不封顶",
    "大厂",
    "短期",
  ]);
  const reason = buildReason(
    signals,
    overpromiseCategories,
    "JD 命中了薪资、offer 或成长速度的强承诺话术，需要确认哪些内容能进入正式合同或 offer。",
  );

  return [
    {
      id: "overpromise-contract",
      category: "过度承诺 / 合同落地",
      question:
        "JD 中提到的薪资、奖金、offer、入职时间或晋升承诺，哪些会写入正式 offer、劳动合同或补充协议？",
      reason,
      relatedEvidence: evidence,
      priority: "medium",
    },
    {
      id: "overpromise-conditions",
      category: "过度承诺 / 条件边界",
      question:
        "这些承诺是否附带业绩、培训、考核、转正、服务期或地点限制？如果未达成，候选人需要承担哪些责任？",
      reason:
        "把承诺条件问清楚，可以避免把营销式话术误判为确定录用或确定薪酬。",
      relatedEvidence: evidence,
      priority: "medium",
    },
  ];
}

function buildBaselineQuestions(
  signals: RiskSignal[],
  jdText: string,
): QuestionDraft[] {
  const evidence = findEvidence(signals, jdText, new Set<string>(), [
    "RAG",
    "Agent",
    "大模型",
    "向量数据库",
    "模型评测",
    "线上",
  ]);

  return [
    {
      id: "baseline-ai-technical-depth",
      category: "AI 技术含金量",
      question:
        "这个岗位最核心的 AI 技术问题是什么？候选人会直接处理模型、RAG、Agent、评测、数据闭环或线上推理链路中的哪一部分？",
      reason:
        "即使当前没有明显高风险，也需要确认岗位是否具备真实 AI 技术含金量，而不是只使用 AI 工具或概念。",
      relatedEvidence: evidence,
      priority: "medium",
    },
    {
      id: "baseline-team-boundary",
      category: "团队边界",
      question:
        "候选人入职后归属哪个团队，直接负责人是谁，和算法、平台、产品、数据或业务团队的协作边界是什么？",
      reason:
        "团队归属和负责人能帮助判断岗位是否有真实资源、明确职责和可持续成长环境。",
      relatedEvidence: evidence,
      priority: "medium",
    },
    {
      id: "baseline-first-90-days",
      category: "前三个月交付物",
      question:
        "入职前三个月的主要交付物、验收标准和考核指标是什么？其中哪些指标能证明 AI 功能真的产生业务或技术价值？",
      reason:
        "前三个月交付物能把模糊 JD 转成可核实的工作目标，降低边界不清和包装岗位风险。",
      relatedEvidence: evidence,
      priority: "low",
    },
  ];
}

function normalizeQuestions(
  drafts: QuestionDraft[],
): RiskVerificationQuestion[] {
  const seen = new Set<string>();
  const normalized: RiskVerificationQuestion[] = [];

  for (const draft of drafts) {
    if (seen.has(draft.id)) {
      continue;
    }

    seen.add(draft.id);
    const relatedEvidence = normalizeOptionalText(draft.relatedEvidence, 1_000);

    normalized.push({
      id: draft.id,
      category: draft.category,
      question: draft.question,
      reason: draft.reason,
      ...(relatedEvidence ? { relatedEvidence } : {}),
      priority: draft.priority,
    });
  }

  return normalized.sort((left, right) => {
    const priorityDelta = priorityRank[right.priority] - priorityRank[left.priority];

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return drafts.findIndex((draft) => draft.id === left.id) -
      drafts.findIndex((draft) => draft.id === right.id);
  });
}

function compareSignalsByRisk(left: RiskSignal, right: RiskSignal): number {
  const severityDelta = severityRank[right.severity] - severityRank[left.severity];

  if (severityDelta !== 0) {
    return severityDelta;
  }

  return (left.id ?? left.signal).localeCompare(right.id ?? right.signal, "zh-Hans-CN");
}

function hasAnyCategory(signals: RiskSignal[], categories: Set<string>): boolean {
  return signals.some((signal) => {
    const category = signal.category?.trim();

    return Boolean(category && categories.has(category));
  });
}

function buildReason(
  signals: RiskSignal[],
  categories: Set<string>,
  fallback: string,
): string {
  const matchedSignals = signals
    .filter((signal) => {
      const category = signal.category?.trim();

      return Boolean(category && categories.has(category));
    })
    .slice(0, 2);

  if (matchedSignals.length === 0) {
    return fallback;
  }

  return `JD 命中「${matchedSignals
    .map((signal) => signal.signal)
    .join("」「")}」等信号，${fallback.replace(/^JD 命中了?/, "")}`;
}

function findEvidence(
  signals: RiskSignal[],
  jdText: string,
  categories: Set<string>,
  fallbackTerms: string[],
): string | null {
  const signalEvidence = signals
    .filter((signal) => {
      if (categories.size === 0) {
        return Boolean(signal.excerpt?.trim());
      }

      const category = signal.category?.trim();

      return Boolean(category && categories.has(category) && signal.excerpt?.trim());
    })
    .sort(compareSignalsByRisk)
    .map((signal) => signal.excerpt)
    .find((excerpt) => excerpt.trim().length > 0);

  if (signalEvidence) {
    return signalEvidence;
  }

  return excerptByTerms(jdText, fallbackTerms);
}

function excerptByTerms(jdText: string, terms: string[]): string | null {
  const normalizedText = normalizeWhitespace(jdText);
  const lowerText = normalizedText.toLocaleLowerCase();
  const match = terms
    .map((term) => ({
      index: lowerText.indexOf(term.toLocaleLowerCase()),
      term,
    }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index)[0];

  if (!match) {
    return null;
  }

  const start = Math.max(0, match.index - 80);
  const end = Math.min(normalizedText.length, match.index + match.term.length + 120);

  return normalizeOptionalText(normalizedText.slice(start, end), 1_000);
}

function normalizeOptionalText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  const normalized = normalizeWhitespace(value ?? "");

  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildRuleVersion(riskRuleVersion: string | undefined): string {
  return `${riskRuleVersion ?? "risk-rules-unknown"}+${RISK_VERIFICATION_QUESTION_RULE_VERSION}`;
}
