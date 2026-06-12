import { z } from "zod";

import {
  callDeepSeekJson,
  type DeepSeekCallOptions,
  type DeepSeekClientError,
} from "./deepseek-client";
import { mergeRiskScanResultWithSignals, type ScanRisksOptions } from "./risk-engine";
import { TRUE_AI_TECH_STACK_KEYWORDS } from "./risk-rules";
import type { JsonObject, RiskScanResult, RiskSeverity, RiskSignal } from "./types";

export type SemanticRiskCategory =
  | "training_loan"
  | "training_company_disguise"
  | "traditional_dev_disguise"
  | "non_ai_positioning"
  | "overpromise"
  | "data_labeling_disguise";

export type SemanticRiskTriggerReason =
  | "forced"
  | "low_ai_title"
  | "low_suspicious_generic_expression"
  | "medium_high_sparse_local_signals"
  | "medium_high_expected_signal_gap"
  | "benchmark_miss_pattern";

export type SemanticRiskWarning = {
  code: DeepSeekClientError["code"] | "invalid_schema" | "all_signals_filtered";
  message: string;
};

export type SemanticRiskScanInput = ScanRisksOptions & {
  jdText: string;
  localResult: RiskScanResult;
  expectedRiskSignals?: unknown[];
  force?: boolean;
  deepSeek?: DeepSeekCallOptions;
};

export type SemanticRiskScanResult = {
  shouldRun: boolean;
  triggerReasons: SemanticRiskTriggerReason[];
  signals: RiskSignal[];
  reasoningSummary: string;
  warnings: SemanticRiskWarning[];
};

export type SemanticRiskMergeResult = SemanticRiskScanResult & {
  result: RiskScanResult;
};

type RawSemanticRiskSignal = z.infer<typeof semanticRiskSignalSchema>;

const MAX_PROMPT_JD_LENGTH = 8_000;
const MAX_LOCAL_SIGNALS_IN_PROMPT = 20;
const MAX_SEMANTIC_SIGNALS = 6;
const MIN_SEMANTIC_CONFIDENCE = 0.55;
const STRONG_TRUE_AI_EVIDENCE_THRESHOLD = 3;

const SEMANTIC_RISK_CATEGORIES = [
  "training_loan",
  "training_company_disguise",
  "traditional_dev_disguise",
  "non_ai_positioning",
  "overpromise",
  "data_labeling_disguise",
] as const;

const SEMANTIC_SEVERITY_WEIGHTS: Record<Exclude<RiskSeverity, "critical">, number> =
  {
    high: 3,
    medium: 2,
    low: 1,
  };

const AI_TITLE_PATTERN =
  /((AI|AIGC|人工智能|大模型|LLM|算法|机器学习|深度学习|智能体|Agent).{0,24}(工程师|开发|研究员|实习|储备|训练师|架构师|平台|产品|评测|专员|销售|客服|运营|客户经理|BD|商务|顾问))|((工程师|开发|研究员|实习|储备|训练师|架构师|平台|产品|评测|专员|销售|客服|运营|客户经理|BD|商务|顾问).{0,24}(AI|AIGC|人工智能|大模型|LLM|算法|机器学习|深度学习|智能体|Agent))/i;

const SUSPICIOUS_GENERIC_PATTERNS = [
  /(AI|AIGC|人工智能|大模型).{0,28}(变现|副业|接单|账号|矩阵|短视频|内容发布|一键生成|工具上手|玩法|商业化)/i,
  /(零基础|无经验|经验不限|小白|可培养|快速上手|手把手|导师带教).{0,32}(AI|AIGC|人工智能|大模型)/i,
  /(AI|AIGC|人工智能|大模型).{0,32}(零基础|无经验|经验不限|小白|可培养|快速上手|手把手|导师带教)/i,
  /(不涉及算法|无需写代码|只需会使用|工具操作|模板套用|素材整理|内容搬运)/i,
  /(项目包装|面试包装|就业推荐|推荐就业|薪资上不封顶|收益稳定)/i,
] as const;

const BENCHMARK_MISS_PATTERNS = [
  /(AI|大模型|人工智能).{0,20}(文本完善|文本评估|质量评估|内容审核|内容质检)/i,
  /(模型回复|大语言模型|AIGC).{0,36}(打分|评分|校准|标注|审核|质检|评估报告)/i,
  /(评估规则|评分依据|校准测试|标注规范).{0,36}(模型|AI|AIGC|大模型)/i,
  /(AI训练师|人工智能训练师).{0,80}(基础操作|标注工具|拉框|分类|质检|规则执行)/i,
] as const;

