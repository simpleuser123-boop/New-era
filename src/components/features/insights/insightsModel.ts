import presetInsightsJson from "../../../../demo-data/insights.json";

export type MetricTone = "primary" | "green" | "blue" | "neutral";

export type InsightMetric = {
  id?: string;
  label: string;
  value: string;
  numericValue?: number;
  unit?: string;
  period?: string;
  description?: string;
  comparisonLabel?: string;
  trend?: string;
  tone: MetricTone;
  progress?: number;
  estimateLabel?: string;
};

export type TechTrend = {
  id?: string;
  rank?: number;
  name: string;
  period?: string;
  heatScore: number;
  demandSharePercent?: number;
  growthPercentEstimate?: number;
  trend?: string;
  trendLabel?: string;
  displayChange?: string;
  aliases: string[];
  relatedSkills: string[];
  note?: string;
  estimateLabel?: string;
};

export type TrendTag = {
  name: string;
  heatScore?: number;
  trend?: string;
  estimateLabel?: string;
};

export type LatestNewsItem = {
  id?: string;
  title: string;
  url?: string;
  snippet?: string;
  sourceName?: string;
  publishedAt?: string;
};

export type DomainSlice = {
  id?: string;
  label: string;
  percent: number;
  period?: string;
  color?: string;
  detail?: string;
  representativeCompanies: string[];
  typicalRoles: string[];
  entryBarrier?: string;
  estimateLabel?: string;
};

export type SalaryBand = {
  key: string;
  label: string;
};

export type SalaryRange = {
  min?: number;
  max?: number;
  display: string;
};

export type SalaryBenchmarkRow = {
  domain: string;
  aiEcosystemDomain?: string;
  ranges: Record<string, SalaryRange>;
  note?: string;
  estimateLabel?: string;
};

export type SalaryBenchmarks = {
  period?: string;
  currency?: string;
  payPeriod?: string;
  unitLabel?: string;
  estimateLabel?: string;
  sourcePolicy?: string;
  experienceBands: SalaryBand[];
  rows: SalaryBenchmarkRow[];
};

export type RecommendedCompany = {
  id?: string;
  name: string;
  initials: string;
  headquarters?: string;
  companyType?: string;
  focus?: string;
  primaryDomains: string[];
  estimatedOpenAiRoles?: {
    min?: number;
    max?: number;
    display?: string;
  };
  hiringRoles: string[];
  whyWatch?: string;
  realtimeNotice?: string;
  estimateLabel?: string;
};

export type WeeklyBriefHighlight = {
  id?: string;
  title: string;
  detail?: string;
  impact?: string;
  estimateLabel?: string;
};

export type WeeklyBrief = {
  id?: string;
  title?: string;
  period?: {
    start?: string;
    end?: string;
    timezone?: string;
  };
  generatedBy?: string;
  estimateLabel?: string;
  summary: string;
  highlights: WeeklyBriefHighlight[];
  recommendedActions: string[];
  disclaimer?: string;
};

export type DataSourceItem = {
  name: string;
  usage?: string;
};

export type DataSources = {
  statementTitle?: string;
  displayText?: string;
  items: DataSourceItem[];
  limitations: string[];
};

export type FallbackStates = {
  loadingText?: string;
  unavailableText?: string;
  briefGeneratingText?: string;
};

export type IndustryInsights = {
  snapshotPeriod?: string;
  snapshotDate?: string;
  dataNature?: string;
  overviewMetrics: InsightMetric[];
  techTrends: TechTrend[];
  latestNews: LatestNewsItem[];
  trendTags: TrendTag[];
  domainDistribution: DomainSlice[];
  salaryBenchmarks: SalaryBenchmarks;
  recommendedCompanies: RecommendedCompany[];
  weeklyBrief: WeeklyBrief;
  dataSources: DataSources;
  fallbackStates: FallbackStates;
  provider?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  fallbackCode?: string;
};

type InsightMeta = {
  provider?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  fallbackCode?: string;
};

export const fallbackInsights = normalizeInsights(presetInsightsJson, {
  provider: "preset_demo_data",
  fallbackUsed: true,
});

export function normalizeInsights(
  rawInsights: unknown,
  meta: InsightMeta = {},
): IndustryInsights {
  const root = toRecord(rawInsights) ?? {};
  const nestedInsights = toRecord(root.insights);
  const source = nestedInsights ?? root;
  const dataset = toRecord(source.dataset);

  return {
    snapshotPeriod: readString(dataset?.snapshotPeriod),
    snapshotDate: readString(dataset?.snapshotDate),
    dataNature: readString(dataset?.dataNature),
    overviewMetrics: readOverviewMetrics(source.overviewMetrics),
    techTrends: readTechTrends(source.techTrends),
    latestNews: readLatestNews(source.latestNews),
    trendTags: readTrendTags(source.trendTags),
    domainDistribution: readDomainDistribution(source.domainDistribution),
    salaryBenchmarks: readSalaryBenchmarks(source.salaryBenchmarks),
    recommendedCompanies: readRecommendedCompanies(source.recommendedCompanies),
    weeklyBrief: normalizeWeeklyBrief(source.weeklyBrief),
    dataSources: readDataSources(source.dataSources),
    fallbackStates: readFallbackStates(source.fallbackStates),
    provider: meta.provider ?? readString(root.provider),
    fallbackUsed: meta.fallbackUsed ?? readBoolean(root.fallbackUsed),
    fallbackReason: meta.fallbackReason ?? readString(root.fallbackReason),
    fallbackCode: meta.fallbackCode ?? readString(root.fallbackCode),
  };
}

