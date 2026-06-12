import { getCareerProfileSetting } from "./career-profile";
import { RESUME_DIRECTION_LABELS } from "./resume-directions";
import { assistantResponseSchema, analyticsOverviewSchema } from "./schemas";
import {
  getAnalyticsOverview,
  getApplicationById,
  getDefaultResume,
  getReportById,
  getResumeById,
  listApplicationEvents,
  listApplications,
  listReports,
  listResumes,
} from "./server-db";
import type {
  AnalyticsOverviewDto,
  ApplicationDto,
  ApplicationEventDto,
  ApplicationStatus,
  AssistantAction,
  AssistantCitation,
  AssistantRequest,
  AssistantResponse,
  CareerProfileSettings,
  ReportDto,
  ResumeDto,
  RiskLevel,
} from "./types";

export type AssistantReportSnapshot = {
  id: number;
  company: string;
  role: string;
  direction: string;
  location?: string;
  scoreOverall: number;
  riskLevel: RiskLevel;
  recommendation: string;
  techStack: string[];
  topRisks: string[];
  createdAt: string;
};

export type AssistantApplicationSnapshot = {
  id: number;
  company: string;
  role: string;
  status: ApplicationStatus;
  priority: ApplicationDto["priority"];
  channel: string | null;
  scoreOverall: number | null;
  riskLevel: RiskLevel | null;
  nextFollowUpAt: string | null;
  daysOverdue: number | null;
  reportId: number | null;
  resumeId: number | null;
  tags: string[];
  updatedAt: string;
};

export type AssistantResumeSnapshot = {
  id: number;
  name: string;
  direction: ResumeDto["direction"];
  isDefault: boolean;
  currentRole?: string;
  topSkills: string[];
  updatedAt: string;
};

export type AssistantApplicationDetail = {
  application: AssistantApplicationSnapshot;
  events: ApplicationEventDto[];
};

export type AssistantInterviewPrepContext = {
  report: AssistantReportSnapshot;
  resume: AssistantResumeSnapshot | null;
  focusAreas: string[];
};

export type AssistantLocalContext = {
  generatedAt: string;
  request: AssistantRequest;
  analytics: AnalyticsOverviewDto;
  applications: AssistantApplicationSnapshot[];
  applicationDetail: AssistantApplicationDetail | null;
  careerProfile: CareerProfileSettings;
  careerProfileConfigured: boolean;
  citations: AssistantCitation[];
  defaultResume: AssistantResumeSnapshot | null;
  hasLocalData: boolean;
  interviewPrep: AssistantInterviewPrepContext | null;
  reportDetail: AssistantReportSnapshot | null;
  reports: AssistantReportSnapshot[];
  resumes: AssistantResumeSnapshot[];
  sourceSummary: {
    applications: number;
    reports: number;
    resumes: number;
    activeApplications: number;
    matchedReports: number;
  };
  suggestedActions: AssistantAction[];
  warnings: string[];
};

const TERMINAL_APPLICATION_STATUSES = new Set<ApplicationStatus>([
  "abandoned",
  "offer_received",
  "rejected",
]);

const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  abandoned: "已放弃",
  applied: "已投递",
  interviewing: "面试中",
  offer_received: "已获 Offer",
  rejected: "未通过",
  to_apply: "待投递",
};

const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  critical: "极高风险",
  high: "高风险",
  low: "低风险",
  medium: "中风险",
};

