import fs from "node:fs/promises";
import path from "node:path";

import { scanRisks, type ScanRisksOptions } from "./risk-engine";
import { riskBenchmarkOverviewSchema } from "./schemas";
import type {
  RiskBenchmarkIssueBreakdown,
  RiskBenchmarkLabel,
  RiskBenchmarkMetric,
  RiskBenchmarkOverview,
  RiskBenchmarkTopIssueSample,
  RiskLevel,
  RiskScanResult,
  RiskSeverity,
  RiskSignal,
} from "./types";

export const RISK_BENCHMARK_DATASET_RELATIVE_PATH =
  "demo-data/risk-benchmark-jds.jsonl";

export const RISK_BENCHMARK_DISCLAIMER =
  "这是本地标注 benchmark 的只读质量看板，不代表招聘市场总体统计，不代表所有岗位同等准确率；指标会随本地风险规则版本变化。";

export const RISK_BENCHMARK_STRICT_THRESHOLDS = {
  fakeAiPrecision: 0.8,
  fakeAiRecall: 0.7,
  realAiFalsePositiveRate: 0.25,
  borderlineReasonableHitRate: 0.6,
} as const;

const LABELS = ["real_ai", "fake_ai", "borderline"] as const;
const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
const HIGH_RISK_LEVELS = new Set<RiskLevel>(["high", "critical"]);
const BORDERLINE_HIT_LEVELS = new Set<RiskLevel>(["medium", "high"]);
const REQUIRED_FIELDS = [
  "id",
  "sourceUrl",
  "collectedAt",
  "company",
  "role",
  "jdText",
  "label",
  "expectedRiskLevel",
  "expectedRiskSignals",
  "expectedTrueAiEvidence",
  "annotationNotes",
] as const;

type RiskBenchmarkSample = {
  id: string;
  sourceUrl: string;
  collectedAt: string;
  company: string;
  role: string;
  jdText: string;
  label: RiskBenchmarkLabel;
  expectedRiskLevel: RiskLevel;
  expectedRiskSignals: unknown[];
  expectedTrueAiEvidence: unknown[];
  annotationNotes: string;
};

type RiskBenchmarkQualityIssueType =
  | "correct"
  | "false_negative"
  | "false_positive"
  | "missing_signal"
  | "wrong_severity";

type RiskBenchmarkQualityIssue = {
  label: string;
  type: RiskBenchmarkQualityIssueType;
};

type ExpectedSignalDetail = {
  expected: unknown;
  matched: boolean;
  matchedBy: {
    field: string;
    signal: string;
    term: string;
  } | null;
};

type RiskBenchmarkSampleResult = {
  id: string;
  sourceUrl: string;
  company: string;
  role: string;
  label: RiskBenchmarkLabel;
  expectedDecision: RiskBenchmarkLabel;
  actualDecision: RiskBenchmarkLabel;
  expectedRiskLevel: RiskLevel;
  actualRiskLevel: RiskLevel;
  riskLevelHit: boolean;
  fakeAiRiskDetected: boolean | null;
  realAiFalsePositive: boolean | null;
  borderlineReasonableHit: boolean | null;
  borderlineAnomaly: "漏掉边界风险" | "过度误报" | null;
  qualityIssue: RiskBenchmarkQualityIssue;
  expectedRiskSignalHits: number;
  expectedRiskSignalTotal: number;
  expectedRiskSignalHitRate: number | null;
  expectedRiskSignalDetails: ExpectedSignalDetail[];
  scoreCap: number | null;
  totalWeight: number;
  ruleVersion: string;
  signals: Array<{
    id: string | null;
    signal: string;
    category: string;
    severity: RiskSeverity;
    source: RiskSignal["source"];
    excerpt: string;
    matchTerms: string[];
    weight: number | null;
  }>;
};

type RiskBenchmarkScanFunction = (
  jdText: string,
  options?: ScanRisksOptions,
) => RiskScanResult;

export type RiskBenchmarkReport = {
  generatedAt: string;
  datasetPath: string;
  totalSamples: number;
  mode: "baseline";
  strict: boolean;
  ruleVersions: Record<string, number>;
  distributions: {
    labels: Record<RiskBenchmarkLabel, number>;
    expectedRiskLevels: Record<RiskLevel, number>;
    actualRiskLevels: Record<RiskLevel, number>;
  };
  metrics: {
    riskLevelAccuracy: RiskBenchmarkMetric;
    decisionAccuracy: RiskBenchmarkMetric;
    fakeAiRecall: RiskBenchmarkMetric;
    fakeAiPrecision: RiskBenchmarkMetric;
    realAiFalsePositiveRate: RiskBenchmarkMetric;
    borderlinePrecision: RiskBenchmarkMetric;
    borderlineReasonableHitRate: RiskBenchmarkMetric;
    expectedRiskSignalHitRate: RiskBenchmarkMetric;
    expectedRiskSignalsAverageHitRate: RiskBenchmarkMetric;
  };
  issues: RiskBenchmarkIssueBreakdown;
  decisionConfusionMatrix: Record<string, number>;
  qualityIssueCounts: Record<string, number>;
  warnings: string[];
  topMissedFakeAi: RiskBenchmarkTopIssueSample[];
  topFalsePositiveRealAi: RiskBenchmarkTopIssueSample[];
  topBorderlineAnomalies: RiskBenchmarkTopIssueSample[];
  signalCategoryCounts: Record<string, number>;
  riskSignalCounts: Record<string, number>;
  expectedSignalHitCounts: Record<string, number>;
  results: RiskBenchmarkSampleResult[];
};