export function normalizeWeeklyBrief(value: unknown): WeeklyBrief {
  const record = toRecord(value);

  if (!record) {
    return {
      summary: "行业趋势数据暂未加载。",
      highlights: [],
      recommendedActions: [],
    };
  }

  return {
    id: readString(record.id),
    title: readString(record.title),
    period: readBriefPeriod(record.period),
    generatedBy: readString(record.generatedBy),
    estimateLabel: readString(record.estimateLabel),
    summary: readString(record.summary) ?? "行业趋势数据暂未加载。",
    highlights: readBriefHighlights(record.highlights),
    recommendedActions: readStringArray(record.recommendedActions),
    disclaimer: readString(record.disclaimer),
  };
}

export function hasRenderableInsights(insights: IndustryInsights): boolean {
  return (
    insights.overviewMetrics.length > 0 ||
    insights.techTrends.length > 0 ||
    insights.domainDistribution.length > 0 ||
    insights.salaryBenchmarks.rows.length > 0 ||
    insights.recommendedCompanies.length > 0
  );
}

export function readApiErrorMessage(body: unknown, fallback: string): string {
  const record = toRecord(body);
  const error = toRecord(record?.error);

  return readString(error?.message) ?? fallback;
}

export function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function readOverviewMetrics(value: unknown): InsightMetric[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);

      if (!record) {
        return null;
      }

      const label = readString(record.label);
      const displayValue = readString(record.value);

      if (!label || !displayValue) {
        return null;
      }

      return {
        id: readString(record.id),
        label,
        value: displayValue,
        numericValue: readNumber(record.numericValue),
        unit: readString(record.unit),
        period: readString(record.period),
        description: readString(record.description),
        comparisonLabel: readString(record.comparisonLabel),
        trend: readString(record.trend),
        tone: readMetricTone(record.tone),
        progress: readNumber(record.progress),
        estimateLabel: readString(record.estimateLabel),
      };
    })
    .filter(isPresent);
}

function readTechTrends(value: unknown): TechTrend[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);

      if (!record) {
        return null;
      }

      const name = readString(record.name);
      const heatScore = readNumber(record.heatScore);

      if (!name || heatScore === undefined) {
        return null;
      }

      return {
        id: readString(record.id),
        rank: readNumber(record.rank),
        name,
        period: readString(record.period),
        heatScore,
        demandSharePercent: readNumber(record.demandSharePercent),
        growthPercentEstimate: readNumber(record.growthPercentEstimate),
        trend: readString(record.trend),
        trendLabel: readString(record.trendLabel),
        displayChange: readString(record.displayChange),
        aliases: readStringArray(record.aliases),
        relatedSkills: readStringArray(record.relatedSkills),
        note: readString(record.note),
        estimateLabel: readString(record.estimateLabel),
      };
    })
    .filter(isPresent);
}

function readLatestNews(value: unknown): LatestNewsItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);

      if (!record) {
        return null;
      }

      const title = readString(record.title);

      if (!title) {
        return null;
      }

      return {
        id: readString(record.id),
        title,
        url: readString(record.url),
        snippet: readString(record.snippet),
        sourceName: readString(record.sourceName),
        publishedAt: readString(record.publishedAt),
      };
    })
    .filter(isPresent);
}

function readTrendTags(value: unknown): TrendTag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);

      if (!record) {
        return null;
      }

      const name = readString(record.name);

      if (!name) {
        return null;
      }

      return {
        name,
        heatScore: readNumber(record.heatScore),
        trend: readString(record.trend),
        estimateLabel: readString(record.estimateLabel),
      };
    })
    .filter(isPresent);
}

function readDomainDistribution(value: unknown): DomainSlice[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);

      if (!record) {
        return null;
      }

      const label = readString(record.label);
      const percent = readNumber(record.percent);

      if (!label || percent === undefined) {
        return null;
      }

      return {
        id: readString(record.id),
        label,
        percent,
        period: readString(record.period),
        color: readString(record.color),
        detail: readString(record.detail),
        representativeCompanies: readStringArray(record.representativeCompanies),
        typicalRoles: readStringArray(record.typicalRoles),
        entryBarrier: readString(record.entryBarrier),
        estimateLabel: readString(record.estimateLabel),
      };
    })
    .filter(isPresent);
}