export function buildAssistantLocalContext(
  request: AssistantRequest,
): AssistantLocalContext {
  const generatedAt = new Date().toISOString();
  const analytics = analyticsOverviewSchema.parse(getAnalyticsOverview());
  const allReports = listReports(100);
  const allApplications = listApplications({ limit: 100 });
  const allResumes = listResumes(20);
  const defaultResume = getDefaultResume();
  const { defaultsApplied, profile: careerProfile } = getCareerProfileSetting();
  const reportDetail = request.context?.reportId
    ? getReportDetail(request.context.reportId)
    : null;
  const applicationDetail = request.context?.applicationId
    ? getApplicationDetail(request.context.applicationId)
    : null;
  const reports = mergeReports(
    reportDetail,
    searchReports(request.message, 8, allReports),
  );
  const applications = listAssistantApplications(request.message, 12, allApplications);
  const resumes = allResumes.map(mapResumeSnapshot);
  const selectedResume = request.context?.resumeId
    ? getResumeById(request.context.resumeId)
    : null;
  const interviewReportId = request.context?.reportId ?? reports[0]?.id;
  const interviewPrep = shouldBuildInterviewContext(request.message, interviewReportId)
    ? buildInterviewPrepContext(
        interviewReportId,
        selectedResume?.id ?? request.context?.resumeId,
      )
    : null;
  const careerProfileConfigured = !defaultsApplied && !isCareerProfileEmpty(careerProfile);
  const hasLocalData =
    analytics.sampleSize.reports > 0 ||
    analytics.sampleSize.resumes > 0 ||
    analytics.sampleSize.applications > 0 ||
    careerProfileConfigured;
  const actionResult = buildRuleBasedActions(request, allApplications, careerProfile);
  const warnings = buildContextWarnings({
    actionWarnings: actionResult.warnings,
    analytics,
    careerProfileConfigured,
    hasLocalData,
  });
  const citations = buildContextCitations({
    analytics,
    applicationDetail,
    applications,
    careerProfileConfigured,
    defaultResume: defaultResume ? mapResumeSnapshot(defaultResume) : null,
    reportDetail,
    reports,
    selectedResume: selectedResume ? mapResumeSnapshot(selectedResume) : null,
  });

  return {
    generatedAt,
    request,
    analytics,
    applications,
    applicationDetail,
    careerProfile,
    careerProfileConfigured,
    citations,
    defaultResume: defaultResume ? mapResumeSnapshot(defaultResume) : null,
    hasLocalData,
    interviewPrep,
    reportDetail,
    reports,
    resumes,
    sourceSummary: {
      activeApplications: analytics.sampleSize.activeApplications,
      applications: analytics.sampleSize.applications,
      matchedReports: analytics.sampleSize.matchedReports,
      reports: analytics.sampleSize.reports,
      resumes: analytics.sampleSize.resumes,
    },
    suggestedActions: actionResult.actions,
    warnings,
  };
}

export function searchReports(
  query: string,
  limit = 8,
  reports = listReports(100),
): AssistantReportSnapshot[] {
  const tokens = tokenize(query);
  const scored = reports.map((report) => ({
    report,
    score: scoreReportRelevance(report, tokens),
  }));

  return scored
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return parseDateTime(right.report.createdAt) - parseDateTime(left.report.createdAt);
    })
    .slice(0, limit)
    .map(({ report }) => mapReportSnapshot(report));
}

export function getReportDetail(reportId: number): AssistantReportSnapshot | null {
  const report = getReportById(reportId);

  return report ? mapReportSnapshot(report) : null;
}

export function listAssistantApplications(
  query: string,
  limit = 12,
  applications = listApplications({ limit: 100 }),
): AssistantApplicationSnapshot[] {
  const tokens = tokenize(query);

  return applications
    .map((application) => ({
      application,
      score: scoreApplicationRelevance(application, tokens, query),
    }))
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return (
        parseDateTime(right.application.updatedAt) -
        parseDateTime(left.application.updatedAt)
      );
    })
    .slice(0, limit)
    .map(({ application }) => mapApplicationSnapshot(application));
}

export function getApplicationDetail(
  applicationId: number,
): AssistantApplicationDetail | null {
  const application = getApplicationById(applicationId);

  if (!application) {
    return null;
  }

  return {
    application: mapApplicationSnapshot(application),
    events: listApplicationEvents(applicationId),
  };
}

export function getCareerProfile() {
  return getCareerProfileSetting();
}

export function getAnalyticsOverviewForAssistant(): AnalyticsOverviewDto {
  return analyticsOverviewSchema.parse(getAnalyticsOverview());
}

export function listAssistantResumes(limit = 20): AssistantResumeSnapshot[] {
  return listResumes(limit).map(mapResumeSnapshot);
}

export function getAssistantDefaultResume(): AssistantResumeSnapshot | null {
  const resume = getDefaultResume();

  return resume ? mapResumeSnapshot(resume) : null;
}

export function buildInterviewPrepContext(
  reportId: number | undefined,
  resumeId?: number,
): AssistantInterviewPrepContext | null {
  if (!reportId) {
    return null;
  }

  const report = getReportById(reportId);

  if (!report) {
    return null;
  }

  const resume = resumeId ? getResumeById(resumeId) : getDefaultResume();
  const focusAreas = uniqueStrings([
    ...report.report.job.techStack.slice(0, 6),
    ...report.risks.slice(0, 4).map((risk) => risk.signal),
    ...report.report.sections.flatMap((section) => section.suggestions.slice(0, 1)),
  ]).slice(0, 10);

  return {
    report: mapReportSnapshot(report),
    resume: resume ? mapResumeSnapshot(resume) : null,
    focusAreas,
  };
}

