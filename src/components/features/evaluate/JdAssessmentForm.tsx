"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bolt,
  Bot,
  BrainCircuit,
  Compass,
  Link2,
  Loader2,
  ServerCog,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import presetJds from "../../../../demo-data/preset-jds.json";
import type { JdAssessmentRequest } from "@/components/features/evaluate/assessment-types";
import { ApiClientError, apiRequest } from "@/lib/api-client";

type PresetJd = {
  id: string;
  title: string;
  company: string;
  role: string;
  type: "real_ai" | "fake_ai" | "borderline";
  aiDirection: string;
  salaryRange: string;
  location: string;
  demoPurpose: string;
  jdText: string;
};

type DemoJob = {
  id: string;
  title: string;
  company: string;
  role: string;
  description: string;
  location: string;
  tag: string;
  icon: typeof Bot;
  accent: "amber" | "blue" | "green" | "red";
  jd: string;
};

const typedPresetJds = presetJds as PresetJd[];
const MIN_JD_LENGTH = 50;
const MAX_JD_LENGTH = 50000;
const URL_PATTERN = /^https?:\/\/[^\s]+$/i;
const JD_FETCH_TIMEOUT_MS = 15000;
const JD_FETCH_FALLBACK_MESSAGE = "抓取失败，请手动粘贴 JD 文本。";
const MANUAL_PASTE_HINT = "请手动粘贴 JD 文本。";

const demoJobs: DemoJob[] = typedPresetJds.slice(0, 8).map((job) => {
  const config = getDemoVisualConfig(job.type);

  return {
    id: job.id,
    title: job.title,
    company: job.company,
    role: job.role,
    description: job.demoPurpose,
    location: job.location,
    tag: job.aiDirection,
    icon: config.icon,
    accent: config.accent,
    jd: job.jdText,
  };
});

type JdAssessmentFormProps = {
  errorMessage?: string;
  isEvaluating?: boolean;
  onStartAssessment: (request: JdAssessmentRequest) => void;
};

type FetchState = "idle" | "fetching" | "failed" | "success";

