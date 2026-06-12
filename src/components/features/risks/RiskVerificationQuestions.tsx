"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileText,
  LoaderCircle,
} from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import type {
  RiskVerificationQuestion,
  RiskVerificationQuestionResult,
} from "@/lib/types";

type RiskVerificationQuestionsProps = {
  jdText: string;
  company?: string;
  role?: string;
  surface?: "card" | "inline";
};

type RiskVerificationQuestionsApiResponse = RiskVerificationQuestionResult & {
  ok: true;
};

type GenerationStatus = "idle" | "loading" | "ready" | "error";
type CopyState = "success" | "error";
type CopyFeedback = {
  target: string;
  state: CopyState;
};

const MIN_JD_TEXT_LENGTH = 30;
const priorityLabel: Record<RiskVerificationQuestion["priority"], string> = {
  high: "优先核实",
  medium: "建议核实",
  low: "补充核实",
};
const priorityClass: Record<RiskVerificationQuestion["priority"], string> = {
  high: "bg-[#f5e8e6] text-[var(--color-red)]",
  medium: "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
  low: "bg-[#eaf0e8] text-[var(--color-green)]",
};

export function RiskVerificationQuestions({
  company,
  jdText,
  role,
  surface = "card",
}: RiskVerificationQuestionsProps) {
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [result, setResult] = useState<RiskVerificationQuestionResult | null>(
    null,
  );
  const [message, setMessage] = useState<string>();
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const copyFeedbackTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
    };
  }, []);

  const normalizedJdText = jdText.trim();
  const canGenerate =
    normalizedJdText.length >= MIN_JD_TEXT_LENGTH && status !== "loading";

  async function handleGenerateQuestions() {
    if (!canGenerate) {
      setStatus("error");
      setMessage(`JD 文本过短，至少需要 ${MIN_JD_TEXT_LENGTH} 个字符。`);
      return;
    }

    setStatus("loading");
    setMessage(undefined);
    setResult(null);
    setCopyFeedback(null);

    try {
      const body = await apiRequest<RiskVerificationQuestionsApiResponse>(
        "/api/risk-verification-questions",
        {
          errorMessage: "核实问题生成失败，请稍后重试。",
          json: {
            jdText: normalizedJdText,
            ...(company?.trim() ? { company: company.trim() } : {}),
            ...(role?.trim() ? { role: role.trim() } : {}),
          },
          method: "POST",
        },
      );

      setResult(body);
      setStatus("ready");
      setMessage("核实问题已生成。");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "核实问题生成失败，请稍后重试。",
      );
    }
  }

  async function handleCopyQuestion(
    question: RiskVerificationQuestion,
    index: number,
  ) {
    await copyText(formatQuestion(question, index), question.id);
  }

  async function handleCopyAll() {
    if (!result) {
      return;
    }

    await copyText(formatQuestionsText(result), "all");
  }

  async function copyText(text: string, target: string) {
    try {
      await writeClipboardText(text);
      showCopyFeedback({ target, state: "success" });
    } catch {
      showCopyFeedback({ target, state: "error" });
    }
  }

  function showCopyFeedback(feedback: CopyFeedback) {
    setCopyFeedback(feedback);

    if (copyFeedbackTimerRef.current) {
      window.clearTimeout(copyFeedbackTimerRef.current);
    }

    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopyFeedback(null);
      copyFeedbackTimerRef.current = undefined;
    }, 2400);
  }

  const isCardSurface = surface === "card";
  const containerClass = isCardSurface
    ? "rounded-[24px] border border-[var(--color-border-light)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-6"
    : "border-t border-[var(--color-border-light)] pt-4";
  const copyAllFeedback = copyFeedback?.target === "all" ? copyFeedback : null;

  return (
    <section className={containerClass} data-testid="risk-verification-questions">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[var(--color-blue)]">
            <FileText aria-hidden="true" className="size-4" strokeWidth={1.8} />
            <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
              HR 核实问题
            </h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            把风险证据转成可复制问题；只供你人工核实，不自动发送、不保存联系人或外部消息。
          </p>
        </div>
        <button
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-4 py-2 text-sm font-bold leading-5 text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[var(--color-primary)] disabled:active:scale-100"
          data-testid="risk-verification-generate"
          disabled={status === "loading"}
          onClick={handleGenerateQuestions}
          type="button"
        >
          {status === "loading" ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin"
              strokeWidth={1.8}
            />
          ) : (
            <FileText aria-hidden="true" className="size-4" strokeWidth={1.8} />
          )}
          {status === "loading" ? "生成中..." : "生成核实问题"}
        </button>
      </div>

      {message ? (
        <p
          className={`mt-3 text-xs font-medium leading-5 ${
            status === "error" ? "text-[var(--color-red)]" : "text-[var(--color-green)]"
          }`}
          role="status"
        >
          {message}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-[16px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="break-words text-sm font-bold leading-5 text-[var(--color-text)]">
                  {result.decisionLabel}
                </p>
                <p className="mt-1 break-words text-xs leading-5 text-[var(--color-text-secondary)]">
                  规则版本：{result.ruleVersion}
                </p>
              </div>
              <button
                className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-bold leading-4 text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-surface-hover)] active:scale-[0.98]"
                data-testid="risk-verification-copy-all"
                onClick={handleCopyAll}
                type="button"
              >
                {copyAllFeedback?.state === "success" ? (
                  <CheckCircle2
                    aria-hidden="true"
                    className="size-4 text-[var(--color-green)]"
                    strokeWidth={1.8}
                  />
                ) : (
                  <Copy aria-hidden="true" className="size-4" strokeWidth={1.8} />
                )}
                复制全部
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--color-text-secondary)]">
              {result.disclaimer}
            </p>
            {copyAllFeedback ? (
              <CopyFeedbackText feedback={copyAllFeedback} />
            ) : null}
          </div>

          <ul className="space-y-3">
            {result.questions.map((question, index) => (
              <li
                className="rounded-[16px] border border-[var(--color-border-light)] bg-white p-4"
                key={question.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold leading-4 ${priorityClass[question.priority]}`}
                      >
                        {priorityLabel[question.priority]}
                      </span>
                      <span className="rounded-full bg-[var(--color-surface-hover)] px-3 py-1 text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
                        {question.category}
                      </span>
                    </div>
                    <p className="mt-3 break-words text-sm font-bold leading-6 text-[var(--color-text)]">
                      {question.question}
                    </p>
                  </div>
                  <button
                    className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-bold leading-4 text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-surface-hover)] active:scale-[0.98]"
                    data-testid={`risk-verification-copy-${question.id}`}
                    onClick={() => handleCopyQuestion(question, index)}
                    type="button"
                  >
                    {copyFeedback?.target === question.id &&
                    copyFeedback.state === "success" ? (
                      <CheckCircle2
                        aria-hidden="true"
                        className="size-4 text-[var(--color-green)]"
                        strokeWidth={1.8}
                      />
                    ) : (
                      <Copy
                        aria-hidden="true"
                        className="size-4"
                        strokeWidth={1.8}
                      />
                    )}
                    复制
                  </button>
                </div>
                <p className="mt-3 text-xs leading-5 text-[var(--color-text-secondary)]">
                  <span className="font-bold text-[var(--color-text)]">
                    为什么要问：
                  </span>
                  {question.reason}
                </p>
                {question.relatedEvidence ? (
                  <blockquote className="mt-3 rounded-[12px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-3 text-xs leading-5 text-[var(--color-text-secondary)]">
                    <span className="mb-1 block font-bold text-[var(--color-text)]">
                      关联原文证据
                    </span>
                    {question.relatedEvidence}
                  </blockquote>
                ) : null}
                {copyFeedback?.target === question.id ? (
                  <CopyFeedbackText feedback={copyFeedback} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : status === "error" ? (
        <div className="mt-4 flex items-start gap-2 rounded-[14px] border border-[rgba(196,102,90,0.26)] bg-[#fff6f4] p-3">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-[var(--color-red)]"
            strokeWidth={1.8}
          />
          <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
            请确认已提供完整 JD。系统会在服务端重新扫描风险后生成问题，不会使用客户端传入的风险结论。
          </p>
        </div>
      ) : null}
    </section>
  );
}

function CopyFeedbackText({ feedback }: { feedback: CopyFeedback }) {
  return (
    <p
      className={`mt-2 text-xs font-medium leading-5 ${
        feedback.state === "success"
          ? "text-[var(--color-green)]"
          : "text-[var(--color-red)]"
      }`}
      role="status"
    >
      {feedback.state === "success" ? "已复制" : "复制失败，请手动选择文本复制"}
    </p>
  );
}

function formatQuestionsText(result: RiskVerificationQuestionResult): string {
  return [
    `风险判断：${result.decisionLabel}`,
    `风险等级：${result.riskLevel}`,
    `规则版本：${result.ruleVersion}`,
    result.disclaimer,
    "",
    ...result.questions.map((question, index) => formatQuestion(question, index)),
  ].join("\n");
}

function formatQuestion(
  question: RiskVerificationQuestion,
  index: number,
): string {
  return [
    `${index + 1}. 【${question.category}】${question.question}`,
    `优先级：${priorityLabel[question.priority]}`,
    `为什么要问：${question.reason}`,
    question.relatedEvidence ? `关联原文证据：${question.relatedEvidence}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  const didCopy = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!didCopy) {
    throw new Error("Clipboard write failed");
  }
}
