import { z } from "zod";

import {
  buildInterviewPrepContext,
  getAnalyticsOverviewForAssistant,
  getApplicationDetail,
  getAssistantDefaultResume,
  getCareerProfile,
  getReportDetail,
  listAssistantApplications,
  listAssistantResumes,
  searchReports,
  type AssistantApplicationSnapshot,
  type AssistantInterviewPrepContext,
  type AssistantReportSnapshot,
  type AssistantResumeSnapshot,
} from "../../../assistant-tools";
import {
  applicationPrioritySchema,
  applicationStatusSchema,
} from "../../../schemas";
import { listApplications } from "../../../server-db";
import type {
  AnalyticsOverviewDto,
  AssistantCitation,
  CareerProfileSettings,
  JsonValue,
} from "../../../types";
import { searchWeb, type WebSearchResult } from "../../../web-search";
import { ToolRegistry } from "../registry";
import type { ToolDefinition } from "../types";

const messageSchema = z.string().trim().max(4_000).default("");
const reportSearchLimitSchema = z.coerce.number().int().min(1).max(20).default(8);
const applicationListLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(30)
  .default(12);
const resumeListLimitSchema = z.coerce.number().int().min(1).max(30).default(20);
const webSearchLimitSchema = z.coerce.number().int().min(1).max(8).default(5);
const positiveIdSchema = z.coerce.number().int().positive();

const searchReportsParamsSchema = z.strictObject({
  limit: reportSearchLimitSchema,
  query: messageSchema,
});

const getReportDetailParamsSchema = z.strictObject({
  reportId: positiveIdSchema,
});

const listApplicationsParamsSchema = z.strictObject({
  limit: applicationListLimitSchema,
  priority: applicationPrioritySchema.optional(),
  query: messageSchema,
  status: applicationStatusSchema.optional(),
});

const getApplicationDetailParamsSchema = z.strictObject({
  applicationId: positiveIdSchema,
});

const emptyParamsSchema = z.strictObject({});

const listResumesParamsSchema = z.strictObject({
  limit: resumeListLimitSchema,
});

const buildInterviewPrepContextParamsSchema = z.strictObject({
  query: messageSchema,
  reportId: positiveIdSchema.optional(),
  resumeId: positiveIdSchema.optional(),
});

const webSearchParamsSchema = z.strictObject({
  limit: webSearchLimitSchema,
  query: z.string().trim().min(1).max(400),
});

type SearchReportsParams = z.infer<typeof searchReportsParamsSchema>;
type GetReportDetailParams = z.infer<typeof getReportDetailParamsSchema>;
type ListApplicationsParams = z.infer<typeof listApplicationsParamsSchema>;
type GetApplicationDetailParams = z.infer<typeof getApplicationDetailParamsSchema>;
type EmptyParams = z.infer<typeof emptyParamsSchema>;
type ListResumesParams = z.infer<typeof listResumesParamsSchema>;
type BuildInterviewPrepContextParams = z.infer<
  typeof buildInterviewPrepContextParamsSchema
>;
type WebSearchParams = z.infer<typeof webSearchParamsSchema>;

type CareerProfileToolData = {
  configured: boolean;
  defaultsApplied: boolean;
  profile: CareerProfileSettings;
  settingUpdatedAt: string | null;
};

export const searchReportsTool: ToolDefinition<SearchReportsParams, JsonValue> = {
  name: "search_reports",
  displayName: "Search Reports",
  description: "按用户问题检索本地 JD 评估报告摘要，只读取 SQLite 报告表。",
  category: "query",
  parameters: {
    limit: {
      type: "integer",
      description: "最多返回的报告数量，范围 1-20。",
    },
    query: {
      type: "string",
      description: "用于匹配公司、岗位、技术栈、风险和建议的搜索文本。",
    },
  },
  parametersSchema: searchReportsParamsSchema,
  handler: ({ limit, query }) => {
    const reports = searchReports(query, limit);

    return {
      ok: true,
      data: toJsonValue({
        count: reports.length,
        query,
        reports,
      }),
      llmSummary:
        reports.length > 0
          ? `找到 ${reports.length} 份本地评估报告，最相关的是 ${reports[0].company} · ${reports[0].role}。`
          : "没有找到可用的本地评估报告。",
      citations: reports.map(toReportCitation),
    };
  },
};

export const getReportDetailTool: ToolDefinition<
  GetReportDetailParams,
  JsonValue