export function buildLocalAssistantResponse(
  context: AssistantLocalContext,
  extraWarnings: string[] = [],
  meta: {
    fallbackCode?: string | null;
    fallbackMessage?: string | null;
    fallbackReason?: string | null;
  } = {},
): AssistantResponse {
  return assistantResponseSchema.parse({
    actions: context.suggestedActions,
    answer: buildRuleBasedAnswer(context),
    citations: context.citations,
    fallbackCode: meta.fallbackCode ?? null,
    fallbackMessage: meta.fallbackMessage ?? null,
    fallbackReason: meta.fallbackReason ?? (meta.fallbackCode ? "deepseek_unavailable" : null),
    fallbackUsed: true,
    provider: "local_fallback",
    warnings: uniqueStrings([...context.warnings, ...extraWarnings]).slice(0, 12),
  });
}

function buildRuleBasedAnswer(context: AssistantLocalContext): string {
  const message = context.request.message;
  const lowerMessage = message.toLocaleLowerCase();

  if (!context.hasLocalData) {
    return [
      "当前还没有可用的报告、简历或 Tracker 记录。",
      "建议先完成一次 JD 评估，保存默认简历，再把你手动维护的岗位加入 Tracker。之后我才能基于真实本地数据回答“最该跟进谁”“风险集中在哪”“哪些岗位更符合 Career DNA”。",
    ].join("\n\n");
  }

  if (context.suggestedActions.length > 0) {
    const actionLines = context.suggestedActions.map(
      (action) => `- ${action.label}`,
    );

    return [
      "我不会直接修改本地数据，也不会替你投递或联系 HR。",
      "已根据你的问题生成待确认动作：",
      ...actionLines,
      "请先核对动作卡片里的 payload，再到对应页面手动确认或编辑。",
    ].join("\n");
  }

  if (includesAny(lowerMessage, ["跟进", "逾期", "最该", "优先"])) {
    return buildFollowUpAnswer(context);
  }

  if (includesAny(lowerMessage, ["career dna", "画像", "匹配", "符合"])) {
    return buildCareerFitAnswer(context);
  }

  if (includesAny(lowerMessage, ["风险", "为什么", "解释报告"])) {
    return buildRiskAnswer(context);
  }

  if (includesAny(lowerMessage, ["漏斗", "analytics", "分析", "这周", "复盘"])) {
    return buildAnalyticsAnswer(context);
  }

  if (includesAny(lowerMessage, ["面试", "问题", "准备"])) {
    return buildInterviewAnswer(context);
  }

  return buildOverviewAnswer(context);
}

function buildFollowUpAnswer(context: AssistantLocalContext): string {
  const overdue = context.analytics.tracker.overdueItems.slice(0, 5);

  if (overdue.length > 0) {
    return [
      `当前有 ${context.analytics.tracker.overdueFollowUps} 条 Tracker 已过下次跟进时间。建议先处理：`,
      ...overdue.map(
        (item) =>
          `- ${item.company} · ${item.role}：${APPLICATION_STATUS_LABELS[item.status]}，${item.priority === "high" ? "高优先级，" : ""}已逾期 ${item.daysOverdue} 天。`,
      ),
      "处理顺序建议：先高优先级，再面试中，再补齐缺少下一步记录的岗位。",
    ].join("\n");
  }

  const active = context.applications
    .filter((application) => !TERMINAL_APPLICATION_STATUSES.has(application.status))
    .slice(0, 5);

  if (active.length === 0) {
    return "当前 Tracker 没有推进中的岗位。建议先从最近高匹配报告中挑选 1-3 个真实想投的岗位，手动加入投递清单。";
  }

  return [
    "当前没有逾期跟进。可以按优先级检查这些推进中岗位：",
    ...active.map(
      (application) =>
        `- ${application.company} · ${application.role}：${APPLICATION_STATUS_LABELS[application.status]}，${application.priority}，下次跟进 ${application.nextFollowUpAt ?? "未设置"}。`,
    ),
  ].join("\n");
}

