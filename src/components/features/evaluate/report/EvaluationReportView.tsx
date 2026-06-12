"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Info,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Verified,
} from "lucide-react";
import { EmployerSnapshot } from "@/components/features/evaluate/report/EmployerSnapshot";
import {
  keywords as demoKeywords,
  optimizationAdvice as demoOptimizationAdvice,
  reportSummary,
} from "@/components/features/evaluate/report/reportData";
import { SkillRadar } from "@/components/features/evaluate/report/SkillRadar";
import { ErrorState } from "@/components/ui/ErrorState";
import { RiskVerificationQuestions } from "@/components/features/risks/RiskVerificationQuestions";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import {
  clearDraftEvaluationReport,
  readDraftEvaluationReport,
  writeDraftEvaluationReport,
  type DraftEvaluationReport,
} from "./draftReportStorage";

type ReportLoadStatus = "idle" | "loading" | "ready" | "error";
type DraftSaveStatus = "idle" | "saving" | "saved" | "error";
type CopySummaryStatus = "idle" | "success" | "error";
type ApplicationAddStatus =
  | "idle"
  | "submitting"
  | "success"
  | "duplicate"
  | "error";
type RiskLevel = "critical" | "high" | "medium" | "low";
type RiskFeedbackUserLabel = "real_ai" | "fake_ai" | "borderline" | "unsure";
type RiskFeedbackType =
  | "false_positive"
  | "false_negative"
  | "confirmed_risk"
  | "wrong_severity"
  | "missing_signal"
  | "other";
type RiskFeedbackStatus = "idle" | "submitting" | "success" | "error";

type ReportDetailResponse =
  {
    ok: true;
    report: unknown;
  };

type ReportSaveResponse =
  {
    ok: true;
    reportId: number;
    report: unknown;
    saveStatus: "saved";
  };

type ApplicationCreateResponse = {
  ok: true;
  applicationId: number;
};

type RiskFeedbackResponse = {
  ok: true;
  feedback: RiskFeedbackItem;
  feedbackId: number;
};

type RiskFeedbackListResponse = {
  ok: true;
  count: number;
  feedback: RiskFeedbackItem[];
  limit: number;
};

type RiskFeedbackItem = {
  id: number;
  benchmarkJdId: string | null;
  company: string;
  createdAt: string;
  feedbackType: RiskFeedbackType;
  jdExcerpt: string;
  originalRiskLevel: RiskLevel;
  reportId: number | null;
  riskRuleVersion: string;
  role: string;
  signalId: string | null;
  signalText: string | null;
  sourceUrl: string | null;
  updatedAt: string;
  userLabel: RiskFeedbackUserLabel;
  userNote: string;
};

type KeywordItem = {
  label: string;
  tone: string;
};

type AdviceItem = {
  title: string;
  text: string;
};

type RiskReasonItem = {
  title: string;
  severity: RiskLevel;
  explanation?: string;
  excerpt?: string;
  matchTerms: string[];
};

type ReportDisplay = {
  role: string;
  company: string;
  department: string;
  score: string;
  scoreMax: string;
  scorePercent: number;
  scoreOverall: number;
  jdText: string;
  recommendation: string;
  benchmark: string;
  riskLevel: string;
  riskLevelRaw: RiskLevel;
  riskText: string;
  aiJobDecisionLabel: string;
  aiJobDecisionDescription: string;
  riskReasons: RiskReasonItem[];
  riskRuleVersion?: string;
  riskRuleVersionNotes: string[];
  updatedAt: string;
  riskFeedback: {
    jdExcerpt: string;
    signalId?: string;
    signalText?: string;
    sourceUrl?: string;
  };
  recommendedResumeName?: string;
  keywords: KeywordItem[];
  advice: AdviceItem[];
};

type RiskFeedbackChoice = {
  feedbackType: RiskFeedbackType;
  label: string;
  userLabel: RiskFeedbackUserLabel;
};

const demoReportDisplay: ReportDisplay = {
  ...reportSummary,
  scoreOverall: 4.2,
  jdText: `${reportSummary.role}\n${reportSummary.riskText}\n关键词：LLM、RAG、Prompt Engineering、PyTorch。`,
  riskLevelRaw: "low",
  aiJobDecisionLabel: "真 AI 岗倾向",
  aiJobDecisionDescription:
    "当前报告未命中高风险信号；真实判断仍需结合完整 JD、用工主体和面试确认。",
  riskReasons: [],
  riskRuleVersionNotes: [],
  riskFeedback: {
    jdExcerpt: reportSummary.riskText,
  },
  keywords: demoKeywords,
  advice: demoOptimizationAdvice,
};

const riskFeedbackChoices: RiskFeedbackChoice[] = [
  {
    feedbackType: "false_positive",
    label: "误报：其实是真 AI 岗",
    userLabel: "real_ai",
  },
  {
    feedbackType: "false_negative",
    label: "漏报：其实是假 AI 岗",
    userLabel: "fake_ai",
  },
  {
    feedbackType: "confirmed_risk",
    label: "确认：这就是假 AI 岗",
    userLabel: "fake_ai",
  },
  {
    feedbackType: "wrong_severity",
    label: "严重度不准，更像边界岗",
    userLabel: "borderline",
  },
  {
    feedbackType: "missing_signal",
    label: "缺少关键风险信号",
    userLabel: "fake_ai",
  },
];

