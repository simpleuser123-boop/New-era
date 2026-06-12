"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  BarChart3,
  BadgeCheck,
  ChartNoAxesCombined,
  FileText,
  Info,
  Network,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import presetJds from "../../../../demo-data/preset-jds.json";
import type {
  EvaluationRunState,
  EvaluationStreamSection,
  JdAssessmentRequest,
} from "@/components/features/evaluate/assessment-types";
import { EvaluationProgress } from "@/components/features/evaluate/EvaluationProgress";
import { JdAssessmentForm } from "@/components/features/evaluate/JdAssessmentForm";
import {
  clearDraftEvaluationReport,
  writeDraftEvaluationReport,
} from "@/components/features/evaluate/report/draftReportStorage";
import type {
  AiEcosystemDomain,
  EvaluationDimension,
  EvaluationDimensionScore,
  EvaluationDimensionScores,
  EvaluationReport,
  ResumeDto,
  RiskSignal,
} from "@/lib/types";
import {
  apiRequest,
  fetchApi,
  readApiErrorFromResponse,
  readErrorMessage,
} from "@/lib/api-client";
import { PageContainer, PageHeader } from "@/components/features/AppShell";

const analysisFeatures = [
  {
    title: "技能图谱",
    description: "提取 JD 隐藏核心硬核技能",
    icon: Network,
  },
  {
    title: "文化契合",
    description: "分析团队氛围与潜在软素质",
    icon: UsersRound,
  },
  {
    title: "行业对标",
    description: "薪酬范围与同业稀缺度分析",
    icon: TrendingUp,
  },
  {
    title: "面试预测",
    description: "生成精准的面试高频问题",
    icon: BadgeCheck,
  },
];

const dimensionOrder: EvaluationDimension[] = ["A", "B", "C", "D", "E", "F"];
const MAX_STREAM_RETRY_COUNT = 2;
const STREAM_RETRY_DELAY_MS = 700;

type PresetJd = {
  id: string;
  title: string;
  company: string;
  role: string;
  type: "real_ai" | "fake_ai" | "borderline";
  aiDirection: string;
  salaryRange: string;
  location: string;
  experienceLevel: string;
  demoPurpose: string;
  jdText: string;
  expectedScore: number;
  expectedRiskLevel: "critical" | "high" | "medium" | "low";
  expectedRiskSignals: string[];
  expectedKeywords: string[];
};

const typedPresetJds = presetJds as PresetJd[];
const demoFallbackSaveError = {
  code: "API_UNAVAILABLE_DEMO_FALLBACK",
  message: "当前服务暂不可用，已生成临时报告并保留在本页。",
};

type DefaultResumeResponse = {
  ok: true;
  resume: ResumeDto | null;
};