function buildCareerFitAnswer(context: AssistantLocalContext): string {
  const careerFit = context.analytics.careerFit;

  if (!careerFit) {
    return "Career DNA 还没有足够配置。建议先在“求职画像”里补目标方向、目标岗位、城市偏好和不接受条件；之后我可以用它对 Tracker 岗位做匹配判断。";
  }

  return [
    careerFit.summary,
    `已检查 ${careerFit.checkedCount} 条记录，其中 ${careerFit.matchedCount} 条较符合画像，${careerFit.warningCount} 条需要复核。`,
    careerFit.warnings.length > 0
      ? `需要关注：${careerFit.warnings.slice(0, 4).join("；")}。`
      : "暂未发现明显偏离画像的提醒。",
  ].join("\n");
}

function buildRiskAnswer(context: AssistantLocalContext): string {
  const report = context.reportDetail ?? context.reports[0] ?? null;

  if (report) {
    return [
      `${report.company} · ${report.role} 的报告风险等级为${RISK_LEVEL_LABELS[report.riskLevel]}，总评分 ${report.scoreOverall.toFixed(1)} / 5。`,
      report.topRisks.length > 0
        ? `主要风险信号：${report.topRisks.join("；")}。`
        : "报告里没有高频风险信号。",
      `建议：${report.recommendation}`,
    ].join("\n");
  }

  const topRisk = context.analytics.riskSignals[0];

  if (!topRisk) {
    return "当前报告里没有可聚合的风险信号。继续积累 JD 评估后，我可以解释高风险岗位的原因和面试追问点。";
  }

  return `最近报告里最常见的风险是「${topRisk.label}」，出现 ${topRisk.count} 次。建议优先复核这类 JD 的真实性、岗位职责边界和薪资/试用期条件。`;
}

function buildAnalyticsAnswer(context: AssistantLocalContext): string {
  const funnel = context.analytics.funnel
    .map((item) => `${item.label} ${item.count}`)
    .join("、");
  const topDirection = context.analytics.directions[0];
  const topGap = context.analytics.skillGaps[0];

  return [
    `已保存记录：${context.sourceSummary.reports} 份报告、${context.sourceSummary.resumes} 份简历、${context.sourceSummary.applications} 条 Tracker。`,
    `漏斗：${funnel}。`,
    topDirection
      ? `方向上，${topDirection.label} 记录最多，平均分 ${topDirection.averageScore.toFixed(1)}，高风险率 ${topDirection.highRiskRate.toFixed(1)}%。`
      : "方向记录暂不足。",
    topGap
      ? `技能缺口 Top：${topGap.skill}，出现在 ${topGap.count} 个岗位。`
      : "技能缺口暂不足，通常需要默认简历和多份报告共同支撑。",
  ].join("\n");
}

function buildInterviewAnswer(context: AssistantLocalContext): string {
  const prep = context.interviewPrep;

  if (!prep) {
    return "要准备面试问题，请先指定一个报告或在完成 JD 评估后再提问。当前 Assistant MVP 只基于本地报告和默认简历生成基础准备方向。";
  }

  const focus = prep.focusAreas.slice(0, 5);

  return [
    `可以先围绕 ${prep.report.company} · ${prep.report.role} 准备这些问题：`,
    ...focus.map((item, index) => `${index + 1}. 请结合你的项目经历解释 ${item} 的实际应用和取舍。`),
    `补充准备：把默认简历「${prep.resume?.name ?? "未设置"}」中最能支撑该岗位的 2 个项目证据整理成 STAR 结构。`,
  ].join("\n");
}

function buildOverviewAnswer(context: AssistantLocalContext): string {
  const overdueCount = context.analytics.tracker.overdueFollowUps;
  const activeCount = context.analytics.sampleSize.activeApplications;
  const risk = context.analytics.riskSignals[0];

  return [
    `我读取到 ${context.sourceSummary.reports} 份报告、${context.sourceSummary.applications} 条 Tracker、${context.sourceSummary.resumes} 份简历和 ${context.careerProfileConfigured ? "已配置" : "未完整配置"}的 Career DNA。`,
    overdueCount > 0
      ? `下一步建议先处理 ${overdueCount} 条逾期跟进。`
      : `当前有 ${activeCount} 条岗位仍在推进中，暂未发现逾期跟进。`,
    risk
      ? `风险上，最近最常见信号是「${risk.label}」。`
      : "风险记录暂不足。",
    "如果要修改状态或写入画像，我只会返回待确认动作，不会直接写入。",
  ].join("\n");
}

