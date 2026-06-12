"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BrainCircuit,
  Check,
  CheckCircle2,
  CircleSlash,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Textarea } from "@/components/ui/Textarea";
import { apiRequest, readErrorMessage } from "@/lib/api-client";
import {
  RESUME_DIRECTION_LABELS,
  RESUME_DIRECTION_OPTIONS,
} from "@/lib/resume-directions";
import {
  CAREER_PROFILE_WORK_MODES,
  type CareerProfileSettings,
  type CareerProfileStrength,
  type CareerProfileSuggestion,
  type CareerProfileSuggestionField,
  type CareerProfileSuggestionSource,
  type CareerProfileWeakness,
  type CareerProfileWorkMode,
  type JsonObject,
  type JsonValue,
  type ResumeDirection,
} from "@/lib/types";

type LoadStatus = "loading" | "ready" | "error";
type SaveStatus = "idle" | "saving" | "success" | "error";
type SuggestionStatus = "idle" | "loading" | "ready" | "error";

type CareerProfileResponse = {
  ok: true;
  defaults: CareerProfileSettings;
  defaultsApplied: boolean;
  profile: CareerProfileSettings;
  updatedAt: string | null;
};

type CareerProfileSaveResponse = {
  ok: true;
  profile: CareerProfileSettings;
  savedAt: string;
};

type CareerProfileSuggestionsResponse = {
  ok: true;
  count: number;
  generatedAt: string;
  sources: Array<{
    available: boolean;
    count: number;
    source: CareerProfileSuggestionSource;
    sourceLabel: string;
  }>;
  suggestions: CareerProfileSuggestion[];
};

const WORK_MODE_LABELS: Record<CareerProfileWorkMode, string> = {
  flexible: "灵活",
  hybrid: "混合办公",
  onsite: "到岗办公",
  remote: "远程",
};

const FIELD_LABELS: Record<CareerProfileSuggestionField, string> = {
  currentStrategy: "当前策略",
  dealBreakers: "不接受条件",
  preferredCompanyStages: "公司阶段偏好",
  preferredWorkModes: "工作模式",
  salaryExpectation: "薪资期望",
  strengths: "核心优势",
  targetCities: "目标城市",
  targetDirections: "目标方向",
  targetRoles: "目标岗位",
  weaknesses: "能力短板",
};

const LIST_SEPARATOR_PATTERN = /[,\n，、；;]+/;