export type RiskBenchmarkRunOptions = {
  datasetPath?: string;
  generatedAt?: Date;
  scan?: RiskBenchmarkScanFunction;
  strict?: boolean;
};

export function resolveRiskBenchmarkDatasetPath(projectRoot = process.cwd()): string {
  return path.join(projectRoot, RISK_BENCHMARK_DATASET_RELATIVE_PATH);
}

export async function loadRiskBenchmarkSamples(
  datasetPath = resolveRiskBenchmarkDatasetPath(),
): Promise<RiskBenchmarkSample[]> {
  let content: string;

  try {
    content = await fs.readFile(datasetPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error("benchmark 数据文件不存在。");
    }

    throw new Error("benchmark 数据文件读取失败。");
  }

  return parseRiskBenchmarkJsonl(content);
}

export function parseRiskBenchmarkJsonl(content: string): RiskBenchmarkSample[] {
  if (content.trim().length === 0) {
    throw new Error("benchmark 数据文件为空。");
  }

  const rawLines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines =
    rawLines.at(-1) === "" ? rawLines.slice(0, rawLines.length - 1) : rawLines;
  const rows: Array<{ lineNumber: number; sample: unknown }> = [];
  const errors: string[] = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (line.trim().length === 0) {
      errors.push(`第 ${lineNumber} 行为空行，JSONL 每行都必须是一个 JSON 对象。`);
      return;
    }

    try {
      rows.push({ lineNumber, sample: JSON.parse(line) as unknown });
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      errors.push(`第 ${lineNumber} 行 JSON 解析失败：${message}`);
    }
  });

  if (errors.length > 0) {
    throw new Error(`JSONL 格式错误：\n${errors.join("\n")}`);
  }

  validateRiskBenchmarkSamples(rows);

  return rows.map(({ sample }) => sample as RiskBenchmarkSample);
}

export async function createRiskBenchmarkReport(
  options: RiskBenchmarkRunOptions = {},
): Promise<RiskBenchmarkReport> {
  const datasetPath = options.datasetPath ?? resolveRiskBenchmarkDatasetPath();
  const samples = await loadRiskBenchmarkSamples(datasetPath);

  return buildRiskBenchmarkReport(samples, {
    ...options,
    datasetPath,
  });
}

export async function createRiskBenchmarkOverview(
  options: RiskBenchmarkRunOptions = {},
): Promise<RiskBenchmarkOverview> {
  const report = await createRiskBenchmarkReport(options);

  return buildRiskBenchmarkOverview(report);
}