const semanticRiskSignalSchema = z.strictObject({
  signal: z.string().trim().min(1).max(120),
  severity: z.enum(["low", "medium", "high"]),
  category: z.enum(SEMANTIC_RISK_CATEGORIES),
  excerpt: z.string().trim().min(1).max(220),
  explanation: z.string().trim().min(1).max(600),
  confidence: z.number().finite().min(0).max(1),
});

const semanticRiskResponseSchema = z.strictObject({
  signals: z.array(semanticRiskSignalSchema).max(MAX_SEMANTIC_SIGNALS),
  reasoningSummary: z.string().trim().min(1).max(240),
});

export async function applySemanticRiskLayer(
  input: SemanticRiskScanInput,
): Promise<SemanticRiskMergeResult> {
  const semanticResult = await scanSemanticRiskSignals(input);

  return {
    ...semanticResult,
    result: mergeRiskScanResultWithSignals(
      input.localResult,
      semanticResult.signals,
    ),
  };
}

export async function scanSemanticRiskSignals(
  input: SemanticRiskScanInput,
): Promise<SemanticRiskScanResult> {
  const triggerReasons = resolveSemanticRiskTriggerReasons(input);

  if (triggerReasons.length === 0) {
    return {
      shouldRun: false,
      triggerReasons,
      signals: [],
      reasoningSummary: "本地规则结果足够明确，未触发 Layer 3 语义补充。",
      warnings: [],
    };
  }

  const result = await callDeepSeekJson<JsonObject>(
    buildSemanticRiskMessages(input, triggerReasons),
    "SemanticRiskSignals",
    {
      timeoutMs: 25_000,
      temperature: 0,
      maxTokens: 1_500,
      ...input.deepSeek,
    },
  );

  if (!result.ok) {
    return {
      shouldRun: true,
      triggerReasons,
      signals: [],
      reasoningSummary: "Layer 3 语义补充调用失败，已保留本地规则结果。",
      warnings: [
        {
          code: result.error.code,
          message: result.error.message,
        },
      ],
    };
  }

  const parsed = semanticRiskResponseSchema.safeParse(result.data);

  if (!parsed.success) {
    return {
      shouldRun: true,
      triggerReasons,
      signals: [],
      reasoningSummary: "Layer 3 返回结构不符合 schema，已保留本地规则结果。",
      warnings: [
        {
          code: "invalid_schema",
          message: parsed.error.issues
            .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
            .join("; "),
        },
      ],
    };
  }

  const signals = sanitizeSemanticSignals(parsed.data.signals, input);
  const warnings: SemanticRiskWarning[] =
    parsed.data.signals.length > 0 && signals.length === 0
      ? [
          {
            code: "all_signals_filtered",
            message: "Layer 3 返回的信号未通过 excerpt、白名单、置信度或去重清洗。",
          },
        ]
      : [];

  return {
    shouldRun: true,
    triggerReasons,
    signals,
    reasoningSummary: parsed.data.reasoningSummary,
    warnings,
  };
}

export function resolveSemanticRiskTriggerReasons(
  input: SemanticRiskScanInput,
): SemanticRiskTriggerReason[] {
  if (input.localResult.level === "critical") {
    return [];
  }

  const reasons = new Set<SemanticRiskTriggerReason>();
  const searchText = buildSearchText(input);

  if (input.force) {
    reasons.add("forced");
  }

  if (
    input.localResult.level === "low" &&
    hasAiTitle(searchText) &&
    !hasStrongTrueAiEvidence(searchText)
  ) {
    reasons.add("low_ai_title");
  }

  if (
    input.localResult.level === "low" &&
    hasSuspiciousGenericExpression(searchText)
  ) {
    reasons.add("low_suspicious_generic_expression");
  }

  if (
    (input.localResult.level === "medium" || input.localResult.level === "high") &&
    input.localResult.signals.length < 2 &&
    (hasAiTitle(searchText) || hasSuspiciousGenericExpression(searchText))
  ) {
    reasons.add("medium_high_sparse_local_signals");
  }

  if (
    (input.localResult.level === "medium" || input.localResult.level === "high") &&
    hasExpectedSignalGap(input.expectedRiskSignals, input.localResult.signals)
  ) {
    reasons.add("medium_high_expected_signal_gap");
  }

  if (hasBenchmarkMissPattern(searchText)) {
    reasons.add("benchmark_miss_pattern");
  }

  return [...reasons];
}