export function JdAssessmentWorkspace() {
  const [evaluation, setEvaluation] = useState<EvaluationRunState | null>(null);
  const [formError, setFormError] = useState<string | undefined>();
  const [defaultResume, setDefaultResume] = useState<ResumeDto | null>(null);
  const [defaultResumeError, setDefaultResumeError] = useState<string | null>(null);
  const [isLoadingDefaultResume, setIsLoadingDefaultResume] = useState(true);
  const runIdRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);
  const isAssessmentRunningRef = useRef(false);

  useEffect(() => {
    let ignore = false;

    async function loadDefaultResume() {
      setIsLoadingDefaultResume(true);

      try {
        const body = await apiRequest<DefaultResumeResponse>(
          "/api/resumes/default",
          {
            cache: "no-store",
            errorMessage: "默认简历读取失败。",
          },
        );

        if (!ignore) {
          setDefaultResume(body.resume);
          setDefaultResumeError(null);
        }
      } catch (error) {
        if (!ignore) {
          setDefaultResume(null);
          setDefaultResumeError(
            error instanceof Error
              ? error.message
              : "默认简历读取失败，请稍后重试。",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoadingDefaultResume(false);
        }
      }
    }

    void loadDefaultResume();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      isAssessmentRunningRef.current = false;
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
    };
  }, []);

  const runFallbackEvaluation = useCallback(
    async (
      request: JdAssessmentRequest,
      runId: number,
      signal: AbortSignal,
    ) => {
      appendLog(runIdRef, setEvaluation, runId, {
        tone: "amber",
        text: "SSE 不可用，已切换为同步评估接口。",
      });
      setEvaluation((current) =>
        current && runIdRef.current === runId
          ? {
              ...current,
              phase: "fallback",
              fallbackUsed: true,
              message: "正在使用同步接口完成评估。",
            }
          : current,
      );

      const body = await apiRequest<EvaluateResponse>("/api/evaluate", {
        errorMessage: "岗位评估失败，请稍后重试。",
        json: buildEvaluationPayload(request),
        method: "POST",
        signal,
        timeoutMs: 30000,
      });

      const completedDimensions = [...dimensionOrder];
      const sections = Object.fromEntries(
        body.report.sections.map((section) => [
          section.dimension,
          section,
        ]),
      ) as EvaluationRunState["sections"];
      const saveFailed = body.saveStatus === "failed";
      const saveErrorMessage = readSaveErrorMessage(body.saveError);

      if (saveFailed) {
        writeDraftEvaluationReport({
          jdText: request.jdText,
          report: body.report,
          saveError: body.saveError,
        });
      } else {
        clearDraftEvaluationReport();
      }

      setEvaluation((current) =>
        current && runIdRef.current === runId
          ? {
              ...current,
              status: "completed",
              phase: "completed",
              sections,
              completedDimensions,
              risks: body.report.risks.signals,
              overallScore: body.score.overall,
              reportId: body.reportId ?? undefined,
              report: body.report,
              saveStatus: body.saveStatus,
              saveErrorMessage: saveFailed ? saveErrorMessage : undefined,
              activeDimension: undefined,
              message: saveFailed
                ? "结果已生成，但保存失败。报告内容已保留，可在报告页重试保存。"
                : "评估报告已生成，可点击查看评估结果进入报告页。",
              logs: [
                ...current.logs,
                ...(body.fallbackUsed
                  ? [
                      {
                        tone: "amber" as const,
                        text: "已生成可用的评估结果。",
                      },
                    ]
                  : []),
                {
                  tone: saveFailed ? "red" : "green",
                  text: saveFailed
                    ? saveErrorMessage
                    : `同步评估完成，报告 ID: ${body.reportId}。`,
                },
              ],
            }
          : current,
      );
    },
    [],
  );

  const startAssessment = useCallback(
    async (request: JdAssessmentRequest) => {
      if (isAssessmentRunningRef.current) {
        return;
      }

      const assessmentRequest = {
        ...request,
        resumeText: request.resumeText ?? defaultResume?.content.rawText,
        clientRequestId: request.clientRequestId ?? createClientRequestId(),
      };
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      activeControllerRef.current?.abort();
      const controller = new AbortController();
      activeControllerRef.current = controller;
      isAssessmentRunningRef.current = true;
      setFormError(undefined);
      setEvaluation(createInitialEvaluationState(assessmentRequest));

      try {
        await runStreamEvaluationWithRetry(
          assessmentRequest,
          runId,
          setEvaluation,
          runIdRef,
          controller.signal,
        );
      } catch (error) {
        if (runIdRef.current !== runId) {
          return;
        }

        try {
          await runFallbackEvaluation(assessmentRequest, runId, controller.signal);
        } catch (fallbackError) {
          if (runIdRef.current !== runId) {
            return;
          }

          const demoReport = buildDemoEvaluationReport(assessmentRequest);

          if (demoReport) {
            writeDraftEvaluationReport({
              jdText: assessmentRequest.jdText,
              report: demoReport,
              saveError: demoFallbackSaveError,
            });
            setEvaluation((current) =>
              current
                ? {
                    ...current,
                    status: "completed",
                    phase: "completed",
                    fallbackUsed: true,
                    sections: Object.fromEntries(
                      demoReport.sections.map((section) => [
                        section.dimension,
                        section,
                      ]),
                    ) as EvaluationRunState["sections"],
                    completedDimensions: [...dimensionOrder],
                    risks: demoReport.risks.signals,
                    overallScore: demoReport.score.overall,
                    report: demoReport,
                    saveStatus: "failed",
                    saveErrorMessage: demoFallbackSaveError.message,
                    activeDimension: undefined,
                    message: "当前服务暂不可用，已生成临时报告。",
                    logs: [
                      ...current.logs,
                      {
                        tone: "amber",
                        text: "已生成可用的评估结果。",
                      },
                    ],
                  }
                : current,
            );
            setFormError(undefined);
            return;
          }

          const message =
            fallbackError instanceof Error
              ? fallbackError.message
              : error instanceof Error
                ? error.message
                : "岗位评估失败，请稍后重试。";

          setEvaluation((current) =>
            current
              ? {
                  ...current,
                  status: "failed",
                  phase: "failed",
                  errorMessage: message,
                  message: "评估失败，可返回修改 JD 后重试。",
                  logs: [
                    ...current.logs,
                    {
                      tone: "red",
                      text: message,
                    },
                  ],
                }
              : current,
          );
          setFormError(message);
        }
      } finally {
        if (runIdRef.current === runId) {
          isAssessmentRunningRef.current = false;

          if (activeControllerRef.current === controller) {
            activeControllerRef.current = null;
          }
        }
      }
    },
    [defaultResume, runFallbackEvaluation],
  );

  async function retrySaveEvaluation() {
    if (!evaluation?.report || evaluation.saveStatus === "saving") {
      return;
    }

    const reportToSave = evaluation.report;
    const request = evaluation.request;

    setEvaluation((current) =>
      current?.report
        ? {
            ...current,
            saveStatus: "saving",
            saveErrorMessage: undefined,
            message: "正在重试保存报告。",
            logs: [
              ...current.logs,
              {
                tone: "amber",
                text: "正在重试保存报告。",
              },
            ],
          }
        : current,
    );

    try {
      const body = await apiRequest<ReportSaveResponse>("/api/reports", {
        errorMessage: "报告保存失败，请稍后重试。",
        json: {
          jdText: request.jdText,
          report: reportToSave,
        },
        method: "POST",
      });

      clearDraftEvaluationReport();
      setEvaluation((current) =>
        current
          ? {
              ...current,
              reportId: body.reportId,
              saveStatus: "saved",
              saveErrorMessage: undefined,
              message: "评估报告已保存，可点击查看评估结果进入报告页。",
              logs: [
                ...current.logs,
                {
                  tone: "green",
                  text: `报告已保存，ID: ${body.reportId}。`,
                },
              ],
            }
          : current,
      );
    } catch (saveError) {
      const message = readSaveErrorMessage(saveError);

      writeDraftEvaluationReport({
        jdText: request.jdText,
        report: reportToSave,
        saveError: {
          message,
        },
      });
      setEvaluation((current) =>
        current
          ? {
              ...current,
              saveStatus: "failed",
              saveErrorMessage: message,
              message:
                "结果已生成，但保存失败。报告内容已保留，可重试保存或重新提交。",
              logs: [
                ...current.logs,
                {
                  tone: "red",
                  text: message,
                },
              ],
            }
          : current,
      );
    }
  }

  function resetAssessment() {
    runIdRef.current += 1;
    isAssessmentRunningRef.current = false;
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    setEvaluation(null);
  }

  if (evaluation) {
    return (
      <>
        <EvaluateHeader
          defaultResume={defaultResume}
          isLoadingDefaultResume={isLoadingDefaultResume}
        />
        <PageContainer className="pb-12 pt-4">
          <EvaluationProgress
            evaluation={evaluation}
            onRetry={() =>
              startAssessment({
                ...evaluation.request,
                clientRequestId: createClientRequestId(),
              })
            }
            onRetrySave={retrySaveEvaluation}
            onBack={resetAssessment}
          />
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <EvaluateHeader
        defaultResume={defaultResume}
        isLoadingDefaultResume={isLoadingDefaultResume}
      />
      <PageContainer>
        <div className="space-y-8">
          <ResumeContextNotice
            defaultResume={defaultResume}
            error={defaultResumeError}
            isLoading={isLoadingDefaultResume}
          />
          <JdAssessmentForm
            errorMessage={formError}
            onStartAssessment={startAssessment}
          />
          <AnalysisFeatures />
        </div>
        <footer className="px-5 py-10 text-center">
          <p className="text-xs leading-4 text-[var(--color-muted)]">
            Powered by New Era AI Models · 企业级智能招聘分析引擎
          </p>
        </footer>
      </PageContainer>
    </>
  );
}