export function CareerProfileWorkspace() {
  const [savedProfile, setSavedProfile] = useState<CareerProfileSettings>(() =>
    createEmptyProfile(),
  );
  const [draftProfile, setDraftProfile] = useState<CareerProfileSettings>(() =>
    createEmptyProfile(),
  );
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [suggestionStatus, setSuggestionStatus] =
    useState<SuggestionStatus>("idle");
  const [suggestions, setSuggestions] = useState<CareerProfileSuggestion[]>([]);
  const [sourceSummaries, setSourceSummaries] =
    useState<CareerProfileSuggestionsResponse["sources"]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<string>();
  const [suggestionMessage, setSuggestionMessage] = useState<string>();

  const hasChanges = useMemo(
    () => profileSignature(savedProfile) !== profileSignature(draftProfile),
    [draftProfile, savedProfile],
  );
  const isEmptyProfile = useMemo(
    () => isCareerProfileEmpty(savedProfile),
    [savedProfile],
  );
  useEffect(() => {
    const controller = new AbortController();

    void loadProfile(controller.signal);

    return () => controller.abort();
  }, []);

  async function loadProfile(signal?: AbortSignal) {
    setLoadStatus("loading");
    setFeedbackMessage(undefined);

    try {
      const body = await apiRequest<CareerProfileResponse>("/api/career-profile", {
        cache: "no-store",
        errorMessage: "Career DNA 读取失败，请稍后重试。",
        signal,
      });

      if (signal?.aborted) {
        return;
      }

      setSavedProfile(body.profile);
      setDraftProfile(body.profile);
      setLoadStatus("ready");
      setSaveStatus("idle");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setFeedbackMessage(
        readErrorMessage(error, "Career DNA 读取失败，请稍后重试。"),
      );
      setLoadStatus("error");
    }
  }

  function updateDraft(
    updater:
      | CareerProfileSettings
      | ((current: CareerProfileSettings) => CareerProfileSettings),
  ) {
    setDraftProfile((current) =>
      typeof updater === "function" ? updater(current) : updater,
    );
    setSaveStatus("idle");
    setFeedbackMessage(undefined);
  }

  function resetChanges() {
    setDraftProfile(savedProfile);
    setSaveStatus("idle");
    setFeedbackMessage("已重置为上次保存的 Career DNA。");
  }

  async function saveProfile() {
    if (!hasChanges || saveStatus === "saving") {
      return;
    }

    setSaveStatus("saving");
    setFeedbackMessage(undefined);

    try {
      const body = await apiRequest<CareerProfileSaveResponse>(
        "/api/career-profile",
        {
          errorMessage: "Career DNA 保存失败，请稍后重试。",
          json: {
            profile: {
              ...draftProfile,
              generatedSuggestions: draftProfile.generatedSuggestions?.slice(-80),
              updatedAt: new Date().toISOString(),
            },
          },
          method: "PUT",
        },
      );

      setSavedProfile(body.profile);
      setDraftProfile(body.profile);
      setSaveStatus("success");
      setFeedbackMessage("Career DNA 已保存。");
      window.setTimeout(() => {
        setSaveStatus((current) => (current === "success" ? "idle" : current));
      }, 1800);
    } catch (error) {
      setSaveStatus("error");
      setFeedbackMessage(
        `${readErrorMessage(error, "Career DNA 保存失败，请稍后重试。")} 当前更改仍保留在页面草稿中。`,
      );
    }
  }

  async function generateSuggestions() {
    if (suggestionStatus === "loading") {
      return;
    }

    setSuggestionStatus("loading");
    setSuggestionMessage(undefined);

    try {
      const body = await apiRequest<CareerProfileSuggestionsResponse>(
        "/api/career-profile/suggestions",
        {
          errorMessage: "画像建议生成失败，请稍后重试。",
          method: "POST",
        },
      );

      setSuggestions(body.suggestions);
      setSourceSummaries(body.sources);
      setSuggestionStatus("ready");
      setSuggestionMessage(
        body.count > 0
          ? `已生成 ${body.count} 条建议。接受或忽略后仍需点击保存才会写入画像。`
          : "当前暂无足够数据生成建议。",
      );
    } catch (error) {
      setSuggestionStatus("error");
      setSuggestionMessage(
        readErrorMessage(error, "画像建议生成失败，请稍后重试。"),
      );
    }
  }

  function acceptSuggestion(suggestion: CareerProfileSuggestion) {
    updateDraft((current) =>
      applySuggestionToProfile(recordSuggestionDecision(current, suggestion, true), suggestion),
    );
    setSuggestions((current) =>
      current.map((item) =>
        item.id === suggestion.id ? { ...item, accepted: true } : item,
      ),
    );
    setSuggestionMessage("建议已加入草稿。请检查字段内容，确认后点击保存。");
  }

  function ignoreSuggestion(suggestion: CareerProfileSuggestion) {
    updateDraft((current) => recordSuggestionDecision(current, suggestion, false));
    setSuggestions((current) =>
      current.map((item) =>
        item.id === suggestion.id ? { ...item, accepted: false } : item,
      ),
    );
    setSuggestionMessage("已在草稿中标记为忽略。保存后该决定会记录在本地画像中。");
  }

  if (loadStatus === "loading") {
    return <CareerProfileSkeleton />;
  }

  if (loadStatus === "error") {
    return (
      <ErrorState
        action={
          <Button
            leftIcon={<RefreshCw aria-hidden="true" className="size-4" />}
            onClick={() => void loadProfile()}
            variant="primary"
          >
            重新加载
          </Button>
        }
        description={feedbackMessage}
        title="Career DNA 加载失败"
      />
    );
  }

  return (
    <div className="space-y-6 pb-28">
      {isEmptyProfile ? (
        <EmptyState
          action={
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                leftIcon={<Sparkles aria-hidden="true" className="size-4" />}
                onClick={() => void generateSuggestions()}
              >
                从本地数据生成建议
              </Button>
              <Button
                leftIcon={<Plus aria-hidden="true" className="size-4" />}
                onClick={() =>
                  updateDraft((current) => ({
                    ...current,
                    targetRoles: current.targetRoles.length
                      ? current.targetRoles
                      : ["AI 产品经理"],
                  }))
                }
                variant="outline"
              >
                先手动填写
              </Button>
            </div>
          }
          description="画像为空时，后续 Analytics 和 Assistant 只能读取 Tracker 与报告。你可以手动填写，也可以先生成一组待确认建议。"
          icon={<BrainCircuit aria-hidden="true" className="size-6" strokeWidth={1.8} />}
          title="还没有 Career DNA"
        />
      ) : null}

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <ProfileSection
            description="把求职方向写成可筛选的本地条件，后续分析会用它判断岗位是否偏离目标。"
            icon={<Target aria-hidden="true" className="size-5" strokeWidth={1.8} />}
            title="目标与偏好"
          >
            <div className="space-y-6">
              <ToggleGroup
                label="目标 AI 方向"
                options={RESUME_DIRECTION_OPTIONS}
                selected={draftProfile.targetDirections}
                onToggle={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    targetDirections: toggleValue(current.targetDirections, value),
                  }))
                }
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ListTextField
                  helperText="用逗号、顿号或换行分隔。"
                  label="目标岗位"
                  onChange={(items) =>
                    updateDraft((current) => ({ ...current, targetRoles: items }))
                  }
                  placeholder="AI 产品经理、Agent 产品负责人"
                  values={draftProfile.targetRoles}
                />
                <ListTextField
                  helperText="例如：上海、北京、杭州、深圳。"
                  label="目标城市"
                  onChange={(items) =>
                    updateDraft((current) => ({ ...current, targetCities: items }))
                  }
                  placeholder="上海、杭州"
                  values={draftProfile.targetCities}
                />
              </div>

              <ToggleGroup
                label="工作模式"
                options={CAREER_PROFILE_WORK_MODES.map((mode) => ({
                  label: WORK_MODE_LABELS[mode],
                  value: mode,
                }))}
                selected={draftProfile.preferredWorkModes}
                onToggle={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    preferredWorkModes: toggleValue(
                      current.preferredWorkModes,
                      value,
                    ),
                  }))
                }
              />

              <SalaryEditor
                profile={draftProfile}
                updateDraft={updateDraft}
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ListTextField
                  helperText="这些条件会作为后续岗位过滤的硬边界。"
                  label="不接受条件"
                  onChange={(items) =>
                    updateDraft((current) => ({ ...current, dealBreakers: items }))
                  }
                  placeholder="不明确薪资范围、过度销售包装"
                  values={draftProfile.dealBreakers}
                />
                <ListTextField
                  helperText="例如：A 轮后、上市公司、成熟产品团队。"
                  label="公司阶段偏好"
                  onChange={(items) =>
                    updateDraft((current) => ({
                      ...current,
                      preferredCompanyStages: items,
                    }))
                  }
                  placeholder="B 轮以上、成熟 AI 产品团队"
                  values={draftProfile.preferredCompanyStages}
                />
              </div>
            </div>
          </ProfileSection>

          <ProfileSection
            description="优势和短板都要能落到证据或补救策略，避免变成无法验证的自我描述。"
            icon={<BadgeCheck aria-hidden="true" className="size-5" strokeWidth={1.8} />}
            title="优势与短板"
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <EvidenceListEditor
                addLabel="新增优势"
                detailLabel="证据"
                detailPlaceholder="项目结果、上线指标、面试可讲证据"
                emptyText="暂未记录核心优势。"
                items={draftProfile.strengths}
                onChange={(items) =>
                  updateDraft((current) => ({ ...current, strengths: items }))
                }
                title="核心优势"
              />
              <EvidenceListEditor
                addLabel="新增短板"
                detailKey="mitigation"
                detailLabel="补救策略"
                detailPlaceholder="如何补证据、绕开风险或准备回答"
                emptyText="暂未记录能力短板。"
                items={draftProfile.weaknesses}
                onChange={(items) =>
                  updateDraft((current) => ({ ...current, weaknesses: items }))
                }
                title="能力短板"
              />
            </div>
          </ProfileSection>

          <ProfileSection
            description="写下当前阶段的打法，后续分析和 Assistant 会用它判断下一步是否聚焦。"
            icon={<Sparkles aria-hidden="true" className="size-5" strokeWidth={1.8} />}
            title="当前策略"
          >
            <Textarea
              helperText="例如：优先推进高匹配 LLM 应用层岗位，每周复盘 Tracker，补齐 RAG 评测和商业化案例证据。"
              label="求职策略"
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  currentStrategy: event.target.value,
                }))
              }
              value={draftProfile.currentStrategy ?? ""}
            />
          </ProfileSection>
        </div>

        <aside className="space-y-6">
          <SuggestionPanel
            draftProfile={draftProfile}
            message={suggestionMessage}
            onAccept={acceptSuggestion}
            onGenerate={() => void generateSuggestions()}
            onIgnore={ignoreSuggestion}
            sourceSummaries={sourceSummaries}
            status={suggestionStatus}
            suggestions={suggestions}
          />
          <SavedSuggestionHistory profile={draftProfile} />
        </aside>
      </section>

      <SaveFeedback message={feedbackMessage} status={saveStatus} />
      <SaveActionBar
        hasChanges={hasChanges}
        onReset={resetChanges}
        onSave={() => void saveProfile()}
        saveStatus={saveStatus}
      />
    </div>
  );
}