function buildRuleBasedActions(
  request: AssistantRequest,
  applications: ApplicationDto[],
  careerProfile: CareerProfileSettings,
): { actions: AssistantAction[]; warnings: string[] } {
  const message = request.message;
  const actions: AssistantAction[] = [];
  const warnings: string[] = [];
  const status = detectStatusIntent(message);

  if (status) {
    const target = findApplicationTarget(request, applications);

    if (target) {
      actions.push({
        id: `assistant-update-status-${target.id}-${status}`,
        label: `将「${target.company} · ${target.role}」状态改为${APPLICATION_STATUS_LABELS[status]}`,
        payload: {
          applicationId: target.id,
          currentStatus: target.status,
          status,
        },
        requiresConfirmation: true,
        type: "update_application_status",
      });
    } else {
      warnings.push("检测到状态修改意图，但无法唯一定位 Tracker 记录，请指定岗位或 applicationId。");
    }
  }

  if (shouldCreateFollowUpEvent(message)) {
    const target = findApplicationTarget(request, applications);

    if (target) {
      actions.push({
        id: `assistant-follow-up-${target.id}-${hashString(message)}`,
        label: `为「${target.company} · ${target.role}」新增跟进事件`,
        payload: {
          applicationId: target.id,
          eventType: "follow_up_scheduled",
          note: message,
          title: "Assistant 建议跟进",
        },
        requiresConfirmation: true,
        type: "create_follow_up_event",
      });
    } else {
      warnings.push("检测到新增跟进事件意图，但无法唯一定位 Tracker 记录，请指定岗位或 applicationId。");
    }
  }

  if (shouldEditCareerProfile(message)) {
    actions.push({
      id: `assistant-edit-career-profile-${hashString(message)}`,
      label: "将这条建议写入 Career DNA 草稿",
      payload: {
        currentProfileUpdatedAt: careerProfile.updatedAt,
        proposal: message,
      },
      requiresConfirmation: true,
      type: "edit_career_profile",
    });
  }

  return {
    actions: dedupeActions(actions).slice(0, 5),
    warnings,
  };
}

function buildContextWarnings({
  actionWarnings,
  analytics,
  careerProfileConfigured,
  hasLocalData,
}: {
  actionWarnings: string[];
  analytics: AnalyticsOverviewDto;
  careerProfileConfigured: boolean;
  hasLocalData: boolean;
}): string[] {
  const warnings = [
    "仅基于你已保存的内容回答，不连接招聘平台。",
    "不会自动投递、不会联系 HR，也不会声称已完成外部操作。",
  ];

  if (!hasLocalData) {
    warnings.push("当前还没有本地报告、简历和 Tracker 记录。");
  }

  if (!careerProfileConfigured) {
    warnings.push("Career DNA 尚未完整配置，画像匹配建议只能作为参考。");
  }

  warnings.push(...analytics.caveats.slice(0, 4));
  warnings.push(...actionWarnings);

  return uniqueStrings(warnings).slice(0, 12);
}

function buildContextCitations({
  analytics,
  applicationDetail,
  applications,
  careerProfileConfigured,
  defaultResume,
  reportDetail,
  reports,
  selectedResume,
}: {
  analytics: AnalyticsOverviewDto;
  applicationDetail: AssistantApplicationDetail | null;
  applications: AssistantApplicationSnapshot[];
  careerProfileConfigured: boolean;
  defaultResume: AssistantResumeSnapshot | null;
  reportDetail: AssistantReportSnapshot | null;
  reports: AssistantReportSnapshot[];
  selectedResume: AssistantResumeSnapshot | null;
}): AssistantCitation[] {
  const citations: AssistantCitation[] = [
    {
      id: analytics.generatedAt,
      label: `Analytics 概览：${analytics.sampleSize.reports} 份报告 / ${analytics.sampleSize.applications} 条 Tracker`,
      type: "analytics",
    },
    {
      id: "career_profile",
      label: careerProfileConfigured ? "Career DNA：已配置" : "Career DNA：未完整配置",
      type: "career_profile",
    },
  ];

  for (const report of uniqueById([reportDetail, ...reports].filter(isDefined))) {
    citations.push({
      id: report.id,
      label: `报告 #${report.id}：${report.company} · ${report.role}`,
      type: "report",
    });
  }

  for (const application of uniqueById([
    applicationDetail?.application ?? null,
    ...applications,
  ].filter(isDefined))) {
    citations.push({
      id: application.id,
      label: `Tracker #${application.id}：${application.company} · ${application.role}`,
      type: "application",
    });
  }

  for (const resume of uniqueById([selectedResume, defaultResume].filter(isDefined))) {
    citations.push({
      id: resume.id,
      label: `${resume.isDefault ? "默认简历" : "简历"} #${resume.id}：${resume.name}`,
      type: "resume",
    });
  }

  return dedupeCitations(citations).slice(0, 20);
}

