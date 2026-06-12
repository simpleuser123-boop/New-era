import { getAgentDefinition } from "./agents";
import type {
  AgentDefinition,
  AgentId,
  AgentIntentClassification,
  AgentIntentRequest,
} from "./types";

type RoutableAgentId = Exclude<AgentId, "general-agent">;

type KeywordRule = {
  agentId: RoutableAgentId;
  label: string;
  phrases: readonly string[];
  weight: number;
};

const ROUTING_ORDER: readonly AgentId[] = [
  "interview-agent",
  "tracker-agent",
  "evaluate-agent",
  "resume-agent",
  "career-agent",
  "general-agent",
];

const KEYWORD_RULES: readonly KeywordRule[] = [
  {
    agentId: "tracker-agent",
    label: "tracker-follow-up",
    phrases: [
      "跟进",
      "逾期",
      "投递清单",
      "投递记录",
      "tracker",
      "application",
      "优先级",
      "渠道复盘",
      "面试中岗位",
      "状态更新",
      "下次跟进",
    ],
    weight: 5,
  },
  {
    agentId: "evaluate-agent",
    label: "evaluate-report-risk",
    phrases: [
      "报告风险",
      "评估报告",
      "风险",
      "评分",
      "jd",
      "岗位评估",
      "真假ai",
      "假 ai",
      "外包",
      "薪资",
      "风险信号",
      "为什么推荐",
    ],
    weight: 4,
  },
  {
    agentId: "resume-agent",
    label: "resume-gap",
    phrases: [
      "简历缺口",
      "技能缺口",
      "默认简历",
      "简历",
      "resume",
      "resume judge",
      "项目经历",
      "改简历",
      "补充经历",
      "技能差距",
    ],
    weight: 5,
  },
  {
    agentId: "interview-agent",
    label: "interview-prep",
    phrases: [
      "面试准备",
      "准备面试",
      "面试问题",
      "面试",
      "追问",
      "star",
      "自我介绍",
      "mock interview",
      "行为面",
      "技术面",
    ],
    weight: 6,
  },
  {
    agentId: "career-agent",
    label: "career-dna",
    phrases: [
      "career dna",
      "求职画像",
      "画像",
      "职业方向",
      "方向选择",
      "目标岗位",
      "目标方向",
      "偏好",
      "不接受",
      "deal breaker",
      "符合画像",
      "适合什么",
    ],
    weight: 5,
  },
];

export function classifyAgentIntent(
  request: AgentIntentRequest,
): AgentIntentClassification {
  const scores = createScoreMap();
  const matchedRules = createMatchMap();
  const message = normalizeText(request.message);
  const source = normalizeText(request.source ?? "");

  addContextScores(request, scores, matchedRules);
  addSourceScores(source, scores, matchedRules);
  addKeywordScores(message, scores, matchedRules);

  const agentId = pickAgentId(scores);

  if (agentId === "general-agent") {
    return {
      agentId,
      confidence: 0.2,
      matchedRules: [],
      reason: "未命中具体 Agent 路由规则，使用兜底 General Agent。",
    };
  }

  const score = scores[agentId];

  return {
    agentId,
    confidence: Math.min(0.95, Number((0.45 + score / 20).toFixed(2))),
    matchedRules: matchedRules[agentId],
    reason: `命中 ${matchedRules[agentId].join("、")}，路由到 ${agentId}。`,
  };
}

export function getAgentForRequest(
  request: AgentIntentRequest,
  classification = classifyAgentIntent(request),
): AgentDefinition {
  return getAgentDefinition(classification.agentId);
}

function addContextScores(
  request: AgentIntentRequest,
  scores: Record<RoutableAgentId, number>,
  matchedRules: Record<RoutableAgentId, string[]>,
): void {
  const context = request.context;
  const normalizedMessage = normalizeText(request.message);
  const hasInterviewIntent = includesAny(normalizedMessage, [
    "面试",
    "面试准备",
    "准备面试",
    "面试问题",
    "star",
  ]);

  if (context?.applicationId) {
    addScore(scores, matchedRules, "tracker-agent", 7, "context.applicationId");
  }

  if (context?.reportId) {
    addScore(scores, matchedRules, "evaluate-agent", 6, "context.reportId");

    if (hasInterviewIntent) {
      addScore(
        scores,
        matchedRules,
        "interview-agent",
        7,
        "context.reportId + interview intent",
      );
    }
  }

  if (context?.resumeId) {
    addScore(scores, matchedRules, "resume-agent", 6, "context.resumeId");

    if (hasInterviewIntent) {
      addScore(
        scores,
        matchedRules,
        "interview-agent",
        6,
        "context.resumeId + interview intent",
      );
    }
  }
}

function addSourceScores(
  source: string,
  scores: Record<RoutableAgentId, number>,
  matchedRules: Record<RoutableAgentId, string[]>,
): void {
  if (!source) {
    return;
  }

  if (includesAny(source, ["/applications", "tracker", "application"])) {
    addScore(scores, matchedRules, "tracker-agent", 4, "source.tracker");
  }

  if (includesAny(source, ["/evaluate", "/reports", "report"])) {
    addScore(scores, matchedRules, "evaluate-agent", 4, "source.evaluate");
  }

  if (includesAny(source, ["/resume", "resume"])) {
    addScore(scores, matchedRules, "resume-agent", 4, "source.resume");
  }

  if (includesAny(source, ["/interview", "interview"])) {
    addScore(scores, matchedRules, "interview-agent", 4, "source.interview");
  }

  if (includesAny(source, ["/career", "career"])) {
    addScore(scores, matchedRules, "career-agent", 4, "source.career");
  }
}

function addKeywordScores(
  message: string,
  scores: Record<RoutableAgentId, number>,
  matchedRules: Record<RoutableAgentId, string[]>,
): void {
  for (const rule of KEYWORD_RULES) {
    const matchedPhrases = rule.phrases.filter((phrase) =>
      message.includes(normalizeText(phrase)),
    );

    if (matchedPhrases.length === 0) {
      continue;
    }

    addScore(
      scores,
      matchedRules,
      rule.agentId,
      rule.weight + Math.min(3, matchedPhrases.length - 1),
      `${rule.label}:${matchedPhrases.slice(0, 3).join("|")}`,
    );
  }
}

function pickAgentId(scores: Record<RoutableAgentId, number>): AgentId {
  let selected: AgentId = "general-agent";
  let selectedScore = 0;

  for (const agentId of ROUTING_ORDER) {
    if (agentId === "general-agent") {
      continue;
    }

    const score = scores[agentId];

    if (score > selectedScore) {
      selected = agentId;
      selectedScore = score;
    }
  }

  return selectedScore > 0 ? selected : "general-agent";
}

function createScoreMap(): Record<RoutableAgentId, number> {
  return {
    "career-agent": 0,
    "evaluate-agent": 0,
    "interview-agent": 0,
    "resume-agent": 0,
    "tracker-agent": 0,
  };
}

function createMatchMap(): Record<RoutableAgentId, string[]> {
  return {
    "career-agent": [],
    "evaluate-agent": [],
    "interview-agent": [],
    "resume-agent": [],
    "tracker-agent": [],
  };
}

function addScore(
  scores: Record<RoutableAgentId, number>,
  matchedRules: Record<RoutableAgentId, string[]>,
  agentId: RoutableAgentId,
  score: number,
  matchedRule: string,
): void {
  scores[agentId] += score;
  matchedRules[agentId].push(matchedRule);
}

function includesAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(normalizeText(needle)));
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}
