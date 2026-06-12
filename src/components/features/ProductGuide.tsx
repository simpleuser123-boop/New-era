"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Check,
  ClipboardList,
  FileText,
  Gauge,
  LoaderCircle,
  MessageSquarePlus,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";

import { apiRequest, readErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import type { ProductGuideSettings } from "@/lib/types";
import { Button } from "@/components/ui";

const PRODUCT_GUIDE_VERSION = 1;
const PRODUCT_GUIDE_EVENT = "new-era:open-product-guide";
const SESSION_DISMISS_KEY = `new-era-product-guide-dismissed-v${PRODUCT_GUIDE_VERSION}`;

type ProductGuideStep = {
  accent: string;
  detail: string;
  href: string;
  icon: typeof Target;
  label: string;
  points: string[];
  title: string;
};

type SettingsResponse = {
  ok: true;
  settings: {
    product_guide?: ProductGuideSettings;
  };
};

const guideSteps: ProductGuideStep[] = [
  {
    accent: "画像",
    detail: "先把目标方向、城市、工作模式、优势和不接受条件整理清楚，后续评估和 Agent 建议才有判断依据。",
    href: "/career",
    icon: Target,
    label: "Career DNA",
    points: ["明确适合投什么", "记录优势与短板", "建议采纳前不写入"],
    title: "建立你的求职判断基准",
  },
  {
    accent: "简历",
    detail: "维护基础简历、方向标签和默认简历。系统用它做 JD 匹配、简历诊断、ATS 检查和面试准备。",
    href: "/resume",
    icon: ClipboardList,
    label: "简历管理",
    points: ["选择默认简历", "按 AI 方向打标签", "优化建议需手动确认"],
    title: "把简历变成可复用资产",
  },
  {
    accent: "识别",
    detail: "粘贴 JD 或输入 URL，New Era 会拆解岗位要求，重点识别它是真 AI 岗、包装岗，还是风险机会。",
    href: "/evaluate",
    icon: FileText,
    label: "JD 评估",
    points: ["六维评分", "真假 AI 岗判断", "URL 失败可手动粘贴"],
    title: "先判断岗位值不值得投",
  },
  {
    accent: "报告",
    detail: "评估报告会给出评分、风险、证据和行动建议。你可以把值得跟进的机会加入本地投递清单。",
    href: "/reports",
    icon: Gauge,
    label: "评估报告",
    points: ["保留证据链", "报告可回看", "加入 Tracker 前需确认"],
    title: "用报告沉淀每次判断",
  },
  {
    accent: "跟进",
    detail: "投递管理负责记录机会状态、优先级、渠道、时间线和下次跟进，让求职流程不靠记忆推进。",
    href: "/applications",
    icon: BriefcaseBusiness,
    label: "投递管理",
    points: ["状态看板", "跟进事件", "逾期提醒"],
    title: "把机会推进变成可管理流程",
  },
  {
    accent: "准备",
    detail: "面试教练基于报告、简历和画像生成问题，帮你练习回答、补齐证据，并记录可复用故事。",
    href: "/interview",
    icon: MessageSquarePlus,
    label: "面试教练",
    points: ["按岗位生成问题", "回答评分", "沉淀 STAR 故事"],
    title: "从投递判断过渡到面试准备",
  },
  {
    accent: "协作",
    detail: "AI 助手会读取本地上下文做分析。涉及修改 Tracker、画像、简历反馈等写操作时，只会生成待确认动作。",
    href: "/assistant",
    icon: Bot,
    label: "AI 助手",
    points: ["读取本地上下文", "分 Agent 路由", "确认前不改业务数据"],
    title: "让 Agent 做分析，不让它越权写入",
  },
  {
    accent: "本地",
    detail: "设置页管理主题、账号、安全、模型和数据导出清理。",
    href: "/settings",
    icon: Settings,
    label: "设置与数据",
    points: ["管理员账号", "数据导出清理", "操作边界清晰"],
    title: "管理账号与数据",
  },
];

function hasSeenCurrentGuide(settings?: ProductGuideSettings) {
  return (
    settings !== undefined &&
    settings.version >= PRODUCT_GUIDE_VERSION &&
    ["completed", "skipped"].includes(settings.status)
  );
}

export function openProductGuide() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(PRODUCT_GUIDE_EVENT));
}

