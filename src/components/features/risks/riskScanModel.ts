import presetJds from "../../../../demo-data/preset-jds.json";

export type Severity = "critical" | "high" | "medium" | "low";
export type RiskSource = "regex" | "dictionary" | "llm";
export type DemoVariant = "safe" | "risky";
export type PresetJdType = "real_ai" | "fake_ai" | "borderline";
export type PresetDataSource = "competition_demo" | "local_benchmark";
export type ScanResultSource = "api" | "preset_fallback";

export type RiskSignal = {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  excerpt: string;
  interpretation: string;
  advice: string;
  source: string;
  matchTerms: string[];
};

export type RiskLevel = {
  label: string;
  summary: string;
  recommendation: string;
  score: number;
  riskScore: number;
  scoreCap: number | null;
  tone: "danger" | "warning" | "safe";
};

export type ScanResult = {
  level: RiskLevel;
  signals: RiskSignal[];
  counts: Record<Severity, number>;
  layers: ScanLayer[];
  ruleVersion: string | null;
  ruleVersionNotes: string[];
  source: ScanResultSource;
  fallbackReason?: string;
};

export type ScanLayer = {
  id: string;
  title: string;
  subtitle: string;
  progress: number;
  status: string;
  detail: string;
  tone: "primary" | "blue" | "muted";
};

export type PresetJd = {
  id: string;
  title: string;
  company: string;
  role: string;
  type: PresetJdType;
  source?: PresetDataSource;
  sourceLabel?: string;
  aiDirection: string;
  salaryRange: string;
  location: string;
  experienceLevel: string;
  demoPurpose: string;
  jdText: string;
  expectedScore: number;
  expectedRiskLevel: Severity;
  expectedRiskSignals: string[];
  expectedKeywords: string[];
};

type ScanRiskApiSignal = {
  id: string | null;
  signal: string;
  excerpt: string;
  severity: Severity;
  source: RiskSource;
  category: string | null;
  explanation: string | null;
  advice: string | null;
  weight: number | null;
  matchTerms: string[];
};

export type ScanRiskApiResponse =
  | {
      ok: true;
      riskLevel: Severity;
      riskScore: number;
      ruleVersion?: string | null;
      ruleVersionNotes?: string[];
      scoreCap: number | null;
      signals: ScanRiskApiSignal[];
      summary: string;
      recommendation?: string;
    }
  | {
      ok: false;
      error?: {
        code?: string;
        message?: string;
      };
    };

export type DemoJob = {
  id: string;
  label: string;
  title: string;
  company: string;
  role: string;
  riskLabel: string;
  score: string;
  jd: string;
  stack: string[];
  signals: string[];
};

export type DemoPresetOption = {
  id: string;
  title: string;
  company: string;
  role: string;
  type: PresetJdType;
  label: string;
  jdText: string;
  demoPurpose: string;
  source: PresetDataSource;
  sourceLabel: string;
  aiDirection: string;
  salaryRange: string;
  location: string;
  experienceLevel: string;
  expectedRiskLevel: Severity;
  expectedRiskSignals: string[];
};

export type RiskComparisonPair = {
  id: string;
  label: string;
  description: string;
  leftId: string;
  rightId: string;
};

export type RiskComparisonSideStatus =
  | "idle"
  | "scanning"
  | "done"
  | "fallback"
  | "error";

export type RiskComparisonSideResult = {
  status: RiskComparisonSideStatus;
  preset: DemoPresetOption;
  result: ScanResult | null;
  error: string | null;
};

const typedPresetJds = presetJds as PresetJd[];

const realDemo =
  typedPresetJds.find((job) => job.id === "real-llm-rag-agent-engineer") ??
  typedPresetJds.find((job) => job.type === "real_ai");
const fakeDemo =
  typedPresetJds.find((job) => job.id === "fake-training-loan-ai-engineer") ??
  typedPresetJds.find((job) => job.type === "fake_ai");
const borderlineDemo =
  typedPresetJds.find((job) => job.id === "borderline-data-evaluation-algorithm") ??
  typedPresetJds.find((job) => job.type === "borderline");