function ProfileSection({
  children,
  description,
  icon,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
          {icon}
        </div>
        <div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ToggleGroup<TValue extends string>({
  label,
  onToggle,
  options,
  selected,
}: {
  label: string;
  onToggle: (value: TValue) => void;
  options: Array<{ label: string; value: TValue }>;
  selected: TValue[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold leading-5 text-[var(--color-text-secondary)]">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);

          return (
            <button
              aria-pressed={isSelected}
              className={`rounded-[12px] border px-3 py-2 text-xs font-bold leading-4 transition-all active:scale-[0.98] ${
                isSelected
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              }`}
              key={option.value}
              onClick={() => onToggle(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ListTextField({
  helperText,
  label,
  onChange,
  placeholder,
  values,
}: {
  helperText: string;
  label: string;
  onChange: (items: string[]) => void;
  placeholder: string;
  values: string[];
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-bold leading-5 text-[var(--color-text-secondary)]">
        {label}
      </span>
      <textarea
        className="min-h-24 w-full resize-y rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base leading-7 text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]"
        onChange={(event) => onChange(parseTextList(event.target.value))}
        placeholder={placeholder}
        value={values.join("、")}
      />
      <span className="block text-xs leading-5 text-[var(--color-text-secondary)]">
        {helperText}
      </span>
    </label>
  );
}

function SalaryEditor({
  profile,
  updateDraft,
}: {
  profile: CareerProfileSettings;
  updateDraft: (
    updater: (current: CareerProfileSettings) => CareerProfileSettings,
  ) => void;
}) {
  const salary = profile.salaryExpectation ?? {};

  return (
    <div className="rounded-[18px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-bold leading-5 text-[var(--color-text-secondary)]">
          薪资期望
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
          <input
            checked={salary.negotiable ?? false}
            className="size-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[rgba(196,135,58,0.24)]"
            onChange={(event) =>
              updateDraft((current) => ({
                ...current,
                salaryExpectation: {
                  ...(current.salaryExpectation ?? {}),
                  negotiable: event.target.checked,
                },
              }))
            }
            type="checkbox"
          />
          可谈
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumberField
          label="月薪下限 K"
          onChange={(value) =>
            updateDraft((current) => ({
              ...current,
              salaryExpectation: {
                ...(current.salaryExpectation ?? {}),
                minMonthlyK: value,
              },
            }))
          }
          value={salary.minMonthlyK}
        />
        <NumberField
          label="月薪上限 K"
          onChange={(value) =>
            updateDraft((current) => ({
              ...current,
              salaryExpectation: {
                ...(current.salaryExpectation ?? {}),
                maxMonthlyK: value,
              },
            }))
          }
          value={salary.maxMonthlyK}
        />
      </div>
    </div>
  );
}

function NumberField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number | undefined) => void;
  value?: number;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
        {label}
      </span>
      <input
        className="w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base leading-6 text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]"
        min={0}
        onChange={(event) => {
          const nextValue = event.target.value.trim();

          onChange(nextValue ? Number(nextValue) : undefined);
        }}
        type="number"
        value={value ?? ""}
      />
    </label>
  );
}

function EvidenceListEditor<TItem extends CareerProfileStrength | CareerProfileWeakness>({
  addLabel,
  detailKey = "evidence",
  detailLabel,
  detailPlaceholder,
  emptyText,
  items,
  onChange,
  title,
}: {
  addLabel: string;
  detailKey?: "evidence" | "mitigation";
  detailLabel: string;
  detailPlaceholder: string;
  emptyText: string;
  items: TItem[];
  onChange: (items: TItem[]) => void;
  title: string;
}) {
  function updateItem(index: number, patch: Partial<TItem>) {
    onChange(
      items.map((item, itemIndex) =>
        itemIndex === index ? ({ ...item, ...patch } as TItem) : item,
      ),
    );
  }

  return (
    <div className="rounded-[18px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-bold leading-6 text-[var(--color-text)]">
          {title}
        </h3>
        <button
          className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-bold leading-4 text-[var(--color-primary)] transition-all hover:border-[var(--color-primary)] active:scale-[0.98]"
          onClick={() => onChange([...items, { title: "" } as TItem])}
          type="button"
        >
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.8} />
          {addLabel}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm leading-6 text-[var(--color-text-secondary)]">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              className="rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              key={index}
            >
              <div className="mb-3 flex items-start gap-3">
                <TextField
                  label="标题"
                  onChange={(value) => updateItem(index, { title: value } as Partial<TItem>)}
                  placeholder="例如：RAG 产品化经验"
                  value={item.title}
                />
                <button
                  aria-label={`删除${title}`}
                  className="mt-7 flex size-9 shrink-0 items-center justify-center rounded-[12px] border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-red)] hover:text-[var(--color-red)] active:scale-[0.98]"
                  onClick={() =>
                    onChange(items.filter((_, itemIndex) => itemIndex !== index))
                  }
                  type="button"
                >
                  <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.8} />
                </button>
              </div>
              <TextAreaMini
                label={detailLabel}
                onChange={(value) =>
                  updateItem(index, { [detailKey]: value } as Partial<TItem>)
                }
                placeholder={detailPlaceholder}
                value={readItemDetail(item, detailKey)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionPanel({
  draftProfile,
  message,
  onAccept,
  onGenerate,
  onIgnore,
  sourceSummaries,
  status,
  suggestions,
}: {
  draftProfile: CareerProfileSettings;
  message?: string;
  onAccept: (suggestion: CareerProfileSuggestion) => void;
  onGenerate: () => void;
  onIgnore: (suggestion: CareerProfileSuggestion) => void;
  sourceSummaries: CareerProfileSuggestionsResponse["sources"];
  status: SuggestionStatus;
  suggestions: CareerProfileSuggestion[];
}) {
  void sourceSummaries;

  const processedById = new Map(
    (draftProfile.generatedSuggestions ?? []).map((suggestion) => [
      suggestion.id,
      suggestion,
    ]),
  );

  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase leading-4 tracking-[0.14em] text-[var(--color-text-secondary)]">
            Suggestions
          </p>
          <h2 className="mt-2 text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            系统建议
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
            建议会先进入草稿，不会自动保存。
          </p>
        </div>
        <Button
          disabled={status === "loading"}
          leftIcon={
            status === "loading" ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Sparkles aria-hidden="true" className="size-4" />
            )
          }
          onClick={onGenerate}
          size="sm"
        >
          {status === "loading" ? "生成中" : "生成建议"}
        </Button>
      </div>

      {message ? (
        <div
          className={`mt-4 rounded-[14px] border px-4 py-3 text-sm leading-6 ${
            status === "error"
              ? "border-[#efd4d0] bg-[#fff0ee] text-[var(--color-red)]"
              : "border-[var(--color-border-light)] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]"
          }`}
          role={status === "error" ? "alert" : "status"}
        >
          {message}
        </div>
      ) : null}

      {status === "ready" && suggestions.length === 0 ? (
        <div className="mt-4 rounded-[18px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-hover)] px-4 py-8 text-center">
          <CircleSlash
            aria-hidden="true"
            className="mx-auto mb-3 size-8 text-[var(--color-muted)]"
            strokeWidth={1.8}
          />
          <p className="text-sm font-bold leading-5 text-[var(--color-text)]">
            暂无建议
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            设置默认简历、生成报告或维护 Tracker 后再试。
          </p>
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="mt-4 space-y-3">
          {suggestions.map((suggestion) => {
            const processed = processedById.get(suggestion.id);

            return (
              <article
                className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4"
                key={suggestion.id}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {suggestion.field ? (
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold leading-4 text-[var(--color-text-secondary)]">
                      {FIELD_LABELS[suggestion.field]}
                    </span>
                  ) : null}
                </div>
                <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
                  {suggestion.title}
                </h3>
                <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
                  {suggestion.detail}
                </p>

                {processed ? (
                  <div className="mt-4 flex items-center gap-2 rounded-[12px] border border-[var(--color-border-light)] bg-white px-3 py-2 text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
                    {processed.accepted ? (
                      <CheckCircle2
                        aria-hidden="true"
                        className="size-4 text-[var(--color-green)]"
                        strokeWidth={1.8}
                      />
                    ) : (
                      <X
                        aria-hidden="true"
                        className="size-4 text-[var(--color-muted)]"
                        strokeWidth={1.8}
                      />
                    )}
                    {processed.accepted ? "已接受到草稿" : "已标记忽略"}
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      leftIcon={<Check aria-hidden="true" className="size-4" />}
                      onClick={() => onAccept(suggestion)}
                      size="sm"
                    >
                      接受
                    </Button>
                    <Button
                      leftIcon={<X aria-hidden="true" className="size-4" />}
                      onClick={() => onIgnore(suggestion)}
                      size="sm"
                      variant="outline"
                    >
                      忽略
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function SavedSuggestionHistory({ profile }: { profile: CareerProfileSettings }) {
  const suggestions = profile.generatedSuggestions ?? [];

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)]">
      <h2 className="text-base font-bold leading-6 text-[var(--color-text)]">
        已处理建议
      </h2>
      <div className="mt-4 space-y-2">
        {suggestions.slice(-6).map((suggestion) => (
          <div
            className="rounded-[14px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] px-3 py-3"
            key={`${suggestion.id}-${suggestion.accepted}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-xs font-bold leading-4 text-[var(--color-text)]">
                {suggestion.title}
              </p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold leading-4 ${
                  suggestion.accepted
                    ? "bg-[#eef6eb] text-[#5f7f50]"
                    : "bg-[var(--color-surface)] text-[var(--color-muted)]"
                }`}
              >
                {suggestion.accepted ? "已接受" : "已忽略"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SaveActionBar({
  hasChanges,
  onReset,
  onSave,
  saveStatus,
}: {
  hasChanges: boolean;
  onReset: () => void;
  onSave: () => void;
  saveStatus: SaveStatus;
}) {
  const isSaving = saveStatus === "saving";

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-5 z-20 flex justify-center lg:left-[280px] lg:right-8">
      <div className="pointer-events-auto flex w-full max-w-[680px] flex-col gap-3 rounded-[24px] border border-[var(--color-floating-bar-border)] bg-[var(--color-floating-bar-bg)] px-5 py-4 shadow-[var(--shadow-floating-bar)] backdrop-blur-md sm:w-auto sm:flex-row sm:items-center sm:gap-6 sm:rounded-full sm:px-8">
        <p className="text-center text-xs leading-4 text-[var(--color-text-secondary)] sm:text-left">
          {saveStatus === "error"
            ? "保存失败，当前更改未写入"
            : hasChanges
              ? "Career DNA 有未保存更改"
              : "Career DNA 已是最新"}
        </p>
        <div className="flex justify-center gap-3">
          <Button
            disabled={!hasChanges || isSaving}
            leftIcon={<RotateCcw aria-hidden="true" className="size-4" />}
            onClick={onReset}
            variant="outline"
          >
            重置
          </Button>
          <Button
            disabled={!hasChanges || isSaving}
            leftIcon={
              isSaving ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Save aria-hidden="true" className="size-4" />
              )
            }
            onClick={onSave}
          >
            {isSaving ? "保存中" : "保存画像"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SaveFeedback({
  message,
  status,
}: {
  message?: string;
  status: SaveStatus;
}) {
  if (!message || status === "saving") {
    return null;
  }

  const isError = status === "error";
  const Icon = isError ? AlertTriangle : CheckCircle2;

  return (
    <div className="fixed right-5 top-5 z-40 lg:left-[260px] lg:right-auto">
      <div
        className={`flex max-w-sm items-center gap-3 rounded-[16px] border px-4 py-3 shadow-[var(--shadow-md)] ${
          isError
            ? "border-[#efd4d0] bg-[#fff0ee] text-[var(--color-red)]"
            : "border-[#d7e7d2] bg-[#eef6eb] text-[#5f7f50]"
        }`}
        role={isError ? "alert" : "status"}
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.8} />
        <p className="text-sm font-bold leading-5">{message}</p>
      </div>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "amber" | "blue" | "green" | "neutral";
}) {
  const classes = {
    amber: "border-[#eedaa6] bg-[#fff7df] text-[#875006]",
    blue: "border-[#cfe2f7] bg-[#f1f7ff] text-[#2f6aa3]",
    green: "border-[#d7e7d2] bg-[#eef6eb] text-[#5f7f50]",
    neutral:
      "border-[var(--color-border)] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]",
  }[tone];

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold leading-4 ${classes}`}>
      {label}
    </span>
  );
}

function TextField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="block flex-1 space-y-2">
      <span className="block text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
        {label}
      </span>
      <input
        className="w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm leading-5 text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
    </label>
  );
}

function TextAreaMini({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
        {label}
      </span>
      <textarea
        className="min-h-20 w-full resize-y rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm leading-6 text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function CareerProfileSkeleton() {
  return (
    <div className="space-y-6 pb-28">
      <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)]">
        <div className="h-4 w-44 animate-pulse rounded-full bg-[var(--color-border-light)]" />
        <div className="mt-4 h-8 w-72 max-w-full animate-pulse rounded-full bg-[var(--color-border-light)]" />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              className="h-20 animate-pulse rounded-[16px] bg-[var(--color-border-light)]"
              key={index}
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              className="min-h-72 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)]"
              key={index}
            >
              <div className="h-8 w-40 animate-pulse rounded-full bg-[var(--color-border-light)]" />
              <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="h-24 animate-pulse rounded-[14px] bg-[var(--color-border-light)]" />
                <div className="h-24 animate-pulse rounded-[14px] bg-[var(--color-border-light)]" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]" />
      </div>
    </div>
  );
}

function createEmptyProfile(): CareerProfileSettings {
  return {
    currentStrategy: "",
    dealBreakers: [],
    generatedSuggestions: [],
    preferredCompanyStages: [],
    preferredWorkModes: [],
    salaryExpectation: {
      negotiable: true,
    },
    strengths: [],
    targetCities: [],
    targetDirections: [],
    targetRoles: [],
    updatedAt: new Date().toISOString(),
    weaknesses: [],
  };
}

function applySuggestionToProfile(
  profile: CareerProfileSettings,
  suggestion: CareerProfileSuggestion,
): CareerProfileSettings {
  if (!suggestion.field) {
    return profile;
  }

  if (suggestion.field === "targetDirections") {
    return {
      ...profile,
      targetDirections: mergeValues(
        profile.targetDirections,
        readDirectionArray(suggestion.value),
      ),
    };
  }

  if (suggestion.field === "preferredWorkModes") {
    return {
      ...profile,
      preferredWorkModes: mergeValues(
        profile.preferredWorkModes,
        readWorkModeArray(suggestion.value),
      ),
    };
  }

  if (suggestion.field === "targetRoles") {
    return {
      ...profile,
      targetRoles: mergeValues(profile.targetRoles, readStringArray(suggestion.value)),
    };
  }

  if (suggestion.field === "targetCities") {
    return {
      ...profile,
      targetCities: mergeValues(profile.targetCities, readStringArray(suggestion.value)),
    };
  }

  if (suggestion.field === "dealBreakers") {
    return {
      ...profile,
      dealBreakers: mergeValues(
        profile.dealBreakers,
        readStringArray(suggestion.value),
      ),
    };
  }

  if (suggestion.field === "preferredCompanyStages") {
    return {
      ...profile,
      preferredCompanyStages: mergeValues(
        profile.preferredCompanyStages,
        readStringArray(suggestion.value),
      ),
    };
  }

  if (suggestion.field === "strengths") {
    return {
      ...profile,
      strengths: mergeEvidenceItems(profile.strengths, readStrengths(suggestion.value)),
    };
  }

  if (suggestion.field === "weaknesses") {
    return {
      ...profile,
      weaknesses: mergeEvidenceItems(
        profile.weaknesses,
        readWeaknesses(suggestion.value),
      ),
    };
  }

  if (suggestion.field === "salaryExpectation") {
    const salary = readSalaryExpectation(suggestion.value);

    return salary ? { ...profile, salaryExpectation: salary } : profile;
  }

  if (suggestion.field === "currentStrategy") {
    const strategy = readStringValue(suggestion.value) ?? suggestion.detail;
    const current = profile.currentStrategy?.trim();

    return {
      ...profile,
      currentStrategy: current
        ? mergeValues([current], [strategy]).join("\n")
        : strategy,
    };
  }

  return profile;
}

function recordSuggestionDecision(
  profile: CareerProfileSettings,
  suggestion: CareerProfileSuggestion,
  accepted: boolean,
): CareerProfileSettings {
  const nextSuggestion = {
    ...suggestion,
    accepted,
  };
  const existing = profile.generatedSuggestions ?? [];

  return {
    ...profile,
    generatedSuggestions: [
      ...existing.filter((item) => item.id !== suggestion.id),
      nextSuggestion,
    ],
  };
}

function parseTextList(value: string): string[] {
  return uniqueStrings(
    value
      .split(LIST_SEPARATOR_PATTERN)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function toggleValue<TValue extends string>(values: TValue[], value: TValue): TValue[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function mergeValues<TValue extends string>(current: TValue[], next: TValue[]): TValue[] {
  return uniqueStrings([...current, ...next]) as TValue[];
}

function mergeEvidenceItems<
  TItem extends CareerProfileStrength | CareerProfileWeakness,
>(current: TItem[], next: TItem[]): TItem[] {
  const byTitle = new Map<string, TItem>();

  for (const item of [...current, ...next]) {
    const title = item.title.trim();

    if (!title) {
      continue;
    }

    byTitle.set(title.toLocaleLowerCase(), { ...item, title });
  }

  return Array.from(byTitle.values());
}

function readDirectionArray(value: JsonValue | undefined): ResumeDirection[] {
  return readStringArray(value).filter(
    (item): item is ResumeDirection => item in RESUME_DIRECTION_LABELS,
  );
}

function readWorkModeArray(value: JsonValue | undefined): CareerProfileWorkMode[] {
  return readStringArray(value).filter((item): item is CareerProfileWorkMode =>
    CAREER_PROFILE_WORK_MODES.includes(item as CareerProfileWorkMode),
  );
}

function readStringArray(value: JsonValue | undefined): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.filter((item): item is string => typeof item === "string"));
  }

  if (typeof value === "string") {
    return [value];
  }

  return [];
}

function readStrengths(value: JsonValue | undefined): CareerProfileStrength[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readRecord(item))
    .filter((item): item is JsonObject => Boolean(item))
    .map((item) => ({
      evidence: readStringValue(item.evidence),
      title: readStringValue(item.title) ?? "",
    }))
    .filter((item) => item.title.trim().length > 0);
}

function readWeaknesses(value: JsonValue | undefined): CareerProfileWeakness[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readRecord(item))
    .filter((item): item is JsonObject => Boolean(item))
    .map((item) => ({
      mitigation: readStringValue(item.mitigation),
      title: readStringValue(item.title) ?? "",
    }))
    .filter((item) => item.title.trim().length > 0);
}

function readSalaryExpectation(value: JsonValue | undefined) {
  const record = readRecord(value);

  if (!record) {
    return undefined;
  }

  return {
    maxMonthlyK: readNumberValue(record.maxMonthlyK),
    minMonthlyK: readNumberValue(record.minMonthlyK),
    negotiable:
      typeof record.negotiable === "boolean" ? record.negotiable : undefined,
  };
}

function readItemDetail(
  item: CareerProfileStrength | CareerProfileWeakness,
  detailKey: "evidence" | "mitigation",
): string {
  return detailKey === "evidence"
    ? ("evidence" in item ? item.evidence : undefined) ?? ""
    : ("mitigation" in item ? item.mitigation : undefined) ?? "";
}

function profileSignature(profile: CareerProfileSettings): string {
  const rest: Partial<CareerProfileSettings> = { ...profile };

  delete rest.updatedAt;
  return JSON.stringify(rest);
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
    !profile.currentStrategy?.trim() &&
    profile.salaryExpectation?.minMonthlyK === undefined &&
    profile.salaryExpectation?.maxMonthlyK === undefined
  );
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

function readRecord(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : undefined;
}

function readStringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readNumberValue(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