function buildSemanticRiskMessages(
  input: SemanticRiskScanInput,
  triggerReasons: SemanticRiskTriggerReason[],
) {
  return [
    {
      role: "system" as const,
      content:
        "你是真假 AI 岗位识别的 Layer 3 语义风险补充器。只能返回 JSON，不能输出 Markdown、解释文字或外层包装。你只补充本地规则未命中的风险信号，不能删除、覆盖或降级本地规则信号，不能决定最终评分。",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        task:
          "阅读 JD 原文和本地风险扫描结果，只找本地规则未命中的模糊语义风险。没有明确证据时返回空 signals。",
        hardRules: [
          "只判断 JD 原文，不编造公司背景、招聘平台背景或行业传闻。",
          "不要重复 localSignals 中已有的信号、类别同义信号或摘录证据。",
          "excerpt 必须是 JD 原文中能找到的短摘录，不要改写。",
          "severity 只能是 low、medium、high；不要输出 critical。",
          "不要用 LLM 覆盖培训贷、收费、贷款、包就业等本地确定性规则。",
          "发现收费、贷款、包就业等强证据时也只按 high 返回；这些证据理论上应由本地规则覆盖。",
          "没有清晰证据时 signals 返回空数组。",
          "只返回 JSON，不要输出中文解释包裹 JSON。",
        ],
        categoryWhitelist: SEMANTIC_RISK_CATEGORIES,
        outputShape: {
          signals: [
            {
              signal: "string",
              severity: "low | medium | high",
              category:
                "training_loan | training_company_disguise | traditional_dev_disguise | non_ai_positioning | overpromise | data_labeling_disguise",
              excerpt: "必须来自 JD 原文的短摘录",
              explanation: "为什么这是风险",
              confidence: 0.0,
            },
          ],
          reasoningSummary: "一句话说明是否发现新增风险",
        },
        triggerReasons,
        job: {
          company: input.company ?? "",
          role: input.role ?? "",
          sourceUrl: input.sourceUrl ?? "",
        },
        localScan: {
          level: input.localResult.level,
          totalWeight: input.localResult.totalWeight,
          summary: input.localResult.summary,
          signals: input.localResult.signals
            .slice(0, MAX_LOCAL_SIGNALS_IN_PROMPT)
            .map((signal) => ({
              signal: signal.signal,
              severity: signal.severity,
              category: signal.category ?? "",
              excerpt: signal.excerpt,
              source: signal.source,
              matchTerms: signal.matchTerms ?? [],
            })),
        },
        jdText: input.jdText.slice(0, MAX_PROMPT_JD_LENGTH),
      }),
    },
  ];
}

function sanitizeSemanticSignals(
  rawSignals: RawSemanticRiskSignal[],
  input: SemanticRiskScanInput,
): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const seen = new Set<string>();

  for (const rawSignal of rawSignals) {
    if (rawSignal.confidence < MIN_SEMANTIC_CONFIDENCE) {
      continue;
    }

    const excerpt = findVerifiedExcerpt(input.jdText, rawSignal.excerpt);

    if (!excerpt) {
      continue;
    }

    if (isDuplicateOfLocalSignal(rawSignal, excerpt, input.localResult.signals)) {
      continue;
    }

    const key = normalizeForComparison(
      `${rawSignal.category}|${rawSignal.signal}|${excerpt}`,
    );

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    signals.push({
      id: `llm-semantic-${rawSignal.category}-${stableHash(
        `${rawSignal.signal}|${excerpt}`,
      )}`,
      signal: rawSignal.signal,
      severity: rawSignal.severity,
      source: "llm",
      category: rawSignal.category,
      excerpt,
      explanation: `${rawSignal.explanation}（语义补充置信度：${rawSignal.confidence.toFixed(
        2,
      )}）`,
      weight: SEMANTIC_SEVERITY_WEIGHTS[rawSignal.severity],
      matchTerms: [excerpt],
    });
  }

  return signals.slice(0, MAX_SEMANTIC_SIGNALS);
}

function findVerifiedExcerpt(jdText: string, excerpt: string): string | null {
  const normalizedExcerpt = normalizeWhitespace(excerpt);

  if (!normalizedExcerpt) {
    return null;
  }

  if (jdText.includes(normalizedExcerpt)) {
    return normalizedExcerpt;
  }

  const compactExcerpt = normalizeForComparison(normalizedExcerpt);

  if (!compactExcerpt) {
    return null;
  }

  const lines = jdText
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  for (const line of lines) {
    const compactLine = normalizeForComparison(line);

    if (!compactLine.includes(compactExcerpt)) {
      continue;
    }

    if (line.length <= 220) {
      return line;
    }

    const rawIndex = Math.max(0, line.indexOf(normalizedExcerpt));
    const index = rawIndex > 0 ? rawIndex : 0;

    return line.slice(index, index + 220);
  }

  return null;
}