function EvaluateHeader({
  defaultResume,
  isLoadingDefaultResume,
}: {
  defaultResume: ResumeDto | null;
  isLoadingDefaultResume: boolean;
}) {
  return (
    <PageHeader
      actions={
        <div className="inline-flex w-fit max-w-full items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-3 py-2">
          <Info
            aria-hidden="true"
            className="size-[18px] shrink-0 text-[var(--color-primary)]"
            strokeWidth={1.8}
          />
          <span className="text-xs leading-4 text-[var(--color-text-secondary)]">
            {isLoadingDefaultResume
              ? "正在读取默认简历"
              : defaultResume
                ? `默认简历：${defaultResume.name}`
              : "尚未设置默认简历"}
          </span>
        </div>
      }
      description="基于 6 维模型，深度解析岗位价值与能力匹配度。"
      icon={<BarChart3 aria-hidden="true" className="size-5" strokeWidth={1.8} />}
      title="岗位深度评估"
    />
  );
}

function ResumeContextNotice({
  defaultResume,
  error,
  isLoading,
}: {
  defaultResume: ResumeDto | null;
  error: string | null;
  isLoading: boolean;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 pt-4 lg:grid-cols-[1.4fr_0.8fr]">
      <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
        <div className="flex gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#e8f0f5] text-[var(--color-blue)]">
            <FileText aria-hidden="true" className="size-5" strokeWidth={1.8} />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-6 text-[var(--color-text)]">
              {isLoading
                ? "正在读取默认简历上下文"
                : defaultResume
                  ? `已加载默认简历：${defaultResume.name}`
                  : "尚未设置默认简历"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
              {error
                ? error
                : defaultResume
                  ? defaultResume.content.rawText
                    ? "评估会结合这份简历的原始文本，优先识别高匹配机会和潜在风险。"
                    : "默认简历缺少原始文本，本次仍可正常完成岗位评估。"
                  : "本次仍可正常完成岗位评估。需要简历匹配上下文时，请先设置默认简历。"}
            </p>
            {!isLoading && !defaultResume ? (
              <Link
                className="mt-3 inline-flex text-sm font-bold text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary-hover)]"
                href="/resume"
              >
                前往简历管理
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <Link
        className="group flex items-center justify-between rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-px hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-lg)]"
        href="/reports"
      >
        <div className="flex items-center gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
            <ChartNoAxesCombined
              aria-hidden="true"
              className="size-5"
              strokeWidth={1.8}
            />
          </div>
          <div>
            <p className="text-base font-semibold leading-6 text-[var(--color-text)]">
              查看评估历史
            </p>
            <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
              最近报告与岗位决策记录
            </p>
          </div>
        </div>
        <span className="text-sm font-bold text-[var(--color-primary)] transition-transform group-hover:translate-x-1">
          查看
        </span>
      </Link>
    </section>
  );
}

function AnalysisFeatures() {
  return (
    <section className="grid grid-cols-1 gap-4 border-t border-[var(--color-border)] pt-8 sm:grid-cols-2 lg:grid-cols-4">
      {analysisFeatures.map((feature) => {
        const Icon = feature.icon;

        return (
          <article
            className="rounded-[18px] border border-transparent p-5 text-center transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-surface)]"
            key={feature.title}
          >
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-[14px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
              <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
            </div>
            <h3 className="text-sm font-semibold leading-5 text-[var(--color-text)]">
              {feature.title}
            </h3>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
              {feature.description}
            </p>
          </article>
        );
      })}
    </section>
  );
}

function createInitialEvaluationState(
  request: JdAssessmentRequest,
): EvaluationRunState {
  return {
    status: "evaluating",
    phase: "connecting",
    request,
    sections: {},
    completedDimensions: [],
    logs: [
      {
        tone: "amber",
        text: "正在连接流式评估接口。",
      },
    ],
    risks: [],
    startedAt: Date.now(),
    message: "正在启动岗位评估。",
  };
}

async function runStreamEvaluation(
  request: JdAssessmentRequest,
  runId: number,
  setEvaluation: Dispatch<SetStateAction<EvaluationRunState | null>>,
  runIdRef: MutableRefObject<number>,
  signal: AbortSignal,
) {
  const response = await fetchApi("/api/evaluate/stream", {
    errorMessage: "流式评估接口暂不可用。",
    json: buildEvaluationPayload(request),
    method: "POST",
    headers: {
      Accept: "text/event-stream",
    },
    signal,
    timeoutMs: 30000,
  });

  if (!response.ok) {
    throw new Error(await readApiErrorFromResponse(response, "流式评估接口暂不可用。"));
  }

  if (!response.body) {
    throw new Error("流式评估接口暂不可用。");
  }

  setEvaluation((current) =>
    current && runIdRef.current === runId
      ? {
          ...current,
          message: "流式评估已连接，正在扫描岗位风险。",
          logs: [
            ...current.logs,
            {
              tone: "blue",
              text: "SSE 连接已建立。",
            },
          ],
        }
      : current,
  );

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedDone = false;
  const cancelReaderOnAbort = () => {
    void reader.cancel().catch(() => undefined);
  };

  if (signal.aborted) {
    await reader.cancel();
    reader.releaseLock();
    return;
  }

  signal.addEventListener("abort", cancelReaderOnAbort, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        if (signal.aborted || runIdRef.current !== runId) {
          return;
        }

        break;
      }

      if (runIdRef.current !== runId) {
        await reader.cancel();
        return;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      const events = buffer.split(/\n\n/);
      buffer = events.pop() ?? "";

      for (const rawEvent of events) {
        const event = parseSseEvent(rawEvent);

        if (!event) {
          continue;
        }

        if (handleSseEvent(event, request, runId, setEvaluation, runIdRef)) {
          receivedDone = true;
        }

        if (event.type === "error") {
          throw new Error(readStreamErrorMessage(event));
        }
      }
    }
    const finalEvent = parseSseEvent(buffer);

    if (finalEvent) {
      if (handleSseEvent(finalEvent, request, runId, setEvaluation, runIdRef)) {
        receivedDone = true;
      }

      if (finalEvent.type === "error") {
        throw new Error(readStreamErrorMessage(finalEvent));
      }
    }

    if (!receivedDone) {
      throw new Error("流式评估未返回完成事件。");
    }
  } finally {
    signal.removeEventListener("abort", cancelReaderOnAbort);
    reader.releaseLock();
  }
}

async function runStreamEvaluationWithRetry(
  request: JdAssessmentRequest,
  runId: number,
  setEvaluation: Dispatch<SetStateAction<EvaluationRunState | null>>,
  runIdRef: MutableRefObject<number>,
  signal: AbortSignal,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_STREAM_RETRY_COUNT; attempt += 1) {
    if (signal.aborted) {
      return;
    }

    if (attempt > 0) {
      setEvaluation((current) =>
        current && runIdRef.current === runId
          ? {
              ...current,
              message: `SSE 连接中断，正在第 ${attempt} 次重试。`,
            }
          : current,
      );
      appendLog(runIdRef, setEvaluation, runId, {
        tone: "amber",
          text: `SSE 第 ${attempt}/${MAX_STREAM_RETRY_COUNT} 次重试连接中。`,
        });
      await wait(STREAM_RETRY_DELAY_MS * attempt, signal);

      if (runIdRef.current !== runId) {
        return;
      }
    }

    try {
      await runStreamEvaluation(
        request,
        runId,
        setEvaluation,
        runIdRef,
        signal,
      );
      return;
    } catch (error) {
      if (signal.aborted || runIdRef.current !== runId) {
        return;
      }

      lastError = error;

      if (attempt < MAX_STREAM_RETRY_COUNT) {
        appendLog(runIdRef, setEvaluation, runId, {
          tone: "amber",
          text: `SSE 连接失败：${readErrorMessage(
            error,
            "流式评估接口暂不可用。",
          )}`,
        });
        continue;
      }

      appendLog(runIdRef, setEvaluation, runId, {
        tone: "red",
        text: "SSE 重试失败，准备切换到同步评估接口。",
      });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("流式评估接口暂不可用。");
}

function buildEvaluationPayload(request: JdAssessmentRequest) {
  return {
    jdText: request.jdText,
    resumeText: request.resumeText,
    company: request.company,
    role: request.role,
    sourceUrl: request.sourceUrl,
    demoId: request.demoId,
    clientRequestId: request.clientRequestId,
  };
}

function buildDemoEvaluationReport(
  request: JdAssessmentRequest,
): EvaluationReport | null {
  const preset =
    typedPresetJds.find((job) => job.id === request.demoId) ??
    typedPresetJds.find((job) => request.jdText.trim() === job.jdText.trim());

  if (!preset) {
    return null;
  }

  const dimensions = buildDemoDimensionScores(preset);
  const riskScore =
    preset.expectedRiskSignals.length * getDemoRiskWeight(preset.expectedRiskLevel);
  const risks = {
    level: preset.expectedRiskLevel,
    summary:
      preset.expectedRiskSignals.length > 0
        ? `已识别 ${preset.expectedRiskSignals.length} 个重点风险信号。`
        : "当前未识别高危风险信号。",
    recommendation: getDemoRiskRecommendation(preset.expectedRiskLevel),
    totalWeight: riskScore,
    ...(preset.expectedRiskLevel === "critical"
      ? { scoreCap: 1.5 }
      : preset.expectedRiskLevel === "high"
        ? { scoreCap: 2.5 }
        : {}),
    signals: preset.expectedRiskSignals.map((signal, index) => ({
      id: `${preset.id}-demo-risk-${index}`,
      signal,
      excerpt: signal,
      severity: preset.expectedRiskLevel,
      source: "dictionary" as const,
      category: "风险信号",
      explanation: "当前结果可作为初步判断，请结合岗位原文继续判断。",
      advice: getDemoRiskRecommendation(preset.expectedRiskLevel),
      weight: getDemoRiskWeight(preset.expectedRiskLevel),
      matchTerms: [signal],
    })),
  };

  return {
    job: {
      company: request.company ?? preset.company,
      role: request.role ?? preset.role,
      location: preset.location,
      salaryRange: preset.salaryRange,
      aiDirection: preset.aiDirection,
      experienceLevel: preset.experienceLevel,
      techStack: preset.expectedKeywords,
      keywords: preset.expectedKeywords,
      ecosystem: {
        primaryDomain: readPresetDomain(preset.aiDirection),
        vector: buildDemoEcosystemVector(preset.aiDirection),
        evidence: preset.expectedKeywords.slice(0, 6),
      },
    },
    score: {
      overall: preset.expectedScore,
      maxScore: 5,
      dimensions,
    },
    risks,
    sections: dimensionOrder.map((dimension) => ({
      dimension,
      title: dimensions[dimension].title,
      score: dimensions[dimension].score,
      summary: dimensions[dimension].summary,
      findings: dimensions[dimension].evidence,
      suggestions: dimensions[dimension].suggestions,
    })),
    recommendation:
      preset.expectedRiskLevel === "critical" || preset.expectedRiskLevel === "high"
        ? "建议谨慎推进或放弃该岗位，优先核实风险信号。"
        : "可继续评估岗位，并结合简历匹配判断投递优先级。",
    generatedAt: new Date().toISOString(),
  };
}

function buildDemoDimensionScores(
  preset: PresetJd,
): EvaluationDimensionScores {
  const baseScore = preset.expectedScore;
  const riskScore =
    preset.expectedRiskLevel === "low"
      ? 4.6
      : preset.expectedRiskLevel === "medium"
        ? 3.1
        : preset.expectedRiskLevel === "high"
          ? 1.8
          : 0.8;

  return {
    A: makeDemoDimensionScore("A", baseScore, {
      summary: `岗位定位为${preset.aiDirection}，可继续结合岗位职责判断方向匹配度。`,
      evidence: [preset.demoPurpose, `岗位：${preset.title}`, `方向：${preset.aiDirection}`],
      suggestions: ["面试时继续确认团队投入、AI 工作占比和上线指标。"],
    }),
    B: makeDemoDimensionScore("B", baseScore, {
      summary: `识别到 ${preset.expectedKeywords.length} 个关键技术关键词，可据此判断技术栈匹配度。`,
      evidence: preset.expectedKeywords.slice(0, 8),
      suggestions: ["重点核实这些技术在岗位中的实际使用深度。"],
    }),
    C: makeDemoDimensionScore("C", baseScore, {
      summary: `经验要求为${preset.experienceLevel}，可用于判断经验层级与岗位门槛。`,
      evidence: [preset.experienceLevel, preset.salaryRange],
      suggestions: ["结合候选人真实项目年限判断是否匹配。"],
    }),
    D: makeDemoDimensionScore("D", baseScore, {
      summary: "成长价值按岗位信息估算，重点用于说明真 AI 岗与包装岗的差异。",
      evidence: [preset.demoPurpose],
      suggestions: ["继续追问模型、数据、评测、上线权限和团队分工。"],
    }),
    E: makeDemoDimensionScore("E", baseScore, {
      summary: `薪资范围为${preset.salaryRange}，不代表实时招聘承诺。`,
      evidence: [preset.salaryRange, preset.location],
      suggestions: ["确认薪资结构、试用期折扣和是否存在培训收费。"],
    }),
    F: makeDemoDimensionScore("F", riskScore, {
      summary:
        preset.expectedRiskSignals.length > 0
          ? `已识别 ${preset.expectedRiskSignals.length} 个风险信号。`
          : "未识别到高危风险信号。",
      evidence:
        preset.expectedRiskSignals.length > 0
          ? preset.expectedRiskSignals
          : ["未出现培训收费、传统开发包装或过度承诺信号。"],
      suggestions: [getDemoRiskRecommendation(preset.expectedRiskLevel)],
    }),
  };
}

function makeDemoDimensionScore(
  dimension: EvaluationDimension,
  score: number,
  content: {
    summary: string;
    evidence: string[];
    suggestions: string[];
  },
): EvaluationDimensionScore {
  return {
    dimension,
    title: getDimensionTitle(dimension),
    weight: getDimensionWeight(dimension),
    score: clampDemoScore(score),
    summary: content.summary,
    evidence: content.evidence,
    suggestions: content.suggestions,
  };
}

function buildDemoEcosystemVector(aiDirection: string) {
  const primaryDomain = readPresetDomain(aiDirection);

  return {
    llm_application: primaryDomain === "llm_application" ? 86 : 8,
    ai_infra: primaryDomain === "ai_infra" ? 86 : 8,
    algorithm_research: primaryDomain === "algorithm_research" ? 86 : 8,
    embodied_ai: primaryDomain === "embodied_ai" ? 86 : 2,
    ai_safety: primaryDomain === "ai_safety" ? 86 : 8,
  };
}

function readPresetDomain(aiDirection: string): AiEcosystemDomain {
  if (aiDirection.includes("Infra")) {
    return "ai_infra";
  }

  if (aiDirection.includes("算法")) {
    return "algorithm_research";
  }

  if (aiDirection.includes("具身")) {
    return "embodied_ai";
  }

  if (aiDirection.includes("安全")) {
    return "ai_safety";
  }

  return "llm_application";
}

function getDemoRiskWeight(level: PresetJd["expectedRiskLevel"]): number {
  if (level === "critical") {
    return 5;
  }

  if (level === "high") {
    return 3;
  }

  if (level === "medium") {
    return 2;
  }

  return 1;
}

function getDemoRiskRecommendation(level: PresetJd["expectedRiskLevel"]): string {
  if (level === "critical") {
    return "建议停止投递，并优先核实培训收费、贷款分期、包就业承诺和合同主体。";
  }

  if (level === "high") {
    return "建议谨慎推进，要求对方明确 AI 研发职责占比、真实技术栈和交付模式。";
  }

  if (level === "medium") {
    return "建议继续沟通，但重点追问模型、数据、评测、上线权限和团队分工。";
  }

  return "可进入正常评估流程，继续结合技术栈深度、团队背景和成长空间判断岗位质量。";
}

function getDimensionWeight(dimension: EvaluationDimension): number {
  const weights: Record<EvaluationDimension, number> = {
    A: 15,
    B: 25,
    C: 20,
    D: 15,
    E: 10,
    F: 15,
  };

  return weights[dimension];
}

function clampDemoScore(value: number): number {
  return Math.round(Math.min(5, Math.max(0, value)) * 10) / 10;
}

function readSaveErrorMessage(error: unknown): string {
  if (
    isRecord(error) &&
    typeof error.message === "string" &&
    error.message.trim().length > 0
  ) {
    return error.message.trim();
  }

  return "结果已生成，但保存失败。报告内容已保留，可稍后重试保存。";
}

function createClientRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function handleSseEvent(
  event: StreamEvent,
  request: JdAssessmentRequest,
  runId: number,
  setEvaluation: Dispatch<SetStateAction<EvaluationRunState | null>>,
  runIdRef: MutableRefObject<number>,
): boolean {
  if (runIdRef.current !== runId) {
    return false;
  }

  if (event.type === "phase") {
    setEvaluation((current) =>
      current
        ? {
            ...current,
            phase: event.phase === "scanning_risks" ? "scanning_risks" : "evaluating",
            activeDimension: event.section,
            message:
              event.phase === "scanning_risks"
                ? "正在扫描培训贷、伪 AI 岗和外包驻场等风险信号。"
                : `正在评估 ${event.section ?? "A"} 维度。`,
            logs: [
              ...current.logs,
              {
                tone: event.phase === "scanning_risks" ? "amber" : "blue",
                text:
                  event.phase === "scanning_risks"
                    ? "风险扫描开始。"
                    : `进入 ${event.section ?? "A"} 维评估。`,
              },
            ],
          }
        : current,
    );
    return false;
  }

  if (event.type === "risks") {
    setEvaluation((current) =>
      current
        ? {
            ...current,
            risks: event.risks,
            logs: [
              ...current.logs,
              {
                tone: event.risks.length > 0 ? "amber" : "green",
                text:
                  event.risks.length > 0
                    ? `识别到 ${event.risks.length} 个风险信号。`
                    : "未命中明显风险信号。",
              },
            ],
          }
        : current,
    );
    return false;
  }

  if (event.type === "section") {
    const dimension = event.section;
    const nextDimension = dimensionOrder[dimensionOrder.indexOf(dimension) + 1];

    setEvaluation((current) =>
      current
        ? {
            ...current,
            phase: "evaluating",
            activeDimension: nextDimension,
            sections: {
              ...current.sections,
              [dimension]: normalizeStreamSection(dimension, event.data),
            },
            completedDimensions: uniqueDimensions([
              ...current.completedDimensions,
              dimension,
            ]),
            message: nextDimension
              ? `已完成 ${dimension} 维度，正在评估 ${nextDimension} 维度。`
              : "六维评估已完成，正在生成最终报告。",
            logs: [
              ...current.logs,
              {
                tone: "green",
                text: `${dimension} 维评估完成。`,
              },
            ],
          }
        : current,
    );
    return false;
  }

  if (event.type === "score") {
    setEvaluation((current) =>
      current
        ? {
            ...current,
            overallScore: event.overall,
            logs: [
              ...current.logs,
              {
                tone: "green",
                text: `综合评分 ${event.overall.toFixed(1)} / 5.0。`,
              },
            ],
          }
        : current,
    );
    return false;
  }

  if (event.type === "fallback") {
    const fallbackMessage = "已生成可用的评估结果。";

    setEvaluation((current) =>
      current
        ? {
            ...current,
            fallbackUsed: true,
            message: fallbackMessage,
            logs: [
              ...current.logs,
              {
                tone: "amber",
                text: fallbackMessage,
              },
            ],
          }
        : current,
    );
    return false;
  }

  if (event.type === "done") {
    const saveFailed = event.save_status === "failed";
    const saveErrorMessage = readSaveErrorMessage(event.save_error);

    if (saveFailed && event.report) {
      writeDraftEvaluationReport({
        jdText: request.jdText,
        report: event.report,
        saveError: event.save_error,
      });
    } else if (!saveFailed) {
      clearDraftEvaluationReport();
    }

    setEvaluation((current) =>
      current
        ? {
            ...current,
            status: "completed",
            phase: "completed",
            reportId: event.report_id ?? undefined,
            report: event.report ?? current.report,
            saveStatus: saveFailed ? "failed" : "saved",
            saveErrorMessage: saveFailed ? saveErrorMessage : undefined,
            activeDimension: undefined,
            message: saveFailed
              ? "结果已生成，但保存失败。报告内容已保留，可在报告页重试保存。"
              : "评估报告已生成，可点击查看评估结果进入报告页。",
            logs: [
              ...current.logs,
              {
                tone: saveFailed ? "red" : "green",
                text: saveFailed
                  ? saveErrorMessage
                  : `报告已保存，ID: ${event.report_id}。`,
              },
            ],
          }
        : current,
    );

    return true;
  }

  return false;
}

function normalizeStreamSection(
  dimension: EvaluationDimension,
  data: unknown,
): EvaluationStreamSection {
  if (!isRecord(data)) {
    return {
      dimension,
      title: getDimensionTitle(dimension),
      summary: "该维度已完成评估，报告页会展示完整结论。",
      findings: [],
      suggestions: [],
    };
  }

  return {
    dimension,
    title: readString(data.title) ?? getDimensionTitle(dimension),
    score: readNumber(data.score),
    summary:
      readString(data.summary) ?? "该维度已完成评估，报告页会展示完整结论。",
    findings: readStringArray(data.findings),
    evidence: readStringArray(data.evidence),
    suggestions: readStringArray(data.suggestions),
  };
}

function parseSseEvent(rawEvent: string): StreamEvent | null {
  const dataLine = rawEvent
    .split(/\r?\n/)
    .find((line) => line.startsWith("data:"));

  if (!dataLine) {
    return null;
  }

  try {
    return JSON.parse(dataLine.slice(5).trim()) as StreamEvent;
  } catch {
    return null;
  }
}

function readStreamErrorMessage(event: StreamEvent): string {
  if (
    event.type === "error" &&
    isRecord(event.error) &&
    typeof event.error.message === "string"
  ) {
    return event.error.message;
  }

  return "流式评估失败。";
}

function appendLog(
  runIdRef: MutableRefObject<number>,
  setEvaluation: Dispatch<SetStateAction<EvaluationRunState | null>>,
  runId: number,
  log: EvaluationRunState["logs"][number],
) {
  setEvaluation((current) =>
    current && runIdRef.current === runId
      ? {
          ...current,
          logs: [...current.logs, log],
        }
      : current,
  );
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timeoutId = window.setTimeout(resolve, delayMs);

    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeoutId);
        resolve();
      },
      { once: true },
    );
  });
}