> = {
  name: "get_report_detail",
  displayName: "Get Report Detail",
  description: "读取单份本地 JD 评估报告详情摘要。",
  category: "query",
  parameters: {
    reportId: {
      type: "integer",
      description: "报告 ID。",
      required: true,
    },
  },
  parametersSchema: getReportDetailParamsSchema,
  handler: ({ reportId }) => {
    const report = getReportDetail(reportId);

    return {
      ok: true,
      data: toJsonValue({
        report,
        reportId,
      }),
      llmSummary: report
        ? `报告 #${report.id} 是 ${report.company} · ${report.role}，总分 ${report.scoreOverall}/${5}，风险等级 ${report.riskLevel}。`
        : `未找到报告 #${reportId}。`,
      citations: report ? [toReportCitation(report)] : [],
    };
  },
};

export const listApplicationsTool: ToolDefinition<
  ListApplicationsParams,
  JsonValue
> = {
  name: "list_applications",
  displayName: "List Applications",
  description: "检索本地 Tracker 投递记录摘要，只读取 SQLite applications 表。",
  category: "query",
  parameters: {
    limit: {
      type: "integer",
      description: "最多返回的 Tracker 记录数量，范围 1-30。",
    },
    priority: {
      type: "string",
      description: "按优先级筛选。",
      enum: ["high", "medium", "low"],
    },
    query: {
      type: "string",
      description: "用于匹配公司、岗位、标签和跟进意图的搜索文本。",
    },
    status: {
      type: "string",
      description: "按 Tracker 状态筛选。",
      enum: [
        "to_apply",
        "applied",
        "interviewing",
        "offer_received",
        "rejected",
        "abandoned",
      ],
    },
  },
  parametersSchema: listApplicationsParamsSchema,
  handler: ({ limit, priority, query, status }) => {
    const sourceApplications = listApplications({
      limit: 100,
      priority,
      q: query || undefined,
      status,
    });
    const applications = listAssistantApplications(
      query,
      limit,
      sourceApplications,
    );

    return {
      ok: true,
      data: toJsonValue({
        applications,
        count: applications.length,
        filters: {
          priority: priority ?? null,
          query,
          status: status ?? null,
        },
      }),
      llmSummary:
        applications.length > 0
          ? `找到 ${applications.length} 条 Tracker 记录，最近相关记录是 ${applications[0].company} · ${applications[0].role}。`
          : "没有找到符合条件的 Tracker 记录。",
      citations: applications.map(toApplicationCitation),
    };
  },
};

export const getApplicationDetailTool: ToolDefinition<
  GetApplicationDetailParams,
  JsonValue
> = {
  name: "get_application_detail",
  displayName: "Get Application Detail",
  description: "读取单条本地 Tracker 记录及事件时间线。",
  category: "query",
  parameters: {
    applicationId: {
      type: "integer",
      description: "Tracker 记录 ID。",
      required: true,
    },
  },
  parametersSchema: getApplicationDetailParamsSchema,
  handler: ({ applicationId }) => {
    const detail = getApplicationDetail(applicationId);

    return {
      ok: true,
      data: toJsonValue({
        applicationId,
        detail,
      }),
      llmSummary: detail
        ? `Tracker #${detail.application.id} 是 ${detail.application.company} · ${detail.application.role}，当前状态 ${detail.application.status}，事件 ${detail.events.length} 条。`
        : `未找到 Tracker 记录 #${applicationId}。`,
      citations: detail ? [toApplicationCitation(detail.application)] : [],
    };
  },
};

export const getAnalyticsOverviewTool: ToolDefinition<EmptyParams, JsonValue> = {
  name: "get_analytics_overview",
  displayName: "Get Analytics Overview",
  description: "读取本地 Analytics 聚合概览。",
  category: "query",
  parameters: {},
  parametersSchema: emptyParamsSchema,
  handler: () => {
    const analytics = getAnalyticsOverviewForAssistant();

    return {
      ok: true,
      data: toJsonValue(analytics),
      llmSummary: buildAnalyticsSummary(analytics),
      citations: [toAnalyticsCitation(analytics)],
    };
  },
};

export const getCareerProfileTool: ToolDefinition<EmptyParams, JsonValue> = {
  name: "get_career_profile",
  displayName: "Get Career Profile",
  description: "读取本地 Career DNA 设置，不生成或保存建议。",
  category: "query",
  parameters: {},
  parametersSchema: emptyParamsSchema,
  handler: () => {
    const { defaultsApplied, profile, setting } = getCareerProfile();
    const configured = !defaultsApplied && !isCareerProfileEmpty(profile);
    const data: CareerProfileToolData = {
      configured,
      defaultsApplied,
      profile,
      settingUpdatedAt: setting?.updatedAt ?? null,
    };

    return {
      ok: true,
      data: toJsonValue(data),
      llmSummary: configured
        ? `Career DNA 已配置：${profile.targetRoles.length} 个目标岗位，${profile.targetCities.length} 个目标城市，${profile.strengths.length} 条优势。`
        : "Career DNA 尚未完整配置，只能使用空画像或默认值作为参考。",
      citations: [toCareerProfileCitation(configured)],
    };
  },
};

