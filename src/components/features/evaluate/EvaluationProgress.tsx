"use client";

import { useEffect, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Code2,
  Gavel,
  Hourglass,
  LineChart,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Workflow,
} from "lucide-react";
import type {
  EvaluationLogTone,
  EvaluationRunState,
  EvaluationStreamSection,
} from "@/components/features/evaluate/assessment-types";
import type { EvaluationDimension } from "@/lib/types";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type CompletedStage = {
  status: "completed";
  dimension: EvaluationDimension;
  title: string;
  icon: IconComponent;
  section: EvaluationStreamSection;
};

type ActiveStage = {
  status: "active";
  dimension: EvaluationDimension;
  title: string;
  icon: IconComponent;
  activeText: string;
};

type WaitingStage = {
  status: "waiting";
  dimension: EvaluationDimension;
  title: string;
  icon: IconComponent;
  waitingText: string;
};

type EvaluationStage = CompletedStage | ActiveStage | WaitingStage;

type EvaluationProgressProps = {
  evaluation: EvaluationRunState;
  onBack: () => void;
  onRetry: () => void;
  onRetrySave: () => void;
};

const dimensionOrder: EvaluationDimension[] = ["A", "B", "C", "D", "E", "F"];

const dimensionMeta: Record<
  EvaluationDimension,
  {
    title: string;
    icon: IconComponent;
    waitingText: string;
  }
> = {
  A: {
    title: "岗位定位",
    icon: MapPin,
    waitingText: "等待岗位定位评估...",
  },
  B: {
    title: "技术栈匹配",
    icon: Code2,
    waitingText: "等待技术栈解析...",
  },
  C: {
    title: "经验要求",
    icon: Workflow,
    waitingText: "等待经验要求比对...",
  },
  D: {
    title: "成长价值",
    icon: LineChart,
    waitingText: "等待成长价值分析...",
  },
  E: {
    title: "薪酬竞争力",
    icon: CircleDollarSign,
    waitingText: "等待薪酬竞争力判断...",
  },
  F: {
    title: "风险合规",
    icon: Gavel,
    waitingText: "等待风险合规复核...",
  },
};

export function EvaluationProgress({
  evaluation,
  onBack,
  onRetry,
  onRetrySave,
}: EvaluationProgressProps) {
  const progress = useVisibleProgress(evaluation);
  const stages = buildStages(evaluation);
  const isComplete = evaluation.status === "completed";
  const isFailed = evaluation.status === "failed";

  return (
    <div className="space-y-8">
      <EvaluationSummary evaluation={evaluation} progress={progress} />
      {isFailed ? (
        <FailurePanel
          message={evaluation.errorMessage ?? "岗位评估失败，请稍后重试。"}
          onBack={onBack}
          onRetry={onRetry}
        />
      ) : null}
      <section
        aria-label="六维评估进度"
        className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-[1fr_1.05fr_0.95fr]"
      >
        {stages.map((stage) => (
          <StageCard key={stage.dimension} stage={stage} />
        ))}
      </section>
      <ReasoningLog logs={evaluation.logs} />
      {isComplete ? (
        <ReportReadyPanel
          reportId={evaluation.reportId}
          saveErrorMessage={evaluation.saveErrorMessage}
          saveStatus={evaluation.saveStatus}
          onRetrySave={onRetrySave}
        />
      ) : null}
      <FloatingStatus
        isComplete={isComplete}
        reportId={evaluation.reportId}
        saveStatus={evaluation.saveStatus}
      />
    </div>
  );
}