function mapReportSnapshot(report: ReportDto): AssistantReportSnapshot {
  const riskSignals = report.risks
    .filter((risk) => risk.severity === "critical" || risk.severity === "high")
    .map((risk) => `${risk.signal}（${RISK_LEVEL_LABELS[risk.severity]}）`);
  const direction =
    report.report.job.aiDirection ??
    report.report.job.ecosystem?.primaryDomain ??
    "general";

  return {
    id: report.id,
    company: report.company,
    role: report.role,
    direction:
      direction in RESUME_DIRECTION_LABELS
        ? RESUME_DIRECTION_LABELS[direction as keyof typeof RESUME_DIRECTION_LABELS]
        : direction,
    location: report.report.job.location,
    scoreOverall: report.score.overall,
    riskLevel: report.report.risks.level,
    recommendation: report.report.recommendation,
    techStack: report.report.job.techStack.slice(0, 12),
    topRisks: riskSignals.slice(0, 6),
    createdAt: report.createdAt,
  };
}

function mapApplicationSnapshot(
  application: ApplicationDto,
): AssistantApplicationSnapshot {
  return {
    id: application.id,
    company: application.company,
    role: application.role,
    status: application.status,
    priority: application.priority,
    channel: application.channel,
    scoreOverall: application.scoreOverall,
    riskLevel: application.riskLevel,
    nextFollowUpAt: application.nextFollowUpAt,
    daysOverdue: getDaysOverdue(application),
    reportId: application.reportId,
    resumeId: application.resumeId,
    tags: application.tags,
    updatedAt: application.updatedAt,
  };
}

function mapResumeSnapshot(resume: ResumeDto): AssistantResumeSnapshot {
  return {
    id: resume.id,
    name: resume.name,
    direction: resume.direction,
    isDefault: resume.isDefault,
    currentRole: resume.content.currentRole,
    topSkills: resume.skills.slice(0, 12).map((skill) => skill.name),
    updatedAt: resume.updatedAt,
  };
}

function scoreReportRelevance(report: ReportDto, tokens: string[]): number {
  if (tokens.length === 0) {
    return 1;
  }

  const haystack = normalizeSearchText([
    report.company,
    report.role,
    report.report.job.aiDirection ?? "",
    report.report.job.location ?? "",
    report.report.job.techStack.join(" "),
    report.report.risks.summary,
    report.report.recommendation,
  ].join(" "));

  return tokens.reduce(
    (score, token) => score + (haystack.includes(token) ? token.length : 0),
    0,
  );
}

function scoreApplicationRelevance(
  application: ApplicationDto,
  tokens: string[],
  query: string,
): number {
  let score = 0;
  const haystack = normalizeSearchText([
    application.company,
    application.role,
    application.channel ?? "",
    application.tags.join(" "),
    application.notes,
  ].join(" "));

  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += token.length * 2;
    }
  }

  if (isApplicationOverdue(application) && includesAny(query, ["跟进", "逾期", "最该"])) {
    score += 20;
  }

  if (application.priority === "high" && includesAny(query, ["优先", "最该", "重点"])) {
    score += 12;
  }

  if (!TERMINAL_APPLICATION_STATUSES.has(application.status)) {
    score += 3;
  }

  return score;
}

function findApplicationTarget(
  request: AssistantRequest,
  applications: ApplicationDto[],
): ApplicationDto | null {
  if (request.context?.applicationId) {
    return (
      applications.find(
        (application) => application.id === request.context?.applicationId,
      ) ?? null
    );
  }

  const mentionedId = readMentionedApplicationId(request.message);

  if (mentionedId) {
    return applications.find((application) => application.id === mentionedId) ?? null;
  }

  const tokens = tokenize(request.message);
  const matches = applications.filter((application) => {
    const haystack = normalizeSearchText(`${application.company} ${application.role}`);

    return tokens.some((token) => token.length >= 2 && haystack.includes(token));
  });

  if (matches.length === 1) {
    return matches[0];
  }

  return null;
}