export const listResumesTool: ToolDefinition<ListResumesParams, JsonValue> = {
  name: "list_resumes",
  displayName: "List Resumes",
  description: "读取本地未归档简历摘要。",
  category: "query",
  parameters: {
    limit: {
      type: "integer",
      description: "最多返回的简历数量，范围 1-30。",
    },
  },
  parametersSchema: listResumesParamsSchema,
  handler: ({ limit }) => {
    const resumes = listAssistantResumes(limit);

    return {
      ok: true,
      data: toJsonValue({
        count: resumes.length,
        defaultResumeId: resumes.find((resume) => resume.isDefault)?.id ?? null,
        resumes,
      }),
      llmSummary:
        resumes.length > 0
          ? `找到 ${resumes.length} 份未归档简历，默认简历是 ${
              resumes.find((resume) => resume.isDefault)?.name ?? "未设置"
            }。`
          : "没有找到未归档简历。",
      citations: resumes.map(toResumeCitation),
    };
  },
};

export const getDefaultResumeTool: ToolDefinition<EmptyParams, JsonValue> = {
  name: "get_default_resume",
  displayName: "Get Default Resume",
  description: "读取本地默认简历摘要。",
  category: "query",
  parameters: {},
  parametersSchema: emptyParamsSchema,
  handler: () => {
    const resume = getAssistantDefaultResume();

    return {
      ok: true,
      data: toJsonValue({
        resume,
      }),
      llmSummary: resume
        ? `默认简历是 #${resume.id}：${resume.name}，方向 ${resume.direction}。`
        : "尚未设置默认简历。",
      citations: resume ? [toResumeCitation(resume)] : [],
    };
  },
};

export const buildInterviewPrepContextTool: ToolDefinition<
  BuildInterviewPrepContextParams,
  JsonValue
> = {
  name: "build_interview_prep_context",
  displayName: "Build Interview Prep Context",
  description: "基于本地报告和简历生成只读面试准备上下文。",
  category: "query",
  parameters: {
    query: {
      type: "string",
      description: "未指定报告 ID 时，用于选择相关报告的搜索文本。",
    },
    reportId: {
      type: "integer",
      description: "用于面试准备的报告 ID；缺省时按 query 选择最近相关报告。",
    },
    resumeId: {
      type: "integer",
      description: "用于面试准备的简历 ID；缺省时使用默认简历。",
    },
  },
  parametersSchema: buildInterviewPrepContextParamsSchema,
  handler: ({ query, reportId, resumeId }) => {
    const selectedReportId = reportId ?? searchReports(query, 1)[0]?.id;
    const interviewPrep = buildInterviewPrepContext(selectedReportId, resumeId);

    return {
      ok: true,
      data: toJsonValue({
        interviewPrep,
        reportId: selectedReportId ?? null,
        resumeId: resumeId ?? interviewPrep?.resume?.id ?? null,
      }),
      llmSummary: buildInterviewPrepSummary(interviewPrep, selectedReportId),
      citations: interviewPrep ? toInterviewPrepCitations(interviewPrep) : [],
    };
  },
};

export const webSearchTool: ToolDefinition<WebSearchParams, JsonValue> = {
  name: "web_search",
  displayName: "Web Search",
  description:
    "联网搜索可用网页结果，不写入用户数据。",
  category: "query",
  parameters: {
    limit: {
      type: "integer",
      description: "最多返回的网页结果数量，范围 1-8。",
    },
    query: {
      type: "string",
      description: "要联网搜索的关键词或问题。",
      required: true,
    },
  },
  parametersSchema: webSearchParamsSchema,
  handler: async ({ limit, query }, context) => {
    const result = await searchWeb({ limit, query }, { now: context.now });

    if (!result.ok) {
      return {
        ok: false,
        error: {
          code: `web_search_${result.error.code}`,
          details: result.error.details,
          message: result.error.message,
          recoverable: isRecoverableWebSearchError(result.error.code),
        },
        llmSummary: `联网搜索失败：${result.error.message}`,
      };
    }

    return {
      ok: true,
      data: toJsonValue(result.data),
      llmSummary: buildWebSearchSummary(
        result.data.query,
        result.data.results,
        result.data.provider,
      ),
      citations: result.data.results.map(toWebCitation),
    };
  },
};

