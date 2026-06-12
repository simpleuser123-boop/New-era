import { normalizeResumeDirection } from "./resume-directions";
import {
  careerProfileSettingsSchema,
  careerProfileSuggestionSchema,
} from "./schemas";
import {
  getDefaultResume,
  getSetting,
  listApplications,
  listReports,
  upsertSetting,
} from "./server-db";
import type {
  ApplicationDto,
  CareerProfileSettings,
  CareerProfileSuggestion,
  CareerProfileSuggestionField,
  CareerProfileSuggestionSource,
  JsonValue,
  ReportDto,
  ResumeDirection,
  ResumeDto,
  SettingDto,
} from "./types";

export type CareerProfileSourceSummary = {
  available: boolean;
  count: number;
  source: CareerProfileSuggestionSource;
  sourceLabel: string;
};

const TERMINAL_APPLICATION_STATUSES = new Set([
  "abandoned",
  "offer_received",
  "rejected",
]);

export function createEmptyCareerProfile(
  updatedAt = new Date().toISOString(),
): CareerProfileSettings {
  return {
    targetDirections: [],
    targetRoles: [],
    targetCities: [],
    preferredWorkModes: [],
    salaryExpectation: {
      negotiable: true,
    },
    strengths: [],
    weaknesses: [],
    dealBreakers: [],
    preferredCompanyStages: [],
    currentStrategy: "",
    generatedSuggestions: [],
    updatedAt,
  };
}

export function getCareerProfileSetting(): {
  defaultsApplied: boolean;
  profile: CareerProfileSettings;
  setting: SettingDto | null;
} {
  const setting = getSetting("career_profile");

  if (!setting) {
    return {
      defaultsApplied: true,
      profile: createEmptyCareerProfile(),
      setting: null,
    };
  }

  return {
    defaultsApplied: false,
    profile: careerProfileSettingsSchema.parse(setting.value),
    setting,
  };
}

export function saveCareerProfileSetting(
  input: CareerProfileSettings,
): SettingDto {
  const profile = careerProfileSettingsSchema.parse({
    ...input,
    updatedAt: new Date().toISOString(),
  });

  return upsertSetting("career_profile", profile);
}

export function buildCareerProfileSuggestions(): {
  generatedAt: string;
  sources: CareerProfileSourceSummary[];
  suggestions: CareerProfileSuggestion[];
} {
  const defaultResume = getDefaultResume();
  const reports = listReports(20);
  const applications = listApplications({ limit: 100 });
  const suggestions: CareerProfileSuggestion[] = [];

  suggestions.push(...buildDefaultResumeSuggestions(defaultResume));
  suggestions.push(...buildReportSuggestions(reports));
  suggestions.push(...buildTrackerSuggestions(applications));

  const parsedSuggestions = suggestions
    .map((suggestion) => careerProfileSuggestionSchema.parse(suggestion))
    .slice(0, 24);

  return {
    generatedAt: new Date().toISOString(),
    sources: [
      {
        available: Boolean(defaultResume),
        count: defaultResume ? 1 : 0,
        source: "default_resume",
        sourceLabel: defaultResume
          ? `默认简历：${defaultResume.name}`
          : "默认简历：未设置",
      },
      {
        available: reports.length > 0,
        count: reports.length,
        source: "reports",
        sourceLabel: `最近报告：${reports.length} 份`,
      },
      {
        available: applications.length > 0,
        count: applications.length,
        source: "tracker",
        sourceLabel: `Tracker：${applications.length} 条记录`,
      },
    ],
    suggestions: parsedSuggestions,
  };
}

