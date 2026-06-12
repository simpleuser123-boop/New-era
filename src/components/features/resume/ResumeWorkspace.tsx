"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BrainCircuit,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardPaste,
  FileCheck2,
  FileText,
  Loader2,
  MoreVertical,
  Sparkles,
  Target,
  TriangleAlert,
  UploadCloud,
  X,
} from "lucide-react";
import presetJds from "../../../../demo-data/preset-jds.json";
import sampleResumes from "../../../../demo-data/sample-resumes.json";
import { Progress } from "@/components/ui/Progress";
import { apiRequest } from "@/lib/api-client";
import {
  normalizeResumeDirection,
  RESUME_DIRECTION_LABELS,
  RESUME_DIRECTION_OPTIONS,
} from "@/lib/resume-directions";
import type {
  AiEcosystemDomain,
  AiEcosystemVector,
  AtsCheckResult,
  OptimizationFeedbackDecision,
  OptimizationFeedbackDto,
  ReportDto,
  ResumeContent,
  ResumeDirection,
  ResumeDto,
  ResumeMatchedSkill,
  ResumeMatchLevel,
  ResumeMatchResult,
  ResumeOptimizationEffort,
  ResumeOptimizationMode,
  ResumeOptimizationRunDto,
  ResumeOptimizationSuggestion,
  ResumeProject,
  ResumeSkill,
  SkillGap,
} from "@/lib/types";

type DemoResume = {
  id: string;
  name: string;
  targetDirection: string;
  yearsOfExperience: number;
  rawText: string;
  expectedParsedProfile?: {
    name?: string;
    currentRole?: string;
    targetDirection?: string;
    yearsOfExperience?: number;
    location?: string;
    summary?: string;
    preferredRoles?: string[];
    education?: Array<{
      school: string;
      degree?: string;
      major?: string;
      period?: string;
    }>;
    workExperience?: Array<{
      company: string;
      role: string;
      period?: string;
      focus?: string;
    }>;
  };
  expectedSkills?: Array<{
    name: string;
    category: string;
    level?: string;
    evidence?: string;
  }>;
  expectedProjects?: Array<{
    name: string;
    role?: string;
    domain?: string;
    techStack?: string[];
    impact?: string;
    matchKeywords?: string[];
  }>;
  expectedEcosystemPosition?: Partial<Record<string, number>>;
  expectedStrengths?: Array<{
    title: string;
    detail: string;
  }>;
  expectedGaps?: Array<{
    title: string;
    impactOnMatching?: string;
    suggestion?: string;
  }>;
};

type DemoJd = {
  id: string;
  title: string;
  company: string;
  role: string;
  type: "real_ai" | "fake_ai" | "borderline";
  aiDirection: string;
  salaryRange: string;
  location: string;
  experienceLevel: string;
  jdText: string;
  expectedKeywords?: string[];
};

type MatchTarget =
  | {
      id: string;
      kind: "report";
      title: string;
      company: string;
      role: string;
      description: string;
      reportId: number;
      jdText: string;
      jobDirection: ResumeDirection | null;
      score?: number;
    }
  | {
      id: string;
      kind: "demo";
      title: string;
      company: string;
      role: string;
      description: string;
      demoId: string;
      jdText: string;
      jobDirection: ResumeDirection | null;
      score?: number;
    };

type ParsedResumeState = {
  resumeId: number | null;
  resume?: ResumeDto;
  direction: ResumeDirection;
  content: ResumeContent;
  skills: ResumeSkill[];
  aiTechStack?: {
    languages?: string[];
    frameworks?: string[];
    tools?: string[];
    domains?: string[];
    infrastructure?: string[];
    evaluation?: string[];
    all?: string[];
  };
  ecosystem: AiEcosystemVector;
  ecosystemPosition?: Partial<Record<string, number>>;
  ecosystemProfile?: {
    primaryDomain: AiEcosystemDomain;
    vector: AiEcosystemVector;
    evidence: string[];
  } | null;
  parsedProfile?: {
    name?: string;
    currentRole?: string;
    targetDirection?: string;
    yearsOfExperience?: number;
    summary?: string;
    preferredRoles?: string[];
  };
};

type ParseResponse =
  {
    ok: true;
    resumeId: number | null;
    resume?: ResumeDto | null;
    structuredResume: ResumeContent;
    parsedProfile?: ParsedResumeState["parsedProfile"];
    skills: ResumeSkill[];
    aiTechStack?: ParsedResumeState["aiTechStack"];
    ecosystem: AiEcosystemVector;
    ecosystemPosition?: Partial<Record<string, number>>;
    ecosystemProfile?: ParsedResumeState["ecosystemProfile"];
    saveStatus?: "saved" | "failed";
    saveError?: {
      code?: string;
      message?: string;
    } | null;
    uploadedFile?: {
      extension: string | null;
      name: string;
      parser: string;
      size: number;
      type: string;
    } | null;
    provider?: string;
    fallbackUsed?: boolean;
    fallbackMessage?: string | null;
  };

type ResumeSaveResponse =
  {
    ok: true;
    resumeId: number;
    resume: ResumeDto;
    saveStatus: "saved";
  };

type ReportsResponse =
  {
    ok: true;
    reports: ReportDto[];
  };

type ResumesResponse =
  {
    ok: true;
    resumes: ResumeDto[];
  };

type DefaultResumeResponse =
  {
    ok: true;
    resume: ResumeDto;
  };

type ArchiveResumeResponse =
  {
    ok: true;
    resume: ResumeDto;
    archiveStatus: "archived";
    clearedDefault: boolean;
  };

type ResumeDirectionUpdateResponse =
  {
    ok: true;
    resume: ResumeDto;
  };

type MatchResponse =
  {
    ok: true;
    match: ResumeMatchResult;
    scores?: {
      directionMatch: number;
      skillCoverage: number;
      overallMatch: number;
      matchLevel: ResumeMatchLevel;
    };
    matchedSkills?: ResumeMatchedSkill[];
    skillGaps?: {
      quickFix?: SkillGap[];
      longTerm?: SkillGap[];
      all?: SkillGap[];
    };
    optimizationSuggestions?: string[];
  };

type OptimizeResponse =
  {
    ok: true;
    suggestions: string[];
    count: number;
    provider?: string;
    fallbackUsed?: boolean;
    fallbackMessage?: string | null;
  };

type ResumeJudgeResponse =
  {
    ok: true;
    run: ResumeOptimizationRunDto;
    suggestions: ResumeOptimizationSuggestion[];
    atsCheck: AtsCheckResult | null;
    count: number;
  };

type ResumeJudgeRunsResponse =
  {
    ok: true;
    runs: ResumeOptimizationRunDto[];
    count: number;
    limit: number;
  };

type ResumeJudgeFeedbackResponse =
  {
    ok: true;
    feedback: OptimizationFeedbackDto;
    runId: number;
  };

type AtsCheckResponse =
  {
    ok: true;
    atsCheck?: AtsCheckResult;
    run: ResumeOptimizationRunDto;
  };

type ResumeStage =
  | "empty"
  | "parsing"
  | "parsed"
  | "saving"
  | "save_failed"
  | "matching"
  | "matched"
  | "error";

export type ResumeWorkspaceView = "manage" | "optimize";

type ResumeWorkspaceProps = {
  activeView: ResumeWorkspaceView;
};

const typedSampleResumes = sampleResumes.items as DemoResume[];
const typedPresetJds = presetJds as DemoJd[];
const MIN_RESUME_LENGTH = 20;
const DEFAULT_RESUME_DIRECTION: ResumeDirection = "general";
const DOMAIN_LABELS: Record<AiEcosystemDomain, string> = {
  llm_application: RESUME_DIRECTION_LABELS.llm_application,
  ai_infra: RESUME_DIRECTION_LABELS.ai_infra,
  algorithm_research: RESUME_DIRECTION_LABELS.algorithm_research,
  embodied_ai: RESUME_DIRECTION_LABELS.embodied_ai,
  ai_safety: RESUME_DIRECTION_LABELS.ai_safety,
};
const DOMAIN_ORDER: AiEcosystemDomain[] = [
  "llm_application",
  "ai_infra",
  "algorithm_research",
  "embodied_ai",
  "ai_safety",
];
const SKILL_LEVEL_LABELS: Record<string, string> = {
  beginner: "入门",
  proficient: "熟练",
  expert: "精通",
};
const SKILL_CATEGORY_LABELS: Record<string, string> = {
  framework: "框架",
  tool: "工具",
  domain: "领域能力",
  language: "语言",
  infrastructure: "基础设施",
  evaluation: "评测观测",
  other: "其他",
};
const MANUAL_JD_TARGET_ID = "manual-jd";
const JUDGE_MODE_OPTIONS: Array<{
  label: string;
  value: ResumeOptimizationMode;
}> = [
  { label: "关键词对齐", value: "keyword_alignment" },
  { label: "STAR 重写", value: "star_rewrite" },
  { label: "量化成果", value: "quantify_impact" },
  { label: "ATS 检查", value: "ats_check" },
  { label: "完整定制", value: "full_tailor" },
];
const JUDGE_EFFORT_OPTIONS: Array<{
  label: string;
  value: ResumeOptimizationEffort;
}> = [
  { label: "轻量", value: "light" },
  { label: "标准", value: "standard" },
  { label: "深入", value: "deep" },
];