export function buildRiskBenchmarkReport(
  samples: RiskBenchmarkSample[],
  options: RiskBenchmarkRunOptions = {},
): RiskBenchmarkReport {
  const scan = options.scan ?? scanRisks;
  const results = samples.map((sample) => evaluateRiskBenchmarkSample(sample, scan));
  const labelDistribution = new Map<RiskBenchmarkLabel, number>(
    LABELS.map((label) => [label, 0] as const),
  );
  const expectedRiskLevelDistribution = new Map<RiskLevel, number>(
    RISK_LEVELS.map((level) => [level, 0] as const),
  );
  const actualRiskLevelDistribution = new Map<RiskLevel, number>(
    RISK_LEVELS.map((level) => [level, 0] as const),
  );
  const decisionConfusionMatrix = new Map<string, number>();
  const qualityIssueCounts = new Map<string, number>();
  const ruleVersionCounts = new Map<string, number>();
  const signalCategoryCounts = new Map<string, number>();
  const riskSignalCounts = new Map<string, number>();
  const expectedSignalHitCounts = new Map<string, number>();
  const issues: RiskBenchmarkIssueBreakdown = {
    correct: 0,
    falseNegative: 0,
    falsePositive: 0,
    severityMismatch: 0,
    borderlineFalsePositive: 0,
    missingExpectedSignal: 0,
  };
  let riskLevelHits = 0;
  let fakeAiTotal = 0;
  let fakeAiDetected = 0;
  let predictedFakeAiTotal = 0;
  let realAiTotal = 0;
  let realAiFalsePositive = 0;
  let borderlineTotal = 0;
  let borderlineReasonableHit = 0;
  let predictedBorderlineTotal = 0;
  let predictedBorderlineHit = 0;
  let decisionHits = 0;
  let expectedSignalRateSum = 0;
  let expectedSignalRateDenominator = 0;

  for (const result of results) {
    increment(labelDistribution, result.label);
    increment(expectedRiskLevelDistribution, result.expectedRiskLevel);
    increment(actualRiskLevelDistribution, result.actualRiskLevel);
    increment(ruleVersionCounts, result.ruleVersion);
    increment(qualityIssueCounts, result.qualityIssue.label);
    increment(
      decisionConfusionMatrix,
      `${result.expectedDecision} -> ${result.actualDecision}`,
    );
    incrementIssueBreakdown(issues, result);

    if (result.riskLevelHit) {
      riskLevelHits += 1;
    }

    if (result.expectedDecision === result.actualDecision) {
      decisionHits += 1;
    }

    if (result.actualDecision === "fake_ai") {
      predictedFakeAiTotal += 1;
    }

    if (result.actualDecision === "borderline") {
      predictedBorderlineTotal += 1;

      if (result.expectedDecision === "borderline") {
        predictedBorderlineHit += 1;
      }
    }

    if (result.label === "fake_ai") {
      fakeAiTotal += 1;

      if (result.fakeAiRiskDetected) {
        fakeAiDetected += 1;
      }
    }

    if (result.label === "real_ai") {
      realAiTotal += 1;

      if (result.realAiFalsePositive) {
        realAiFalsePositive += 1;
      }
    }

    if (result.label === "borderline") {
      borderlineTotal += 1;

      if (result.borderlineReasonableHit) {
        borderlineReasonableHit += 1;
      }
    }

    if (result.expectedRiskSignalHitRate !== null) {
      expectedSignalRateSum += result.expectedRiskSignalHitRate;
      expectedSignalRateDenominator += 1;
    }

    for (const signal of result.signals) {
      increment(signalCategoryCounts, signal.category);
      increment(riskSignalCounts, signal.signal);
    }

    for (const detail of result.expectedRiskSignalDetails) {
      const key =
        typeof detail.expected === "string"
          ? detail.expected
          : JSON.stringify(detail.expected);

      if (detail.matched) {
        increment(expectedSignalHitCounts, key);
      }
    }
  }

  const expectedRiskSignalHitRate = toDisplayMetric({
    denominator: expectedSignalRateDenominator,
    numerator: expectedSignalRateDenominator === 0 ? 0 : expectedSignalRateSum,
    value: ratio(expectedSignalRateSum, expectedSignalRateDenominator),
  });
  const metrics = {
    riskLevelAccuracy: toDisplayMetric({
      denominator: results.length,
      numerator: riskLevelHits,
      value: ratio(riskLevelHits, results.length),
    }),
    decisionAccuracy: toDisplayMetric({
      denominator: results.length,
      numerator: decisionHits,
      value: ratio(decisionHits, results.length),
    }),
    fakeAiRecall: toDisplayMetric({
      denominator: fakeAiTotal,
      numerator: fakeAiDetected,
      value: ratio(fakeAiDetected, fakeAiTotal),
    }),
    fakeAiPrecision: toDisplayMetric({
      denominator: predictedFakeAiTotal,
      numerator: fakeAiDetected,
      value: ratio(fakeAiDetected, predictedFakeAiTotal),
    }),
    realAiFalsePositiveRate: toDisplayMetric({
      denominator: realAiTotal,
      numerator: realAiFalsePositive,
      value: ratio(realAiFalsePositive, realAiTotal),
    }),
    borderlinePrecision: toDisplayMetric({
      denominator: predictedBorderlineTotal,
      numerator: predictedBorderlineHit,
      value: ratio(predictedBorderlineHit, predictedBorderlineTotal),
    }),
    borderlineReasonableHitRate: toDisplayMetric({
      denominator: borderlineTotal,
      numerator: borderlineReasonableHit,
      value: ratio(borderlineReasonableHit, borderlineTotal),
    }),
    expectedRiskSignalHitRate,
    expectedRiskSignalsAverageHitRate: expectedRiskSignalHitRate,
  };

  const topMissedFakeAi = results
    .filter((result) => result.label === "fake_ai" && !result.fakeAiRiskDetected)
    .sort((left, right) => {
      const levelDiff =
        riskLevelRank(left.actualRiskLevel) - riskLevelRank(right.actualRiskLevel);

      if (levelDiff !== 0) {
        return levelDiff;
      }

      return left.totalWeight - right.totalWeight;
    })
    .slice(0, 10)
    .map(toTopSample);

  const topFalsePositiveRealAi = results
    .filter((result) => result.label === "real_ai" && result.realAiFalsePositive)
    .sort((left, right) => {
      const levelDiff =
        riskLevelRank(right.actualRiskLevel) - riskLevelRank(left.actualRiskLevel);

      if (levelDiff !== 0) {
        return levelDiff;
      }

      return right.totalWeight - left.totalWeight;
    })
    .slice(0, 10)
    .map(toTopSample);

  const topBorderlineAnomalies = results
    .filter((result) => result.label === "borderline" && result.borderlineAnomaly)
    .sort((left, right) => {
      const leftRank = left.actualRiskLevel === "critical" ? 2 : 1;
      const rightRank = right.actualRiskLevel === "critical" ? 2 : 1;

      if (rightRank !== leftRank) {
        return rightRank - leftRank;
      }

      return right.totalWeight - left.totalWeight;
    })
    .slice(0, 10)
    .map(toTopSample);

  return {
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    datasetPath: path.relative(
      process.cwd(),
      options.datasetPath ?? resolveRiskBenchmarkDatasetPath(),
    ),
    totalSamples: samples.length,
    mode: "baseline",
    strict: Boolean(options.strict),
    ruleVersions: mapToSortedObject(ruleVersionCounts),
    distributions: {
      labels: mapToSortedObject(labelDistribution),
      expectedRiskLevels: mapToSortedObject(expectedRiskLevelDistribution),
      actualRiskLevels: mapToSortedObject(actualRiskLevelDistribution),
    },
    metrics,
    issues,
    decisionConfusionMatrix: mapToSortedObject(decisionConfusionMatrix),
    qualityIssueCounts: mapToSortedObject(qualityIssueCounts),
    warnings: buildWarnings({
      metrics,
      strict: Boolean(options.strict),
      topBorderlineAnomalies,
      topFalsePositiveRealAi,
      topMissedFakeAi,
    }),
    topMissedFakeAi,
    topFalsePositiveRealAi,
    topBorderlineAnomalies,
    signalCategoryCounts: mapToSortedObject(signalCategoryCounts),
    riskSignalCounts: mapToSortedObject(riskSignalCounts),
    expectedSignalHitCounts: mapToSortedObject(expectedSignalHitCounts),
    results,
  };
}