export function EvaluationReportView({ reportId }: { reportId?: number }) {
  const router = useRouter();
  const [displayReport, setDisplayReport] = useState<ReportDisplay | null>(null);
  const [loadStatus, setLoadStatus] = useState<ReportLoadStatus>(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string>();
  const [draftReport, setDraftReport] = useState<DraftEvaluationReport | null>(
    null,
  );
  const [draftSaveStatus, setDraftSaveStatus] =
    useState<DraftSaveStatus>("idle");
  const [draftSaveMessage, setDraftSaveMessage] = useState<string>();
  const [copySummaryStatus, setCopySummaryStatus] =
    useState<CopySummaryStatus>("idle");
  const [applicationAddStatus, setApplicationAddStatus] =
    useState<ApplicationAddStatus>("idle");
  const copyFeedbackTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
    };
  }, []);

  function showCopySummaryFeedback(status: CopySummaryStatus) {
    setCopySummaryStatus(status);

    if (copyFeedbackTimerRef.current) {
      window.clearTimeout(copyFeedbackTimerRef.current);
    }

    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopySummaryStatus("idle");
      copyFeedbackTimerRef.current = undefined;
    }, 2400);
  }

  async function handleCopyReportSummary() {
    const report = readVisibleReport(displayReport, reportId);

    if (!report) {
      return;
    }

    try {
      await navigator.clipboard.writeText(buildReportSummaryText(report));
      showCopySummaryFeedback("success");
    } catch {
      showCopySummaryFeedback("error");
    }
  }

  useEffect(() => {
    if (!reportId) {
      return;
    }

    const currentReportId = reportId;
    const controller = new AbortController();

    async function loadInitialReport() {
      try {
        const nextDisplay = await fetchReportDisplay(
          currentReportId,
          controller.signal,
        );

        if (controller.signal.aborted) {
          return;
        }

        setDisplayReport(nextDisplay);
        setLoadStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "评估报告读取失败，请稍后重试。",
        );
        setLoadStatus("error");
      }
    }

    void loadInitialReport();

    return () => controller.abort();
  }, [reportId]);

  useEffect(() => {
    if (reportId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const draft = readDraftEvaluationReport();

      if (!draft) {
        setDraftReport(null);
        setDisplayReport(null);
        setDraftSaveStatus("idle");
        setDraftSaveMessage(undefined);
        setLoadStatus("idle");
        return;
      }

      const nextDisplay = buildDraftReportDisplay(draft);

      if (!nextDisplay) {
        setDraftReport(null);
        setDisplayReport(null);
        setDraftSaveStatus("idle");
        setDraftSaveMessage(undefined);
        setLoadStatus("idle");
        return;
      }

      setDraftReport(draft);
      setDisplayReport(nextDisplay);
      setDraftSaveStatus(draft.saveError ? "error" : "idle");
      setDraftSaveMessage(draft.saveError?.message);
      setLoadStatus("ready");
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [reportId]);

  async function reloadReport() {
    if (!reportId) {
      return;
    }

    const currentReportId = reportId;
    setLoadStatus("loading");
    setErrorMessage(undefined);

    try {
      const nextDisplay = await fetchReportDisplay(currentReportId);

      setDisplayReport(nextDisplay);
      setLoadStatus("ready");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "评估报告读取失败，请稍后重试。",
      );
      setLoadStatus("error");
    }
  }

  async function retrySaveDraftReport() {
    if (!draftReport || draftSaveStatus === "saving") {
      return;
    }

    setDraftSaveStatus("saving");
    setDraftSaveMessage(undefined);

    try {
      const body = await apiRequest<ReportSaveResponse>("/api/reports", {
        errorMessage: "报告保存失败，请稍后重试。",
        json: {
          jdText: draftReport.jdText,
          report: draftReport.report,
        },
        method: "POST",
      });

      clearDraftEvaluationReport();
      setDraftReport(null);
      setDisplayReport(null);
      setDraftSaveStatus("saved");
      setDraftSaveMessage("报告已保存。");
      setLoadStatus("loading");
      router.replace(`/evaluate/report?reportId=${body.reportId}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "报告保存失败，请稍后重试。";
      const nextDraft = {
        ...draftReport,
        saveError: {
          message,
        },
      };

      setDraftReport(nextDraft);
      setDraftSaveStatus("error");
      setDraftSaveMessage(message);
      writeDraftEvaluationReport({
        jdText: nextDraft.jdText,
        report: nextDraft.report,
        saveError: nextDraft.saveError,
      });
    }
  }

  async function handleAddToApplications() {
    if (
      applicationAddStatus === "submitting" ||
      applicationAddStatus === "success" ||
      applicationAddStatus === "duplicate"
    ) {
      return;
    }

    const report = displayReport ?? demoReportDisplay;

    setApplicationAddStatus("submitting");

    try {
      await apiRequest<ApplicationCreateResponse>("/api/applications", {
        errorMessage: "加入失败，请稍后重试。",
        json: {
          ...(reportId ? { reportId } : {}),
          company: report.company,
          role: report.role,
          scoreOverall: report.scoreOverall,
          riskLevel: report.riskLevelRaw,
          ...(report.recommendedResumeName
            ? { recommendedResumeName: report.recommendedResumeName }
            : {}),
          notes: "",
          tags: [],
          status: "to_apply",
        },
        method: "POST",
      });

      setApplicationAddStatus("success");
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        (error.status === 409 || error.code === "APPLICATION_ALREADY_EXISTS")
      ) {
        setApplicationAddStatus("duplicate");
        return;
      }

      setApplicationAddStatus("error");
    }
  }

  if (loadStatus === "loading") {
    return (
      <div className="space-y-8 pb-12 pt-5 sm:pt-8">
        <ReportTopBar
          copySummaryStatus={copySummaryStatus}
          onCopyReportSummary={handleCopyReportSummary}
          report={displayReport}
          reportId={reportId}
        />
        <ReportLoadingState />
      </div>
    );
  }

  if (reportId && loadStatus === "error") {
    return (
      <div className="space-y-8 pb-12 pt-5 sm:pt-8">
        <ReportTopBar
          copySummaryStatus={copySummaryStatus}
          onCopyReportSummary={handleCopyReportSummary}
          report={displayReport}
          reportId={reportId}
        />
        <ErrorState
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <button
                className="inline-flex items-center justify-center rounded-[12px] bg-[var(--color-primary)] px-5 py-2 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
                onClick={() => {
                  setLoadStatus("loading");
                  setErrorMessage(undefined);
                  void reloadReport();
                }}
                type="button"
              >
                重新加载
              </button>
              <Link
                className="inline-flex items-center justify-center rounded-[12px] border border-[var(--color-border)] bg-white px-5 py-2 text-sm font-bold text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-surface)] active:scale-[0.98]"
                href="/reports"
              >
                返回历史
              </Link>
            </div>
          }
          description={errorMessage}
          title="报告详情加载失败"
        />
      </div>
    );
  }

  const report = displayReport ?? demoReportDisplay;
  return (
    <div className="print-report space-y-8 pb-12 pt-5 sm:pt-8">
      <ReportTopBar
        copySummaryStatus={copySummaryStatus}
        onCopyReportSummary={handleCopyReportSummary}
        report={readVisibleReport(displayReport, reportId)}
        reportId={reportId}
      />
      {draftReport ? (
        <DraftSaveNotice
          message={draftSaveMessage}
          onRetrySave={retrySaveDraftReport}
          status={draftSaveStatus}
        />
      ) : null}
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <ReportHero report={report} />
        <RiskScanCard report={report} reportId={reportId} />
      </section>

      <section className="grid grid-cols-1 gap-8 md:grid-cols-12">
        <div className="space-y-8 md:col-span-8">
          <KeywordCloud keywords={report.keywords} />
          <OptimizationAdvice advice={report.advice} />
        </div>
        <div className="space-y-8 md:col-span-4">
          <SkillRadar />
          <EmployerSnapshot />
        </div>
      </section>

      <ReportActions
        onAddToApplications={handleAddToApplications}
        reportId={reportId}
        status={applicationAddStatus}
      />
    </div>
  );
}

function ReportTopBar({
  copySummaryStatus,
  onCopyReportSummary,
  report,
  reportId,
}: {
  copySummaryStatus: CopySummaryStatus;
  onCopyReportSummary: () => void;
  report: ReportDisplay | null;
  reportId?: number;
}) {
  function handlePrintReport() {
    window.focus();
    window.print();
  }

  const canCopyReportSummary = Boolean(report);
  const copySummaryMessage =
    copySummaryStatus === "success"
      ? "报告摘要已复制"
      : copySummaryStatus === "error"
        ? "复制失败，请稍后重试"
        : undefined;

  return (
    <header className="no-print flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <Link
        className="inline-flex w-fit items-center gap-2 rounded-full px-1 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)]"
        href={reportId ? "/reports" : "/evaluate"}
      >
        <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.8} />
        {reportId ? "返回历史" : "返回评估"}
      </Link>

      <div className="flex flex-wrap gap-3">
        <button
          aria-describedby={copySummaryMessage ? "copy-summary-feedback" : undefined}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-surface-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--color-surface)] disabled:active:scale-100"
          disabled={!canCopyReportSummary}
          onClick={onCopyReportSummary}
          type="button"
        >
          {copySummaryStatus === "success" ? (
            <CheckCircle2
              aria-hidden="true"
              className="size-4 text-[var(--color-green)]"
              strokeWidth={1.8}
            />
          ) : (
            <Copy aria-hidden="true" className="size-4" strokeWidth={1.8} />
          )}
          复制报告摘要
        </button>
        {copySummaryMessage ? (
          <span
            className={`inline-flex items-center rounded-full px-3 py-2 text-sm font-medium ${
              copySummaryStatus === "success"
                ? "bg-[#f6fbf4] text-[var(--color-green)]"
                : "bg-[#fff6f4] text-[var(--color-red)]"
            }`}
            id="copy-summary-feedback"
            role="status"
          >
            {copySummaryMessage}
          </span>
        ) : null}
        <button
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white shadow-[var(--shadow-sm)] transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
          onClick={handlePrintReport}
          type="button"
        >
          <Download aria-hidden="true" className="size-4" strokeWidth={1.8} />
          导出 PDF
        </button>
      </div>
    </header>
  );
}

function readVisibleReport(
  displayReport: ReportDisplay | null,
  reportId?: number,
): ReportDisplay | null {
  if (displayReport) {
    return displayReport;
  }

  return reportId ? null : demoReportDisplay;
}

function DraftSaveNotice({
  message,
  onRetrySave,
  status,
}: {
  message?: string;
  onRetrySave: () => void;
  status: DraftSaveStatus;
}) {
  const isSaving = status === "saving";
  const isSaved = status === "saved";
  const Icon = isSaved ? Verified : AlertTriangle;

  return (
    <section
      className={`no-print rounded-[18px] border p-5 shadow-[var(--shadow-sm)] sm:p-6 ${
        isSaved
          ? "border-[#d7e7d2] bg-[#f6fbf4]"
          : "border-[#efd4d0] bg-[#fff6f4]"
      }`}
      role="status"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-4">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-[12px] ${
              isSaved
                ? "bg-[#eaf0e8] text-[var(--color-green)]"
                : "bg-[#f5e8e6] text-[var(--color-red)]"
            }`}
          >
            <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-6 text-[var(--color-text)]">
              {isSaved ? "报告已保存" : "结果已生成，但保存失败"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
              {message ??
                "报告内容已保留在当前页面，可重试保存或返回评估页重新提交。"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            disabled={isSaving || isSaved}
            onClick={onRetrySave}
            type="button"
          >
            {isSaving ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
                strokeWidth={1.8}
              />
            ) : (
              <RefreshCw
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.8}
              />
            )}
            {isSaving ? "保存中..." : "重试保存"}
          </button>
          <Link
            className="inline-flex items-center justify-center rounded-[12px] border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-bold text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-surface)] active:scale-[0.98]"
            href="/evaluate"
          >
            重新提交
          </Link>
        </div>
      </div>
    </section>
  );
}

function ReportHero({ report }: { report: ReportDisplay }) {
  return (
    <section className="print-card relative overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8 lg:col-span-2">
      <div
        aria-hidden="true"
        className="absolute right-0 top-0 h-32 w-32 rounded-bl-[100px] bg-[var(--color-primary-light)] opacity-70"
      />
      <div className="relative">
        <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-light)] px-3 py-1 text-xs font-bold leading-4 text-[#6b4716]">
          <Verified aria-hidden="true" className="size-4" strokeWidth={1.8} />
          精准匹配评估
        </span>
        <h1 className="text-[28px] font-semibold leading-[38px] text-[var(--color-text)]">
          {report.role}
        </h1>
        <p className="mt-2 text-base font-medium leading-6 text-[var(--color-text-secondary)] sm:text-lg sm:leading-7">
          {report.company} · {report.department}
        </p>

        <div className="mt-7 flex flex-col gap-6 md:flex-row md:items-end md:gap-10">
          <div className="shrink-0">
            <p className="mb-1 text-xs font-medium uppercase leading-4 tracking-[0.08em] text-[var(--color-text-secondary)]">
              综合匹配度
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-[40px] font-bold leading-[52px] text-[var(--color-primary)]">
                {report.score}
              </span>
              <span className="text-[22px] font-semibold leading-[30px] text-[var(--color-text-secondary)]">
                / {report.scoreMax}
              </span>
            </div>
          </div>

          <div className="w-full min-w-0">
            <div
              aria-label="综合匹配度"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={report.scorePercent}
              className="h-2 overflow-hidden rounded-full bg-[var(--color-primary-light)]"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-[var(--color-primary)]"
                style={{ width: `${report.scorePercent}%` }}
              />
            </div>
            <div className="mt-2 flex flex-col gap-1 text-sm font-bold leading-5 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[var(--color-primary)]">
                {report.recommendation}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RiskScanCard({
  report,
  reportId,
}: {
  report: ReportDisplay;
  reportId?: number;
}) {
  const canLoadFeedbackHistory = Boolean(reportId);
  const [selectedChoice, setSelectedChoice] =
    useState<RiskFeedbackChoice | null>(null);
  const [userNote, setUserNote] = useState("");
  const [feedbackStatus, setFeedbackStatus] =
    useState<RiskFeedbackStatus>("idle");
  const [feedbackMessage, setFeedbackMessage] = useState<string>();
  const [feedbackHistory, setFeedbackHistory] = useState<RiskFeedbackItem[]>([]);
  const [feedbackHistoryStatus, setFeedbackHistoryStatus] =
    useState<"idle" | "loading" | "ready" | "error">("idle");
  const [feedbackHistoryMessage, setFeedbackHistoryMessage] =
    useState<string>();

  useEffect(() => {
    if (!reportId) {
      return;
    }

    let isMounted = true;

    async function loadFeedbackHistory() {
      setFeedbackHistoryStatus("loading");
      setFeedbackHistoryMessage(undefined);
      setFeedbackHistory([]);

      try {
        const body = await apiRequest<RiskFeedbackListResponse>(
          `/api/risk-feedback?reportId=${reportId}&limit=6`,
          {
            cache: "no-store",
            errorMessage: "风险反馈历史读取失败，请稍后重试。",
          },
        );

        if (!isMounted) {
          return;
        }

        setFeedbackHistory(body.feedback);
        setFeedbackHistoryStatus("ready");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setFeedbackHistoryStatus("error");
        setFeedbackHistoryMessage(
          error instanceof Error
            ? error.message
            : "风险反馈历史读取失败，请稍后重试。",
        );
      }
    }

    void loadFeedbackHistory();

    return () => {
      isMounted = false;
    };
  }, [reportId]);

  function handleChoiceSelect(choice: RiskFeedbackChoice) {
    setSelectedChoice(choice);
    setFeedbackStatus("idle");
    setFeedbackMessage(undefined);
  }

  async function handleSubmitRiskFeedback() {
    if (!selectedChoice || feedbackStatus === "submitting") {
      return;
    }

    setFeedbackStatus("submitting");
    setFeedbackMessage(undefined);

    try {
      const body = await apiRequest<RiskFeedbackResponse>("/api/risk-feedback", {
        errorMessage: "风险反馈保存失败，请稍后重试。",
        json: {
          ...(reportId ? { reportId } : {}),
          ...(report.riskFeedback.sourceUrl
            ? { sourceUrl: report.riskFeedback.sourceUrl }
            : {}),
          company: report.company,
          feedbackType: selectedChoice.feedbackType,
          jdExcerpt: report.riskFeedback.jdExcerpt,
          originalRiskLevel: report.riskLevelRaw,
          riskRuleVersion: report.riskRuleVersion ?? "未记录",
          role: report.role,
          ...(report.riskFeedback.signalId
            ? { signalId: report.riskFeedback.signalId }
            : {}),
          ...(report.riskFeedback.signalText
            ? { signalText: report.riskFeedback.signalText }
            : {}),
          userLabel: selectedChoice.userLabel,
          userNote,
        },
        method: "POST",
      });

      setSelectedChoice(null);
      setUserNote("");
      setFeedbackHistory((items) => [body.feedback, ...items].slice(0, 6));
      setFeedbackHistoryStatus("ready");
      setFeedbackStatus("success");
      setFeedbackMessage("已记录反馈，不会自动改动评分或规则。");
    } catch (error) {
      setFeedbackStatus("error");
      setFeedbackMessage(
        error instanceof Error
          ? error.message
          : "风险反馈保存失败，请稍后重试。",
      );
    }
  }

  return (
    <section className="new-era-hidden-scrollbar print-card flex max-h-[680px] flex-col overflow-y-auto overscroll-contain rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8 lg:max-h-[calc(100dvh-180px)]">
      <div>
        <div className="mb-4 flex items-center gap-2 text-[var(--color-blue)]">
          <ShieldCheck aria-hidden="true" className="size-5" strokeWidth={1.8} />
          <h2 className="text-sm font-bold leading-5">风险扫描</h2>
        </div>
        <span className="mb-4 inline-block rounded-full bg-[#eaf0e8] px-4 py-1 text-xs font-bold leading-4 text-[var(--color-green)]">
          {report.riskLevel}
        </span>
        <p className="text-base leading-7 text-[var(--color-text-secondary)]">
          {report.riskText}
        </p>
        <div className="mt-5 border-l-4 border-[var(--color-primary)] pl-4">
          <p className="text-sm font-bold leading-5 text-[var(--color-text)]">
            为什么判成{report.aiJobDecisionLabel}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
            {report.aiJobDecisionDescription}
          </p>
          {report.riskReasons.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {report.riskReasons.map((reason) => (
                <li
                  className="text-xs leading-5 text-[var(--color-text-secondary)]"
                  key={`${reason.title}-${reason.excerpt ?? reason.severity}`}
                >
                  <span className="font-bold text-[var(--color-text)]">
                    {riskLevelLabels[reason.severity]}：{reason.title}
                  </span>
                  {reason.explanation ? `。${reason.explanation}` : null}
                  {reason.excerpt ? (
                    <span className="block pt-1 text-[var(--color-muted)]">
                      原文证据：{reason.excerpt}
                    </span>
                  ) : null}
                  {reason.matchTerms.length > 0 ? (
                    <span className="block pt-1 text-[var(--color-muted)]">
                      命中关键词：{reason.matchTerms.join("、")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs leading-5 text-[var(--color-muted)]">
              当前没有命中高风险信号；仍建议结合 JD 原文、用工主体和面试信息核实。
            </p>
          )}
        </div>
      </div>
      <div className="no-print mt-6">
        <RiskVerificationQuestions
          company={report.company}
          jdText={report.jdText}
          role={report.role}
          surface="inline"
        />
      </div>
      <div className="no-print mt-6 border-t border-[var(--color-border)] pt-5">
        <p className="text-xs font-bold leading-4 text-[var(--color-text)]">
          风险判断反馈
        </p>
        <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
          反馈仅用于你后续查看和人工优化判断；不会上传、自动训练或自动改动评分、规则与投递状态。
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {riskFeedbackChoices.map((choice) => {
            const isSelected =
              selectedChoice?.feedbackType === choice.feedbackType;

            return (
              <button
                aria-pressed={isSelected}
                className={`inline-flex min-h-10 items-center justify-center rounded-[10px] border px-3 py-2 text-xs font-bold leading-4 transition-all active:scale-[0.98] ${
                  isSelected
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                    : "border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                }`}
                key={choice.feedbackType}
                onClick={() => handleChoiceSelect(choice)}
                type="button"
              >
                {choice.label}
              </button>
            );
          })}
        </div>
        <textarea
          className="mt-3 min-h-20 w-full resize-y rounded-[12px] border border-[var(--color-border)] bg-white px-3 py-2 text-sm leading-6 text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)]"
          maxLength={2000}
          onChange={(event) => {
            setUserNote(event.target.value);
            if (feedbackStatus !== "submitting") {
              setFeedbackStatus("idle");
              setFeedbackMessage(undefined);
            }
          }}
          placeholder="可选：补充为什么这是误报、漏报或严重度不准"
          value={userNote}
        />
        <button
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-4 py-2 text-sm font-bold leading-5 text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[var(--color-primary)] disabled:active:scale-100"
          disabled={!selectedChoice || feedbackStatus === "submitting"}
          onClick={handleSubmitRiskFeedback}
          type="button"
        >
          {feedbackStatus === "submitting" ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin"
              strokeWidth={1.8}
            />
          ) : (
            <Send aria-hidden="true" className="size-4" strokeWidth={1.8} />
          )}
          {feedbackStatus === "submitting" ? "记录中..." : "提交反馈"}
        </button>
        {feedbackMessage ? (
          <p
            className={`mt-2 text-xs font-medium leading-5 ${
              feedbackStatus === "error"
                ? "text-[var(--color-red)]"
                : "text-[var(--color-green)]"
            }`}
            role="status"
          >
            {feedbackMessage}
          </p>
        ) : null}
        <RiskFeedbackHistory
          canLoad={canLoadFeedbackHistory}
          feedback={
            canLoadFeedbackHistory
              ? feedbackHistory
              : feedbackHistory.filter((item) => item.reportId === null)
          }
          message={feedbackHistoryMessage}
          status={canLoadFeedbackHistory ? feedbackHistoryStatus : "idle"}
        />
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
        <span className="text-xs leading-4 text-[var(--color-text-secondary)]">
          更新于 {report.updatedAt}
        </span>
        <Info
          aria-hidden="true"
          className="size-5 text-[var(--color-muted)]"
          strokeWidth={1.8}
        />
      </div>
    </section>
  );
}

function RiskFeedbackHistory({
  canLoad,
  feedback,
  message,
  status,
}: {
  canLoad: boolean;
  feedback: RiskFeedbackItem[];
  message?: string;
  status: "idle" | "loading" | "ready" | "error";
}) {
  const summaryText = buildRiskFeedbackSummary(feedback);

  return (
    <div className="mt-5 border-t border-[var(--color-border)] pt-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold leading-4 text-[var(--color-text)]">
            最近反馈回看
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            用于人工复盘误报、漏报和严重度不准；不会自动训练模型或静默改规则。
          </p>
        </div>
        {summaryText ? (
          <span className="text-xs font-bold leading-5 text-[var(--color-primary)]">
            {summaryText}
          </span>
        ) : null}
      </div>

      {!canLoad && feedback.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-[var(--color-muted)]">
          当前报告暂未保存；保存后可以回看反馈历史。
        </p>
      ) : null}

      {status === "loading" ? (
        <p className="mt-3 text-xs leading-5 text-[var(--color-muted)]">
          正在读取本地反馈历史...
        </p>
      ) : null}

      {status === "error" ? (
        <p className="mt-3 text-xs leading-5 text-[var(--color-red)]">
          {message ?? "风险反馈历史读取失败。"}
        </p>
      ) : null}

      {canLoad && status === "ready" && feedback.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-[var(--color-muted)]">
          这份报告暂时还没有风险反馈。
        </p>
      ) : null}

      {feedback.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {feedback.map((item) => (
            <li
              className="border-l-2 border-[var(--color-border)] pl-3 text-xs leading-5 text-[var(--color-text-secondary)]"
              key={item.id}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-bold text-[var(--color-text)]">
                  {riskFeedbackTypeLabels[item.feedbackType]} · 用户标记：
                  {riskFeedbackUserLabelLabels[item.userLabel]}
                </span>
                <span className="text-[var(--color-muted)]">
                  {formatDate(item.createdAt)}
                </span>
              </div>
              <p className="mt-1">
                原风险等级：{riskLevelLabels[item.originalRiskLevel]}
              </p>
              {item.signalText ? (
                <p className="mt-1">关联信号：{item.signalText}</p>
              ) : null}
              {item.userNote ? (
                <p className="mt-1 text-[var(--color-text)]">
                  备注：{item.userNote}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function KeywordCloud({ keywords }: { keywords: KeywordItem[] }) {
  return (
    <section className="print-card rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
      <h2 className="mb-6 text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
        技术关键词
      </h2>
      <div className="flex flex-wrap gap-3">
        {keywords.map((keyword) => (
          <span
            className={`rounded-[12px] px-5 py-2 text-sm font-bold leading-5 ${keyword.tone}`}
            key={keyword.label}
          >
            {keyword.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function OptimizationAdvice({ advice }: { advice: AdviceItem[] }) {
  return (
    <section className="print-card rounded-[24px] border-2 border-dashed border-[rgba(196,135,58,0.24)] bg-[rgba(196,135,58,0.06)] p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <Sparkles
          aria-hidden="true"
          className="size-5 fill-[var(--color-primary)] text-[var(--color-primary)]"
          strokeWidth={1.8}
        />
        <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-primary)]">
          AI 优化建议
        </h2>
      </div>
      <ol className="space-y-4">
        {advice.map((item, index) => (
          <li className="flex gap-4" key={item.title}>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold leading-4 text-white">
              {index + 1}
            </span>
            <p className="text-base leading-7 text-[var(--color-text-secondary)]">
              <span className="font-bold text-[var(--color-text)]">
                {item.title}：
              </span>
              {item.text}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ReportLoadingState() {
  return (
    <>
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="min-h-64 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8 lg:col-span-2">
          <div className="h-7 w-36 animate-pulse rounded-full bg-[var(--color-border-light)]" />
          <div className="mt-6 h-8 w-72 max-w-full animate-pulse rounded-full bg-[var(--color-border-light)]" />
          <div className="mt-4 h-5 w-56 max-w-full animate-pulse rounded-full bg-[var(--color-border-light)]" />
          <div className="mt-10 h-12 w-32 animate-pulse rounded-[12px] bg-[var(--color-border-light)]" />
          <div className="mt-6 h-2 w-full animate-pulse rounded-full bg-[var(--color-border-light)]" />
        </div>
        <div className="min-h-64 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
          <div className="h-6 w-28 animate-pulse rounded-full bg-[var(--color-border-light)]" />
          <div className="mt-6 h-7 w-24 animate-pulse rounded-full bg-[var(--color-border-light)]" />
          <div className="mt-6 space-y-3">
            <div className="h-4 animate-pulse rounded-full bg-[var(--color-border-light)]" />
            <div className="h-4 w-4/5 animate-pulse rounded-full bg-[var(--color-border-light)]" />
          </div>
        </div>
      </section>
      <section className="grid grid-cols-1 gap-8 md:grid-cols-12">
        <div className="min-h-48 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] md:col-span-8" />
        <div className="min-h-48 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] md:col-span-4" />
      </section>
    </>
  );
}

function ReportActions({
  onAddToApplications,
  reportId,
  status,
}: {
  onAddToApplications: () => void;
  reportId?: number;
  status: ApplicationAddStatus;
}) {
  const isSubmitting = status === "submitting";
  const isDisabled =
    isSubmitting || status === "success" || status === "duplicate";
  const actionLabel =
    status === "submitting"
      ? "加入中..."
      : status === "success"
        ? "已加入投递清单"
        : status === "duplicate"
          ? "已在投递清单中"
          : "加入投递清单";
  const feedbackMessage =
    status === "success"
      ? "已加入投递清单"
      : status === "duplicate"
        ? "已在投递清单中"
        : status === "error"
          ? "加入失败，请稍后重试"
          : undefined;

  return (
    <footer className="no-print flex flex-col items-center gap-3">
      <div className="inline-flex flex-col gap-3 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-2 sm:flex-row">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-8 py-3 text-sm font-bold leading-5 text-white shadow-[var(--shadow-sm)] transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-[var(--color-primary)] disabled:active:scale-100"
          disabled={isDisabled}
          onClick={onAddToApplications}
          type="button"
        >
          {isSubmitting ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin"
              strokeWidth={1.8}
            />
          ) : status === "success" || status === "duplicate" ? (
            <CheckCircle2
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.8}
            />
          ) : (
            <Send aria-hidden="true" className="size-4" strokeWidth={1.8} />
          )}
          {actionLabel}
        </button>
        {reportId ? (
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-white px-8 py-3 text-sm font-bold leading-5 text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-surface)] active:scale-[0.98]"
            href={`/interview?reportId=${reportId}`}
          >
            <FileText aria-hidden="true" className="size-4" strokeWidth={1.8} />
            准备面试
          </Link>
        ) : (
          <button
            className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-white px-8 py-3 text-sm font-bold leading-5 text-[var(--color-text-secondary)] opacity-60"
            disabled
            type="button"
          >
            <FileText aria-hidden="true" className="size-4" strokeWidth={1.8} />
            准备面试
          </button>
        )}
      </div>
      {feedbackMessage ? (
        <p
          className={`text-sm font-medium ${
            status === "error"
              ? "text-[var(--color-red)]"
              : "text-[var(--color-green)]"
          }`}
          role="status"
        >
          {feedbackMessage}
        </p>
      ) : null}
    </footer>
  );
}

function buildDraftReportDisplay(
  draft: DraftEvaluationReport,
): ReportDisplay | null {
  return buildReportDisplay(
    {
      company: draft.report.job.company,
      role: draft.report.job.role,
      jdText: draft.jdText,
      score: draft.report.score,
      risks: draft.report.risks.signals,
      report: draft.report,
      createdAt: draft.report.generatedAt || draft.createdAt,
    },
    "临时报告",
  );
}

function buildReportDisplay(
  rawReport: unknown,
  benchmark: string,
): ReportDisplay | null {
  const reportRecord = toRecord(rawReport);

  if (!reportRecord) {
    return null;
  }

  const reportPayload = toRecord(reportRecord.report);
  const job = toRecord(reportPayload?.job);
  const score = toRecord(reportRecord.score);
  const reportScore = toRecord(reportPayload?.score);
  const risks = toRecord(reportPayload?.risks);
  const sections = Array.isArray(reportPayload?.sections)
    ? reportPayload.sections
    : [];
  const overall = clampScore(
    readNumber(score?.overall) ?? readNumber(reportScore?.overall) ?? 0,
  );
  const maxScore = Math.max(
    1,
    readNumber(score?.maxScore) ?? readNumber(reportScore?.maxScore) ?? 5,
  );
  const riskLevel = readRiskLevel(risks?.level) ?? "low";
  const recommendation =
    readString(reportPayload?.recommendation) ?? "建议结合简历匹配结果继续判断。";
  const riskText =
    readString(risks?.summary) ??
    "报告已读取，当前记录未提供额外风险摘要。";
  const riskReasons = buildRiskReasons(risks?.signals);
  const aiJobDecision = buildAiJobDecision(riskLevel, riskReasons);
  const riskFeedback = buildRiskFeedbackContext({
    fallbackExcerpt: riskText,
    reportPayload,
    reportRecord,
    risks,
  });

  return {
    role:
      readString(reportRecord.role) ?? readString(job?.role) ?? demoReportDisplay.role,
    company:
      readString(reportRecord.company) ??
      readString(job?.company) ??
      demoReportDisplay.company,
    department:
      readString(job?.department) ??
      readString(job?.aiDirection) ??
      "岗位评估报告",
    score: overall.toFixed(1),
    scoreMax: maxScore.toFixed(1),
    scorePercent: clampPercent(Math.round((overall / maxScore) * 100)),
    scoreOverall: overall,
    jdText: readString(reportRecord.jdText) ?? readString(reportPayload?.jdText) ?? riskText,
    recommendation,
    benchmark,
    riskLevel: riskLevelLabels[riskLevel],
    riskLevelRaw: riskLevel,
    riskText,
    aiJobDecisionLabel: aiJobDecision.label,
    aiJobDecisionDescription: aiJobDecision.description,
    riskReasons,
    riskRuleVersion: readString(risks?.ruleVersion),
    riskRuleVersionNotes: readStringArray(risks?.ruleVersionNotes),
    riskFeedback,
    updatedAt: formatDate(
      readString(reportRecord.createdAt) ?? readString(reportPayload?.generatedAt),
    ),
    recommendedResumeName:
      readString(reportRecord.recommendedResumeName) ??
      readString(reportPayload?.recommendedResumeName),
    keywords: buildKeywordItems([
      ...readStringArray(job?.techStack),
      ...readStringArray(job?.keywords),
    ]),
    advice: buildAdviceItems(sections, recommendation),
  };
}

async function fetchReportDisplay(
  reportId: number,
  signal?: AbortSignal,
): Promise<ReportDisplay> {
  const body = await apiRequest<ReportDetailResponse>(`/api/reports/${reportId}`, {
    cache: "no-store",
    errorMessage: "评估报告读取失败，请稍后重试。",
    signal,
  });

  const nextDisplay = buildReportDisplay(body.report, `报告 ID ${reportId}`);

  if (!nextDisplay) {
    throw new Error("报告数据不完整，请返回历史列表重新选择。");
  }

  return nextDisplay;
}

const riskLevelLabels: Record<RiskLevel, string> = {
  critical: "极高风险",
  high: "高风险",
  medium: "中风险",
  low: "低风险",
};

const riskSeverityRank: Record<RiskLevel, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const riskFeedbackTypeLabels: Record<RiskFeedbackType, string> = {
  false_positive: "误报",
  false_negative: "漏报",
  confirmed_risk: "确认风险",
  wrong_severity: "严重度不准",
  missing_signal: "缺少风险信号",
  other: "其他反馈",
};

const riskFeedbackUserLabelLabels: Record<RiskFeedbackUserLabel, string> = {
  real_ai: "真 AI 岗",
  fake_ai: "假 AI 岗",
  borderline: "边界岗",
  unsure: "不确定",
};

function buildRiskFeedbackSummary(feedback: RiskFeedbackItem[]): string | undefined {
  if (feedback.length === 0) {
    return undefined;
  }

  const counts = feedback.reduce<Partial<Record<RiskFeedbackType, number>>>(
    (result, item) => ({
      ...result,
      [item.feedbackType]: (result[item.feedbackType] ?? 0) + 1,
    }),
    {},
  );

  return Object.entries(counts)
    .map(
      ([type, count]) =>
        `${riskFeedbackTypeLabels[type as RiskFeedbackType]} ${count}`,
    )
    .join(" / ");
}

function buildKeywordItems(values: string[]): KeywordItem[] {
  const labels = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
    .slice(0, 10);

  if (labels.length === 0) {
    return demoReportDisplay.keywords;
  }

  return labels.map((label, index) => ({
    label,
    tone: demoKeywords[index % demoKeywords.length]?.tone ?? demoKeywords[0].tone,
  }));
}

function buildAdviceItems(sections: unknown[], fallback: string): AdviceItem[] {
  const items = sections.flatMap((section) => {
    const record = toRecord(section);
    const title = readString(record?.title) ?? "优化建议";

    return readStringArray(record?.suggestions).slice(0, 1).map((text) => ({
      title,
      text,
    }));
  });

  if (items.length > 0) {
    return items.slice(0, 3);
  }

  if (fallback) {
    return [{ title: "投递判断", text: fallback }];
  }

  return demoReportDisplay.advice;
}

function buildRiskReasons(value: unknown): RiskReasonItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const reasons: RiskReasonItem[] = [];

  for (const item of value) {
    const signal = toRecord(item);
    const severity = readRiskLevel(signal?.severity);
    const title =
      readString(signal?.signal) ??
      readString(signal?.title) ??
      readString(signal?.category);

    if (!signal || !severity || !title) {
      continue;
    }

    const explanation = readString(signal.explanation);
    const excerpt = readString(signal.excerpt);

    reasons.push({
      title,
      severity,
      ...(explanation ? { explanation } : {}),
      ...(excerpt ? { excerpt } : {}),
      matchTerms: readStringArray(signal.matchTerms).slice(0, 8),
    });
  }

  return reasons
    .sort(
      (left, right) =>
        riskSeverityRank[right.severity] - riskSeverityRank[left.severity],
    )
    .slice(0, 3);
}

function buildAiJobDecision(
  riskLevel: RiskLevel,
  reasons: RiskReasonItem[],
): { label: string; description: string } {
  const reasonCount = reasons.length;
  const reasonText =
    reasonCount > 0
      ? `主要证据是 ${reasons.map((reason) => reason.title).join("、")}。`
      : "";

  if (riskLevel === "critical") {
    return {
      label: "假 AI 岗风险",
      description: `因为命中了极高风险信号，当前更接近培训贷、招转培或包装型假 AI 岗，需要优先停止投递并核实收费、贷款、用工主体和合同。${reasonText}`,
    };
  }

  if (riskLevel === "high") {
    return {
      label: "假 AI 岗风险",
      description: `因为风险信号已经达到高风险阈值，岗位可信度受到明显影响；除非招聘方能补充可核验的 AI 研发职责、技术栈和合同主体，否则不应按真 AI 岗推进。${reasonText}`,
    };
  }

  if (riskLevel === "medium") {
    return {
      label: "边界岗",
      description: `因为岗位存在需要追问的边界信号，但没有达到直接判定为假 AI 岗的高危阈值；面试前应确认模型、数据、评测、上线权限和团队分工。${reasonText}`,
    };
  }

  return {
    label: "真 AI 岗倾向",
    description:
      "当前未命中假 AI 岗或边界岗风险信号，可按低风险进入正常评估；这不等于最终背书，仍需结合 JD 原文和面试核实。",
  };
}

function buildRiskFeedbackContext({
  fallbackExcerpt,
  reportPayload,
  reportRecord,
  risks,
}: {
  fallbackExcerpt: string;
  reportPayload?: Record<string, unknown>;
  reportRecord: Record<string, unknown>;
  risks?: Record<string, unknown>;
}): ReportDisplay["riskFeedback"] {
  const primarySignal = readPrimaryRiskSignal(risks?.signals);
  const jdText = readString(reportRecord.jdText);
  const jdExcerpt =
    primarySignal.excerpt ??
    truncateText(jdText, 1_000) ??
    fallbackExcerpt;
  const sourceUrl =
    readString(reportRecord.sourceUrl) ??
    readString(reportPayload?.sourceUrl) ??
    readString(toRecord(reportPayload?.job)?.sourceUrl);

  return {
    jdExcerpt,
    ...(primarySignal.id ? { signalId: primarySignal.id } : {}),
    ...(primarySignal.text ? { signalText: primarySignal.text } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}

function readPrimaryRiskSignal(value: unknown): {
  excerpt?: string;
  id?: string;
  text?: string;
} {
  if (!Array.isArray(value)) {
    return {};
  }

  for (const item of value) {
    const signal = toRecord(item);

    if (!signal) {
      continue;
    }

    return {
      excerpt: readString(signal.excerpt),
      id: readString(signal.id),
      text:
        readString(signal.signal) ??
        readString(signal.title) ??
        readString(signal.category),
    };
  }

  return {};
}

function buildReportSummaryText(report: ReportDisplay): string {
  const keywordText =
    report.keywords.map((keyword) => keyword.label).filter(Boolean).join("、") ||
    "暂无";
  const adviceText =
    report.advice.length > 0
      ? report.advice
          .map((item, index) => `${index + 1}. ${item.title}：${item.text}`)
          .join("\n")
      : "暂无";

  return [
    `公司：${report.company}`,
    `岗位：${report.role}`,
    `综合分：${report.score} / ${report.scoreMax}`,
    `风险等级：${report.riskLevel}`,
    `真假 AI 岗判断：${report.aiJobDecisionLabel}`,
    `推荐结论：${report.recommendation}`,
    `关键技术栈：${keywordText}`,
    "主要建议：",
    adviceText,
  ].join("\n");
}

function formatDate(value: string | undefined): string {
  if (!value) {
    return "时间未知";
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);

  if (!Number.isFinite(date.getTime())) {
    return "时间未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function readRiskLevel(value: unknown): RiskLevel | undefined {
  if (
    value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low"
  ) {
    return value;
  }

  return undefined;
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

  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function truncateText(value: string | undefined, maxLength: number): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(5, value));
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