export function ResumeWorkspace({ activeView }: ResumeWorkspaceProps) {
  const [resumeText, setResumeText] = useState("");
  const [resumeDirection, setResumeDirection] =
    useState<ResumeDirection>(DEFAULT_RESUME_DIRECTION);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [loadedSavedResumeId, setLoadedSavedResumeId] = useState<number | null>(null);
  const [parsedResume, setParsedResume] = useState<ParsedResumeState | null>(null);
  const [savedResumes, setSavedResumes] = useState<ResumeDto[]>([]);
  const [reports, setReports] = useState<ReportDto[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  const [matchResult, setMatchResult] = useState<ResumeMatchResult | null>(null);
  const [optimizationSuggestions, setOptimizationSuggestions] = useState<string[]>([]);
  const [optimizationNotice, setOptimizationNotice] = useState<string | null>(null);
  const [judgeResumeId, setJudgeResumeId] = useState<number | null>(null);
  const [judgeTargetId, setJudgeTargetId] = useState<string>("");
  const [judgeJdText, setJudgeJdText] = useState("");
  const [judgeMode, setJudgeMode] =
    useState<ResumeOptimizationMode>("keyword_alignment");
  const [judgeEffort, setJudgeEffort] =
    useState<ResumeOptimizationEffort>("standard");
  const [judgeRun, setJudgeRun] = useState<ResumeOptimizationRunDto | null>(null);
  const [judgeRuns, setJudgeRuns] = useState<ResumeOptimizationRunDto[]>([]);
  const [judgeAtsCheck, setJudgeAtsCheck] = useState<AtsCheckResult | null>(null);
  const [judgeNotice, setJudgeNotice] = useState<string | null>(null);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [copiedSuggestionId, setCopiedSuggestionId] = useState<string | null>(null);
  const [feedbackSubmittingKey, setFeedbackSubmittingKey] = useState<string | null>(null);
  const [isJudgeLoading, setIsJudgeLoading] = useState(false);
  const [isAtsChecking, setIsAtsChecking] = useState(false);
  const [isLoadingJudgeRuns, setIsLoadingJudgeRuns] = useState(false);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);
  const [stage, setStage] = useState<ResumeStage>("empty");
  const [error, setError] = useState<string | null>(null);
  const [resumeFileNotice, setResumeFileNotice] = useState<string | null>(null);
  const [resumeListError, setResumeListError] = useState<string | null>(null);
  const [resumeListNotice, setResumeListNotice] = useState<string | null>(null);
  const [resumeDirectionError, setResumeDirectionError] = useState<string | null>(null);
  const [resumeDirectionNotice, setResumeDirectionNotice] = useState<string | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<ResumeDto | null>(null);
  const [archivingResumeId, setArchivingResumeId] = useState<number | null>(null);
  const [settingDefaultResumeId, setSettingDefaultResumeId] = useState<number | null>(null);
  const [updatingResumeDirectionId, setUpdatingResumeDirectionId] =
    useState<number | null>(null);
  const [isLoadingResumes, setIsLoadingResumes] = useState(true);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const hasExplicitResumeSelectionRef = useRef(false);
  const judgeRequestVersionRef = useRef(0);

  const clearDisplayedJudgeResult = useCallback(() => {
    setJudgeRun(null);
    setJudgeAtsCheck(null);
    setFeedbackDrafts({});
    setCopiedSuggestionId(null);
  }, []);

  const resetJudgeResultForInputChange = useCallback(() => {
    judgeRequestVersionRef.current += 1;
    clearDisplayedJudgeResult();
    setIsJudgeLoading(false);
    setIsAtsChecking(false);
    setJudgeError(null);
    setJudgeNotice(null);
  }, [clearDisplayedJudgeResult]);

  const loadSavedResume = useCallback((
    resume: ResumeDto,
    options: {
      explicit?: boolean;
      notice?: string;
    } = {},
  ) => {
    if (options.explicit !== false) {
      hasExplicitResumeSelectionRef.current = true;
    }

    setResumeText(resume.content.rawText ?? "");
    setResumeDirection(resume.direction);
    setSelectedResumeId(null);
    setLoadedSavedResumeId(resume.id);
    setParsedResume(toParsedResumeState(resume));
    setJudgeResumeId(resume.id);
    resetJudgeResultForInputChange();
    setMatchResult(null);
    setOptimizationSuggestions([]);
    setOptimizationNotice(null);
    setResumeDirectionError(null);
    setResumeDirectionNotice(null);
    setResumeFileNotice(null);
    setDemoNotice(
      options.notice ??
        `已加载保存简历「${resume.name}」，可直接选择目标岗位开始匹配。`,
    );
    setError(null);
    setStage("parsed");
  }, [resetJudgeResultForInputChange]);

  useEffect(() => {
    if (!resumeListNotice) {
      return;
    }

    const timeoutId = setTimeout(() => setResumeListNotice(null), 6000);

    return () => clearTimeout(timeoutId);
  }, [resumeListNotice]);

  useEffect(() => {
    if (!resumeDirectionNotice) {
      return;
    }

    const timeoutId = setTimeout(() => setResumeDirectionNotice(null), 5000);

    return () => clearTimeout(timeoutId);
  }, [resumeDirectionNotice]);

  useEffect(() => {
    if (!judgeNotice) {
      return;
    }

    const timeoutId = setTimeout(() => setJudgeNotice(null), 5000);

    return () => clearTimeout(timeoutId);
  }, [judgeNotice]);

  useEffect(() => {
    if (!copiedSuggestionId) {
      return;
    }

    const timeoutId = setTimeout(() => setCopiedSuggestionId(null), 2000);

    return () => clearTimeout(timeoutId);
  }, [copiedSuggestionId]);

  useEffect(() => {
    let ignore = false;

    async function loadResumes() {
      setIsLoadingResumes(true);

      try {
        const body = await apiRequest<ResumesResponse>("/api/resumes?limit=100", {
          cache: "no-store",
          errorMessage: "简历列表读取失败。",
        });

        if (ignore) {
          return;
        }

        setSavedResumes(body.resumes);
        setResumeListError(null);
        const defaultResume = body.resumes.find(
          (resume) => resume.isDefault && !resume.archivedAt,
        );

        if (defaultResume && !hasExplicitResumeSelectionRef.current) {
          loadSavedResume(defaultResume, {
            explicit: false,
            notice: `已自动加载默认简历「${defaultResume.name}」，可直接选择目标岗位开始匹配。`,
          });
        } else if (body.resumes[0]) {
          setJudgeResumeId((current) => current ?? body.resumes[0].id);
        }
      } catch (loadError) {
        if (!ignore) {
          setSavedResumes([]);
          setResumeListError(
            loadError instanceof Error
              ? loadError.message
              : "简历列表读取失败，请稍后重试。",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoadingResumes(false);
        }
      }
    }

    void loadResumes();

    return () => {
      ignore = true;
    };
  }, [loadSavedResume]);

  useEffect(() => {
    let ignore = false;

    async function loadReports() {
      setIsLoadingReports(true);

      try {
        const body = await apiRequest<ReportsResponse>("/api/reports?limit=20", {
          cache: "no-store",
          errorMessage: "评估报告读取失败。",
        });

        if (!ignore) {
          setReports(body.reports);
        }
      } catch {
        if (!ignore) {
          setReports([]);
        }
      } finally {
        if (!ignore) {
          setIsLoadingReports(false);
        }
      }
    }

    void loadReports();

    return () => {
      ignore = true;
    };
  }, []);

  const loadJudgeRuns = useCallback(async (
    resumeId: number | null,
    expectedRequestVersion?: number,
  ) => {
    if (!resumeId) {
      setJudgeRuns([]);
      return;
    }

    setIsLoadingJudgeRuns(true);

    try {
      const body = await apiRequest<ResumeJudgeRunsResponse>(
        `/api/resume/judge/runs?resumeId=${resumeId}&limit=10`,
        {
          cache: "no-store",
          errorMessage: "Resume Judge 历史读取失败。",
        },
      );

      if (
        expectedRequestVersion !== undefined &&
        judgeRequestVersionRef.current !== expectedRequestVersion
      ) {
        return;
      }

      setJudgeRuns(body.runs);
      setJudgeError(null);
    } catch (runsError) {
      if (
        expectedRequestVersion !== undefined &&
        judgeRequestVersionRef.current !== expectedRequestVersion
      ) {
        return;
      }

      setJudgeRuns([]);
      setJudgeError(
        runsError instanceof Error
          ? runsError.message
          : "Resume Judge 历史读取失败，请稍后重试。",
      );
    } finally {
      setIsLoadingJudgeRuns(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadRuns() {
      if (!judgeResumeId) {
        setJudgeRuns([]);
        return;
      }

      setIsLoadingJudgeRuns(true);

      try {
        const body = await apiRequest<ResumeJudgeRunsResponse>(
          `/api/resume/judge/runs?resumeId=${judgeResumeId}&limit=10`,
          {
            cache: "no-store",
            errorMessage: "Resume Judge 历史读取失败。",
          },
        );

        if (!ignore) {
          setJudgeRuns(body.runs);
          setJudgeError(null);
        }
      } catch (runsError) {
        if (!ignore) {
          setJudgeRuns([]);
          setJudgeError(
            runsError instanceof Error
              ? runsError.message
              : "Resume Judge 历史读取失败，请稍后重试。",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoadingJudgeRuns(false);
        }
      }
    }

    void loadRuns();

    return () => {
      ignore = true;
    };
  }, [judgeResumeId]);

  const targets = useMemo<MatchTarget[]>(() => {
    const reportTargets = reports.map((report) => ({
      id: `report-${report.id}`,
      kind: "report" as const,
      title: `${report.company} - ${report.role}`,
      company: report.company,
      role: report.role,
      description: `已评估报告 · ${formatScore(report.score.overall)} / ${formatScore(report.score.maxScore)}`,
      reportId: report.id,
      jdText: report.jdText,
      jobDirection: readReportDirection(report),
      score: report.score.overall,
    }));
    const demoTargets = typedPresetJds
      .filter((job) => job.type === "real_ai" || job.type === "borderline")
      .slice(0, 5)
      .map((job) => ({
        id: `demo-${job.id}`,
        kind: "demo" as const,
        title: job.title,
        company: job.company,
        role: job.role,
        description: `${job.aiDirection} · ${job.location} · ${job.experienceLevel}`,
        demoId: job.id,
        jdText: job.jdText,
        jobDirection: normalizeResumeDirection(job.aiDirection) ?? null,
      }));

    return [...reportTargets, ...demoTargets];
  }, [reports]);

  const selectedTarget = targets.find((target) => target.id === selectedTargetId);
  const selectedJudgeTarget = targets.find((target) => target.id === judgeTargetId);
  const selectedJudgeResume = savedResumes.find(
    (resume) => resume.id === judgeResumeId && !resume.archivedAt,
  );
  const trimmedResumeText = resumeText.trim();
  const trimmedJudgeJdText = judgeJdText.trim();
  const canParse =
    trimmedResumeText.length >= MIN_RESUME_LENGTH &&
    stage !== "parsing" &&
    stage !== "saving";
  const canMatch =
    Boolean(parsedResume) &&
    Boolean(selectedTarget) &&
    stage !== "matching" &&
    stage !== "parsing" &&
    stage !== "saving";
  const canRunJudge =
    Boolean(selectedJudgeResume) &&
    Boolean(
      selectedJudgeTarget ||
        (judgeTargetId === MANUAL_JD_TARGET_ID &&
          trimmedJudgeJdText.length >= MIN_RESUME_LENGTH),
    ) &&
    !isJudgeLoading &&
    !isAtsChecking;

  function updateJudgeResumeId(nextResumeId: number | null) {
    if (nextResumeId === judgeResumeId) {
      return;
    }

    setJudgeResumeId(nextResumeId);
    resetJudgeResultForInputChange();
  }

  function updateJudgeTargetId(nextTargetId: string) {
    if (nextTargetId === judgeTargetId) {
      return;
    }

    setJudgeTargetId(nextTargetId);
    resetJudgeResultForInputChange();
  }

  function updateJudgeJdText(value: string) {
    setJudgeJdText(value);
    resetJudgeResultForInputChange();
  }

  function updateJudgeMode(nextMode: ResumeOptimizationMode) {
    if (nextMode === judgeMode) {
      return;
    }

    setJudgeMode(nextMode);
    resetJudgeResultForInputChange();
  }

  function updateJudgeEffort(nextEffort: ResumeOptimizationEffort) {
    if (nextEffort === judgeEffort) {
      return;
    }

    setJudgeEffort(nextEffort);
    resetJudgeResultForInputChange();
  }

  function updateResumeText(value: string) {
    hasExplicitResumeSelectionRef.current = true;
    setResumeText(value);
    setSelectedResumeId(null);
    setLoadedSavedResumeId(null);
    setMatchResult(null);
    setOptimizationSuggestions([]);
    setOptimizationNotice(null);
    setResumeDirectionError(null);
    setResumeDirectionNotice(null);
    setResumeFileNotice(null);
    setDemoNotice(null);
    setError(null);
    resetJudgeResultForInputChange();

    if (parsedResume) {
      setParsedResume(null);
    }

    setStage("empty");
  }

  function loadSampleResume(resume: DemoResume) {
    hasExplicitResumeSelectionRef.current = true;
    setResumeText(resume.rawText);
    setResumeDirection(
      normalizeResumeDirection(resume.targetDirection) ?? DEFAULT_RESUME_DIRECTION,
    );
    setSelectedResumeId(resume.id);
    setLoadedSavedResumeId(null);
    setParsedResume(null);
    setMatchResult(null);
    setOptimizationSuggestions([]);
    setOptimizationNotice(null);
    setResumeDirectionError(null);
    setResumeDirectionNotice(null);
    setResumeFileNotice(null);
    setDemoNotice("已加载简历模板，可直接解析并匹配目标岗位。");
    setError(null);
    setStage("empty");
    resetJudgeResultForInputChange();

    const recommendedPairing = sampleResumes.demoNotes.recommendedJdPairings.find(
      (pairing) => pairing.resumeId === resume.id,
    );
    const recommendedTargetId = recommendedPairing
      ? `demo-${recommendedPairing.highMatchJdId}`
      : "";

    if (recommendedTargetId && targets.some((target) => target.id === recommendedTargetId)) {
      setSelectedTargetId(recommendedTargetId);
      updateJudgeTargetId(recommendedTargetId);
    } else if (!selectedTargetId && targets[0]) {
      setSelectedTargetId(targets[0].id);
      updateJudgeTargetId(targets[0].id);
    }
  }

  function resetResume() {
    hasExplicitResumeSelectionRef.current = true;
    setResumeText("");
    setResumeDirection(DEFAULT_RESUME_DIRECTION);
    setSelectedResumeId(null);
    setLoadedSavedResumeId(null);
    setParsedResume(null);
    setMatchResult(null);
    setOptimizationSuggestions([]);
    setOptimizationNotice(null);
    setResumeDirectionError(null);
    setResumeDirectionNotice(null);
    setResumeFileNotice(null);
    setDemoNotice(null);
    setError(null);
    setStage("empty");
    resetJudgeResultForInputChange();
  }

  async function updateCurrentResumeDirection(nextDirection: ResumeDirection) {
    if (updatingResumeDirectionId !== null) {
      return;
    }

    const previousDirection = parsedResume?.direction ?? resumeDirection;

    setResumeDirection(nextDirection);
    setResumeDirectionError(null);
    setResumeDirectionNotice(null);
    setParsedResume((current) =>
      current
        ? {
            ...current,
            direction: nextDirection,
            resume: current.resume
              ? { ...current.resume, direction: nextDirection }
              : current.resume,
          }
        : current,
    );

    if (!parsedResume?.resumeId) {
      return;
    }

    setUpdatingResumeDirectionId(parsedResume.resumeId);

    try {
      const body = await apiRequest<ResumeDirectionUpdateResponse>(
        `/api/resumes/${parsedResume.resumeId}/direction`,
        {
          errorMessage: "简历方向更新失败，请稍后重试。",
          json: {
            direction: nextDirection,
          },
          method: "PATCH",
        },
      );

      setSavedResumes((current) => upsertResume(current, body.resume));
      setParsedResume((current) =>
        current ? syncParsedResumeState(current, body.resume) : current,
      );
      setResumeDirection(body.resume.direction);
      setResumeDirectionNotice(
        `简历方向已更新为「${RESUME_DIRECTION_LABELS[body.resume.direction]}」。`,
      );
    } catch (directionError) {
      setResumeDirection(previousDirection);
      setParsedResume((current) =>
        current
          ? {
              ...current,
              direction: previousDirection,
              resume: current.resume
                ? { ...current.resume, direction: previousDirection }
                : current.resume,
            }
          : current,
      );
      setResumeDirectionError(
        directionError instanceof Error
          ? directionError.message
          : "简历方向更新失败，请稍后重试。",
      );
    } finally {
      setUpdatingResumeDirectionId(null);
    }
  }

  function applyParseResponse(
    body: ParseResponse,
    options: {
      replaceResumeText?: boolean;
      successNotice?: string | null;
    } = {},
  ) {
    const saveFailed = body.saveStatus === "failed";
    const nextDirection = body.resume?.direction ?? resumeDirection;

    if (options.replaceResumeText) {
      setResumeText(body.structuredResume.rawText ?? "");
    }

    setParsedResume({
      resumeId: body.resumeId,
      resume: body.resume ?? undefined,
      direction: nextDirection,
      content: body.structuredResume,
      skills: body.skills,
      aiTechStack: body.aiTechStack,
      ecosystem: body.ecosystem,
      ecosystemPosition: body.ecosystemPosition,
      ecosystemProfile: body.ecosystemProfile,
      parsedProfile: body.parsedProfile,
    });
    setResumeDirection(nextDirection);
    setLoadedSavedResumeId(body.resumeId);

    if (body.resumeId) {
      updateJudgeResumeId(body.resumeId);
    }

    if (body.resume) {
      setSavedResumes((current) => upsertResume(current, body.resume as ResumeDto));
    }

    setStage(saveFailed ? "save_failed" : "parsed");
    setError(saveFailed ? readSaveErrorMessage(body.saveError) : null);
    setDemoNotice(
      body.fallbackUsed
        ? (options.successNotice ?? "简历已解析，可继续匹配。")
        : (options.successNotice ?? null),
    );

    if (!selectedTargetId && targets[0]) {
      setSelectedTargetId(targets[0].id);
      updateJudgeTargetId(targets[0].id);
    }
  }

  async function parseResume() {
    if (!canParse) {
      setError(`简历文本过短，至少需要 ${MIN_RESUME_LENGTH} 个字符。`);
      setStage("error");
      return;
    }

    setStage("parsing");
    setError(null);
    setParsedResume(null);
    setMatchResult(null);
    setOptimizationSuggestions([]);
    setOptimizationNotice(null);
    setDemoNotice(null);
    setResumeFileNotice(null);
    resetJudgeResultForInputChange();

    try {
      const body = await apiRequest<ParseResponse>("/api/resume/parse", {
        errorMessage: "简历解析失败，请检查文本后重试。",
        json: {
          resumeText: trimmedResumeText,
          direction: resumeDirection,
        },
        method: "POST",
        timeoutMs: 75000,
      });
      applyParseResponse(body);
    } catch (parseError) {
      const fallbackResume = selectedResumeId
        ? typedSampleResumes.find((resume) => resume.id === selectedResumeId)
        : undefined;

      if (fallbackResume) {
        setParsedResume(buildFallbackParsedResume(fallbackResume, resumeDirection));
        setStage("parsed");
        setError(null);
        setDemoNotice("简历已解析，可继续匹配。");

        if (!selectedTargetId && targets[0]) {
          setSelectedTargetId(targets[0].id);
          updateJudgeTargetId(targets[0].id);
        }
      } else {
        setError(
          parseError instanceof Error
            ? parseError.message
            : "简历解析失败，请检查文本后重试。",
        );
        setStage("error");
      }
    }
  }

  async function uploadResumeFile(file: File) {
    if (
      isUploadingResume ||
      stage === "parsing" ||
      stage === "saving" ||
      stage === "matching"
    ) {
      return;
    }

    hasExplicitResumeSelectionRef.current = true;
    setIsUploadingResume(true);
    setStage("parsing");
    setError(null);
    setResumeFileNotice(`正在上传「${file.name}」并提取简历正文...`);
    setSelectedResumeId(null);
    setLoadedSavedResumeId(null);
    setParsedResume(null);
    setMatchResult(null);
    setOptimizationSuggestions([]);
    setOptimizationNotice(null);
    setDemoNotice(null);
    resetJudgeResultForInputChange();

    const formData = new FormData();
    formData.set("file", file);
    formData.set("direction", resumeDirection);

    try {
      const body = await apiRequest<ParseResponse>("/api/resume/parse", {
        body: formData,
        errorMessage: "简历上传解析失败，请检查文件后重试。",
        method: "POST",
        timeoutMs: 90000,
      });
      const uploadedFileName = body.uploadedFile?.name ?? file.name;
      const successNotice = `已上传并解析「${uploadedFileName}」，正文已同步到输入框。`;

      setResumeFileNotice(successNotice);
      applyParseResponse(body, {
        replaceResumeText: true,
        successNotice,
      });
    } catch (uploadError) {
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : "简历上传解析失败，请换一个文件或粘贴文本后重试。";

      setError(message);
      setResumeFileNotice(null);
      setStage("error");
    } finally {
      setIsUploadingResume(false);
    }
  }

  async function retrySaveResume() {
    if (!parsedResume || stage === "saving") {
      return;
    }

    setStage("saving");
    setError(null);
    resetJudgeResultForInputChange();

    try {
      const body = await apiRequest<ResumeSaveResponse>("/api/resume/save", {
        errorMessage: "简历保存失败，请稍后重试。",
        json: {
          name: parsedResume.content.name,
          content: parsedResume.content,
          skills: parsedResume.skills,
          ecosystem: parsedResume.ecosystem,
          direction: parsedResume.direction,
        },
        method: "POST",
      });

      setParsedResume((current) =>
        current
          ? {
              ...current,
              resumeId: body.resumeId,
              resume: body.resume,
              direction: body.resume.direction,
            }
          : current,
      );
      setResumeDirection(body.resume.direction);
      setLoadedSavedResumeId(body.resumeId);
      updateJudgeResumeId(body.resumeId);
      setSavedResumes((current) => upsertResume(current, body.resume));
      setStage("parsed");
      setError(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "简历保存失败，请稍后重试。",
      );
      setStage("save_failed");
    }
  }

  function selectMatchTarget(targetId: string) {
    setSelectedTargetId(targetId);
    updateJudgeTargetId(targetId);
  }

  async function runMatch() {
    if (!parsedResume || !selectedTarget) {
      setError("请先完成简历解析，并选择一个目标岗位。");
      setStage(parsedResume ? "parsed" : "empty");
      return;
    }

    setStage("matching");
    setError(null);
    setMatchResult(null);
    setOptimizationSuggestions([]);
    setOptimizationNotice(null);
    setDemoNotice(null);

    try {
      const matchPayload = parsedResume.resumeId
        ? selectedTarget.kind === "report"
          ? { resumeId: parsedResume.resumeId, reportId: selectedTarget.reportId }
          : { resumeId: parsedResume.resumeId, jdText: selectedTarget.jdText }
        : {
            resumeText: trimmedResumeText,
            jdText: selectedTarget.jdText,
          };

      const matchBody = await apiRequest<MatchResponse>("/api/resume/match", {
        errorMessage: "简历匹配失败，请稍后重试。",
        json: matchPayload,
        method: "POST",
        timeoutMs: 30000,
      });

      setMatchResult(matchBody.match);
      const optimization = await loadOptimizationSuggestions(
        matchBody.match,
        selectedTarget.jdText,
        parsedResume.content.rawText ?? trimmedResumeText,
      );
      setOptimizationSuggestions(optimization.suggestions);
      setOptimizationNotice(optimization.notice);
      setStage("matched");
    } catch (matchError) {
      const fallbackResume = selectedResumeId
        ? typedSampleResumes.find((resume) => resume.id === selectedResumeId)
        : undefined;
      const fallbackMatch =
        fallbackResume && selectedTarget.kind === "demo"
          ? buildFallbackMatchResult(fallbackResume, selectedTarget)
          : null;

      if (fallbackMatch) {
        setMatchResult(fallbackMatch);
        setOptimizationSuggestions(buildFallbackSuggestions(fallbackMatch));
        setOptimizationNotice("已生成可用的匹配结果。");
        setDemoNotice("已生成可用的匹配结果。");
        setError(null);
        setStage("matched");
      } else {
        setError(
          matchError instanceof Error
            ? matchError.message
            : "简历匹配失败，请稍后重试。",
        );
        setStage("error");
      }
    }
  }

  function buildJudgePayload() {
    if (!selectedJudgeResume) {
      throw new Error("请先选择一份已保存且未归档的简历。");
    }

    if (selectedJudgeTarget) {
      return selectedJudgeTarget.kind === "report"
        ? {
            resumeId: selectedJudgeResume.id,
            reportId: selectedJudgeTarget.reportId,
          }
        : {
            resumeId: selectedJudgeResume.id,
            jdText: selectedJudgeTarget.jdText,
          };
    }

    if (
      judgeTargetId === MANUAL_JD_TARGET_ID &&
      trimmedJudgeJdText.length >= MIN_RESUME_LENGTH
    ) {
      return {
        resumeId: selectedJudgeResume.id,
        jdText: trimmedJudgeJdText,
      };
    }

    throw new Error("请选择目标报告或粘贴至少 20 个字符的 JD。");
  }

  async function runJudge() {
    const requestVersion = judgeRequestVersionRef.current + 1;

    judgeRequestVersionRef.current = requestVersion;
    clearDisplayedJudgeResult();
    setIsJudgeLoading(true);
    setJudgeError(null);
    setJudgeNotice(null);

    try {
      const payload = buildJudgePayload();
      const body = await apiRequest<ResumeJudgeResponse>("/api/resume/judge", {
        errorMessage: "Resume Judge 生成失败。",
        json: {
          ...payload,
          effort: judgeEffort,
          mode: judgeMode,
        },
        method: "POST",
        timeoutMs: 60000,
      });

      if (judgeRequestVersionRef.current !== requestVersion) {
        return;
      }

      setJudgeRun(body.run);
      setJudgeAtsCheck(body.atsCheck);
      setFeedbackDrafts({});
      setJudgeNotice(
        body.atsCheck
          ? "ATS 检查已生成并保存到优化历史。"
          : "Resume Judge 建议已生成并保存到优化历史。",
      );
      await loadJudgeRuns(body.run.resumeId, requestVersion);
    } catch (judgeRunError) {
      if (judgeRequestVersionRef.current !== requestVersion) {
        return;
      }

      setJudgeError(
        judgeRunError instanceof Error
          ? judgeRunError.message
          : "Resume Judge 生成失败，请稍后重试。",
      );
    } finally {
      if (judgeRequestVersionRef.current === requestVersion) {
        setIsJudgeLoading(false);
      }
    }
  }

  async function runAtsCheck() {
    const requestVersion = judgeRequestVersionRef.current + 1;

    judgeRequestVersionRef.current = requestVersion;
    clearDisplayedJudgeResult();
    setIsAtsChecking(true);
    setJudgeError(null);
    setJudgeNotice(null);

    try {
      const payload = buildJudgePayload();
      const body = await apiRequest<AtsCheckResponse>("/api/resume/ats-check", {
        errorMessage: "ATS 检查失败。",
        json: payload,
        method: "POST",
        timeoutMs: 45000,
      });

      if (judgeRequestVersionRef.current !== requestVersion) {
        return;
      }

      setJudgeRun(body.run);
      setJudgeMode("ats_check");
      setJudgeAtsCheck(body.atsCheck ?? body.run.result.atsCheck ?? null);
      setFeedbackDrafts({});
      setJudgeNotice("ATS 检查已完成并保存到优化历史。");
      await loadJudgeRuns(body.run.resumeId, requestVersion);
    } catch (atsError) {
      if (judgeRequestVersionRef.current !== requestVersion) {
        return;
      }

      setJudgeError(
        atsError instanceof Error
          ? atsError.message
          : "ATS 检查失败，请稍后重试。",
      );
    } finally {
      if (judgeRequestVersionRef.current === requestVersion) {
        setIsAtsChecking(false);
      }
    }
  }

  async function copyJudgeSuggestion(suggestion: ResumeOptimizationSuggestion) {
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(suggestion.copyText);
        } catch {
          copyTextWithTextarea(suggestion.copyText);
        }
      } else if (!copyTextWithTextarea(suggestion.copyText)) {
        throw new Error("copy_failed");
      }

      setCopiedSuggestionId(suggestion.id);
      setJudgeNotice("建议已复制。");
    } catch {
      setJudgeError("复制失败，请手动选中文本复制。");
    }
  }

  function copyTextWithTextarea(value: string): boolean {
    const textarea = document.createElement("textarea");

    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  }

  async function submitJudgeFeedback(
    suggestion: ResumeOptimizationSuggestion,
    decision: OptimizationFeedbackDecision,
  ) {
    if (!judgeRun || feedbackSubmittingKey) {
      return;
    }

    const submittingKey = `${suggestion.id}-${decision}`;

    setFeedbackSubmittingKey(submittingKey);
    setJudgeError(null);

    try {
      const body = await apiRequest<ResumeJudgeFeedbackResponse>(
        "/api/resume/judge/feedback",
        {
          errorMessage: "反馈保存失败。",
          json: {
            decision,
            reason: feedbackDrafts[suggestion.id] ?? "",
            runId: judgeRun.id,
            suggestionId: suggestion.id,
          },
          method: "POST",
        },
      );

      setJudgeRun((current) =>
        current && current.id === body.runId
          ? {
              ...current,
              feedback: [body.feedback, ...current.feedback],
            }
          : current,
      );
      setJudgeRuns((current) =>
        current.map((run) =>
          run.id === body.runId
            ? {
                ...run,
                feedback: [body.feedback, ...run.feedback],
              }
            : run,
        ),
      );
      setJudgeNotice(decision === "accepted" ? "已记录采纳反馈。" : "已记录拒绝反馈。");
    } catch (feedbackError) {
      setJudgeError(
        feedbackError instanceof Error
          ? feedbackError.message
          : "反馈保存失败，请稍后重试。",
      );
    } finally {
      setFeedbackSubmittingKey(null);
    }
  }

  function selectJudgeRun(run: ResumeOptimizationRunDto) {
    setJudgeRun(run);
    setJudgeMode(run.result.mode);
    setJudgeEffort(run.result.effort);
    setJudgeAtsCheck(run.result.atsCheck ?? null);
    setFeedbackDrafts({});
    setJudgeError(null);
    setJudgeNotice("已载入历史优化记录。");
  }

  async function setAsDefaultResume(resume: ResumeDto) {
    if (settingDefaultResumeId !== null || resume.isDefault || resume.archivedAt) {
      return;
    }

    setSettingDefaultResumeId(resume.id);
    setResumeListError(null);

    try {
      const body = await apiRequest<DefaultResumeResponse>(
        `/api/resumes/${resume.id}/default`,
        {
          errorMessage: "默认简历设置失败，请稍后重试。",
          method: "PATCH",
        },
      );

      setSavedResumes((current) =>
        current.map((item) => ({
          ...item,
          isDefault: item.id === body.resume.id,
          updatedAt:
            item.id === body.resume.id ? body.resume.updatedAt : item.updatedAt,
        })),
      );

      if (!hasExplicitResumeSelectionRef.current) {
        loadSavedResume(body.resume, {
          explicit: false,
          notice: `已设置并加载默认简历「${body.resume.name}」。`,
        });
      }
    } catch (updateError) {
      setResumeListError(
        updateError instanceof Error
          ? updateError.message
          : "默认简历设置失败，请稍后重试。",
      );
    } finally {
      setSettingDefaultResumeId(null);
    }
  }

  async function archiveSavedResume() {
    if (!archiveCandidate || archivingResumeId !== null) {
      return;
    }

    const resume = archiveCandidate;

    setArchivingResumeId(resume.id);
    setResumeListError(null);
    setResumeListNotice(null);

    try {
      const body = await apiRequest<ArchiveResumeResponse>(
        `/api/resumes/${resume.id}/archive`,
        {
          errorMessage: "简历归档失败，请稍后重试。",
          method: "PATCH",
        },
      );

      setSavedResumes((current) =>
        current.filter((item) => item.id !== body.resume.id),
      );
      setArchiveCandidate(null);
      setResumeListNotice(
        body.clearedDefault
          ? "简历已归档。默认简历已归档，请重新设置默认简历。"
          : "简历已归档",
      );

      if (
        loadedSavedResumeId === body.resume.id ||
        parsedResume?.resumeId === body.resume.id
      ) {
        hasExplicitResumeSelectionRef.current = true;
        setResumeText("");
        setSelectedResumeId(null);
        setLoadedSavedResumeId(null);
        setParsedResume(null);
        setResumeDirection(DEFAULT_RESUME_DIRECTION);
        setMatchResult(null);
        setOptimizationSuggestions([]);
        setOptimizationNotice(null);
        setResumeDirectionError(null);
        setResumeDirectionNotice(null);
        setDemoNotice(null);
        setError(null);
        setStage("empty");
      }

      if (judgeResumeId === body.resume.id) {
        setJudgeResumeId(null);
        setJudgeRun(null);
        setJudgeRuns([]);
        setJudgeAtsCheck(null);
        setFeedbackDrafts({});
      }
    } catch (archiveError) {
      setResumeListError(
        archiveError instanceof Error
          ? archiveError.message
          : "简历归档失败，请稍后重试。",
      );
    } finally {
      setArchivingResumeId(null);
    }
  }

  const resumeJudgePanel = (
    <ResumeJudgePanel
      atsCheck={judgeAtsCheck}
      canRun={canRunJudge}
      copiedSuggestionId={copiedSuggestionId}
      effort={judgeEffort}
      error={judgeError}
      feedbackDrafts={feedbackDrafts}
      feedbackSubmittingKey={feedbackSubmittingKey}
      isAtsChecking={isAtsChecking}
      isJudgeLoading={isJudgeLoading}
      isLoadingRuns={isLoadingJudgeRuns}
      jdText={judgeJdText}
      mode={judgeMode}
      notice={judgeNotice}
      onAtsCheck={runAtsCheck}
      onCopySuggestion={copyJudgeSuggestion}
      onEffortChange={updateJudgeEffort}
      onFeedbackReasonChange={(suggestionId, reason) =>
        setFeedbackDrafts((current) => ({
          ...current,
          [suggestionId]: reason,
        }))
      }
      onJdTextChange={updateJudgeJdText}
      onModeChange={updateJudgeMode}
      onResumeChange={updateJudgeResumeId}
      onRunJudge={runJudge}
      onSelectRun={selectJudgeRun}
      onSubmitFeedback={submitJudgeFeedback}
      onTargetChange={updateJudgeTargetId}
      resumeId={judgeResumeId}
      run={judgeRun}
      runs={judgeRuns}
      savedResumes={savedResumes}
      selectedTargetId={judgeTargetId}
      targets={targets}
    />
  );

  return (
    <>
      {archiveCandidate ? (
        <ArchiveResumeDialog
          isSubmitting={archivingResumeId === archiveCandidate.id}
          onCancel={() => setArchiveCandidate(null)}
          onConfirm={archiveSavedResume}
          resume={archiveCandidate}
        />
      ) : null}

      {activeView === "optimize" ? (
        <section className="mt-6">
          {resumeJudgePanel}
        </section>
      ) : (
        <div className="mt-6">
          <SavedResumesPanel
            archivingResumeId={archivingResumeId}
            error={resumeListError}
            isLoading={isLoadingResumes}
            loadedResumeId={loadedSavedResumeId}
            onLoadResume={(resume) => loadSavedResume(resume)}
            onRequestArchive={setArchiveCandidate}
            onSetDefault={setAsDefaultResume}
            notice={resumeListNotice}
            resumes={savedResumes}
            settingDefaultResumeId={settingDefaultResumeId}
          />

          <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="space-y-6 xl:col-span-4">
              <ResumeInputCard
                canParse={canParse}
                direction={resumeDirection}
                error={error}
                fileNotice={resumeFileNotice}
                isUploading={isUploadingResume}
                onChange={updateResumeText}
                onDirectionChange={updateCurrentResumeDirection}
                onUploadFile={uploadResumeFile}
                onParse={parseResume}
                onReset={resetResume}
                stage={stage}
                value={resumeText}
              />
              <SampleResumeCard
                onLoad={loadSampleResume}
                samples={typedSampleResumes}
                selectedResumeId={selectedResumeId}
              />
            </div>

            <div className="space-y-6 xl:col-span-8">
              <StatusCard
                error={error}
                hasResumeText={trimmedResumeText.length > 0}
                notice={demoNotice}
                onRetry={
                  stage === "save_failed"
                    ? retrySaveResume
                    : stage === "error" && parsedResume
                      ? runMatch
                      : parseResume
                }
                stage={stage}
              />
              <ParsedResumePanel
                directionError={resumeDirectionError}
                directionNotice={resumeDirectionNotice}
                isDirectionSaving={updatingResumeDirectionId === parsedResume?.resumeId}
                onDirectionChange={updateCurrentResumeDirection}
                parsedResume={parsedResume}
                stage={stage}
              />
              <MatchPanel
                canMatch={canMatch}
                isLoadingReports={isLoadingReports}
                matchResult={matchResult}
                onMatch={runMatch}
                onSelectTarget={selectMatchTarget}
                optimizationNotice={optimizationNotice}
                optimizationSuggestions={optimizationSuggestions}
                parsedResumeDirection={parsedResume?.direction ?? null}
                selectedTargetId={selectedTargetId}
                selectedTargetJobDirection={selectedTarget?.jobDirection ?? null}
                stage={stage}
                targets={targets}
              />
            </div>
          </section>
        </div>
      )}
    </>
  );
}

type SavedResumesPanelProps = {
  archivingResumeId: number | null;
  error: string | null;
  isLoading: boolean;
  loadedResumeId: number | null;
  onLoadResume: (resume: ResumeDto) => void;
  onRequestArchive: (resume: ResumeDto) => void;
  onSetDefault: (resume: ResumeDto) => void;
  notice: string | null;
  resumes: ResumeDto[];
  settingDefaultResumeId: number | null;
};

function SavedResumesPanel({
  archivingResumeId,
  error,
  isLoading,
  loadedResumeId,
  onLoadResume,
  onRequestArchive,
  onSetDefault,
  notice,
  resumes,
  settingDefaultResumeId,
}: SavedResumesPanelProps) {
  const activeResumes = resumes.filter((resume) => !resume.archivedAt);
  const defaultResume = activeResumes.find((resume) => resume.isDefault);

  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[var(--color-primary)]">
            <FileCheck2 aria-hidden="true" className="size-5" strokeWidth={1.8} />
            <span className="text-xs font-bold uppercase tracking-[0.08em]">
              Saved Resumes
            </span>
          </div>
          <h2 className="mt-2 text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            已保存简历
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            {defaultResume
              ? `当前默认：${defaultResume.name}`
              : "尚未设置默认简历"}
          </p>
        </div>
        <span className="w-fit rounded-[10px] bg-[var(--color-primary-light)] px-2.5 py-1 text-xs font-bold leading-4 text-[#6b4716]">
          共 {activeResumes.length} 份
        </span>
      </div>

      {error ? (
        <p className="mt-4 rounded-[12px] border border-[#e7beb8] bg-[#fff6f4] px-4 py-3 text-sm leading-6 text-[var(--color-red)]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 flex items-start gap-2 rounded-[12px] border border-[#cadcc4] bg-[#f3f8f1] px-4 py-3 text-sm leading-6 text-[var(--color-green)]">
          <CheckCircle2 aria-hidden="true" className="mt-1 size-4 shrink-0" strokeWidth={1.8} />
          {notice}
        </p>
      ) : null}

      {isLoading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.8} />
          正在读取保存简历...
        </div>
      ) : activeResumes.length > 0 ? (
        <div className="mt-5 grid max-h-[420px] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {activeResumes.map((resume) => {
            const isLoaded = loadedResumeId === resume.id;
            const isSettingDefault = settingDefaultResumeId === resume.id;
            const isArchiving = archivingResumeId === resume.id;

            return (
              <article
                className={`rounded-[16px] border p-4 transition-colors ${
                  isLoaded
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-hover)]"
                }`}
                key={resume.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold leading-5 text-[var(--color-text)]">
                      {resume.name}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                      更新于 {formatResumeUpdatedAt(resume.updatedAt)}
                    </p>
                  </div>
                  <details className="relative shrink-0">
                    <summary
                      aria-label={`打开 ${resume.name} 操作菜单`}
                      className="flex size-7 cursor-pointer list-none items-center justify-center rounded-full text-[var(--color-muted)] transition-colors hover:bg-white hover:text-[var(--color-primary)] [&::-webkit-details-marker]:hidden"
                    >
                      <MoreVertical aria-hidden="true" className="size-4" strokeWidth={1.8} />
                    </summary>
                    <div className="absolute right-0 top-8 z-10 min-w-[112px] rounded-[10px] border border-[var(--color-border)] bg-white p-1 shadow-[var(--shadow-lg)]">
                      <button
                        className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-2 text-left text-xs font-bold text-[var(--color-text-secondary)] transition-colors hover:bg-[#fff6f4] hover:text-[var(--color-red)] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={archivingResumeId !== null}
                        onClick={() => onRequestArchive(resume)}
                        type="button"
                      >
                        {isArchiving ? (
                          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" strokeWidth={1.8} />
                        ) : (
                          <Archive aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                        )}
                        归档
                      </button>
                    </div>
                  </details>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <ResumeDirectionBadge direction={resume.direction} />
                  {resume.isDefault ? (
                    <span className="rounded-full bg-[#eaf0e8] px-2.5 py-1 text-[10px] font-bold leading-3 text-[var(--color-green)]">
                      默认简历
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="rounded-[10px] border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                    onClick={() => onLoadResume(resume)}
                    type="button"
                  >
                    {isLoaded ? "已加载" : "用于匹配"}
                  </button>
                  {!resume.isDefault ? (
                    <button
                      className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--color-primary)] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={settingDefaultResumeId !== null}
                      onClick={() => onSetDefault(resume)}
                      type="button"
                    >
                      {isSettingDefault ? (
                        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" strokeWidth={1.8} />
                      ) : null}
                      {isSettingDefault ? "设置中" : "设为默认"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-5 rounded-[14px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-hover)] px-4 py-5 text-sm leading-6 text-[var(--color-text-secondary)]">
          还没有保存简历。粘贴简历文本并完成解析后，档案会显示在这里。
        </p>
      )}
    </section>
  );
}

type ArchiveResumeDialogProps = {
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  resume: ResumeDto;
};

function ArchiveResumeDialog({
  isSubmitting,
  onCancel,
  onConfirm,
  resume,
}: ArchiveResumeDialogProps) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        onCancel();
      }
    }

    document.addEventListener("keydown", closeOnEscape);

    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isSubmitting, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-5 py-8">
      <section
        aria-labelledby="archive-resume-title"
        aria-modal="true"
        className="w-full max-w-md rounded-[18px] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-lg)] sm:p-6"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#fff6f4] text-[var(--color-red)]">
            <Archive aria-hidden="true" className="size-5" strokeWidth={1.8} />
          </div>
          <button
            aria-label="关闭归档确认"
            className="flex size-8 items-center justify-center rounded-full text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" className="size-4" strokeWidth={1.8} />
          </button>
        </div>

        <h2
          className="mt-4 text-lg font-semibold leading-7 text-[var(--color-text)]"
          id="archive-resume-title"
        >
          归档简历「{resume.name}」？
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
          归档后，该简历将从默认列表中隐藏，但数据仍会保留。
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            className="rounded-[10px] border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--color-red)] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            onClick={onConfirm}
            type="button"
          >
            {isSubmitting ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.8} />
            ) : (
              <Archive aria-hidden="true" className="size-4" strokeWidth={1.8} />
            )}
            {isSubmitting ? "归档中" : "确认归档"}
          </button>
        </div>
      </section>
    </div>
  );
}