function buildDefaultResumeSuggestions(
  resume: ResumeDto | null,
): CareerProfileSuggestion[] {
  if (!resume) {
    return [];
  }

  const sourceLabel = `默认简历：${resume.name}`;
  const suggestions: CareerProfileSuggestion[] = [];
  const direction =
    resume.direction !== "general"
      ? resume.direction
      : resume.content.projects.find((project) => project.domain)?.domain ??
        resume.content.experiences.find((experience) => experience.domain)?.domain;

  if (direction) {
    suggestions.push(
      createSuggestion({
        detail: "默认简历的方向标签和项目经历可作为画像里的目标 AI 方向候选。",
        field: "targetDirections",
        source: "default_resume",
        sourceLabel,
        title: "把默认简历方向加入目标方向",
        value: [direction],
      }),
    );
  }

  if (resume.content.currentRole) {
    suggestions.push(
      createSuggestion({
        detail: `默认简历当前身份为「${resume.content.currentRole}」，可作为目标岗位或相邻岗位候选。`,
        field: "targetRoles",
        source: "default_resume",
        sourceLabel,
        title: "补充目标岗位",
        value: [resume.content.currentRole],
      }),
    );
  }

  if (resume.content.contact?.location) {
    suggestions.push(
      createSuggestion({
        detail: `默认简历中的所在地为「${resume.content.contact.location}」，可先作为目标城市候选。`,
        field: "targetCities",
        source: "default_resume",
        sourceLabel,
        title: "补充目标城市",
        value: [resume.content.contact.location],
      }),
    );
  }

  const topSkills = resume.skills
    .filter((skill) => skill.level === "expert" || skill.level === "proficient")
    .slice(0, 3);

  if (topSkills.length > 0) {
    suggestions.push(
      createSuggestion({
        detail: `默认简历中高熟练度技能包括：${topSkills
          .map((skill) => skill.name)
          .join("、")}。建议沉淀成面试和岗位匹配时反复使用的核心优势。`,
        field: "strengths",
        source: "default_resume",
        sourceLabel,
        title: "提炼核心优势",
        value: topSkills.map((skill) =>
          removeEmptyValues({
            evidence: skill.evidence?.[0],
            title: skill.name,
          }),
        ) as JsonValue,
      }),
    );
  }

  const impactProject = resume.content.projects.find((project) => project.impact);

  if (impactProject?.impact) {
    suggestions.push(
      createSuggestion({
        detail: `项目「${impactProject.name}」已有结果证据：${impactProject.impact}`,
        field: "strengths",
        source: "default_resume",
        sourceLabel,
        title: "把项目结果写入优势证据",
        value: [
          {
            evidence: impactProject.impact,
            title: impactProject.name,
          },
        ],
      }),
    );
  }

  const beginnerSkill = resume.skills.find((skill) => skill.level === "beginner");

  if (beginnerSkill) {
    suggestions.push(
      createSuggestion({
        detail: `默认简历中「${beginnerSkill.name}」标记为入门，建议只在能提供项目证据时放进目标画像。`,
        field: "weaknesses",
        source: "default_resume",
        sourceLabel,
        title: "记录需要补证据的技能短板",
        value: [
          {
            mitigation: "用小型项目、实验记录或上线复盘补足证据，避免只写“了解”。",
            title: beginnerSkill.name,
          },
        ],
      }),
    );
  }

  return suggestions;
}

function buildReportSuggestions(reports: ReportDto[]): CareerProfileSuggestion[] {
  if (reports.length === 0) {
    return [];
  }

  const sourceLabel = `最近报告：${reports.length} 份`;
  const directionCounts = new Map<ResumeDirection, number>();
  const roleCounts = new Map<string, number>();
  const cityCounts = new Map<string, number>();
  const riskCounts = new Map<string, number>();

  for (const report of reports) {
    const direction = readReportDirection(report);

    if (direction) {
      increment(directionCounts, direction);
    }

    increment(roleCounts, report.role);

    if (report.report.job.location) {
      increment(cityCounts, report.report.job.location);
    }

    for (const risk of report.risks) {
      if (risk.severity === "critical" || risk.severity === "high") {
        increment(riskCounts, risk.signal);
      }
    }
  }

  const suggestions: CareerProfileSuggestion[] = [];
  const topDirections = topEntries(directionCounts, 3).map(([direction]) => direction);
  const topRoles = topEntries(roleCounts, 5).map(([role]) => role);
  const topCities = topEntries(cityCounts, 4).map(([city]) => city);
  const topRisks = topEntries(riskCounts, 3).map(([risk]) => risk);

  if (topDirections.length > 0) {
    suggestions.push(
      createSuggestion({
        detail: `最近评估中反复出现的方向：${topDirections.join("、")}。建议确认是否纳入目标方向。`,
        field: "targetDirections",
        source: "reports",
        sourceLabel,
        title: "从最近报告归纳目标方向",
        value: topDirections,
      }),
    );
  }

  if (topRoles.length > 0) {
    suggestions.push(
      createSuggestion({
        detail: `最近评估中最常出现的岗位是：${topRoles.join("、")}。`,
        field: "targetRoles",
        source: "reports",
        sourceLabel,
        title: "归纳高频目标岗位",
        value: topRoles,
      }),
    );
  }

  if (topCities.length > 0) {
    suggestions.push(
      createSuggestion({
        detail: `最近报告里的地点集中在：${topCities.join("、")}。`,
        field: "targetCities",
        source: "reports",
        sourceLabel,
        title: "补充目标城市候选",
        value: topCities,
      }),
    );
  }

  if (topRisks.length > 0) {
    suggestions.push(
      createSuggestion({
        detail: `最近报告反复出现的高风险信号包括：${topRisks.join("、")}。建议把这些信号写入不可接受条件或面试追问清单。`,
        field: "dealBreakers",
        source: "reports",
        sourceLabel,
        title: "沉淀高风险筛选条件",
        value: topRisks,
      }),
    );
  }

  return suggestions;
}