export function buildRiskBenchmarkOverview(
  report: RiskBenchmarkReport,
): RiskBenchmarkOverview {
  const labels = report.distributions.labels;

  return riskBenchmarkOverviewSchema.parse({
    dataset: {
      total: report.totalSamples,
      realAi: labels.real_ai,
      fakeAi: labels.fake_ai,
      borderline: labels.borderline,
      source: "local_benchmark",
      labels,
    },
    ruleVersion: selectRuleVersion(report.ruleVersions),
    ruleVersions: report.ruleVersions,
    generatedAt: report.generatedAt,
    metrics: {
      riskLevelAccuracy: report.metrics.riskLevelAccuracy,
      decisionAccuracy: report.metrics.decisionAccuracy,
      fakeAiRecall: report.metrics.fakeAiRecall,
      fakeAiPrecision: report.metrics.fakeAiPrecision,
      realAiFalsePositiveRate: report.metrics.realAiFalsePositiveRate,
      borderlinePrecision: report.metrics.borderlinePrecision,
      borderlineReasonableHitRate: report.metrics.borderlineReasonableHitRate,
      expectedRiskSignalHitRate: report.metrics.expectedRiskSignalHitRate,
    },
    issues: report.issues,
    distributions: {
      expectedRiskLevels: report.distributions.expectedRiskLevels,
      actualRiskLevels: report.distributions.actualRiskLevels,
      decisionConfusionMatrix: report.decisionConfusionMatrix,
    },
    topIssues: {
      missedFakeAi: report.topMissedFakeAi,
      falsePositiveRealAi: report.topFalsePositiveRealAi,
      borderlineAnomalies: report.topBorderlineAnomalies,
    },
    warnings: report.warnings,
    disclaimer: RISK_BENCHMARK_DISCLAIMER,
  });
}

export function shouldFailRiskBenchmarkStrict(report: RiskBenchmarkReport): boolean {
  if (!report.strict) {
    return false;
  }

  return (
    (report.metrics.fakeAiRecall.value !== null &&
      report.metrics.fakeAiRecall.value <
        RISK_BENCHMARK_STRICT_THRESHOLDS.fakeAiRecall) ||
    (report.metrics.fakeAiPrecision.value !== null &&
      report.metrics.fakeAiPrecision.value <
        RISK_BENCHMARK_STRICT_THRESHOLDS.fakeAiPrecision) ||
    (report.metrics.realAiFalsePositiveRate.value !== null &&
      report.metrics.realAiFalsePositiveRate.value >
        RISK_BENCHMARK_STRICT_THRESHOLDS.realAiFalsePositiveRate) ||
    (report.metrics.borderlineReasonableHitRate.value !== null &&
      report.metrics.borderlineReasonableHitRate.value <
        RISK_BENCHMARK_STRICT_THRESHOLDS.borderlineReasonableHitRate)
  );
}