function formatResumeUpdatedAt(value: string): string {
  return value.replace("T", " ").replace("Z", "").slice(0, 16);
}

function upsertResume(resumes: ResumeDto[], resume: ResumeDto): ResumeDto[] {
  return [
    resume,
    ...resumes.filter((item) => item.id !== resume.id),
  ];
}

function syncParsedResumeState(
  current: ParsedResumeState,
  resume: ResumeDto,
): ParsedResumeState {
  return {
    ...current,
    resumeId: resume.id,
    resume,
    direction: resume.direction,
    content: resume.content,
    skills: resume.skills,
    ecosystem: resume.ecosystem,
    ecosystemProfile: current.ecosystemProfile
      ? {
          ...current.ecosystemProfile,
          vector: resume.ecosystem,
        }
      : {
          primaryDomain: pickPrimaryDomain(resume.ecosystem),
          vector: resume.ecosystem,
          evidence: resume.skills.slice(0, 6).map((skill) => skill.name),
        },
    parsedProfile: current.parsedProfile ?? {
      name: resume.content.name,
      currentRole: resume.content.currentRole,
      yearsOfExperience: resume.content.yearsOfExperience,
    },
  };
}

function toParsedResumeState(resume: ResumeDto): ParsedResumeState {
  return {
    resumeId: resume.id,
    resume,
    direction: resume.direction,
    content: resume.content,
    skills: resume.skills,
    ecosystem: resume.ecosystem,
    ecosystemProfile: {
      primaryDomain: pickPrimaryDomain(resume.ecosystem),
      vector: resume.ecosystem,
      evidence: resume.skills.slice(0, 6).map((skill) => skill.name),
    },
    parsedProfile: {
      name: resume.content.name,
      currentRole: resume.content.currentRole,
      yearsOfExperience: resume.content.yearsOfExperience,
    },
  };
}