function isDuplicateOfLocalSignal(
  rawSignal: RawSemanticRiskSignal,
  excerpt: string,
  localSignals: RiskSignal[],
): boolean {
  const candidateSignal = normalizeForComparison(rawSignal.signal);
  const candidateExcerpt = normalizeForComparison(excerpt);

  return localSignals.some((localSignal) => {
    const localCategory = localSignal.category ?? "";

    if (localCategory !== rawSignal.category) {
      return false;
    }

    const localSignalText = normalizeForComparison(localSignal.signal);
    const localExcerpt = normalizeForComparison(localSignal.excerpt);
    const localMatchTerms = normalizeForComparison(
      (localSignal.matchTerms ?? []).join(" "),
    );

    return (
      hasMeaningfulOverlap(candidateSignal, localSignalText) ||
      hasMeaningfulOverlap(candidateExcerpt, localExcerpt) ||
      hasMeaningfulOverlap(candidateExcerpt, localMatchTerms)
    );
  });
}

function hasExpectedSignalGap(
  expectedRiskSignals: unknown[] | undefined,
  localSignals: RiskSignal[],
): boolean {
  if (!expectedRiskSignals || expectedRiskSignals.length === 0) {
    return false;
  }

  const hitCount = expectedRiskSignals.filter((expected) =>
    hasExpectedSignalMatch(expected, localSignals),
  ).length;

  return hitCount / expectedRiskSignals.length < 0.6;
}

function hasExpectedSignalMatch(
  expected: unknown,
  localSignals: RiskSignal[],
): boolean {
  const expectedTerms = extractExpectedSignalTerms(expected).map((term) =>
    normalizeForComparison(term),
  );

  if (expectedTerms.length === 0) {
    return false;
  }

  return localSignals.some((signal) => {
    const fields = [
      signal.signal,
      signal.category ?? "",
      signal.excerpt,
      ...(signal.matchTerms ?? []),
    ].map((value) => normalizeForComparison(value));

    return expectedTerms.some((term) =>
      fields.some((field) => hasMeaningfulOverlap(term, field)),
    );
  });
}

function extractExpectedSignalTerms(expected: unknown): string[] {
  if (typeof expected === "string") {
    return [expected, ...expected.split(/[\s,，.。:：;；/、|()（）【】《》]+/g)];
  }

  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return [];
  }

  const record = expected as Record<string, unknown>;
  const terms: string[] = [];

  for (const key of ["signal", "category", "excerpt", "text", "title"]) {
    const value = record[key];

    if (typeof value === "string") {
      terms.push(value);
    }
  }

  if (Array.isArray(record.matchTerms)) {
    terms.push(...record.matchTerms.filter((term): term is string => typeof term === "string"));
  }

  return terms;
}

function buildSearchText(input: SemanticRiskScanInput): string {
  return [input.role, input.company, input.sourceUrl, input.jdText]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");
}

function hasAiTitle(text: string): boolean {
  return AI_TITLE_PATTERN.test(text);
}

function hasSuspiciousGenericExpression(text: string): boolean {
  return SUSPICIOUS_GENERIC_PATTERNS.some((pattern) => pattern.test(text));
}

function hasBenchmarkMissPattern(text: string): boolean {
  return BENCHMARK_MISS_PATTERNS.some((pattern) => pattern.test(text));
}

function hasStrongTrueAiEvidence(text: string): boolean {
  const normalizedText = text.toLocaleLowerCase();
  const matchedCount = TRUE_AI_TECH_STACK_KEYWORDS.filter((keyword) =>
    normalizedText.includes(keyword.toLocaleLowerCase()),
  ).length;

  return matchedCount >= STRONG_TRUE_AI_EVIDENCE_THRESHOLD;
}

function hasMeaningfulOverlap(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }

  if (left.length < 2 || right.length < 2) {
    return false;
  }

  return left.includes(right) || right.includes(left);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeForComparison(text: string): string {
  return normalizeWhitespace(text)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[，。、“”‘’：:；;！!？?（）()[\]【】《》<>.,/\\|+\-\s]/g, "");
}

function stableHash(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}