if (!realDemo || !fakeDemo || !borderlineDemo) {
  throw new Error(
    "Risk scan demo data requires one real_ai, one fake_ai and one borderline preset JD.",
  );
}

const riskLevelLabel: Record<Severity, string> = {
  critical: "虚假 AI 岗",
  high: "高风险",
  medium: "中风险",
  low: "低风险",
};

const riskLevelTone: Record<Severity, RiskLevel["tone"]> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "safe",
};

const categoryLabel: Record<string, string> = {
  training_loan: "培训贷 / 招转培",
  training_company_disguise: "培训公司伪装",
  traditional_dev_disguise: "传统开发包装",
  non_ai_positioning: "非 AI 岗位",
  overpromise: "过度承诺",
  data_labeling_disguise: "岗位职责漂移",
};

const riskWeight: Record<Severity, number> = {
  critical: 5,
  high: 3,
  medium: 2,
  low: 1,
};

const presetTypeLabel: Record<PresetJdType, string> = {
  real_ai: "真 AI 岗",
  fake_ai: "假 AI 岗",
  borderline: "边界岗",
};

const presetSourceLabel: Record<PresetDataSource, string> = {
  competition_demo: "竞赛 Demo 仿真数据",
  local_benchmark: "本地 benchmark 样本",
};

export const demoPresetOptions: DemoPresetOption[] = typedPresetJds.map((job) => ({
  id: job.id,
  title: job.title,
  company: job.company,
  role: job.role,
  type: job.type,
  label: `${presetTypeLabel[job.type]}：${job.title}`,
  jdText: job.jdText,
  demoPurpose: job.demoPurpose,
  source: job.source ?? "competition_demo",
  sourceLabel: job.sourceLabel ?? presetSourceLabel[job.source ?? "competition_demo"],
  aiDirection: job.aiDirection,
  salaryRange: job.salaryRange,
  location: job.location,
  experienceLevel: job.experienceLevel,
  expectedRiskLevel: job.expectedRiskLevel,
  expectedRiskSignals: job.expectedRiskSignals,
}));

export const riskComparisonPairs: RiskComparisonPair[] = [
  {
    id: "real-vs-fake",
    label: "真 AI 岗 vs 假 AI 岗",
    description: "对比可核验模型链路与培训贷/招转培话术。",
    leftId: realDemo.id,
    rightId: fakeDemo.id,
  },
  {
    id: "real-vs-borderline",
    label: "真 AI 岗 vs 边界岗",
    description: "对比明确 AI 研发职责与数据/评测混合岗位。",
    leftId: realDemo.id,
    rightId: borderlineDemo.id,
  },
  {
    id: "fake-vs-borderline",
    label: "假 AI 岗 vs 边界岗",
    description: "对比高危话术与需要进一步核实的中风险岗位。",
    leftId: fakeDemo.id,
    rightId: borderlineDemo.id,
  },
];

export const demoJobs: Record<DemoVariant, DemoJob> = {
  safe: toDemoJob(realDemo, "低风险岗位参考"),
  risky: toDemoJob(fakeDemo, "高风险岗位参考"),
};

export const knowledgeItems = [
  {
    title: "培训贷",
    phrase: "零基础转行 AI，先培训后上岗",
    method: "出现培训费、分期、贷款、押金、包就业等字样时优先拦截。",
  },
  {
    title: "传统开发包装",
    phrase: "标题写 AI，正文全是 Java CRUD",
    method: "检查是否出现 RAG、模型部署、向量库、评测等可核验技术栈。",
  },
  {
    title: "过度承诺",
    phrase: "参与大模型训练，薪资上不封顶",
    method: "核对岗位级别、团队背景、薪酬结构和真实职责占比。",
  },
  {
    title: "AI 培训公司伪装",
    phrase: "课程、实训、导师带教混在招聘 JD 中",
    method: "核验公司经营范围、招聘主体、劳动合同主体和社保缴纳主体。",
  },
];