function uniqueDimensions(
  dimensions: EvaluationDimension[],
): EvaluationDimension[] {
  return dimensionOrder.filter((dimension) => dimensions.includes(dimension));
}

function getDimensionTitle(dimension: EvaluationDimension): string {
  const titles: Record<EvaluationDimension, string> = {
    A: "岗位定位",
    B: "技术栈匹配",
    C: "经验要求",
    D: "成长价值",
    E: "薪酬竞争力",
    F: "风险合规",
  };

  return titles[dimension];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );

  return strings.length > 0 ? strings : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type EvaluateResponse =
  {
    ok: true;
    reportId: number | null;
    report: EvaluationReport;
    risks: RiskSignal[];
    score: EvaluationReport["score"];
    saveStatus: "saved" | "failed";
    saveError?: {
      code?: string;
      message?: string;
    } | null;
    fallbackUsed?: boolean;
    fallbackCode?: string | null;
    fallbackReason?: string | null;
    fallbackMessage?: string | null;
    provider?: string;
  };

type ReportSaveResponse =
  {
    ok: true;
    reportId: number;
    saveStatus: "saved";
  };

type StreamEvent =
  | {
      type: "phase";
      phase: "scanning_risks" | "evaluating";
      section?: EvaluationDimension;
    }
  | {
      type: "risks";
      risks: RiskSignal[];
    }
  | {
      type: "section";
      section: EvaluationDimension;
      data: unknown;
    }
  | {
      type: "score";
      overall: number;
    }
  | {
      type: "fallback";
      provider?: string;
      fallbackUsed?: boolean;
      fallbackCode?: string;
      fallbackReason?: string;
      fallbackMessage?: string;
    }
  | {
      type: "done";
      report_id: number | null;
      report?: EvaluationReport;
      save_status?: "saved" | "failed";
      save_error?: {
        code?: string;
        message?: string;
      } | null;
    }
  | {
      type: "error";
      error?: unknown;
    };