function readSalaryBenchmarks(value: unknown): SalaryBenchmarks {
  const record = toRecord(value);

  if (!record) {
    return {
      experienceBands: [],
      rows: [],
    };
  }

  return {
    period: readString(record.period),
    currency: readString(record.currency),
    payPeriod: readString(record.payPeriod),
    unitLabel: readString(record.unitLabel),
    estimateLabel: readString(record.estimateLabel),
    sourcePolicy: readString(record.sourcePolicy),
    experienceBands: readSalaryBands(record.experienceBands),
    rows: readSalaryRows(record.rows),
  };
}

function readSalaryBands(value: unknown): SalaryBand[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);

      if (!record) {
        return null;
      }

      const key = readString(record.key);
      const label = readString(record.label);

      return key && label ? { key, label } : null;
    })
    .filter(isPresent);
}

function readSalaryRows(value: unknown): SalaryBenchmarkRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);

      if (!record) {
        return null;
      }

      const domain = readString(record.domain);

      if (!domain) {
        return null;
      }

      return {
        domain,
        aiEcosystemDomain: readString(record.aiEcosystemDomain),
        ranges: readSalaryRanges(record.ranges),
        note: readString(record.note),
        estimateLabel: readString(record.estimateLabel),
      };
    })
    .filter(isPresent);
}

function readSalaryRanges(value: unknown): Record<string, SalaryRange> {
  const record = toRecord(value);

  if (!record) {
    return {};
  }

  return Object.entries(record).reduce<Record<string, SalaryRange>>(
    (ranges, [key, rangeValue]) => {
      const rangeRecord = toRecord(rangeValue);
      const display = readString(rangeRecord?.display);

      if (!display) {
        return ranges;
      }

      ranges[key] = {
        min: readNumber(rangeRecord?.min),
        max: readNumber(rangeRecord?.max),
        display,
      };

      return ranges;
    },
    {},
  );
}

function readRecommendedCompanies(value: unknown): RecommendedCompany[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);

      if (!record) {
        return null;
      }

      const name = readString(record.name);

      if (!name) {
        return null;
      }

      return {
        id: readString(record.id),
        name,
        initials: readString(record.initials) ?? name.slice(0, 2).toUpperCase(),
        headquarters: readString(record.headquarters),
        companyType: readString(record.companyType),
        focus: readString(record.focus),
        primaryDomains: readStringArray(record.primaryDomains),
        estimatedOpenAiRoles: readEstimatedRoles(record.estimatedOpenAiRoles),
        hiringRoles: readStringArray(record.hiringRoles),
        whyWatch: readString(record.whyWatch),
        realtimeNotice: readString(record.realtimeNotice),
        estimateLabel: readString(record.estimateLabel),
      };
    })
    .filter(isPresent);
}

function readEstimatedRoles(value: unknown): RecommendedCompany["estimatedOpenAiRoles"] {
  const record = toRecord(value);

  if (!record) {
    return undefined;
  }

  return {
    min: readNumber(record.min),
    max: readNumber(record.max),
    display: readString(record.display),
  };
}

function readBriefHighlights(value: unknown): WeeklyBriefHighlight[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);

      if (!record) {
        return null;
      }

      const title = readString(record.title);

      if (!title) {
        return null;
      }

      return {
        id: readString(record.id),
        title,
        detail: readString(record.detail),
        impact: readString(record.impact),
        estimateLabel: readString(record.estimateLabel),
      };
    })
    .filter(isPresent);
}

function readBriefPeriod(value: unknown): WeeklyBrief["period"] | undefined {
  const record = toRecord(value);

  if (!record) {
    return undefined;
  }

  return {
    start: readString(record.start),
    end: readString(record.end),
    timezone: readString(record.timezone),
  };
}

function readDataSources(value: unknown): DataSources {
  const record = toRecord(value);

  if (!record) {
    return {
      items: [],
      limitations: [],
    };
  }

  return {
    statementTitle: readString(record.statementTitle),
    displayText: readString(record.displayText),
    items: readDataSourceItems(record.items),
    limitations: readStringArray(record.limitations),
  };
}

function readDataSourceItems(value: unknown): DataSourceItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);

      if (!record) {
        return null;
      }

      const name = readString(record.name);

      return name
        ? {
            name,
            usage: readString(record.usage),
          }
        : null;
    })
    .filter(isPresent);
}

function readFallbackStates(value: unknown): FallbackStates {
  const record = toRecord(value);

  if (!record) {
    return {};
  }

  return {
    loadingText: readString(record.loadingText),
    unavailableText: readString(record.unavailableText),
    briefGeneratingText: readString(record.briefGeneratingText),
  };
}

function readMetricTone(value: unknown): MetricTone {
  if (
    value === "primary" ||
    value === "green" ||
    value === "blue" ||
    value === "neutral"
  ) {
    return value;
  }

  return "neutral";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