export const queryToolDefinitions = [
  searchReportsTool,
  getReportDetailTool,
  listApplicationsTool,
  getApplicationDetailTool,
  getAnalyticsOverviewTool,
  getCareerProfileTool,
  listResumesTool,
  getDefaultResumeTool,
  buildInterviewPrepContextTool,
  webSearchTool,
] as const;

export const queryToolNames = queryToolDefinitions.map((tool) => tool.name);

export function registerQueryTools(registry: ToolRegistry): ToolRegistry {
  for (const definition of queryToolDefinitions) {
    registry.register(definition as unknown as ToolDefinition);
  }

  return registry;
}

export function createQueryToolRegistry(
  activeToolNames?: readonly string[],
): ToolRegistry {
  const registry = registerQueryTools(new ToolRegistry());

  if (activeToolNames) {
    registry.setActiveToolNames(activeToolNames);
  }

  return registry;
}

function buildAnalyticsSummary(analytics: AnalyticsOverviewDto): string {
  return `Analytics 记录：${analytics.sampleSize.reports} 份报告、${analytics.sampleSize.applications} 条 Tracker、${analytics.sampleSize.resumes} 份简历；逾期跟进 ${analytics.tracker.overdueFollowUps} 条。`;
}

function buildInterviewPrepSummary(
  interviewPrep: AssistantInterviewPrepContext | null,
  selectedReportId: number | undefined,
): string {
  if (!selectedReportId) {
    return "没有可用于面试准备的本地评估报告。";
  }

  if (!interviewPrep) {
    return `未能基于报告 #${selectedReportId} 构建面试准备上下文。`;
  }

  const resumeName = interviewPrep.resume?.name ?? "未关联简历";

  return `已基于报告 #${interviewPrep.report.id} 和 ${resumeName} 构建面试准备上下文，重点 ${interviewPrep.focusAreas.length} 项。`;
}

function toReportCitation(report: AssistantReportSnapshot): AssistantCitation {
  return {
    id: report.id,
    label: `报告 #${report.id}：${report.company} · ${report.role}`,
    type: "report",
  };
}

function toApplicationCitation(
  application: AssistantApplicationSnapshot,
): AssistantCitation {
  return {
    id: application.id,
    label: `Tracker #${application.id}：${application.company} · ${application.role}`,
    type: "application",
  };
}

function toResumeCitation(resume: AssistantResumeSnapshot): AssistantCitation {
  return {
    id: resume.id,
    label: `${resume.isDefault ? "默认简历" : "简历"} #${resume.id}：${resume.name}`,
    type: "resume",
  };
}

function toAnalyticsCitation(analytics: AnalyticsOverviewDto): AssistantCitation {
  return {
    id: analytics.generatedAt,
    label: `Analytics 概览：${analytics.sampleSize.reports} 份报告 / ${analytics.sampleSize.applications} 条 Tracker`,
    type: "analytics",
  };
}

function toCareerProfileCitation(configured: boolean): AssistantCitation {
  return {
    id: "career_profile",
    label: configured ? "Career DNA：已配置" : "Career DNA：未完整配置",
    type: "career_profile",
  };
}

function toInterviewPrepCitations(
  interviewPrep: AssistantInterviewPrepContext,
): AssistantCitation[] {
  return [
    toReportCitation(interviewPrep.report),
    ...(interviewPrep.resume ? [toResumeCitation(interviewPrep.resume)] : []),
  ];
}

function buildWebSearchSummary(
  query: string,
  results: WebSearchResult[],
  provider: "brave" | "mock" | "tavily",
): string {
  if (results.length === 0) {
    return `联网搜索 "${query}" 没有返回可用网页结果。`;
  }

  void provider;

  return `联网搜索 "${query}" 返回 ${results.length} 条可用网页结果。`;
}

function toWebCitation(result: WebSearchResult): AssistantCitation {
  return {
    id: result.url,
    label: result.sourceName ? `${result.sourceName}：${result.title}` : result.title,
    type: "web",
  };
}

function isRecoverableWebSearchError(code: string): boolean {
  return [
    "timeout",
    "aborted",
    "network_error",
    "http_error",
    "invalid_response",
  ].includes(code);
}

function isCareerProfileEmpty(profile: CareerProfileSettings): boolean {
  return (
    profile.targetDirections.length === 0 &&
    profile.targetRoles.length === 0 &&
    profile.targetCities.length === 0 &&
    profile.preferredWorkModes.length === 0 &&
    profile.strengths.length === 0 &&
    profile.weaknesses.length === 0 &&
    profile.dealBreakers.length === 0 &&
    profile.preferredCompanyStages.length === 0 &&
    !profile.currentStrategy?.trim()
  );
}

function toJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}