function buildTrackerSuggestions(
  applications: ApplicationDto[],
): CareerProfileSuggestion[] {
  if (applications.length === 0) {
    return [];
  }

  const sourceLabel = `Tracker：${applications.length} 条记录`;
  const activeApplications = applications.filter(
    (application) => !TERMINAL_APPLICATION_STATUSES.has(application.status),
  );
  const interviewing = applications.filter(
    (application) => application.status === "interviewing",
  );
  const highPriorityRoles = applications
    .filter((application) => application.priority === "high")
    .map((application) => application.role);
  const overdueFollowUps = activeApplications.filter((application) =>
    isPastDateTime(application.nextFollowUpAt),
  );
  const suggestions: CareerProfileSuggestion[] = [];

  if (highPriorityRoles.length > 0) {
    suggestions.push(
      createSuggestion({
        detail: `高优先级记录集中在：${uniqueStrings(highPriorityRoles)
          .slice(0, 5)
          .join("、")}。建议确认是否写入目标岗位。`,
        field: "targetRoles",
        source: "tracker",
        sourceLabel,
        title: "从高优先级记录补充目标岗位",
        value: uniqueStrings(highPriorityRoles).slice(0, 5),
      }),
    );
  }

  if (interviewing.length > 0) {
    suggestions.push(
      createSuggestion({
        detail: `当前有 ${interviewing.length} 条记录处于面试中，建议策略聚焦面试准备、项目证据和跟进节奏。`,
        field: "currentStrategy",
        source: "tracker",
        sourceLabel,
        title: "更新当前求职策略",
        value: `当前优先推进 ${interviewing.length} 个面试中机会，围绕目标岗位补齐项目证据和面试复盘。`,
      }),
    );
  }

  if (overdueFollowUps.length > 0) {
    suggestions.push(
      createSuggestion({
        detail: `${overdueFollowUps.length} 条活跃记录已过下次跟进时间。画像策略中可以加入固定跟进节奏。`,
        field: "currentStrategy",
        source: "tracker",
        sourceLabel,
        title: "把跟进节奏写入策略",
        value: "每周固定复盘 Tracker，优先处理高优先级和已逾期跟进的岗位。",
      }),
    );
  }

  const abandonedTags = applications
    .filter(
      (application) =>
        application.status === "abandoned" || application.status === "rejected",
    )
    .flatMap((application) => application.tags);

  if (abandonedTags.length > 0) {
    suggestions.push(
      createSuggestion({
        detail: `已放弃或未通过记录中的标签包括：${uniqueStrings(abandonedTags)
          .slice(0, 6)
          .join("、")}。如这些标签代表明确排斥项，可写入不可接受条件。`,
        field: "dealBreakers",
        source: "tracker",
        sourceLabel,
        title: "从放弃记录提炼筛选条件",
        value: uniqueStrings(abandonedTags).slice(0, 6),
      }),
    );
  }

  return suggestions;
}

function createSuggestion({
  detail,
  field,
  source,
  sourceLabel,
  title,
  value,
}: {
  detail: string;
  field: CareerProfileSuggestionField;
  source: CareerProfileSuggestionSource;
  sourceLabel: string;
  title: string;
  value: JsonValue;
}): CareerProfileSuggestion {
  return {
    accepted: false,
    detail,
    field,
    id: `${source}-${field}-${hashString(`${title}:${detail}`)}`,
    source,
    sourceLabel,
    title,
    value,
  };
}

function readReportDirection(report: ReportDto): ResumeDirection | undefined {
  return (
    normalizeResumeDirection(report.report.job.aiDirection) ??
    report.report.job.ecosystem?.primaryDomain
  );
}

function increment<TKey>(map: Map<TKey, number>, key: TKey) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topEntries<TKey>(map: Map<TKey, number>, limit: number): Array<[TKey, number]> {
  return Array.from(map.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLocaleLowerCase();

    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function isPastDateTime(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const timestamp = new Date(normalized).getTime();

  return Number.isFinite(timestamp) && timestamp < Date.now();
}

function removeEmptyValues(value: Record<string, unknown>): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) => item !== undefined && item !== null && String(item).trim() !== "",
    ),
  ) as Record<string, JsonValue>;
}

function hashString(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}