function buildStages(evaluation: EvaluationRunState): EvaluationStage[] {
  const activeDimension =
    evaluation.activeDimension ??
    (evaluation.status === "evaluating"
      ? dimensionOrder.find(
          (dimension) => !evaluation.completedDimensions.includes(dimension),
        )
      : undefined);

  return dimensionOrder.map((dimension) => {
    const meta = dimensionMeta[dimension];
    const section = evaluation.sections[dimension];

    if (section) {
      return {
        status: "completed",
        dimension,
        title: section.title || meta.title,
        icon: meta.icon,
        section,
      };
    }

    if (evaluation.status === "evaluating" && activeDimension === dimension) {
      return {
        status: "active",
        dimension,
        title: meta.title,
        icon: meta.icon,
        activeText:
          evaluation.phase === "fallback"
            ? "同步评估接口正在生成完整报告..."
            : `正在评估 ${dimension} 维度...`,
      };
    }

    return {
      status: "waiting",
      dimension,
      title: meta.title,
      icon: meta.icon,
      waitingText: meta.waitingText,
    };
  });
}

function useVisibleProgress(evaluation: EvaluationRunState): number {
  const [progressTick, setProgressTick] = useState(0);

  useEffect(() => {
    if (evaluation.status !== "evaluating") {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setProgressTick((current) => current + 1);
    }, 900);

    return () => window.clearInterval(intervalId);
  }, [evaluation.startedAt, evaluation.status]);

  const calculatedProgress = calculateProgress(evaluation);
  const visibleProgress =
    evaluation.status === "evaluating"
      ? Math.max(
          calculatedProgress,
          calculateElapsedProgress(evaluation, progressTick),
        )
      : calculatedProgress;

  return Math.round(
    Math.max(
      0,
      Math.min(evaluation.status === "completed" ? 100 : 96, visibleProgress),
    ),
  );
}

function calculateElapsedProgress(
  evaluation: EvaluationRunState,
  progressTick: number,
): number {
  void progressTick;

  const startedAt = evaluation.startedAt ?? Date.now();
  const elapsedSeconds = Math.max(0, (Date.now() - startedAt) / 1000);
  const phaseBase =
    evaluation.phase === "fallback"
      ? 72
      : evaluation.phase === "evaluating"
        ? 28
        : evaluation.phase === "scanning_risks"
          ? 16
          : 8;
  const speed =
    evaluation.phase === "fallback"
      ? 1.8
      : evaluation.phase === "evaluating"
        ? 2.4
        : 3.2;

  return Math.min(getProgressCap(evaluation), phaseBase + elapsedSeconds * speed);
}

function calculateProgress(evaluation: EvaluationRunState): number {
  if (evaluation.status === "completed") {
    return 100;
  }

  const completedScore = evaluation.completedDimensions.length * 12;
  const riskScore = evaluation.risks.length > 0 || evaluation.phase !== "connecting" ? 14 : 0;
  const phaseBase =
    evaluation.phase === "fallback"
      ? 72
      : evaluation.phase === "evaluating"
        ? 28
        : evaluation.phase === "scanning_risks"
          ? 16
          : 8;
  const progress = phaseBase + riskScore + completedScore;

  if (evaluation.status === "failed") {
    return Math.min(96, Math.max(20, progress));
  }

  return Math.min(96, progress);
}

function getProgressCap(evaluation: EvaluationRunState): number {
  if (evaluation.phase === "fallback") {
    return 92;
  }

  if (evaluation.completedDimensions.length > 0) {
    return Math.min(94, 38 + evaluation.completedDimensions.length * 9);
  }

  if (evaluation.phase === "evaluating") {
    return 72;
  }

  if (evaluation.phase === "scanning_risks") {
    return 46;
  }

  return 28;
}