type ResumeInputCardProps = {
  canParse: boolean;
  direction: ResumeDirection;
  error: string | null;
  fileNotice: string | null;
  isUploading: boolean;
  onChange: (value: string) => void;
  onDirectionChange: (direction: ResumeDirection) => void;
  onParse: () => void;
  onReset: () => void;
  onUploadFile: (file: File) => void;
  stage: ResumeStage;
  value: string;
};

function ResumeInputCard({
  canParse,
  direction,
  error,
  fileNotice,
  isUploading,
  onChange,
  onDirectionChange,
  onParse,
  onReset,
  onUploadFile,
  stage,
  value,
}: ResumeInputCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const charCount = value.trim().length;
  const isParsing = stage === "parsing";
  const isSaving = stage === "saving";
  const isBusy = isParsing || isSaving || isUploading;
  const helperText =
    fileNotice ??
    (charCount > 0
      ? "可以继续编辑，也可以直接解析。"
      : "当前没有简历，请上传文件、粘贴文本或加载一份简历模板。");

  return (
    <section
      className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-6"
      id="resume-upload-panel"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[var(--color-primary)]">
            <ClipboardPaste aria-hidden="true" className="size-5" strokeWidth={1.8} />
            <span className="text-xs font-bold uppercase tracking-[0.08em]">
              Resume Input
            </span>
          </div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            上传或粘贴简历
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            任意格式都可以选择上传；PDF、DOC、DOCX、RTF、HTML、Markdown、TXT 会自动提取正文。
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-[16px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4">
        <input
          className="sr-only"
          disabled={isBusy}
          id="resume-file-input"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];

            if (file) {
              onUploadFile(file);
            }

            event.currentTarget.value = "";
          }}
          ref={fileInputRef}
          type="file"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--color-text)]">
              从本地文件上传
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
              其他格式会尝试按可读文本解析；扫描图片或纯图片需要先 OCR。
            </p>
          </div>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--color-primary)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--color-primary)] transition-all hover:bg-[var(--color-primary-light)] active:scale-[0.98] disabled:cursor-not-allowed disabled:border-[var(--color-border)] disabled:text-[var(--color-muted)]"
            disabled={isBusy}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {isUploading ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.8} />
            ) : (
              <UploadCloud aria-hidden="true" className="size-4" strokeWidth={1.8} />
            )}
            {isUploading ? "上传解析中" : "选择文件"}
          </button>
        </div>
      </div>

      <textarea
        aria-describedby="resume-input-helper"
        aria-invalid={Boolean(error) || undefined}
        className="h-[360px] w-full resize-none rounded-[18px] border border-transparent bg-[var(--color-surface-hover)] p-4 text-sm leading-6 text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:bg-white focus:ring-2 focus:ring-[rgba(196,135,58,0.18)] disabled:cursor-wait disabled:opacity-70"
        disabled={isBusy}
        onChange={(event) => onChange(event.target.value)}
        placeholder="把简历正文粘贴到这里，例如：个人简介、核心技能、工作经历、项目经历、教育背景..."
        value={value}
      />

      <div className="mt-4">
        <ResumeDirectionField
          disabled={isBusy}
          label="简历方向"
          onChange={onDirectionChange}
          value={direction}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <span
          className={error ? "text-[var(--color-red)]" : "text-[var(--color-text-secondary)]"}
          id="resume-input-helper"
        >
          {error ?? helperText}
        </span>
        <span className={charCount >= MIN_RESUME_LENGTH ? "font-medium text-[var(--color-primary)]" : "text-[var(--color-muted)]"}>
          {charCount} 字
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-bold text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy || charCount === 0}
          onClick={onReset}
          type="button"
        >
          清空
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-4 py-3 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] hover:shadow-[var(--shadow-lg)] active:scale-[0.98] disabled:pointer-events-none disabled:bg-[var(--color-border)] disabled:text-[var(--color-muted)]"
          disabled={!canParse}
          onClick={onParse}
          type="button"
        >
          {isBusy ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.8} />
          ) : (
            <Sparkles aria-hidden="true" className="size-4" strokeWidth={1.8} />
          )}
          {isParsing ? "解析中" : isSaving ? "保存中" : "AI 解析简历"}
        </button>
      </div>
    </section>
  );
}