export function JdAssessmentForm({
  errorMessage,
  isEvaluating = false,
  onStartAssessment,
}: JdAssessmentFormProps) {
  const [jdText, setJdText] = useState("");
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [identifiedTitle, setIdentifiedTitle] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>();
  const [selectedDemo, setSelectedDemo] = useState<DemoJob | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const fetchRequestIdRef = useRef(0);
  const activeFetchUrlRef = useRef<string | null>(null);

  const trimmedText = jdText.trim();
  const charCount = trimmedText.length;
  const isUrlInput = URL_PATTERN.test(trimmedText);
  const isFetching = fetchState === "fetching";
  const isOverLimit = charCount > MAX_JD_LENGTH;
  const isReady =
    charCount >= MIN_JD_LENGTH &&
    !isOverLimit &&
    !isFetching &&
    !isEvaluating &&
    !isUrlInput;

  const helperText = useMemo(() => {
    if (isOverLimit) {
      return "内容超过 50000 字，请压缩 JD 后再评估。";
    }

    if (isUrlInput) {
      return "已识别为招聘链接，请先抓取正文；抓取失败时可直接粘贴 JD 文本。";
    }

    if (charCount > 0 && charCount < MIN_JD_LENGTH) {
      return `还需要至少 ${MIN_JD_LENGTH - charCount} 个字符才能开始评估。`;
    }

    return "建议粘贴完整的岗位职责、任职要求和加分项，以便获得更完整的 6 维分析。";
  }, [charCount, isOverLimit, isUrlInput]);

  const visibleError = localError ?? errorMessage;

  function clearContent() {
    fetchRequestIdRef.current += 1;
    activeFetchUrlRef.current = null;
    setJdText("");
    setFetchState("idle");
    setIdentifiedTitle(null);
    setSourceUrl(undefined);
    setSelectedDemo(null);
    setLocalError(null);
  }

  function fillDemo(job: DemoJob) {
    fetchRequestIdRef.current += 1;
    activeFetchUrlRef.current = null;
    setJdText(job.jd);
    setFetchState("idle");
    setIdentifiedTitle(`${job.company} - ${job.role}`);
    setSourceUrl(undefined);
    setSelectedDemo(job);
    setLocalError(null);
  }

  function updateText(value: string) {
    setJdText(value);
    setSelectedDemo(null);

    if (identifiedTitle) {
      setIdentifiedTitle(null);
    }

    if (sourceUrl) {
      setSourceUrl(undefined);
    }

    if (fetchState !== "idle") {
      setFetchState("idle");
    }

    if (localError) {
      setLocalError(null);
    }

    const maybeUrl = value.trim();

    if (!URL_PATTERN.test(maybeUrl)) {
      fetchRequestIdRef.current += 1;
      activeFetchUrlRef.current = null;
      return;
    }

    const requestId = fetchRequestIdRef.current + 1;
    fetchRequestIdRef.current = requestId;

    window.setTimeout(() => {
      if (fetchRequestIdRef.current !== requestId) {
        return;
      }

      void fetchJdFromUrl(maybeUrl, requestId);
    }, 1000);
  }

  async function fetchJdFromUrl(url: string, requestId?: number) {
    if (activeFetchUrlRef.current === url) {
      return;
    }

    const activeRequestId = requestId ?? fetchRequestIdRef.current + 1;
    fetchRequestIdRef.current = activeRequestId;
    activeFetchUrlRef.current = url;
    setFetchState("fetching");
    setIdentifiedTitle(null);
    setSourceUrl(undefined);
    setLocalError(null);

    try {
      const body = await apiRequest<JdFetchResponse>("/api/jd/fetch", {
        errorMessage: JD_FETCH_FALLBACK_MESSAGE,
        json: { url },
        method: "POST",
        timeoutMs: JD_FETCH_TIMEOUT_MS,
      });

      if (fetchRequestIdRef.current !== activeRequestId) {
        return;
      }

      setJdText(body.text);
      setSourceUrl(body.sourceUrl ?? url);
      setIdentifiedTitle(body.title || "已抓取招聘页面正文");
      setFetchState("success");
      activeFetchUrlRef.current = null;
    } catch (error) {
      if (fetchRequestIdRef.current !== activeRequestId) {
        return;
      }

      setFetchState("failed");
      setLocalError(readJdFetchErrorMessage(error));
      activeFetchUrlRef.current = null;
    }
  }

  function startAssessment() {
    if (!isReady) {
      if (isUrlInput) {
        setLocalError("当前输入是 URL，请先抓取 JD 正文，或改为手动粘贴完整 JD 文本。");
        return;
      }

      if (charCount < MIN_JD_LENGTH) {
        setLocalError(`JD 文本过短，至少需要 ${MIN_JD_LENGTH} 个字符。`);
      }

      return;
    }

    setLocalError(null);
    onStartAssessment({
      jdText: trimmedText,
      title: identifiedTitle ?? selectedDemo?.title,
      company: selectedDemo?.company,
      role: selectedDemo?.role,
      sourceUrl,
      demoId: selectedDemo?.id,
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[24px] border border-[var(--color-border-light)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-8">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label
              className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]"
              htmlFor="jd-input"
            >
              职位描述 JD
            </label>
            {identifiedTitle ? (
              <p className="mt-1 text-sm text-[var(--color-blue)]">
                已识别：{identifiedTitle}
              </p>
            ) : (
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                粘贴 JD 文本，或输入招聘页面 URL 自动抓取正文。
              </p>
            )}
            {sourceUrl ? (
              <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
                当前正文来自页面抓取，可继续编辑后再开始评估。
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!isUrlInput || isFetching || isEvaluating}
              onClick={() => fetchJdFromUrl(trimmedText)}
              type="button"
            >
              {isFetching ? (
                <Loader2
                  aria-hidden="true"
                  className="size-[18px] animate-spin"
                  strokeWidth={1.8}
                />
              ) : (
                <Link2 aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
              )}
              抓取 URL
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[#f5e8e6] hover:text-[var(--color-red)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isFetching || isEvaluating}
              onClick={clearContent}
              type="button"
            >
              <Trash2 aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
              清空内容
            </button>
          </div>
        </div>

        <div className="relative">
          <textarea
            aria-describedby="jd-helper jd-count jd-error"
            aria-invalid={Boolean(visibleError) || undefined}
            className="h-[320px] w-full resize-none rounded-[18px] border border-transparent bg-[var(--color-surface-hover)] p-5 text-base leading-7 text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:bg-white focus:ring-2 focus:ring-[rgba(196,135,58,0.18)] disabled:cursor-wait disabled:opacity-70 sm:p-6"
            disabled={isFetching || isEvaluating}
            id="jd-input"
            maxLength={MAX_JD_LENGTH + 500}
            onChange={(event) => updateText(event.target.value)}
            placeholder="粘贴 JD 文本，例如：岗位职责... 任职要求...；也可以粘贴 http/https 招聘页面 URL。"
            value={jdText}
          />

          {isFetching ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[18px] border border-white/60 bg-white/80 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[2px]">
              <Loader2
                aria-hidden="true"
                className="size-10 animate-spin text-[var(--color-primary)]"
                strokeWidth={1.8}
              />
              <div>
                <p className="text-sm font-bold text-[var(--color-primary)]">
                  JD 内容抓取中
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  正在解析招聘页面数据并提取正文
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p
            className={
              isOverLimit || visibleError
                ? "text-[var(--color-red)]"
                : "text-[var(--color-text-secondary)]"
            }
            id="jd-helper"
          >
            {visibleError ?? helperText}
          </p>
          <span
            className={`font-medium ${
              charCount > 0 && !isOverLimit
                ? "text-[var(--color-primary)]"
                : isOverLimit
                  ? "text-[var(--color-red)]"
                  : "text-[var(--color-muted)]"
            }`}
            id="jd-count"
          >
            {charCount} / {MAX_JD_LENGTH}
          </span>
        </div>

        {fetchState === "failed" ? (
          <div
            className="mt-4 rounded-[14px] border border-[#e7beb8] bg-[#fff6f4] px-4 py-3 text-sm leading-6 text-[var(--color-red)]"
            id="jd-error"
          >
            <p className="font-medium">
              {visibleError ?? JD_FETCH_FALLBACK_MESSAGE}
            </p>
            <p className="mt-1 text-[var(--color-text-secondary)]">
              原 URL 已保留在输入框中。你可以直接替换为岗位职责、任职要求等 JD
              正文，或使用下方典型 JD 继续体验。
            </p>
          </div>
        ) : null}

        {fetchState === "success" && sourceUrl ? (
          <div className="mt-4 rounded-[14px] border border-[#d9e6d6] bg-[#f6fbf4] px-4 py-3 text-sm leading-6 text-[var(--color-green)]">
            URL 正文已抓取，内容可继续编辑后再开始评估。
          </div>
        ) : null}

        <div className="mt-8 flex justify-center">
          <button
            className="inline-flex items-center justify-center gap-3 rounded-[12px] bg-[var(--color-primary)] px-10 py-4 text-base font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] hover:shadow-[var(--shadow-lg)] active:scale-[0.98] disabled:pointer-events-none disabled:bg-[var(--color-border)] disabled:text-[var(--color-muted)] sm:px-12"
            disabled={!isReady}
            onClick={startAssessment}
            type="button"
          >
            {isEvaluating ? (
              <Loader2
                aria-hidden="true"
                className="size-5 animate-spin"
                strokeWidth={1.8}
              />
            ) : (
              <Bolt
                aria-hidden="true"
                className="size-5 transition-transform group-hover:rotate-12"
                strokeWidth={1.8}
              />
            )}
            {isEvaluating ? "评估中" : "开始深度评估"}
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Compass
            aria-hidden="true"
            className="size-5 text-[var(--color-text-secondary)]"
            strokeWidth={1.8}
          />
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            试试这些典型 JD
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_0.9fr]">
          {demoJobs.map((job) => (
            <DemoJobCard
              isSelected={selectedDemo?.id === job.id}
              job={job}
              key={job.id}
              onSelect={fillDemo}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

type DemoJobCardProps = {
  isSelected: boolean;
  job: DemoJob;
  onSelect: (job: DemoJob) => void;
};

function DemoJobCard({ isSelected, job, onSelect }: DemoJobCardProps) {
  const Icon = job.icon;
  const iconTone = getIconTone(job.accent);

  return (
    <button
      className={`group flex h-full flex-col rounded-[18px] border bg-[var(--color-surface)] p-6 text-left shadow-[var(--shadow-sm)] transition-all hover:-translate-y-px hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-lg)] active:scale-[0.99] ${
        isSelected
          ? "border-[var(--color-primary)] ring-2 ring-[rgba(196,135,58,0.14)]"
          : "border-[var(--color-border)]"
      }`}
      onClick={() => onSelect(job)}
      type="button"
    >
      <div className="mb-4 flex items-start justify-between">
        <div className={`flex size-10 items-center justify-center rounded-[12px] ${iconTone}`}>
          <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </div>
        <ArrowRight
          aria-hidden="true"
          className="size-5 text-[var(--color-muted)] transition-all group-hover:translate-x-1 group-hover:text-[var(--color-primary)]"
          strokeWidth={1.8}
        />
      </div>

      <h3 className="text-lg font-medium leading-7 text-[var(--color-text)]">
        {job.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-secondary)]">
        {job.description}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <span className="rounded-[8px] bg-[var(--color-primary-light)] px-2.5 py-1 text-[10px] font-bold text-[#6b4716]">
          {job.location}
        </span>
        <span className="rounded-[8px] bg-[var(--color-primary-light)] px-2.5 py-1 text-[10px] font-bold text-[#6b4716]">
          {job.tag}
        </span>
      </div>
    </button>
  );
}

function getDemoVisualConfig(type: PresetJd["type"]): {
  icon: typeof Bot;
  accent: DemoJob["accent"];
} {
  if (type === "fake_ai") {
    return {
      icon: ShieldAlert,
      accent: "red",
    };
  }

  if (type === "borderline") {
    return {
      icon: ServerCog,
      accent: "amber",
    };
  }

  return {
    icon: type === "real_ai" ? BrainCircuit : Sparkles,
    accent: type === "real_ai" ? "blue" : "green",
  };
}

function getIconTone(accent: DemoJob["accent"]): string {
  const tones: Record<DemoJob["accent"], string> = {
    amber: "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
    blue: "bg-[#e8f0f5] text-[var(--color-blue)]",
    green: "bg-[#eaf0e8] text-[var(--color-green)]",
    red: "bg-[#f5e8e6] text-[var(--color-red)]",
  };

  return tones[accent];
}

function readJdFetchErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    const message = error.message || JD_FETCH_FALLBACK_MESSAGE;
    return withManualPasteHint(message);
  }

  if (error instanceof Error && error.message) {
    return withManualPasteHint(error.message);
  }

  return JD_FETCH_FALLBACK_MESSAGE;
}

function withManualPasteHint(message: string): string {
  return message.includes("手动粘贴 JD 文本")
    ? message
    : `${message} ${MANUAL_PASTE_HINT}`;
}

type JdFetchResponse =
  {
    ok: true;
    title?: string;
    text: string;
    sourceUrl?: string;
  };