function detectStatusIntent(message: string): ApplicationStatus | null {
  if (!includesAny(message, ["改成", "更新", "设为", "标记", "状态", "改为"])) {
    return null;
  }

  if (includesAny(message, ["已投递", "投递了", "applied"])) {
    return "applied";
  }

  if (includesAny(message, ["面试中", "面试", "interviewing"])) {
    return "interviewing";
  }

  if (includesAny(message, ["offer", "已获 offer", "拿到 offer"])) {
    return "offer_received";
  }

  if (includesAny(message, ["未通过", "拒绝", "rejected"])) {
    return "rejected";
  }

  if (includesAny(message, ["放弃", "abandoned"])) {
    return "abandoned";
  }

  if (includesAny(message, ["待投递", "to_apply"])) {
    return "to_apply";
  }

  return null;
}

function shouldCreateFollowUpEvent(message: string): boolean {
  return includesAny(message, ["新增跟进", "记录跟进", "安排跟进", "创建跟进"]);
}

function shouldEditCareerProfile(message: string): boolean {
  return includesAny(message, [
    "写入画像",
    "加入画像",
    "更新画像",
    "修改画像",
    "写入 career dna",
  ]);
}

function shouldBuildInterviewContext(
  message: string,
  reportId: number | undefined,
): reportId is number {
  return Boolean(reportId) && includesAny(message, ["面试", "问题", "准备"]);
}

function mergeReports(
  detail: AssistantReportSnapshot | null,
  reports: AssistantReportSnapshot[],
): AssistantReportSnapshot[] {
  return uniqueById([detail, ...reports].filter(isDefined)).slice(0, 8);
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

function getDaysOverdue(application: ApplicationDto): number | null {
  if (!isApplicationOverdue(application) || !application.nextFollowUpAt) {
    return null;
  }

  const timestamp = parseDateTime(application.nextFollowUpAt);
  const dayMs = 24 * 60 * 60 * 1000;

  return Math.max(0, Math.ceil((Date.now() - timestamp) / dayMs));
}

function isApplicationOverdue(application: ApplicationDto): boolean {
  if (
    !application.nextFollowUpAt ||
    TERMINAL_APPLICATION_STATUSES.has(application.status)
  ) {
    return false;
  }

  const timestamp = parseDateTime(application.nextFollowUpAt);

  return timestamp > 0 && timestamp < Date.now();
}

function readMentionedApplicationId(message: string): number | null {
  const match = message.match(/(?:application|tracker|投递记录|#)\s*([1-9]\d*)/i);

  if (!match) {
    return null;
  }

  const id = Number(match[1]);

  return Number.isSafeInteger(id) ? id : null;
}

function tokenize(value: string): string[] {
  return uniqueStrings(
    normalizeSearchText(value)
      .split(/[\s,，、。；;:：!！?？/\\|()[\]{}"'`]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  ).slice(0, 12);
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function includesAny(value: string, needles: string[]): boolean {
  const normalized = normalizeSearchText(value);

  return needles.some((needle) => normalized.includes(normalizeSearchText(needle)));
}

function parseDateTime(value: string | null): number {
  if (!value) {
    return 0;
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const timestamp = new Date(normalized).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
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

function uniqueById<TItem extends { id: number }>(items: TItem[]): TItem[] {
  const seen = new Set<number>();
  const result: TItem[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }

    seen.add(item.id);
    result.push(item);
  }

  return result;
}

function isDefined<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}

function dedupeCitations(citations: AssistantCitation[]): AssistantCitation[] {
  const seen = new Set<string>();
  const result: AssistantCitation[] = [];

  for (const citation of citations) {
    const key = `${citation.type}:${citation.id ?? citation.label}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(citation);
  }

  return result;
}

function dedupeActions(actions: AssistantAction[]): AssistantAction[] {
  const seen = new Set<string>();
  const result: AssistantAction[] = [];

  for (const action of actions) {
    const key = `${action.type}:${JSON.stringify(action.payload)}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(action);
  }

  return result;
}

function hashString(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}