function EvaluationSummary({
  evaluation,
  progress,
}: {
  evaluation: EvaluationRunState;
  progress: number;
}) {
  const statusLabel = getStatusLabel(evaluation);
  const title = getAssessmentTitle(evaluation);
  return (
    <section className="rounded-[24px] border border-[var(--color-border-light)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[var(--color-primary-light)] px-3 py-1 text-xs font-bold leading-4 text-[var(--color-primary)]">
              {statusLabel}
            </span>
            <span className="text-sm font-medium leading-5 text-[var(--color-text-secondary)]">
              {evaluation.reportId
                ? `评估 ID: ${evaluation.reportId}`
                : evaluation.status === "completed" &&
                    evaluation.saveStatus === "failed"
                  ? "评估 ID: 未保存"
                : "评估 ID: 生成中"}
            </span>
          </div>
          <h1 className="text-[26px] font-semibold leading-9 text-[var(--color-text)] sm:text-[28px] sm:leading-[38px]">
            {evaluation.status === "completed" ? "评估完成" : "正在评估"}：{title}
          </h1>
          {evaluation.message ? (
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
              {evaluation.message}
            </p>
          ) : null}
        </div>

        <div className="w-full md:w-56">
          <div className="mb-2 flex items-center justify-between gap-3 md:justify-end">
            <span className="text-[22px] font-bold leading-[30px] text-[var(--color-primary)]">
              {progress}%
            </span>
            <span className="text-sm font-medium leading-5 text-[var(--color-text-secondary)]">
              整体进度
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-[var(--color-primary-light)]"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="整体评估进度"
          >
            <div
              className={`h-full rounded-full ${
                evaluation.status === "completed"
                  ? "bg-[var(--color-primary)]"
                  : "new-era-progress-flow"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          {evaluation.overallScore !== undefined ? (
            <p className="mt-2 text-right text-xs font-bold leading-4 text-[var(--color-primary)]">
              综合评分 {evaluation.overallScore.toFixed(1)} / 5.0
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function FailurePanel({
  message,
  onBack,
  onRetry,
}: {
  message: string;
  onBack: () => void;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-[18px] border border-[#e7beb8] bg-[#fff6f4] p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#f5e8e6] text-[var(--color-red)]">
            <AlertTriangle
              aria-hidden="true"
              className="size-5"
              strokeWidth={1.8}
            />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-6 text-[var(--color-text)]">
              评估失败
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
              {message}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-bold text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-surface)] active:scale-[0.98]"
            onClick={onBack}
            type="button"
          >
            <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.8} />
            返回修改
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
            onClick={onRetry}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.8} />
            重新评估
          </button>
        </div>
      </div>
    </section>
  );
}

function StageCard({ stage }: { stage: EvaluationStage }) {
  if (stage.status === "completed") {
    return <CompletedStageCard stage={stage} />;
  }

  if (stage.status === "active") {
    return <ActiveStageCard stage={stage} />;
  }

  return <WaitingStageCard stage={stage} />;
}

function CompletedStageCard({ stage }: { stage: CompletedStage }) {
  const Icon = stage.icon;
  const findings = stage.section.findings ?? stage.section.evidence ?? [];

  return (
    <article className="rounded-[18px] border border-[var(--color-border-light)] border-l-4 border-l-[var(--color-green)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)]">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex size-10 items-center justify-center rounded-[12px] bg-[#eaf0e8] text-[var(--color-green)]">
          <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </div>
        <CheckCircle2
          aria-hidden="true"
          className="size-5 fill-[#6b8e6b] text-[#6b8e6b]"
          strokeWidth={1.8}
        />
      </div>
      <div className="mb-3 flex items-start justify-between gap-4">
        <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
          {stage.title}
        </h2>
        {stage.section.score !== undefined ? (
          <span className="rounded-full bg-[#eaf0e8] px-2.5 py-1 text-xs font-bold text-[var(--color-green)]">
            {stage.section.score.toFixed(1)}
          </span>
        ) : null}
      </div>
      <div className="rounded-[14px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4">
        <p className="text-base leading-7 text-[var(--color-text-secondary)]">
          <span className="font-bold text-[var(--color-green)]">结论：</span>
          {stage.section.summary}
        </p>
        {findings[0] ? (
          <p className="mt-2 text-xs leading-5 text-[var(--color-muted)]">
            {findings[0]}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function ActiveStageCard({ stage }: { stage: ActiveStage }) {
  const Icon = stage.icon;

  return (
    <article className="relative overflow-hidden rounded-[18px] border border-[rgba(196,135,58,0.36)] border-l-4 border-l-[var(--color-primary)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-lg)] ring-2 ring-[rgba(196,135,58,0.08)]">
      <div className="absolute right-4 top-4 flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((dot) => (
          <span
            className="size-1.5 animate-bounce rounded-full bg-[var(--color-primary)]"
            key={dot}
            style={{ animationDelay: `${dot * 0.18}s` }}
          />
        ))}
      </div>
      <div className="mb-4 flex items-start justify-between">
        <div className="flex size-10 items-center justify-center rounded-[12px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
          <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </div>
      </div>
      <h2 className="mb-3 text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
        {stage.title}
      </h2>
      <div className="new-era-pulse-soft rounded-[14px] border border-[rgba(196,135,58,0.18)] bg-[var(--color-surface-hover)] p-4">
        <p className="flex items-center gap-2 text-base font-medium leading-6 text-[var(--color-primary)]">
          <LoaderCircle
            aria-hidden="true"
            className="size-4 animate-spin"
            strokeWidth={1.8}
          />
          {stage.activeText}
        </p>
        <div className="mt-3 space-y-2">
          {[48, 30].map((lineWidth, index) => (
            <div
              className={`h-2 overflow-hidden rounded-full bg-[rgba(138,134,128,0.22)] ${
                index === 1 ? "w-3/4" : "w-full"
              }`}
              key={`${lineWidth}-${index}`}
            >
              <div
                className="h-full rounded-full bg-[#d49a50]"
                style={{ width: `${lineWidth}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function WaitingStageCard({ stage }: { stage: WaitingStage }) {
  const Icon = stage.icon;

  return (
    <article className="rounded-[18px] border border-[var(--color-border-light)] bg-[rgba(255,255,255,0.58)] p-6 opacity-70 grayscale-[0.35]">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex size-10 items-center justify-center rounded-[12px] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
          <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </div>
        <Hourglass
          aria-hidden="true"
          className="size-5 text-[var(--color-muted)]"
          strokeWidth={1.8}
        />
      </div>
      <h2 className="mb-3 text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
        {stage.title}
      </h2>
      <div className="flex h-24 items-center justify-center rounded-[14px] border border-dashed border-[var(--color-border)] px-4 text-center">
        <span className="text-xs leading-4 text-[var(--color-text-secondary)]">
          {stage.waitingText}
        </span>
      </div>
    </article>
  );
}

function ReasoningLog({ logs }: { logs: EvaluationRunState["logs"] }) {
  return (
    <section
      className="rounded-[18px] bg-[#362f29] p-5 text-[#fbefe5] shadow-[var(--shadow-md)] sm:p-6"
      id="reasoning-log"
    >
      <div className="mb-4 flex flex-col gap-3 border-b border-[rgba(255,248,244,0.18)] pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-[var(--color-red)]" />
          <span className="size-3 rounded-full bg-[#f2bd74]" />
          <span className="size-3 rounded-full bg-[#9fc5da]" />
          <span className="ml-3 text-xs font-medium leading-4 opacity-80">
            AI Reasoning Log v2.4
          </span>
        </div>
        <span className="text-xs leading-4 opacity-60">
          New Era Evaluation Stream
        </span>
      </div>
      <div className="space-y-2 font-mono text-xs leading-5 opacity-90">
        {logs.map((log, index) => (
          <p className={getLogToneClass(log.tone)} key={`${log.text}-${index}`}>
            [{String(index + 1).padStart(2, "0")}] {log.text}
          </p>
        ))}
        <p className="animate-pulse text-[#fbefe5]">_</p>
      </div>
    </section>
  );
}

function ReportReadyPanel({
  onRetrySave,
  reportId,
  saveErrorMessage,
  saveStatus,
}: {
  onRetrySave: () => void;
  reportId?: number;
  saveErrorMessage?: string;
  saveStatus?: EvaluationRunState["saveStatus"];
}) {
  const saveFailed = saveStatus === "failed";
  const isSaving = saveStatus === "saving";

  return (
    <section className="rounded-[24px] border border-[rgba(196,135,58,0.32)] bg-[linear-gradient(135deg,#fff,#f8efe3)] p-5 shadow-[var(--shadow-md)] sm:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="mb-2 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-[var(--color-primary)]">
            Report Ready
          </p>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            {saveFailed
              ? "结果已生成，但保存失败"
              : isSaving
                ? "正在保存报告"
                : "评估结果已生成"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
            {saveFailed
              ? (saveErrorMessage ??
                "报告内容已保留，可打开报告页重试保存或重新提交。")
              : isSaving
                ? "报告内容仍保留在当前页面，请等待保存结果。"
              : "点击查看评估结果，进入完整报告页查看综合匹配度、风险扫描、技能覆盖和 AI 优化建议。"}
          </p>
        </div>
        {saveFailed ? (
          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-5 py-3 text-sm font-bold text-white shadow-[var(--shadow-sm)] transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
              onClick={onRetrySave}
              type="button"
            >
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.8} />
              重试保存
            </button>
            <Link
              className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-white px-5 py-3 text-sm font-bold text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-surface)] active:scale-[0.98]"
              href="/evaluate/report"
            >
              查看临时结果
              <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.8} />
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-[12px] border border-[var(--color-border)] bg-white px-5 py-3 text-sm font-bold text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-surface)] active:scale-[0.98]"
              href="/evaluate"
            >
              重新提交
            </Link>
          </div>
        ) : (
          <Link
            className={`inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-6 py-3 text-sm font-bold text-white shadow-[var(--shadow-sm)] transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98] ${
              isSaving ? "pointer-events-none opacity-70" : ""
            }`}
            href={buildReportHref(reportId)}
          >
            {isSaving ? "保存中..." : "查看评估结果"}
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.8} />
          </Link>
        )}
      </div>
    </section>
  );
}