export function mapApiResponseToScanResult(body: ScanRiskApiResponse): ScanResult {
  if (!body.ok) {
    throw new Error(readApiErrorMessage(body, "风险扫描失败，请稍后重试。"));
  }

  const signals = body.signals.map((signal, index) => ({
    id: signal.id ?? `${signal.signal}-${index}`,
    severity: signal.severity,
    category: formatCategory(signal.category),
    title: signal.signal,
    excerpt: signal.excerpt,
    interpretation: signal.explanation ?? "命中本地风险规则，建议结合原文进一步核实岗位真实性。",
    advice: signal.advice ?? getDefaultAdvice(body.riskLevel),
    source: formatSource(signal.source),
    matchTerms: signal.matchTerms,
  }));

  const counts = countBySeverity(signals);

  return {
    counts,
    layers: createCompletedLayers(signals.length, body.riskLevel),
    level: {
      label: riskLevelLabel[body.riskLevel],
      summary: body.summary,
      recommendation: body.recommendation ?? getDefaultAdvice(body.riskLevel),
      score: riskScoreToGauge(body.riskLevel, body.riskScore),
      riskScore: body.riskScore,
      scoreCap: body.scoreCap,
      tone: riskLevelTone[body.riskLevel],
    },
    ruleVersion: body.ruleVersion ?? null,
    ruleVersionNotes: body.ruleVersionNotes ?? [],
    signals,
    source: "api",
  };
}

export function findDemoPreset(id: string): DemoPresetOption | undefined {
  return demoPresetOptions.find((job) => job.id === id);
}

export function buildPresetScanResult(id: string): ScanResult | null {
  const preset = typedPresetJds.find((job) => job.id === id);

  if (!preset) {
    return null;
  }

  const signals = preset.expectedRiskSignals.map((signal, index) => ({
    id: `${preset.id}-demo-signal-${index}`,
    severity: preset.expectedRiskLevel,
    category: "风险信号",
    title: signal,
    excerpt: signal,
    interpretation: "已根据当前 JD 生成风险判断。",
    advice: getDefaultAdvice(preset.expectedRiskLevel),
    source: "综合扫描",
    matchTerms: [signal],
  }));
  const counts = countBySeverity(signals);
  const riskScore = signals.length * riskWeight[preset.expectedRiskLevel];

  return {
    counts,
    layers: createCompletedLayers(signals.length, preset.expectedRiskLevel),
    level: {
      label: riskLevelLabel[preset.expectedRiskLevel],
      summary:
        signals.length > 0
          ? `${preset.title} 命中 ${signals.length} 个风险信号。`
          : `${preset.title} 未命中高危风险信号。`,
      recommendation: getDefaultAdvice(preset.expectedRiskLevel),
      score: riskScoreToGauge(preset.expectedRiskLevel, riskScore),
      riskScore,
      scoreCap:
        preset.expectedRiskLevel === "critical"
          ? 1.5
          : preset.expectedRiskLevel === "high"
            ? 2.5
            : null,
      tone: riskLevelTone[preset.expectedRiskLevel],
    },
    ruleVersion: "preset-fallback",
    ruleVersionNotes: ["实时扫描失败时使用 preset 期望信号生成兜底结果。"],
    signals,
    source: "preset_fallback",
    fallbackReason: "实时扫描未完成，当前结果来自本地 preset 兜底数据。",
  };
}

export function getPresetTypeLabel(type: PresetJdType): string {
  return presetTypeLabel[type];
}

export function createIdleLayers(): ScanLayer[] {
  return [
    {
      id: "text",
      title: "话术风险",
      subtitle: "识别收费、培训和承诺话术",
      progress: 0,
      status: "待扫描",
      detail: "识别培训贷、招转培、过度承诺和收费话术。",
      tone: "primary",
    },
    {
      id: "company",
      title: "技术栈核验",
      subtitle: "核对岗位职责与技术要求",
      progress: 0,
      status: "待扫描",
      detail: "检查 AI 技术栈白名单、传统开发包装和岗位职责漂移。",
      tone: "blue",
    },
    {
      id: "community",
      title: "综合复核",
      subtitle: "汇总风险等级和建议",
      progress: 0,
      status: "待扫描",
      detail: "综合判断岗位真实性、风险等级和下一步建议。",
      tone: "muted",
    },
  ];
}