export function formatRiskBenchmarkPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function validateRiskBenchmarkSamples(
  rows: Array<{ lineNumber: number; sample: unknown }>,
) {
  const errors: string[] = [];

  for (const { lineNumber, sample } of rows) {
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
      errors.push(`第 ${lineNumber} 行必须是 JSON object。`);
      continue;
    }

    const record = sample as Record<string, unknown>;

    for (const field of REQUIRED_FIELDS) {
      if (record[field] === undefined || record[field] === null) {
        errors.push(`第 ${lineNumber} 行缺少必填字段 ${field}。`);
      }
    }

    for (const field of [
      "id",
      "sourceUrl",
      "collectedAt",
      "company",
      "role",
      "jdText",
      "annotationNotes",
    ]) {
      if (typeof record[field] !== "string" || record[field].trim().length === 0) {
        errors.push(`第 ${lineNumber} 行字段 ${field} 必须是非空字符串。`);
      }
    }

    if (!isRiskBenchmarkLabel(record.label)) {
      errors.push(
        `第 ${lineNumber} 行 label 非法：${String(
          record.label,
        )}，只能是 ${LABELS.join("、")}。`,
      );
    }

    if (!isRiskLevel(record.expectedRiskLevel)) {
      errors.push(
        `第 ${lineNumber} 行 expectedRiskLevel 非法：${String(
          record.expectedRiskLevel,
        )}，只能是 ${RISK_LEVELS.join("、")}。`,
      );
    }

    if (!Array.isArray(record.expectedRiskSignals)) {
      errors.push(`第 ${lineNumber} 行 expectedRiskSignals 必须是数组。`);
    }

    if (!Array.isArray(record.expectedTrueAiEvidence)) {
      errors.push(`第 ${lineNumber} 行 expectedTrueAiEvidence 必须是数组。`);
    }

    if (typeof record.jdText === "string" && record.jdText.length < 200) {
      errors.push(
        `第 ${lineNumber} 行 jdText 太短：${record.jdText.length} 字符，至少需要 200 字符。`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`benchmark 数据校验失败：\n${errors.join("\n")}`);
  }
}