function FloatingStatus({
  isComplete,
  reportId,
  saveStatus,
}: {
  isComplete: boolean;
  reportId?: number;
  saveStatus?: EvaluationRunState["saveStatus"];
}) {
  const saveFailed = saveStatus === "failed";
  const isSaving = saveStatus === "saving";

  return (
    <div className="fixed bottom-6 right-6 hidden flex-col items-center gap-2 xl:flex">
      <Link
        aria-label={isComplete ? "报告快捷入口" : "查看 AI 实时诊断"}
        className="flex size-14 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-[var(--shadow-md)] transition-transform hover:rotate-6 active:scale-[0.98]"
        href={isComplete ? buildReportHref(reportId) : "#reasoning-log"}
      >
        <Bot aria-hidden="true" className="size-6" strokeWidth={1.8} />
      </Link>
      <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium leading-4 text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)]">
        {isComplete
          ? saveFailed
            ? "报告待保存"
            : isSaving
              ? "报告保存中"
              : "报告已生成"
          : "AI 实时诊断中"}
      </span>
    </div>
  );
}

function getAssessmentTitle(evaluation: EvaluationRunState): string {
  if (evaluation.request.title) {
    return evaluation.request.title;
  }

  const parts = [evaluation.request.company, evaluation.request.role].filter(Boolean);

  return parts.length > 0 ? parts.join(" - ") : "待识别岗位";
}

function getStatusLabel(evaluation: EvaluationRunState): string {
  if (evaluation.status === "completed") {
    if (evaluation.saveStatus === "saving") {
      return "保存中";
    }

    if (evaluation.saveStatus === "failed") {
      return "待保存";
    }

    return "已完成";
  }

  if (evaluation.status === "failed") {
    return "失败";
  }

  if (evaluation.phase === "fallback") {
    return "同步评估中";
  }

  if (evaluation.phase === "scanning_risks") {
    return "风险扫描中";
  }

  return "进行中";
}

function getLogToneClass(tone: EvaluationLogTone): string {
  const toneClass: Record<EvaluationLogTone, string> = {
    amber: "text-[#f2bd74]",
    blue: "text-[#9fc5da]",
    green: "text-[#8eb18e]",
    red: "text-[#f0a49a]",
  };

  return toneClass[tone];
}

function buildReportHref(reportId?: number): string {
  return reportId ? `/evaluate/report?reportId=${reportId}` : "/evaluate/report";
}