export function createScanningLayers(step: number): ScanLayer[] {
  const base = createIdleLayers();
  const progressMatrix = [
    [42, 0, 0],
    [100, 58, 0],
    [100, 88, 36],
    [100, 100, 72],
  ];
  const statusMatrix = [
    ["分析中", "排队中", "排队中"],
    ["已完成", "匹配中", "排队中"],
    ["已完成", "匹配中", "复核中"],
    ["已完成", "已完成", "汇总中"],
  ];
  const progress = progressMatrix[Math.min(step, progressMatrix.length - 1)];
  const statuses = statusMatrix[Math.min(step, statusMatrix.length - 1)];

  return base.map((layer, index) => ({
    ...layer,
    progress: progress[index],
    status: statuses[index],
  }));
}

function createCompletedLayers(signalCount: number, riskLevel: Severity): ScanLayer[] {
  const isRisky = riskLevel !== "low";

  return [
    {
      id: "text",
      title: "话术风险",
      subtitle: "识别收费、培训和承诺话术",
      progress: 100,
      status: "100%",
      detail:
        signalCount > 0
          ? `已完成高危话术定位，共命中 ${signalCount} 个风险信号。`
          : "未命中培训贷、招转培或过度承诺高危话术。",
      tone: "primary",
    },
    {
      id: "company",
      title: "技术栈核验",
      subtitle: "核对岗位职责与技术要求",
      progress: 100,
      status: "100%",
      detail: isRisky
        ? "已结合规则库检查 AI 技术栈、传统开发包装和职责漂移。"
        : "AI 技术栈与岗位职责描述基本一致，未触发技术栈缺失红线。",
      tone: "blue",
    },
    {
      id: "community",
      title: "综合复核",
      subtitle: "汇总风险等级和建议",
      progress: 100,
      status: "完成",
      detail: "已完成综合判断，可结合原文证据决定是否继续沟通。",
      tone: "muted",
    },
  ];
}

function toDemoJob(job: PresetJd, label: string): DemoJob {
  const isRisky = job.type === "fake_ai";
  const signals = isRisky
    ? job.expectedRiskSignals.slice(0, 5)
    : ["AI 技术栈可核验", "职责指向模型链路", "未出现培训收费"];

  return {
    id: job.id,
    label,
    title: job.title,
    company: job.company,
    role: job.role,
    riskLabel: riskLevelLabel[job.expectedRiskLevel],
    score: `${job.expectedScore} / 5`,
    jd: job.jdText,
    stack: isRisky
      ? ["无 AI 框架要求", "无模型工具链", "无研发交付口径"]
      : job.expectedKeywords.slice(0, 5),
    signals,
  };
}

function countBySeverity(signals: RiskSignal[]): Record<Severity, number> {
  return signals.reduce<Record<Severity, number>>(
    (counts, signal) => {
      counts[signal.severity] += 1;
      return counts;
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  );
}

function riskScoreToGauge(level: Severity, riskScore: number): number {
  if (level === "low") {
    return Math.min(24, 8 + riskScore * 4);
  }

  if (level === "medium") {
    return Math.min(58, 34 + riskScore * 5);
  }

  if (level === "high") {
    return Math.min(84, 62 + riskScore * 3);
  }

  return Math.min(96, 82 + riskScore);
}

function formatCategory(category: string | null): string {
  if (!category) {
    return "风险信号";
  }

  return categoryLabel[category] ?? category.replaceAll("_", " ");
}

function formatSource(source: RiskSource): string {
  const sourceLabel: Record<RiskSource, string> = {
    regex: "话术风险",
    dictionary: "技术栈核验",
    llm: "综合复核",
  };

  return sourceLabel[source];
}

function getDefaultAdvice(level: Severity): string {
  if (level === "critical") {
    return "建议停止投递，并优先核实是否存在培训收费、贷款分期、包就业承诺或招聘主体不一致问题。";
  }

  if (level === "high") {
    return "建议谨慎推进，面试前要求对方明确 AI 研发职责占比、真实技术栈、劳动合同主体和交付模式。";
  }

  if (level === "medium") {
    return "建议继续沟通，但重点追问模型、数据、评测、上线权限和团队分工。";
  }

  return "可进入正常评估流程，继续结合技术栈深度、团队背景和成长空间判断岗位质量。";
}

function readApiErrorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }

  return fallback;
}