function evaluateRiskBenchmarkSample(
  sample: RiskBenchmarkSample,
  scan: RiskBenchmarkScanFunction,
): RiskBenchmarkSampleResult {
  let scanResult: RiskScanResult;

  try {
    scanResult = scan(sample.jdText, {
      company: sample.company,
      role: sample.role,
      sourceUrl: sample.sourceUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    throw new Error(`${sample.id} scanRisks 执行失败：${message}`);
  }

  const actualRiskLevel = scanResult.level;
  const actualDecision = riskLevelToDecision(actualRiskLevel);
  const expectedSignalResult = evaluateExpectedSignals(
    sample.expectedRiskSignals,
    scanResult.signals,
  );
  const isHighRisk = HIGH_RISK_LEVELS.has(actualRiskLevel);
  const isFakeAiRiskDetected = sample.label === "fake_ai" ? isHighRisk : null;
  const isRealAiFalsePositive = sample.label === "real_ai" ? isHighRisk : null;
  const isBorderlineReasonableHit =
    sample.label === "borderline" ? BORDERLINE_HIT_LEVELS.has(actualRiskLevel) : null;
  const borderlineAnomaly =
    sample.label !== "borderline"
      ? null
      : actualRiskLevel === "low"
        ? "漏掉边界风险"
        : actualRiskLevel === "critical"
          ? "过度误报"
          : null;

  return {
    id: sample.id,
    sourceUrl: sample.sourceUrl,
    company: sample.company,
    role: sample.role,
    label: sample.label,
    expectedDecision: sample.label,
    actualDecision,
    expectedRiskLevel: sample.expectedRiskLevel,
    actualRiskLevel,
    riskLevelHit: actualRiskLevel === sample.expectedRiskLevel,
    fakeAiRiskDetected: isFakeAiRiskDetected,
    realAiFalsePositive: isRealAiFalsePositive,
    borderlineReasonableHit: isBorderlineReasonableHit,
    borderlineAnomaly,
    qualityIssue: classifyQualityIssue({
      actualDecision,
      actualRiskLevel,
      expectedDecision: sample.label,
      expectedRiskLevel: sample.expectedRiskLevel,
      expectedSignalHitRate: expectedSignalResult.rate,
    }),
    expectedRiskSignalHits: expectedSignalResult.hitCount,
    expectedRiskSignalTotal: expectedSignalResult.total,
    expectedRiskSignalHitRate: expectedSignalResult.rate,
    expectedRiskSignalDetails: expectedSignalResult.details,
    scoreCap: scanResult.scoreCap ?? null,
    totalWeight: scanResult.totalWeight,
    ruleVersion: scanResult.ruleVersion ?? "规则版本未知",
    signals: scanResult.signals.map((signal) => ({
      id: signal.id ?? null,
      signal: signal.signal,
      category: signal.category ?? "uncategorized",
      severity: signal.severity,
      source: signal.source,
      excerpt: signal.excerpt,
      matchTerms: signal.matchTerms ?? [],
      weight: signal.weight ?? null,
    })),
  };
}

function evaluateExpectedSignals(
  expectedRiskSignals: unknown[],
  actualSignals: RiskSignal[],
) {
  const details = expectedRiskSignals.map((expected) => {
    const match = findExpectedSignalMatch(expected, actualSignals);

    return {
      expected,
      matched: Boolean(match),
      matchedBy: match
        ? {
            signal: match.signal.signal,
            field: match.field,
            term: match.term,
          }
        : null,
    };
  });
  const hitCount = details.filter((detail) => detail.matched).length;
  const total = details.length;

  return {
    details,
    hitCount,
    total,
    rate: total === 0 ? null : hitCount / total,
  };
}

function findExpectedSignalMatch(
  expected: unknown,
  actualSignals: RiskSignal[],
) {
  const expectedTerms = buildExpectedSignalTerms(expected);

  for (const signal of actualSignals) {
    const fields = buildActualSignalFields(signal);

    for (const expectedTerm of expectedTerms) {
      const normalizedExpected = normalizeText(expectedTerm.value);

      if (normalizedExpected.length === 0) {
        continue;
      }

      for (const field of fields) {
        if (
          field.normalized.includes(normalizedExpected) ||
          normalizedExpected.includes(field.normalized)
        ) {
          return { signal, field: field.name, term: expectedTerm.value };
        }
      }
    }
  }

  return null;
}

function buildActualSignalFields(signal: RiskSignal) {
  const fields = [
    ["signal", signal.signal],
    ["category", signal.category],
    ["excerpt", signal.excerpt],
    ["matchTerms", (signal.matchTerms ?? []).join(" ")],
  ] as const;

  return fields
    .map(([name, value]) => ({
      name,
      normalized: normalizeText(value),
    }))
    .filter((field) => field.normalized.length > 0);
}

function buildExpectedSignalTerms(expected: unknown) {
  const values: string[] = [];

  if (typeof expected === "string") {
    values.push(expected);
    values.push(...splitExpectedSignalText(expected));
    values.push(...aliasExpectedSignalText(expected));
  } else if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    const record = expected as Record<string, unknown>;

    for (const key of ["signal", "category", "excerpt", "text", "title"]) {
      if (typeof record[key] === "string") {
        values.push(record[key]);
      }
    }

    if (Array.isArray(record.matchTerms)) {
      values.push(...record.matchTerms.filter((term) => typeof term === "string"));
    }
  }

  return [...new Set(values.map((value) => compactText(value)).filter(Boolean))].map(
    (value) => ({ value }),
  );
}

function splitExpectedSignalText(value: string) {
  return value
    .split(/[\s,，.。:：;；/、|()（）【】《》]+/g)
    .map((term) => term.trim())
    .filter((term) => normalizeText(term).length >= 2);
}

function aliasExpectedSignalText(value: string) {
  const normalized = normalizeText(value);
  const aliases: string[] = [];

  if (normalized.includes("培训") || normalized.includes("招转培")) {
    aliases.push(
      "training_loan",
      "零基础转行 AI",
      "先培训后上岗",
      "培训费从工资扣",
      "培训分期或贷款",
      "包就业或保 offer",
      "入职前收费",
      "项目包装或面试包装",
      "课程",
      "转行",
      "收费",
      "包就业",
      "岗前培训",
    );
  }

  if (normalized.includes("标题含ai") || normalized.includes("传统开发")) {
    aliases.push(
      "traditional_dev_disguise",
      "AI 标题下堆叠 Java Web 技术栈",
      "声称 AI 岗但缺少可核验 AI 技术栈",
      "工作内容为传统 CRUD 业务系统",
      "Java",
      "Spring",
      "CRM",
      "传统",
    );
  }

  if (normalized.includes("低门槛") || normalized.includes("高薪承诺")) {
    aliases.push(
      "overpromise",
      "低门槛绑定高薪承诺",
      "薪资上不封顶",
      "短周期速成高薪 AI",
      "无经验",
      "经验不限",
      "学历不限",
      "高薪",
    );
  }

  if (
    normalized.includes("标注") ||
    normalized.includes("质检") ||
    normalized.includes("训练师") ||
    normalized.includes("评测") ||
    normalized.includes("内容")
  ) {
    aliases.push(
      "data_labeling_disguise",
      "数据标注伪装大模型训练",
      "人工校对和质检占比过高",
      "AI 训练师实为录入标注",
      "只整理评测结果但缺少实验职责",
      "标注",
      "质检",
      "训练师",
      "评测",
      "内容",
    );
  }

  if (
    normalized.includes("外包") ||
    normalized.includes("供应商") ||
    normalized.includes("众包") ||
    normalized.includes("bpo")
  ) {
    aliases.push(
      "长期驻场外包交付",
      "traditional_dev_disguise",
      "供应商",
      "外包",
      "众包",
      "BPO",
      "交付",
    );
  }

  if (normalized.includes("运营") || normalized.includes("产品经理")) {
    aliases.push("运营", "产品经理", "non_ai_positioning", "traditional_dev_disguise");
  }

  if (
    normalized.includes("销售") ||
    normalized.includes("客服") ||
    normalized.includes("商务")
  ) {
    aliases.push("销售", "客服", "商务", "non_ai_positioning", "traditional_dev_disguise");
  }

  return aliases;
}

function riskLevelToDecision(level: RiskLevel): RiskBenchmarkLabel {
  if (HIGH_RISK_LEVELS.has(level)) {
    return "fake_ai";
  }

  if (level === "medium") {
    return "borderline";
  }

  return "real_ai";
}

function classifyQualityIssue({
  actualDecision,
  actualRiskLevel,
  expectedDecision,
  expectedRiskLevel,
  expectedSignalHitRate,
}: {
  actualDecision: RiskBenchmarkLabel;
  actualRiskLevel: RiskLevel;
  expectedDecision: RiskBenchmarkLabel;
  expectedRiskLevel: RiskLevel;
  expectedSignalHitRate: number | null;
}): RiskBenchmarkQualityIssue {
  if (expectedDecision === "fake_ai" && actualDecision !== "fake_ai") {
    return {
      type: "false_negative",
      label: "漏报：假 AI 岗未被拦截",
    };
  }

  if (expectedDecision === "real_ai" && actualDecision === "fake_ai") {
    return {
      type: "false_positive",
      label: "误报：真 AI 岗被判高风险",
    };
  }

  if (expectedDecision === "borderline" && actualDecision === "real_ai") {
    return {
      type: "false_negative",
      label: "漏报：边界风险被放低",
    };
  }

  if (expectedDecision === "borderline" && actualDecision === "fake_ai") {
    return {
      type: "false_positive",
      label: "误报：边界岗被判成假 AI 岗",
    };
  }

  if (actualRiskLevel !== expectedRiskLevel) {
    return {
      type: "wrong_severity",
      label: "严重度不准",
    };
  }

  if (expectedSignalHitRate !== null && expectedSignalHitRate < 1) {
    return {
      type: "missing_signal",
      label: "缺少预期风险信号",
    };
  }

  return {
    type: "correct",
    label: "判断准确",
  };
}

function incrementIssueBreakdown(
  issues: RiskBenchmarkIssueBreakdown,
  result: RiskBenchmarkSampleResult,
) {
  if (result.qualityIssue.type === "correct") {
    issues.correct += 1;
  }

  if (result.qualityIssue.type === "false_negative") {
    issues.falseNegative += 1;
  }

  if (result.qualityIssue.type === "false_positive") {
    issues.falsePositive += 1;
  }

  if (result.qualityIssue.type === "wrong_severity") {
    issues.severityMismatch += 1;
  }

  if (result.qualityIssue.type === "missing_signal") {
    issues.missingExpectedSignal += 1;
  }

  if (result.label === "borderline" && result.actualDecision === "fake_ai") {
    issues.borderlineFalsePositive += 1;
  }
}

function buildWarnings({
  metrics,
  strict,
  topBorderlineAnomalies,
  topFalsePositiveRealAi,
  topMissedFakeAi,
}: {
  metrics: RiskBenchmarkReport["metrics"];
  strict: boolean;
  topBorderlineAnomalies: RiskBenchmarkTopIssueSample[];
  topFalsePositiveRealAi: RiskBenchmarkTopIssueSample[];
  topMissedFakeAi: RiskBenchmarkTopIssueSample[];
}) {
  const warnings: string[] = [];

  if (topMissedFakeAi.length > 0) {
    warnings.push(`fake_ai 漏报 ${topMissedFakeAi.length} 条，详见 topMissedFakeAi。`);
  }

  if (topFalsePositiveRealAi.length > 0) {
    warnings.push(
      `real_ai 高风险误报 ${topFalsePositiveRealAi.length} 条，详见 topFalsePositiveRealAi。`,
    );
  }

  if (topBorderlineAnomalies.length > 0) {
    warnings.push(
      `borderline 异常 ${topBorderlineAnomalies.length} 条，详见 topBorderlineAnomalies。`,
    );
  }

  if (!strict) {
    return warnings;
  }

  if (
    metrics.fakeAiRecall.value !== null &&
    metrics.fakeAiRecall.value < RISK_BENCHMARK_STRICT_THRESHOLDS.fakeAiRecall
  ) {
    warnings.push(
      `--strict：fake_ai recall ${metrics.fakeAiRecall.percent} 低于 ${formatRiskBenchmarkPercent(
        RISK_BENCHMARK_STRICT_THRESHOLDS.fakeAiRecall,
      )}。`,
    );
  }

  if (
    metrics.fakeAiPrecision.value !== null &&
    metrics.fakeAiPrecision.value <
      RISK_BENCHMARK_STRICT_THRESHOLDS.fakeAiPrecision
  ) {
    warnings.push(
      `--strict：fake_ai precision ${metrics.fakeAiPrecision.percent} 低于 ${formatRiskBenchmarkPercent(
        RISK_BENCHMARK_STRICT_THRESHOLDS.fakeAiPrecision,
      )}。`,
    );
  }

  if (
    metrics.realAiFalsePositiveRate.value !== null &&
    metrics.realAiFalsePositiveRate.value >
      RISK_BENCHMARK_STRICT_THRESHOLDS.realAiFalsePositiveRate
  ) {
    warnings.push(
      `--strict：real_ai false positive rate ${metrics.realAiFalsePositiveRate.percent} 高于 ${formatRiskBenchmarkPercent(
        RISK_BENCHMARK_STRICT_THRESHOLDS.realAiFalsePositiveRate,
      )}。`,
    );
  }

  if (
    metrics.borderlineReasonableHitRate.value !== null &&
    metrics.borderlineReasonableHitRate.value <
      RISK_BENCHMARK_STRICT_THRESHOLDS.borderlineReasonableHitRate
  ) {
    warnings.push(
      `--strict：borderline reasonable-hit rate ${metrics.borderlineReasonableHitRate.percent} 低于 ${formatRiskBenchmarkPercent(
        RISK_BENCHMARK_STRICT_THRESHOLDS.borderlineReasonableHitRate,
      )}。`,
    );
  }

  return warnings;
}

function toTopSample(result: RiskBenchmarkSampleResult): RiskBenchmarkTopIssueSample {
  return {
    id: result.id,
    company: result.company,
    role: result.role,
    label: result.label,
    actualDecision: result.actualDecision,
    expectedRiskLevel: result.expectedRiskLevel,
    actualRiskLevel: result.actualRiskLevel,
    qualityIssue: result.qualityIssue.label,
    ruleVersion: result.ruleVersion,
    totalWeight: result.totalWeight,
    scoreCap: result.scoreCap,
    expectedRiskSignalHitRate:
      result.expectedRiskSignalHitRate === null
        ? null
        : Number(result.expectedRiskSignalHitRate.toFixed(4)),
    signalCount: result.signals.length,
    signals: result.signals
      .slice(0, 20)
      .map((signal) => ({
        signal: signal.signal,
        category: signal.category,
        severity: signal.severity,
        matchTerms: signal.matchTerms,
      })),
  };
}

function selectRuleVersion(ruleVersions: Record<string, number>): string {
  const entries = Object.entries(ruleVersions).sort((left, right) => {
    const countDiff = right[1] - left[1];

    return countDiff !== 0 ? countDiff : left[0].localeCompare(right[0]);
  });

  if (entries.length === 0) {
    return "规则版本未知";
  }

  if (entries.length === 1) {
    return entries[0][0];
  }

  return `${entries[0][0]} 等 ${entries.length} 个版本`;
}

function riskLevelRank(level: RiskLevel) {
  return {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  }[level];
}

function toDisplayMetric(metric: {
  denominator: number;
  numerator: number;
  value: number | null;
}): RiskBenchmarkMetric {
  return {
    numerator: Number(metric.numerator.toFixed(4)),
    denominator: metric.denominator,
    value: metric.value === null ? null : Number(metric.value.toFixed(4)),
    percent: formatRiskBenchmarkPercent(metric.value),
  };
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

function increment<TKey extends string>(
  map: Map<TKey, number>,
  key: TKey,
  amount = 1,
) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function mapToSortedObject<TKey extends string>(
  map: Map<TKey, number>,
): Record<TKey, number> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  ) as Record<TKey, number>;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。、“”‘’：:；;！!？?（）()[\]【】《》<>.,/\\|+-]/g, "");
}

function compactText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isRiskBenchmarkLabel(value: unknown): value is RiskBenchmarkLabel {
  return typeof value === "string" && LABELS.includes(value as RiskBenchmarkLabel);
}

function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === "string" && RISK_LEVELS.includes(value as RiskLevel);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