type SampleResumeCardProps = {
  onLoad: (resume: DemoResume) => void;
  samples: DemoResume[];
  selectedResumeId: string | null;
};

function SampleResumeCard({
  onLoad,
  samples,
  selectedResumeId,
}: SampleResumeCardProps) {
  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-6">
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            简历模板
          </h2>
        </div>
      </div>

      <div className="space-y-3">
        {samples.map((sample) => (
          <button
            className={`group w-full rounded-[18px] border p-4 text-left transition-all hover:-translate-y-px hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-lg)] ${
              selectedResumeId === sample.id
                ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]"
                : "border-transparent bg-[var(--color-surface-hover)]"
            }`}
            key={sample.id}
            onClick={() => onLoad(sample)}
            type="button"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-white text-[var(--color-primary)]">
                <FileText aria-hidden="true" className="size-5" strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-bold leading-5 text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
                  {sample.name}
                </h3>
                <p className="mt-1 text-xs leading-4 text-[var(--color-text-secondary)]">
                  {sample.targetDirection} · {sample.yearsOfExperience} 年经验
                </p>
                <p className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--color-text-secondary)]">
                  {sample.expectedStrengths?.[0]?.detail ?? "可直接用于流程体验。"}
                </p>
              </div>
              <ArrowRight
                aria-hidden="true"
                className="mt-1 size-4 shrink-0 text-[var(--color-muted)] transition-all group-hover:translate-x-1 group-hover:text-[var(--color-primary)]"
                strokeWidth={1.8}
              />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

type StatusCardProps = {
  error: string | null;
  hasResumeText: boolean;
  notice: string | null;
  onRetry: () => void;
  stage: ResumeStage;
};

function StatusCard({ error, hasResumeText, notice, onRetry, stage }: StatusCardProps) {
  const state = getStatusCopy(stage, hasResumeText, error);
  const canRetry = stage === "error" || stage === "save_failed";

  return (
    <section className={`rounded-[24px] border p-5 shadow-[var(--shadow-md)] sm:p-6 ${state.className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className={`flex size-11 shrink-0 items-center justify-center rounded-[14px] ${state.iconClassName}`}>
            {stage === "parsing" || stage === "saving" || stage === "matching" ? (
              <Loader2 aria-hidden="true" className="size-5 animate-spin" strokeWidth={1.8} />
            ) : (
              <state.icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
            )}
          </div>
          <div>
            <h2 className="text-base font-semibold leading-6 text-[var(--color-text)]">
              {state.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
              {state.description}
            </p>
            {notice ? (
              <p className="mt-2 text-xs leading-5 text-[var(--color-primary)]">
                {notice}
              </p>
            ) : null}
          </div>
        </div>

        {canRetry ? (
          <button
            className="inline-flex items-center justify-center rounded-[12px] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
            onClick={onRetry}
            type="button"
          >
            {stage === "save_failed" ? "重新保存" : "重试"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function getStatusCopy(stage: ResumeStage, hasResumeText: boolean, error: string | null) {
  if (stage === "parsing") {
    return {
      title: "AI 正在解析你的简历",
      description: "正在提取个人信息、项目证据、技能栈和 AI 生态位画像。",
      icon: Sparkles,
      className: "border-[var(--color-border)] bg-[var(--color-surface)]",
      iconClassName: "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
    };
  }

  if (stage === "matching") {
    return {
      title: "正在匹配目标岗位",
      description: "系统正在对比简历生态位、JD 技能要求，并生成可执行优化建议。",
      icon: Target,
      className: "border-[var(--color-border)] bg-[var(--color-surface)]",
      iconClassName: "bg-[#e8f0f5] text-[var(--color-blue)]",
    };
  }

  if (stage === "saving") {
    return {
      title: "正在保存结构化简历",
      description: "解析结果已保留，正在写入本地简历档案。",
      icon: FileCheck2,
      className: "border-[var(--color-border)] bg-[var(--color-surface)]",
      iconClassName: "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
    };
  }

  if (stage === "matched") {
    return {
      title: "匹配分析已完成",
      description: "下方展示综合匹配度、技能覆盖、已匹配技能、缺口与具体优化建议。",
      icon: CheckCircle2,
      className: "border-[#d9e6d6] bg-[#f6fbf4]",
      iconClassName: "bg-[#eaf0e8] text-[var(--color-green)]",
    };
  }

  if (stage === "parsed") {
    return {
      title: "简历解析完成",
      description: "结构化简历和 AI 生态位画像已生成，可以选择目标岗位开始匹配。",
      icon: BadgeCheck,
      className: "border-[#d9e6d6] bg-[#f6fbf4]",
      iconClassName: "bg-[#eaf0e8] text-[var(--color-green)]",
    };
  }

  if (stage === "save_failed") {
    return {
      title: "结果已生成，但保存失败",
      description:
        error ?? "结构化简历已保留，可以继续匹配，也可以点击重新保存。",
      icon: TriangleAlert,
      className: "border-[#ead6a8] bg-[#fffaf0]",
      iconClassName: "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
    };
  }

  if (stage === "error") {
    return {
      title: "处理失败",
      description: error ?? "请检查简历文本或目标岗位后重试。",
      icon: TriangleAlert,
      className: "border-[#e7beb8] bg-[#fff6f4]",
      iconClassName: "bg-[#f5e8e6] text-[var(--color-red)]",
    };
  }

  return {
    title: hasResumeText ? "简历文本已输入" : "还没有简历",
    description: hasResumeText
      ? "点击 AI 解析简历，生成结构化档案后再进行岗位匹配。"
      : "先粘贴简历文本，或从左侧加载一份候选人档案。",
    icon: ClipboardPaste,
    className: "border-[var(--color-border)] bg-[var(--color-surface)]",
    iconClassName: "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
  };
}

type ParsedResumePanelProps = {
  directionError: string | null;
  directionNotice: string | null;
  isDirectionSaving: boolean;
  onDirectionChange: (direction: ResumeDirection) => void;
  parsedResume: ParsedResumeState | null;
  stage: ResumeStage;
};

function ParsedResumePanel({
  directionError,
  directionNotice,
  isDirectionSaving,
  onDirectionChange,
  parsedResume,
  stage,
}: ParsedResumePanelProps) {
  if (stage === "parsing") {
    return <ParsedResumeSkeleton />;
  }

  if (!parsedResume) {
    return (
      <section className="rounded-[24px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-[var(--shadow-sm)]">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-[16px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
          <BrainCircuit aria-hidden="true" className="size-6" strokeWidth={1.8} />
        </div>
        <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
          等待生成 AI 生态位画像
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--color-text-secondary)]">
          解析完成后，这里会展示候选人定位、技能栈、项目证据和五类 AI 方向分布。
        </p>
      </section>
    );
  }

  const primaryDomain =
    parsedResume.ecosystemProfile?.primaryDomain ??
    pickPrimaryDomain(parsedResume.ecosystem);
  const primaryScore = toPercent(parsedResume.ecosystem[primaryDomain]);
  const topSkills = parsedResume.skills.slice(0, 12);
  const topProjects = parsedResume.content.projects.slice(0, 3);

  return (
    <section className="relative overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
      <div className="pointer-events-none absolute right-0 top-0 h-44 w-44 -translate-y-1/2 translate-x-1/2 rounded-full bg-[var(--color-primary-light)] opacity-80 blur-3xl" />

      <div className="relative mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[var(--color-primary)]">
            <BrainCircuit aria-hidden="true" className="size-5" strokeWidth={1.8} />
            <span className="text-xs font-bold uppercase tracking-[0.08em]">
              AI 生态位画像
            </span>
          </div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            {parsedResume.content.name}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
            {parsedResume.content.currentRole ?? parsedResume.parsedProfile?.currentRole ?? "未识别当前岗位"}
            {parsedResume.content.yearsOfExperience !== undefined
              ? ` · ${parsedResume.content.yearsOfExperience} 年经验`
              : ""}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <span className="w-fit rounded-full bg-[#eaf0e8] px-3 py-1 text-xs font-bold leading-4 text-[var(--color-green)]">
            核心方向：{DOMAIN_LABELS[primaryDomain]}
          </span>
          <div className="min-w-[220px]">
            <ResumeDirectionField
              description={isDirectionSaving ? "保存中..." : undefined}
              disabled={isDirectionSaving}
              label="简历方向"
              onChange={onDirectionChange}
              value={parsedResume.direction}
            />
          </div>
        </div>
      </div>

      {directionError ? (
        <p className="relative mb-5 rounded-[12px] border border-[#e7beb8] bg-[#fff6f4] px-4 py-3 text-sm leading-6 text-[var(--color-red)]">
          {directionError}
        </p>
      ) : null}
      {directionNotice ? (
        <p className="relative mb-5 rounded-[12px] border border-[#cadcc4] bg-[#f3f8f1] px-4 py-3 text-sm leading-6 text-[var(--color-green)]">
          {directionNotice}
        </p>
      ) : null}

      <div className="relative grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr] lg:items-start">
        <div className="relative mx-auto flex size-48 items-center justify-center rounded-full border-4 border-[rgba(196,135,58,0.25)]">
          <div className="absolute inset-4 rounded-full border-2 border-[var(--color-primary)]" />
          <div className="absolute inset-9 rounded-full bg-[var(--color-primary-light)]" />
          <div className="relative text-center">
            <p className="text-[42px] font-bold leading-none text-[var(--color-primary)]">
              {primaryScore}
            </p>
            <p className="mt-2 text-xs font-medium leading-4 text-[var(--color-text-secondary)]">
              {DOMAIN_LABELS[primaryDomain]}
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4">
            <p className="mb-1 text-sm font-bold leading-5 text-[var(--color-primary)]">
              当前定位：{parsedResume.parsedProfile?.targetDirection ?? DOMAIN_LABELS[primaryDomain]}
            </p>
            <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
              {parsedResume.content.summary ??
                parsedResume.ecosystemProfile?.evidence[0] ??
                "已根据简历技能和项目经历生成 AI 方向画像。"}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DOMAIN_ORDER.map((domain) => (
              <DomainBar
                key={domain}
                label={DOMAIN_LABELS[domain]}
                value={toPercent(parsedResume.ecosystem[domain])}
              />
            ))}
          </div>

          {parsedResume.ecosystemProfile?.evidence.length ? (
            <div className="rounded-[16px] border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
                画像证据
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {parsedResume.ecosystemProfile.evidence.slice(0, 6).map((item) => (
                  <span
                    className="rounded-full bg-[var(--color-primary-light)] px-3 py-1 text-xs font-medium leading-4 text-[#6b4716]"
                    key={item}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <StructuredResumeCard parsedResume={parsedResume} />
        <SkillStackCard skills={topSkills} />
      </div>

      {topProjects.length > 0 ? (
        <div className="relative mt-5 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-5">
          <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
            关键项目证据
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {topProjects.map((project) => (
              <ProjectCard key={project.name} project={project} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ParsedResumeSkeleton() {
  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
      <div className="flex items-center gap-3">
        <Loader2 aria-hidden="true" className="size-5 animate-spin text-[var(--color-primary)]" strokeWidth={1.8} />
        <p className="text-sm font-bold text-[var(--color-primary)]">
          AI 正在解析你的简历...
        </p>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <div className="h-48 rounded-full bg-[var(--color-surface-hover)]" />
        <div className="space-y-3">
          <div className="h-20 rounded-[18px] bg-[var(--color-surface-hover)]" />
          <div className="h-12 rounded-[14px] bg-[var(--color-surface-hover)]" />
          <div className="h-12 rounded-[14px] bg-[var(--color-surface-hover)]" />
          <div className="h-12 rounded-[14px] bg-[var(--color-surface-hover)]" />
        </div>
      </div>
    </section>
  );
}

function DomainBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[16px] border border-[var(--color-border)] bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-bold leading-4 text-[var(--color-text)]">{label}</p>
        <span className="text-xs font-bold leading-4 text-[var(--color-primary)]">
          {value}%
        </span>
      </div>
      <Progress value={value} />
    </div>
  );
}

function StructuredResumeCard({ parsedResume }: { parsedResume: ParsedResumeState }) {
  const content = parsedResume.content;

  return (
    <article className="rounded-[18px] border border-[var(--color-border)] bg-white p-5">
      <div className="mb-4 flex items-center gap-2 text-[var(--color-blue)]">
        <BriefcaseBusiness aria-hidden="true" className="size-5" strokeWidth={1.8} />
        <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
          结构化简历
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <InfoTile label="姓名" value={content.name} />
        <InfoTile label="当前岗位" value={content.currentRole ?? "未识别"} />
        <InfoTile
          label="经验年限"
          value={
            content.yearsOfExperience !== undefined
              ? `${content.yearsOfExperience} 年`
              : "未识别"
          }
        />
        <InfoTile
          label="目标岗位"
          value={parsedResume.parsedProfile?.preferredRoles?.slice(0, 2).join(" / ") ?? "待补充"}
        />
      </div>

      {content.experiences.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
            最近经历
          </p>
          <div className="mt-2 space-y-2">
            {content.experiences.slice(0, 2).map((experience) => (
              <div
                className="rounded-[12px] bg-[var(--color-surface-hover)] p-3"
                key={`${experience.company}-${experience.role}`}
              >
                <p className="text-xs font-bold leading-4 text-[var(--color-text)]">
                  {experience.company} · {experience.role}
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                  {experience.highlights[0] ?? experience.period ?? "经历已结构化"}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-[var(--color-surface-hover)] p-3">
      <p className="text-xs leading-4 text-[var(--color-text-secondary)]">{label}</p>
      <p className="mt-1 text-sm font-bold leading-5 text-[var(--color-text)]">
        {value}
      </p>
    </div>
  );
}

function SkillStackCard({ skills }: { skills: ResumeSkill[] }) {
  return (
    <article className="rounded-[18px] border border-[var(--color-border)] bg-white p-5">
      <div className="mb-4 flex items-center gap-2 text-[var(--color-primary)]">
        <BarChart3 aria-hidden="true" className="size-5" strokeWidth={1.8} />
        <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
          AI 技术栈
        </h3>
      </div>

      {skills.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <span
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-3 py-1.5 text-xs font-medium leading-4 text-[var(--color-text-secondary)]"
              key={`${skill.name}-${skill.category}`}
              title={skill.evidence?.[0]}
            >
              {skill.name}
              {skill.level ? ` · ${SKILL_LEVEL_LABELS[skill.level]}` : ""}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
          暂未识别到明确技能，请在简历中补充核心技能区。
        </p>
      )}
    </article>
  );
}

function ProjectCard({ project }: { project: ResumeProject }) {
  return (
    <article className="rounded-[14px] border border-[var(--color-border)] bg-white p-4">
      <h4 className="text-sm font-bold leading-5 text-[var(--color-text)]">
        {project.name}
      </h4>
      <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
        {project.impact ?? project.summary ?? "已识别项目经历，可继续补充量化结果。"}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {project.techStack.slice(0, 4).map((tech) => (
          <span
            className="rounded-[8px] bg-[var(--color-primary-light)] px-2 py-1 text-[10px] font-bold leading-3 text-[#6b4716]"
            key={tech}
          >
            {tech}
          </span>
        ))}
      </div>
    </article>
  );
}

type MatchPanelProps = {
  canMatch: boolean;
  isLoadingReports: boolean;
  matchResult: ResumeMatchResult | null;
  onMatch: () => void;
  onSelectTarget: (targetId: string) => void;
  optimizationNotice: string | null;
  optimizationSuggestions: string[];
  parsedResumeDirection: ResumeDirection | null;
  selectedTargetId: string;
  selectedTargetJobDirection: ResumeDirection | null;
  stage: ResumeStage;
  targets: MatchTarget[];
};

function MatchPanel({
  canMatch,
  isLoadingReports,
  matchResult,
  onMatch,
  onSelectTarget,
  optimizationNotice,
  optimizationSuggestions,
  parsedResumeDirection,
  selectedTargetId,
  selectedTargetJobDirection,
  stage,
  targets,
}: MatchPanelProps) {
  const isMatching = stage === "matching";

  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[var(--color-primary)]">
            <Target aria-hidden="true" className="size-5" strokeWidth={1.8} />
            <span className="text-xs font-bold uppercase tracking-[0.08em]">
              JD Match
            </span>
          </div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            选择目标岗位进行匹配
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
            可选择评估历史中的报告，也可直接选择目标 JD 快速匹配。
          </p>
        </div>

        <button
          className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-5 py-3 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] hover:shadow-[var(--shadow-lg)] active:scale-[0.98] disabled:pointer-events-none disabled:bg-[var(--color-border)] disabled:text-[var(--color-muted)]"
          disabled={!canMatch}
          onClick={onMatch}
          type="button"
        >
          {isMatching ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.8} />
          ) : (
            <Target aria-hidden="true" className="size-4" strokeWidth={1.8} />
          )}
          {isMatching ? "匹配中" : "开始匹配"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {isLoadingReports ? (
          <div className="rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4 text-sm leading-6 text-[var(--color-text-secondary)]">
            正在读取已评估报告...
          </div>
        ) : null}

        {targets.map((target) => (
          <button
            className={`group rounded-[16px] border p-4 text-left transition-all hover:-translate-y-px hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-lg)] ${
              selectedTargetId === target.id
                ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]"
                : "border-[var(--color-border)] bg-[var(--color-surface-hover)]"
            }`}
            key={target.id}
            onClick={() => onSelectTarget(target.id)}
            type="button"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-white text-[var(--color-primary)]">
                {target.kind === "report" ? (
                  <FileCheck2 aria-hidden="true" className="size-5" strokeWidth={1.8} />
                ) : (
                  <BriefcaseBusiness aria-hidden="true" className="size-5" strokeWidth={1.8} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-1 text-sm font-bold leading-5 text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
                  {target.title}
                </h3>
                <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                  {target.description}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {targets.length === 0 && !isLoadingReports ? (
        <div className="rounded-[16px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-hover)] p-5 text-sm leading-6 text-[var(--color-text-secondary)]">
          暂无可用岗位。请先在 JD 评估页生成报告，或选择目标 JD。
        </div>
      ) : null}

      {parsedResumeDirection ? (
        <DirectionComparisonCard
          jobDirection={selectedTargetJobDirection}
          resumeDirection={parsedResumeDirection}
        />
      ) : null}

      {isMatching ? (
        <div className="mt-6 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-5">
          <div className="mb-3 flex items-center gap-2 text-[var(--color-primary)]">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.8} />
            <p className="text-sm font-bold">匹配中</p>
          </div>
          <Progress animated value={72} />
          <p className="mt-3 text-xs leading-5 text-[var(--color-text-secondary)]">
            正在计算方向匹配度、技能覆盖率、缺口优先级和简历优化建议。
          </p>
        </div>
      ) : null}

      {matchResult ? (
        <MatchResultPanel
          matchResult={matchResult}
          optimizationNotice={optimizationNotice}
          optimizationSuggestions={optimizationSuggestions}
        />
      ) : null}
    </section>
  );
}

type MatchResultPanelProps = {
  matchResult: ResumeMatchResult;
  optimizationNotice: string | null;
  optimizationSuggestions: string[];
};

function MatchResultPanel({
  matchResult,
  optimizationNotice,
  optimizationSuggestions,
}: MatchResultPanelProps) {
  return (
    <div className="mt-8 space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ScoreCard
          label="综合匹配度"
          value={toPercent(matchResult.overallMatch)}
          tone="primary"
        />
        <ScoreCard
          label="方向匹配度"
          value={toPercent(matchResult.directionMatch)}
          tone="blue"
        />
        <ScoreCard
          label="技能覆盖率"
          value={toPercent(matchResult.skillCoverage)}
          tone="green"
        />
      </div>

      <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
            匹配等级
          </h3>
          <span className="rounded-full bg-[var(--color-primary-light)] px-3 py-1 text-xs font-bold leading-4 text-[var(--color-primary)]">
            {matchResult.matchLevel}
          </span>
        </div>
        <Progress value={toPercent(matchResult.overallMatch)} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <MatchedSkillsList skills={matchResult.matchedSkills} />
        <GapList gaps={matchResult.quickGaps} title="快速弥补缺口" tone="amber" />
        <GapList gaps={matchResult.longTermGaps} title="长期缺口" tone="red" />
      </div>

      <OptimizationSuggestions
        notice={optimizationNotice}
        suggestions={optimizationSuggestions}
      />
    </div>
  );
}

type ResumeJudgePanelProps = {
  atsCheck: AtsCheckResult | null;
  canRun: boolean;
  copiedSuggestionId: string | null;
  effort: ResumeOptimizationEffort;
  error: string | null;
  feedbackDrafts: Record<string, string>;
  feedbackSubmittingKey: string | null;
  isAtsChecking: boolean;
  isJudgeLoading: boolean;
  isLoadingRuns: boolean;
  jdText: string;
  mode: ResumeOptimizationMode;
  notice: string | null;
  onAtsCheck: () => void;
  onCopySuggestion: (suggestion: ResumeOptimizationSuggestion) => void;
  onEffortChange: (effort: ResumeOptimizationEffort) => void;
  onFeedbackReasonChange: (suggestionId: string, reason: string) => void;
  onJdTextChange: (value: string) => void;
  onModeChange: (mode: ResumeOptimizationMode) => void;
  onResumeChange: (resumeId: number | null) => void;
  onRunJudge: () => void;
  onSelectRun: (run: ResumeOptimizationRunDto) => void;
  onSubmitFeedback: (
    suggestion: ResumeOptimizationSuggestion,
    decision: OptimizationFeedbackDecision,
  ) => void;
  onTargetChange: (targetId: string) => void;
  resumeId: number | null;
  run: ResumeOptimizationRunDto | null;
  runs: ResumeOptimizationRunDto[];
  savedResumes: ResumeDto[];
  selectedTargetId: string;
  targets: MatchTarget[];
};

function ResumeJudgePanel({
  atsCheck,
  canRun,
  copiedSuggestionId,
  effort,
  error,
  feedbackDrafts,
  feedbackSubmittingKey,
  isAtsChecking,
  isJudgeLoading,
  isLoadingRuns,
  jdText,
  mode,
  notice,
  onAtsCheck,
  onCopySuggestion,
  onEffortChange,
  onFeedbackReasonChange,
  onJdTextChange,
  onModeChange,
  onResumeChange,
  onRunJudge,
  onSelectRun,
  onSubmitFeedback,
  onTargetChange,
  resumeId,
  run,
  runs,
  savedResumes,
  selectedTargetId,
  targets,
}: ResumeJudgePanelProps) {
  const suggestions = run?.result.suggestions ?? [];
  const showManualJd = selectedTargetId === MANUAL_JD_TARGET_ID;

  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[var(--color-primary)]">
            <BrainCircuit aria-hidden="true" className="size-5" strokeWidth={1.8} />
            <span className="text-xs font-bold uppercase tracking-[0.08em]">
              Resume Judge
            </span>
          </div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            多模式简历优化
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
            建议会保存为历史记录，采纳或拒绝只记录反馈，不会覆盖原简历；目标可来自评估报告、目标 JD 或手动粘贴 JD。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-text)] transition-all hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:pointer-events-none disabled:bg-[var(--color-surface-hover)] disabled:text-[var(--color-muted)]"
            disabled={!canRun}
            onClick={onAtsCheck}
            type="button"
          >
            {isAtsChecking ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.8} />
            ) : (
              <BadgeCheck aria-hidden="true" className="size-4" strokeWidth={1.8} />
            )}
            {isAtsChecking ? "检查中" : "ATS 检查"}
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-5 py-3 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] hover:shadow-[var(--shadow-lg)] active:scale-[0.98] disabled:pointer-events-none disabled:bg-[var(--color-border)] disabled:text-[var(--color-muted)]"
            disabled={!canRun}
            onClick={onRunJudge}
            type="button"
          >
            {isJudgeLoading ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.8} />
            ) : (
              <Sparkles aria-hidden="true" className="size-4" strokeWidth={1.8} />
            )}
            {isJudgeLoading ? "生成中" : "生成建议"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
            简历
          </span>
          <select
            className="mt-2 w-full rounded-[14px] border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary-light)]"
            onChange={(event) =>
              onResumeChange(event.target.value ? Number(event.target.value) : null)
            }
            value={resumeId ?? ""}
          >
            <option value="">选择保存简历</option>
            {savedResumes
              .filter((resume) => !resume.archivedAt)
              .map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.name}
                </option>
              ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
            目标 JD
          </span>
          <select
            className="mt-2 w-full rounded-[14px] border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary-light)]"
            onChange={(event) => onTargetChange(event.target.value)}
            value={selectedTargetId}
          >
            <option value="">选择目标报告或 JD</option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.title}
              </option>
            ))}
            <option value={MANUAL_JD_TARGET_ID}>粘贴 JD</option>
          </select>
        </label>
      </div>

      {showManualJd ? (
        <textarea
          className="mt-4 min-h-[140px] w-full resize-y rounded-[16px] border border-[var(--color-border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary-light)]"
          onChange={(event) => onJdTextChange(event.target.value)}
          placeholder="粘贴目标 JD，至少 20 个字符"
          value={jdText}
        />
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_180px]">
        <div>
          <p className="mb-2 text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
            优化模式
          </p>
          <div className="flex flex-wrap gap-2">
            {JUDGE_MODE_OPTIONS.map((option) => (
              <button
                className={`rounded-[12px] border px-3 py-2 text-xs font-bold transition-all ${
                  mode === option.value
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                    : "border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                }`}
                key={option.value}
                onClick={() => onModeChange(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
            改写强度
          </span>
          <select
            className="mt-2 w-full rounded-[14px] border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary-light)]"
            onChange={(event) =>
              onEffortChange(event.target.value as ResumeOptimizationEffort)
            }
            value={effort}
          >
            {JUDGE_EFFORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!canRun ? (
        <p className="mt-4 rounded-[14px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-hover)] px-4 py-3 text-sm leading-6 text-[var(--color-text-secondary)]">
          请选择一份已保存简历，并选择目标报告、目标 JD 或粘贴 JD。
        </p>
      ) : null}

      {notice ? (
        <p className="mt-4 rounded-[14px] border border-[#dce8d9] bg-[#f2f7f0] px-4 py-3 text-sm leading-6 text-[var(--color-green)]">
          {notice}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-[14px] border border-[#ead6d2] bg-[#f8efed] px-4 py-3 text-sm leading-6 text-[var(--color-red)]">
          {error}
        </p>
      ) : null}

      {atsCheck ? <AtsCheckCard atsCheck={atsCheck} /> : null}

      {suggestions.length > 0 ? (
        <div className="mt-6 space-y-4">
          {suggestions.map((suggestion) => {
            const latestFeedback = getLatestFeedback(run?.feedback ?? [], suggestion.id);
            const acceptKey = `${suggestion.id}-accepted`;
            const rejectKey = `${suggestion.id}-rejected`;

            return (
              <article
                className="rounded-[18px] border border-[var(--color-border)] bg-white p-5"
                key={suggestion.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--color-primary-light)] px-2.5 py-1 text-xs font-bold text-[var(--color-primary)]">
                        {formatJudgeMode(suggestion.mode)}
                      </span>
                      {latestFeedback ? (
                        <span className="rounded-full bg-[var(--color-surface-hover)] px-2.5 py-1 text-xs font-bold text-[var(--color-text-secondary)]">
                          {formatFeedbackDecision(latestFeedback.decision)}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="text-base font-bold leading-6 text-[var(--color-text)]">
                      {suggestion.title}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                      {suggestion.targetSection} · {suggestion.tags.join("、")}
                    </p>
                  </div>
                  <button
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--color-text)] transition-all hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                    onClick={() => onCopySuggestion(suggestion)}
                    type="button"
                  >
                    <ClipboardPaste aria-hidden="true" className="size-4" strokeWidth={1.8} />
                    {copiedSuggestionId === suggestion.id ? "已复制" : "复制"}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <JudgeEvidenceBlock
                    label="原简历证据"
                    value={suggestion.originalEvidence}
                  />
                  <JudgeEvidenceBlock
                    label="JD 证据"
                    value={suggestion.jdEvidence ?? "目标 JD 未提供更细证据，按匹配结果处理。"}
                  />
                </div>

                <div className="mt-4 rounded-[14px] bg-[var(--color-surface-hover)] p-4">
                  <p className="text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
                    建议
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-text)]">
                    {suggestion.recommendation}
                  </p>
                  {suggestion.rewriteDraft ? (
                    <p className="mt-3 rounded-[12px] bg-white p-3 text-sm leading-6 text-[var(--color-text)]">
                      {suggestion.rewriteDraft}
                    </p>
                  ) : null}
                  <p className="mt-3 text-xs leading-5 text-[var(--color-text-secondary)]">
                    {suggestion.safetyNote}
                  </p>
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
                    反馈原因
                    <input
                      className="mt-2 w-full rounded-[12px] border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-normal text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary-light)]"
                      onChange={(event) =>
                        onFeedbackReasonChange(suggestion.id, event.target.value)
                      }
                      placeholder="可选，例如：贴合当前目标 / 暂无真实证据"
                      value={feedbackDrafts[suggestion.id] ?? ""}
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-green)] px-4 py-2 text-xs font-bold text-white transition-all hover:opacity-90 disabled:pointer-events-none disabled:opacity-60"
                      disabled={feedbackSubmittingKey !== null}
                      onClick={() => onSubmitFeedback(suggestion, "accepted")}
                      type="button"
                    >
                      {feedbackSubmittingKey === acceptKey ? (
                        <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.8} />
                      ) : (
                        <CheckCircle2 aria-hidden="true" className="size-4" strokeWidth={1.8} />
                      )}
                      采纳
                    </button>
                    <button
                      className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[#ead6d2] bg-[#f8efed] px-4 py-2 text-xs font-bold text-[var(--color-red)] transition-all hover:opacity-90 disabled:pointer-events-none disabled:opacity-60"
                      disabled={feedbackSubmittingKey !== null}
                      onClick={() => onSubmitFeedback(suggestion, "rejected")}
                      type="button"
                    >
                      {feedbackSubmittingKey === rejectKey ? (
                        <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.8} />
                      ) : (
                        <X aria-hidden="true" className="size-4" strokeWidth={1.8} />
                      )}
                      拒绝
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <div className="mt-6 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
            优化历史
          </h3>
          {isLoadingRuns ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin text-[var(--color-primary)]" strokeWidth={1.8} />
          ) : null}
        </div>

        {runs.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {runs.slice(0, 6).map((item) => (
              <button
                className={`rounded-[14px] border p-4 text-left transition-all hover:border-[var(--color-primary)] hover:bg-white ${
                  run?.id === item.id
                    ? "border-[var(--color-primary)] bg-white"
                    : "border-[var(--color-border)] bg-[var(--color-surface)]"
                }`}
                key={item.id}
                onClick={() => onSelectRun(item)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold leading-5 text-[var(--color-text)]">
                    {formatJudgeMode(item.mode)}
                  </span>
                  <span className="text-xs leading-4 text-[var(--color-text-secondary)]">
                    {formatJudgeDate(item.createdAt)}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--color-text-secondary)]">
                  {item.result.target.company || item.result.target.role
                    ? `${item.result.target.company ?? "目标公司"} · ${item.result.target.role ?? "目标岗位"}`
                    : item.result.target.jdPreview}
                </p>
                <p className="mt-2 text-xs font-bold leading-4 text-[var(--color-primary)]">
                  {item.result.suggestions.length} 条建议 · {formatJudgeEffort(item.result.effort)} · {item.feedback.length} 条反馈
                </p>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
            暂无优化历史。
          </p>
        )}
      </div>
    </section>
  );
}

function AtsCheckCard({ atsCheck }: { atsCheck: AtsCheckResult }) {
  return (
    <div className="mt-6 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
            ATS 检查结果
          </h3>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            {atsCheck.summary}
          </p>
        </div>
        <div className="rounded-[16px] bg-white px-4 py-3 text-center">
          <p className="text-xs leading-4 text-[var(--color-text-secondary)]">
            ATS 分
          </p>
          <p className="text-[28px] font-bold leading-none text-[var(--color-primary)]">
            {atsCheck.score}
          </p>
        </div>
      </div>
      <Progress value={atsCheck.score} />

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {atsCheck.checks.map((check) => (
          <div className="rounded-[14px] bg-white p-4" key={check.id}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-bold leading-5 text-[var(--color-text)]">
                {check.title}
              </p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${atsStatusClass(check.status)}`}>
                {formatAtsStatus(check.status)}
              </span>
            </div>
            <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
              {check.detail}
            </p>
            {check.fix ? (
              <p className="mt-2 text-xs leading-5 text-[var(--color-primary)]">
                {check.fix}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function JudgeEvidenceBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4">
      <p className="text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
        {label}
      </p>
      <p className="mt-2 line-clamp-4 text-xs leading-5 text-[var(--color-text)]">
        {value}
      </p>
    </div>
  );
}

function ScoreCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "primary" | "blue" | "green";
  value: number;
}) {
  const toneClass = {
    primary: "text-[var(--color-primary)] bg-[var(--color-primary-light)]",
    blue: "text-[var(--color-blue)] bg-[#e8f0f5]",
    green: "text-[var(--color-green)] bg-[#eaf0e8]",
  }[tone];

  return (
    <article className="rounded-[18px] border border-[var(--color-border)] bg-white p-5">
      <div className={`mb-4 flex size-10 items-center justify-center rounded-[12px] ${toneClass}`}>
        <BarChart3 aria-hidden="true" className="size-5" strokeWidth={1.8} />
      </div>
      <p className="text-xs leading-4 text-[var(--color-text-secondary)]">{label}</p>
      <p className="mt-1 text-[32px] font-bold leading-none text-[var(--color-text)]">
        {value}%
      </p>
      <Progress className="mt-4" value={value} />
    </article>
  );
}

function ResumeDirectionField({
  description,
  disabled,
  label,
  onChange,
  value,
}: {
  description?: string;
  disabled?: boolean;
  label: string;
  onChange: (direction: ResumeDirection) => void;
  value: ResumeDirection;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold leading-4 text-[var(--color-text)]">
        {label}
      </span>
      <select
        className="mt-2 w-full rounded-[12px] border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm leading-5 text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.18)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-hover)] disabled:text-[var(--color-muted)]"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as ResumeDirection)}
        value={value}
      >
        {RESUME_DIRECTION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {description ? (
        <span className="mt-2 block text-xs leading-5 text-[var(--color-text-secondary)]">
          {description}
        </span>
      ) : null}
    </label>
  );
}

function ResumeDirectionBadge({ direction }: { direction: ResumeDirection }) {
  return (
    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold leading-3 text-[var(--color-primary)]">
      {RESUME_DIRECTION_LABELS[direction]}
    </span>
  );
}

function DirectionComparisonCard({
  jobDirection,
  resumeDirection,
}: {
  jobDirection: ResumeDirection | null;
  resumeDirection: ResumeDirection;
}) {
  const jobLabel = jobDirection
    ? RESUME_DIRECTION_LABELS[jobDirection]
    : "待识别";
  const tip = buildDirectionComparisonTip(resumeDirection, jobDirection);

  return (
    <div className="mt-6 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-5">
      <div className="mb-3 flex items-center gap-2 text-[var(--color-primary)]">
        <Target aria-hidden="true" className="size-4" strokeWidth={1.8} />
        <p className="text-sm font-bold leading-5 text-[var(--color-text)]">
          方向对比
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-[14px] border border-[var(--color-border)] bg-white p-4">
          <p className="text-xs leading-4 text-[var(--color-text-secondary)]">
            简历方向
          </p>
          <p className="mt-1 text-sm font-bold leading-5 text-[var(--color-text)]">
            {RESUME_DIRECTION_LABELS[resumeDirection]}
          </p>
        </div>
        <div className="rounded-[14px] border border-[var(--color-border)] bg-white p-4">
          <p className="text-xs leading-4 text-[var(--color-text-secondary)]">
            岗位方向
          </p>
          <p className="mt-1 text-sm font-bold leading-5 text-[var(--color-text)]">
            {jobLabel}
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--color-text-secondary)]">
        提示：{tip}
      </p>
    </div>
  );
}

function MatchedSkillsList({ skills }: { skills: ResumeMatchedSkill[] }) {
  return (
    <article className="rounded-[18px] border border-[var(--color-border)] bg-white p-5">
      <div className="mb-4 flex items-center gap-2 text-[var(--color-green)]">
        <CheckCircle2 aria-hidden="true" className="size-5" strokeWidth={1.8} />
        <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
          已匹配技能
        </h3>
      </div>

      {skills.length > 0 ? (
        <div className="space-y-3">
          {skills.slice(0, 8).map((skill) => (
            <div
              className="rounded-[12px] bg-[var(--color-surface-hover)] p-3"
              key={`${skill.skill}-${skill.resumeEvidence}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold leading-5 text-[var(--color-text)]">
                  {skill.skill}
                </p>
                <span className="shrink-0 rounded-full bg-[#eaf0e8] px-2 py-0.5 text-[10px] font-bold text-[var(--color-green)]">
                  {skill.category ? SKILL_CATEGORY_LABELS[skill.category] : "已覆盖"}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-secondary)]">
                {skill.resumeEvidence ?? skill.jdEvidence ?? "简历中已有相关证据。"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
          暂未识别到直接匹配技能。
        </p>
      )}
    </article>
  );
}

function GapList({
  gaps,
  title,
  tone,
}: {
  gaps: SkillGap[];
  title: string;
  tone: "amber" | "red";
}) {
  const Icon = tone === "amber" ? Sparkles : TriangleAlert;
  const toneClass =
    tone === "amber"
      ? "text-[var(--color-primary)] bg-[var(--color-primary-light)]"
      : "text-[var(--color-red)] bg-[#f5e8e6]";

  return (
    <article className="rounded-[18px] border border-[var(--color-border)] bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className={`flex size-8 items-center justify-center rounded-[10px] ${toneClass}`}>
          <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </span>
        <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
          {title}
        </h3>
      </div>

      {gaps.length > 0 ? (
        <div className="space-y-3">
          {gaps.slice(0, 6).map((gap) => (
            <div
              className="rounded-[12px] bg-[var(--color-surface-hover)] p-3"
              key={`${gap.skill}-${gap.priority}`}
            >
              <p className="text-sm font-bold leading-5 text-[var(--color-text)]">
                {gap.skill}
              </p>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-[var(--color-text-secondary)]">
                {gap.suggestion ?? gap.evidence ?? "建议补充相关项目证据。"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
          当前没有明显{title}。
        </p>
      )}
    </article>
  );
}

function OptimizationSuggestions({
  notice,
  suggestions,
}: {
  notice: string | null;
  suggestions: string[];
}) {
  return (
    <section className="relative overflow-hidden rounded-[24px] bg-[var(--color-primary)] p-6 text-white shadow-[var(--shadow-lg)] sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-white opacity-10 blur-3xl" />
      <div className="relative">
        <div className="mb-4 flex size-12 items-center justify-center rounded-[16px] bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
          <Sparkles aria-hidden="true" className="size-6" strokeWidth={1.8} />
        </div>
        <h2 className="text-[24px] font-semibold leading-[34px] sm:text-[28px] sm:leading-[38px]">
          简历优化建议
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/85 sm:text-base">
          建议来自当前简历和目标 JD 的差异分析，优先补强项目证据、关键词对齐和量化成果。
        </p>
        {notice ? (
          <p className="mt-3 rounded-[12px] border border-white/15 bg-white/10 px-4 py-2 text-xs leading-5 text-white/82">
            {notice}
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {suggestions.slice(0, 5).map((suggestion, index) => (
            <article
              className="rounded-[18px] border border-white/15 bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
              key={suggestion}
            >
              <div className="mb-2 flex items-center gap-2">
                <FileCheck2
                  aria-hidden="true"
                  className="size-4 shrink-0 text-white"
                  strokeWidth={1.8}
                />
                <h3 className="text-sm font-bold leading-5">
                  建议 {index + 1}
                </h3>
              </div>
              <p className="text-xs leading-5 text-white/82">{suggestion}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function getLatestFeedback(
  feedback: OptimizationFeedbackDto[],
  suggestionId: string,
): OptimizationFeedbackDto | undefined {
  return feedback.find((item) => item.suggestionId === suggestionId);
}

function formatJudgeMode(mode: ResumeOptimizationMode): string {
  return JUDGE_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

function formatJudgeEffort(effort: ResumeOptimizationEffort): string {
  return JUDGE_EFFORT_OPTIONS.find((option) => option.value === effort)?.label ?? effort;
}

function formatFeedbackDecision(decision: OptimizationFeedbackDecision): string {
  return decision === "accepted" ? "已采纳" : "已拒绝";
}

function formatJudgeDate(value: string): string {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(timestamp));
}

function formatAtsStatus(
  status: AtsCheckResult["checks"][number]["status"],
): string {
  if (status === "pass") {
    return "通过";
  }

  if (status === "warning") {
    return "需检查";
  }

  return "需修复";
}

function atsStatusClass(
  status: AtsCheckResult["checks"][number]["status"],
): string {
  if (status === "pass") {
    return "bg-[#eaf0e8] text-[var(--color-green)]";
  }

  if (status === "warning") {
    return "bg-[var(--color-primary-light)] text-[var(--color-primary)]";
  }

  return "bg-[#f8efed] text-[var(--color-red)]";
}

function readSaveErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim().length > 0
  ) {
    return error.message.trim();
  }

  return "结果已生成，但保存失败。结构化简历已保留，可稍后重试保存。";
}

function buildFallbackParsedResume(
  resume: DemoResume,
  direction: ResumeDirection,
): ParsedResumeState {
  const profile = resume.expectedParsedProfile;
  const ecosystem = normalizeDemoEcosystem(resume.expectedEcosystemPosition);
  const primaryDomain = pickPrimaryDomain(ecosystem);
  const skills = (resume.expectedSkills ?? []).map((skill) => ({
    name: skill.name,
    category: normalizeSkillCategory(skill.category),
    level: normalizeSkillLevel(skill.level),
    evidence: skill.evidence ? [skill.evidence] : undefined,
  }));

  return {
    resumeId: null,
    direction,
    content: {
      name: profile?.name ?? resume.name,
      yearsOfExperience:
        profile?.yearsOfExperience ?? resume.yearsOfExperience,
      currentRole: profile?.currentRole ?? resume.targetDirection,
      summary:
        profile?.summary ??
        resume.expectedStrengths?.[0]?.detail ??
        "候选人画像，可用于解析与匹配。",
      contact: {
        location: profile?.location,
      },
      skills,
      projects: (resume.expectedProjects ?? []).map((project) => ({
        name: project.name,
        role: project.role,
        domain: normalizeDomain(project.domain) ?? primaryDomain,
        techStack: project.techStack ?? project.matchKeywords ?? [],
        impact: project.impact,
        summary: project.matchKeywords?.join("、"),
      })),
      experiences: (profile?.workExperience ?? []).map((experience) => ({
        company: experience.company,
        role: experience.role,
        period: experience.period,
        domain: primaryDomain,
        techStack: [],
        highlights: [experience.focus ?? "候选人工作经历"],
      })),
      education: (profile?.education ?? []).map((education) => ({
        school: education.school,
        degree: education.degree,
        major: education.major,
        period: education.period,
      })),
      rawText: resume.rawText,
    },
    skills,
    aiTechStack: {
      all: skills.map((skill) => skill.name),
    },
    ecosystem,
    ecosystemPosition: resume.expectedEcosystemPosition,
    ecosystemProfile: {
      primaryDomain,
      vector: ecosystem,
      evidence:
        resume.expectedStrengths?.map((strength) => strength.detail) ??
        ["已生成结构化简历画像。"],
    },
    parsedProfile: {
      name: profile?.name ?? resume.name,
      currentRole: profile?.currentRole ?? resume.targetDirection,
      targetDirection: profile?.targetDirection ?? resume.targetDirection,
      yearsOfExperience:
        profile?.yearsOfExperience ?? resume.yearsOfExperience,
      summary: profile?.summary,
      preferredRoles: profile?.preferredRoles,
    },
  };
}

function buildFallbackMatchResult(
  resume: DemoResume,
  target: MatchTarget,
): ResumeMatchResult {
  const demoTarget =
    target.kind === "demo"
      ? typedPresetJds.find((job) => job.id === target.demoId)
      : undefined;
  const resumeSkills = new Set(
    (resume.expectedSkills ?? []).map((skill) => skill.name.toLocaleLowerCase()),
  );
  const targetKeywords = demoTarget?.expectedKeywords ?? [];
  const matchedSkills = targetKeywords
    .filter((keyword) => resumeSkills.has(keyword.toLocaleLowerCase()))
    .slice(0, 8)
    .map((keyword) => ({
      skill: keyword,
      category: inferSkillCategory(keyword),
      resumeEvidence: `简历中包含 ${keyword} 相关项目证据。`,
      jdEvidence: `目标 JD 要求 ${keyword}。`,
    }));
  const missingKeywords = targetKeywords
    .filter((keyword) => !resumeSkills.has(keyword.toLocaleLowerCase()))
    .slice(0, 5);
  const quickGaps = missingKeywords.slice(0, 3).map((skill) => ({
    skill,
    priority: "quick_fix" as const,
    evidence: "目标 JD 中出现该关键词，简历未直接覆盖。",
    suggestion: `补充一个与 ${skill} 相关的项目证据、上线指标或实验结果。`,
  }));
  const longTermGaps = (resume.expectedGaps ?? []).slice(0, 2).map((gap) => ({
    skill: gap.title,
    priority: "long_term" as const,
    evidence: gap.impactOnMatching,
    suggestion: gap.suggestion,
  }));
  const isSameDirection =
    !demoTarget || resume.targetDirection === demoTarget.aiDirection;
  const skillCoverage =
    targetKeywords.length > 0 ? matchedSkills.length / targetKeywords.length : 0.68;
  const directionMatch = isSameDirection ? 0.86 : 0.48;
  const overallMatch = Math.round((directionMatch * 0.45 + skillCoverage * 0.55) * 100) / 100;

  return {
    directionMatch,
    skillCoverage,
    overallMatch,
    matchLevel:
      overallMatch >= 0.78
        ? "高度匹配"
        : overallMatch >= 0.55
          ? "中度匹配"
          : overallMatch >= 0.35
            ? "低度匹配"
            : "不匹配",
    matchedSkills,
    quickGaps,
    longTermGaps,
    gaps: [
      ...matchedSkills.map((skill) => ({
        skill: skill.skill,
        priority: "matched" as const,
        evidence: skill.resumeEvidence,
      })),
      ...quickGaps,
      ...longTermGaps,
    ],
    optimizationSuggestions: [
      "把最相关项目放到简历前两屏，突出职责、技术栈和量化结果。",
      "按目标 JD 顺序重排核心技能，优先展示已匹配关键词。",
      "对缺口技能补充小型验证项目，不要只写“了解”。",
    ],
    suggestions: [
      "继续围绕目标岗位补充模型、数据、评测和上线证据。",
    ],
  };
}

function normalizeDemoEcosystem(
  value: Partial<Record<string, number>> | undefined,
): AiEcosystemVector {
  return {
    llm_application: readDemoVectorScore(value?.["LLM应用层"]),
    ai_infra: readDemoVectorScore(value?.["AI Infra"]),
    algorithm_research: readDemoVectorScore(value?.["算法研究"]),
    embodied_ai: readDemoVectorScore(value?.["具身智能"]),
    ai_safety: readDemoVectorScore(value?.["AI安全"]),
  };
}

function readDemoVectorScore(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }

  return value <= 1 ? value * 100 : value;
}

function normalizeDomain(value: string | undefined): AiEcosystemDomain | undefined {
  if (value === "LLM应用层" || value === "llm_application") {
    return "llm_application";
  }

  if (value === "AI Infra" || value === "ai_infra") {
    return "ai_infra";
  }

  if (value === "算法研究" || value === "algorithm_research") {
    return "algorithm_research";
  }

  if (value === "具身智能" || value === "embodied_ai") {
    return "embodied_ai";
  }

  if (value === "AI安全" || value === "ai_safety") {
    return "ai_safety";
  }

  return undefined;
}

function normalizeSkillCategory(value: string): ResumeSkill["category"] {
  const normalized = value.toLocaleLowerCase();

  if (value.includes("编程语言") || normalized.includes("language")) {
    return "language";
  }

  if (value.includes("框架") || normalized.includes("framework")) {
    return "framework";
  }

  if (value.includes("基础设施") || normalized.includes("infra")) {
    return "infrastructure";
  }

  if (value.includes("评估") || value.includes("监控") || value.includes("评测")) {
    return "evaluation";
  }

  if (value.includes("领域") || value.includes("模型服务") || value.includes("MLOps")) {
    return "domain";
  }

  return "tool";
}

function normalizeSkillLevel(
  value: string | undefined,
): ResumeSkill["level"] | undefined {
  if (value === "精通" || value === "expert") {
    return "expert";
  }

  if (value === "熟练" || value === "proficient") {
    return "proficient";
  }

  if (value === "入门" || value === "beginner") {
    return "beginner";
  }

  return undefined;
}

function inferSkillCategory(skill: string): ResumeSkill["category"] {
  if (/Python|TypeScript|Go|SQL|Java/i.test(skill)) {
    return "language";
  }

  if (/LangChain|LlamaIndex|FastAPI|Transformers|HuggingFace/i.test(skill)) {
    return "framework";
  }

  if (/Milvus|pgvector|Kubernetes|vLLM|Triton|GPU|Redis/i.test(skill)) {
    return "infrastructure";
  }

  if (/RAGAS|LangSmith|benchmark|评测/i.test(skill)) {
    return "evaluation";
  }

  return "domain";
}

async function loadOptimizationSuggestions(
  match: ResumeMatchResult,
  jdText: string,
  resumeText: string,
): Promise<{ notice: string | null; suggestions: string[] }> {
  const fallback = buildFallbackSuggestions(match);

  if (resumeText.trim().length < MIN_RESUME_LENGTH) {
    return {
      notice: "当前保存简历缺少原始文本，已根据结构化档案和匹配缺口生成建议。",
      suggestions: fallback,
    };
  }

  try {
    const optimizeBody = await apiRequest<OptimizeResponse>("/api/resume/optimize", {
      errorMessage: "简历优化建议生成失败。",
      json: {
        resumeText,
        jdText,
      },
      method: "POST",
      timeoutMs: 60000,
    });

    const suggestions = optimizeBody.suggestions
      .map((suggestion) => suggestion.trim())
      .filter(Boolean)
      .slice(0, 5);

    if (suggestions.length >= 3) {
      return {
        notice: optimizeBody.fallbackUsed
          ? (optimizeBody.fallbackMessage ??
            "AI 优化建议暂不可用，已使用本地匹配缺口生成建议。")
          : null,
        suggestions,
      };
    }

    return {
      notice: "优化建议生成不完整，已使用本地匹配缺口补齐建议。",
      suggestions: fallback,
    };
  } catch {
    return {
      notice: "已根据匹配缺口生成建议。",
      suggestions: fallback,
    };
  }
}

function buildFallbackSuggestions(match: ResumeMatchResult): string[] {
  const suggestions = match.optimizationSuggestions
    .map((suggestion) => suggestion.trim())
    .filter(Boolean);

  for (const gap of match.quickGaps.slice(0, 2)) {
    suggestions.push(
      gap.suggestion ??
        `把「${gap.skill}」补进最相关项目：写清使用场景、你负责的模块、上线结果和一个量化指标。`,
    );
  }

  for (const gap of match.longTermGaps.slice(0, 1)) {
    suggestions.push(
      gap.suggestion ??
        `「${gap.skill}」属于长期缺口，建议补充专项学习或实验项目，不要只写“了解”。`,
    );
  }

  return uniqueStrings(suggestions).slice(0, 5);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const key = value.toLocaleLowerCase().replace(/\s+/g, "");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(value);
  }

  return output;
}

function readReportDirection(report: ReportDto): ResumeDirection | null {
  return (
    normalizeResumeDirection(report.report.job.aiDirection) ??
    report.report.job.ecosystem?.primaryDomain ??
    null
  );
}

function buildDirectionComparisonTip(
  resumeDirection: ResumeDirection,
  jobDirection: ResumeDirection | null,
): string {
  if (!jobDirection) {
    return "岗位方向待识别，建议先确认 JD 的核心 AI 方向后再判断是否需要单独准备简历版本。";
  }

  if (resumeDirection === "general") {
    return "当前为通用简历，建议补充目标岗位相关项目和关键词。";
  }

  if (resumeDirection === jobDirection) {
    return "方向基本一致，建议继续补充该方向下的项目细节、量化指标和关键技术词。";
  }

  return "方向存在差异，建议补充目标岗位相关项目和关键词。";
}

function toPercent(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }

  const normalized = value <= 1 ? value * 100 : value;

  return Math.round(Math.min(100, Math.max(0, normalized)));
}

function pickPrimaryDomain(vector: AiEcosystemVector): AiEcosystemDomain {
  return DOMAIN_ORDER.slice().sort((left, right) => vector[right] - vector[left])[0];
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