export function ProductGuide() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready">("idle");

  const activeStep = guideSteps[activeIndex];
  const progress = useMemo(
    () => Math.round(((activeIndex + 1) / guideSteps.length) * 100),
    [activeIndex],
  );

  useEffect(() => {
    function handleOpenGuide() {
      setActiveIndex(0);
      setError(null);
      setIsOpen(true);
    }

    window.addEventListener(PRODUCT_GUIDE_EVENT, handleOpenGuide);

    return () => {
      window.removeEventListener(PRODUCT_GUIDE_EVENT, handleOpenGuide);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadGuideStatus() {
      setLoadState("loading");

      try {
        const body = await apiRequest<SettingsResponse>("/api/settings", {
          cache: "no-store",
          credentials: "same-origin",
          errorMessage: "功能指导状态读取失败。",
        });

        if (cancelled) {
          return;
        }

        const dismissedThisSession =
          window.sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";

        if (!hasSeenCurrentGuide(body.settings.product_guide) && !dismissedThisSession) {
          setIsOpen(true);
        }
      } catch {
        // Protected pages already enforce auth; a settings read failure should not block the workspace.
      } finally {
        if (!cancelled) {
          setLoadState("ready");
        }
      }
    }

    void loadGuideStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dismissForSession();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function dismissForSession() {
    window.sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    setIsOpen(false);
    setError(null);
  }

  async function saveGuideStatus(status: "completed" | "skipped") {
    setIsSaving(true);
    setError(null);

    const timestamp = new Date().toISOString();
    const productGuide: ProductGuideSettings = {
      lastViewedAt: timestamp,
      status,
      version: PRODUCT_GUIDE_VERSION,
      ...(status === "completed"
        ? { completedAt: timestamp }
        : { skippedAt: timestamp }),
    };

    try {
      await apiRequest<SettingsResponse>("/api/settings", {
        credentials: "same-origin",
        errorMessage: "功能指导状态保存失败。",
        json: {
          settings: {
            product_guide: productGuide,
          },
        },
        method: "PUT",
      });
      window.sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
      setIsOpen(false);
    } catch (saveError) {
      setError(readErrorMessage(saveError, "功能指导状态保存失败，请稍后重试。"));
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen || loadState === "loading") {
    return null;
  }

  const ActiveIcon = activeStep.icon;
  const isFirst = activeIndex === 0;
  const isLast = activeIndex === guideSteps.length - 1;

  return (
    <div
      aria-labelledby="product-guide-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(45,42,38,0.52)] px-4 py-6 backdrop-blur-sm"
      role="dialog"
    >
      <div className="relative grid max-h-[min(880px,calc(100dvh-32px))] w-full max-w-[1040px] overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_24px_80px_rgba(45,42,38,0.22)] md:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 border-r border-[var(--color-border)] bg-[var(--color-surface-hover)] p-5 md:block">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-[14px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
              <Sparkles aria-hidden="true" className="size-5" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-xs font-bold leading-4 text-[var(--color-primary)]">
                初次使用
              </p>
              <p className="text-base font-semibold leading-6 text-[var(--color-text)]">
                New Era 全流程
              </p>
            </div>
          </div>

          <div className="space-y-2" aria-label="功能指导步骤">
            {guideSteps.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = index === activeIndex;
              const isDone = index < activeIndex;

              return (
                <button
                  aria-current={isActive ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left transition-all active:scale-[0.99]",
                    isActive
                      ? "bg-[var(--color-surface)] text-[var(--color-primary)] shadow-[var(--shadow-sm)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-primary)]",
                  )}
                  key={step.label}
                  onClick={() => setActiveIndex(index)}
                  type="button"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-[10px] border",
                      isActive || isDone
                        ? "border-[rgba(196,135,58,0.24)] bg-[var(--color-primary-light)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface)]",
                    )}
                  >
                    {isDone ? (
                      <Check aria-hidden="true" className="size-4" strokeWidth={2} />
                    ) : (
                      <StepIcon aria-hidden="true" className="size-4" strokeWidth={1.8} />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">
                      {step.label}
                    </span>
                    <span className="block truncate text-xs leading-4 opacity-75">
                      {step.accent}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4 sm:px-7">
            <div className="min-w-0">
              <p className="text-xs font-bold leading-4 text-[var(--color-primary)]">
                {activeIndex + 1} / {guideSteps.length}
              </p>
              <div className="mt-2 h-2 w-[180px] max-w-full overflow-hidden rounded-full bg-[var(--color-border-light)]">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <button
              aria-label="关闭功能指导"
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)] active:scale-[0.98]"
              onClick={dismissForSession}
              type="button"
            >
              <X aria-hidden="true" className="size-5" strokeWidth={1.8} />
            </button>
          </div>

          <div className="min-h-0 overflow-y-auto px-5 py-6 sm:px-7 sm:py-8">
            <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_250px] lg:items-start">
              <div className="min-w-0">
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-[16px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
                    <ActiveIcon aria-hidden="true" className="size-7" strokeWidth={1.7} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-4 text-[var(--color-primary)]">
                      {activeStep.label}
                    </p>
                    <h2
                      className="mt-1 text-[26px] font-semibold leading-[34px] text-[var(--color-text)] sm:text-[32px] sm:leading-[40px]"
                      id="product-guide-title"
                    >
                      {activeStep.title}
                    </h2>
                  </div>
                </div>

                <p className="max-w-[680px] text-base leading-7 text-[var(--color-text-secondary)]">
                  {activeStep.detail}
                </p>

                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  {activeStep.points.map((point) => (
                    <div
                      className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4"
                      key={point}
                    >
                      <ShieldCheck
                        aria-hidden="true"
                        className="mb-3 size-5 text-[var(--color-green)]"
                        strokeWidth={1.8}
                      />
                      <p className="text-sm font-bold leading-6 text-[var(--color-text)]">
                        {point}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4">
                <p className="text-xs font-bold leading-4 text-[var(--color-primary)]">
                  推荐路径
                </p>
                <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                  <p>
                    先画像和简历，再评估 JD；报告沉淀判断，Tracker 推进机会，面试教练补齐表达。
                  </p>
                  <p>
                    AI 助手可以跨页面分析，但涉及写入时会停在待确认动作。
                  </p>
                </div>
                <a
                  className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary-hover)]"
                  href={activeStep.href}
                  onClick={dismissForSession}
                >
                  打开{activeStep.label}
                  <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.8} />
                </a>
              </div>
            </div>

            <div className="mt-6 grid gap-2 md:hidden">
              {guideSteps.map((step, index) => (
                <button
                  aria-current={index === activeIndex ? "step" : undefined}
                  className={cn(
                    "flex items-center justify-between rounded-[12px] border px-3 py-2 text-left text-sm font-bold",
                    index === activeIndex
                      ? "border-[rgba(196,135,58,0.38)] bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                      : "border-[var(--color-border)] text-[var(--color-text-secondary)]",
                  )}
                  key={step.label}
                  onClick={() => setActiveIndex(index)}
                  type="button"
                >
                  {step.label}
                  <span className="text-xs font-medium">{index + 1}</span>
                </button>
              ))}
            </div>

            {error ? (
              <div
                className="mt-6 rounded-[14px] border border-[#efd4d0] bg-[#fff0ee] px-4 py-3 text-sm leading-6 text-[var(--color-red)]"
                role="alert"
              >
                {error}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                disabled={isSaving}
                onClick={dismissForSession}
                variant="ghost"
              >
                稍后再看
              </Button>
              <Button
                disabled={isSaving}
                onClick={() => void saveGuideStatus("skipped")}
                variant="outline"
              >
                跳过指导
              </Button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                disabled={isFirst || isSaving}
                leftIcon={<ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.8} />}
                onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
                variant="outline"
              >
                上一步
              </Button>
              {isLast ? (
                <Button
                  disabled={isSaving}
                  leftIcon={
                    isSaving ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin"
                        strokeWidth={1.8}
                      />
                    ) : (
                      <Check aria-hidden="true" className="size-4" strokeWidth={1.8} />
                    )
                  }
                  onClick={() => void saveGuideStatus("completed")}
                >
                  完成功能指导
                </Button>
              ) : (
                <Button
                  disabled={isSaving}
                  onClick={() =>
                    setActiveIndex((index) => Math.min(guideSteps.length - 1, index + 1))
                  }
                  rightIcon={
                    <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.8} />
                  }
                >
                  下一步
                </Button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
