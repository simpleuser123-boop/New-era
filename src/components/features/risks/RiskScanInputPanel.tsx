import {
  AlertCircle,
  Building2,
  ChevronDown,
  FileSearch,
  LoaderCircle,
  MessageSquareWarning,
  Radar,
  ScanSearch,
} from "lucide-react";
import {
  demoJobs,
  demoPresetOptions,
  type DemoVariant,
  type ScanLayer,
} from "@/components/features/risks/riskScanModel";

type RiskScanInputPanelProps = {
  value: string;
  error: string | null;
  isScanning: boolean;
  layers: ScanLayer[];
  selectedDemoId: string | null;
  onChange: (value: string) => void;
  onScan: () => void;
  onUseDemo: (variant: DemoVariant) => void;
  onUsePresetDemo: (id: string) => void;
};

const layerIcons = {
  text: FileSearch,
  company: Building2,
  community: MessageSquareWarning,
};

const layerToneClass = {
  primary: {
    shell: "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
    bar: "bg-[var(--color-primary)]",
    text: "text-[var(--color-primary)]",
  },
  blue: {
    shell: "bg-[#e8f0f5] text-[var(--color-blue)]",
    bar: "bg-[var(--color-blue)]",
    text: "text-[var(--color-blue)]",
  },
  muted: {
    shell: "bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]",
    bar: "bg-[var(--color-text-secondary)]",
    text: "text-[var(--color-text-secondary)]",
  },
};

const demoButtonBaseClass =
  "rounded-[10px] border px-3 py-2 text-sm font-bold transition-all active:scale-[0.98]";

const demoButtonActiveClass =
  "border-transparent bg-[var(--color-primary-light)] text-[var(--color-primary)] hover:bg-[rgba(196,135,58,0.2)]";

const demoButtonInactiveClass =
  "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]";

export function RiskScanInputPanel({
  value,
  error,
  isScanning,
  layers,
  selectedDemoId,
  onChange,
  onScan,
  onUseDemo,
  onUsePresetDemo,
}: RiskScanInputPanelProps) {
  const isRiskyDemoSelected = selectedDemoId === demoJobs.risky.id;
  const isSafeDemoSelected = selectedDemoId === demoJobs.safe.id;

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-[var(--color-border-light)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-8">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label
              className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]"
              htmlFor="risk-jd-input"
            >
              职位描述 JD
            </label>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
              粘贴职位描述正文，系统会识别培训贷、虚假挂靠和非 AI 核心岗。
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              aria-pressed={isRiskyDemoSelected}
              className={`${demoButtonBaseClass} ${
                isRiskyDemoSelected ? demoButtonActiveClass : demoButtonInactiveClass
              }`}
              onClick={() => onUseDemo("risky")}
              type="button"
            >
              填入高风险 JD
            </button>
            <button
              aria-pressed={isSafeDemoSelected}
              className={`${demoButtonBaseClass} ${
                isSafeDemoSelected ? demoButtonActiveClass : demoButtonInactiveClass
              }`}
              onClick={() => onUseDemo("safe")}
              type="button"
            >
              填入低风险 JD
            </button>
            <div className="relative min-w-48">
              <select
                aria-label="选择典型 JD"
                className="h-full w-full appearance-none rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-3 pr-9 text-sm font-bold text-[var(--color-text-secondary)] outline-none transition-all hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.16)]"
                onChange={(event) => {
                  if (event.target.value) {
                    onUsePresetDemo(event.target.value);
                  }
                }}
                value={selectedDemoId ?? ""}
              >
                <option value="">选择典型 JD</option>
                {demoPresetOptions.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-secondary)]"
                strokeWidth={1.8}
              />
            </div>
          </div>
        </div>

        <textarea
          aria-describedby={error ? "risk-jd-error" : "risk-jd-helper"}
          className={`h-40 w-full resize-none rounded-[18px] border bg-[var(--color-surface-hover)] p-4 text-base leading-7 text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-muted)] focus:bg-white focus:ring-2 sm:h-48 ${
            error
              ? "border-[var(--color-red)] focus:border-[var(--color-red)] focus:ring-[rgba(196,102,90,0.16)]"
              : "border-transparent focus:border-[var(--color-primary)] focus:ring-[rgba(196,135,58,0.18)]"
          }`}
          id="risk-jd-input"
          onChange={(event) => onChange(event.target.value)}
          placeholder="请粘贴职位描述、岗位要求、薪资说明或招聘网页正文。至少 30 个字符即可扫描。"
          value={value}
        />

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {error ? (
            <p
              className="flex items-center gap-2 text-xs font-medium leading-5 text-[var(--color-red)]"
              id="risk-jd-error"
            >
              <AlertCircle aria-hidden="true" className="size-4" strokeWidth={1.8} />
              {error}
            </p>
          ) : (
            <p
              className="text-xs leading-5 text-[var(--color-text-secondary)]"
              id="risk-jd-helper"
            >
              当前 {value.length} 字。建议包含岗位职责、任职要求、薪资和培训说明。
            </p>
          )}

          <button
            className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-6 py-3 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] hover:shadow-[var(--shadow-lg)] active:scale-[0.98] disabled:pointer-events-none disabled:bg-[var(--color-border)] disabled:text-[var(--color-muted)]"
            disabled={isScanning}
            onClick={onScan}
            type="button"
          >
            {isScanning ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-5 animate-spin"
                strokeWidth={1.8}
              />
            ) : (
              <ScanSearch aria-hidden="true" className="size-5" strokeWidth={1.8} />
            )}
            {isScanning ? "扫描中" : "一键扫描"}
          </button>
        </div>
      </section>

      <section className="rounded-[24px] border border-[var(--color-border-light)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-[12px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
            <Radar aria-hidden="true" className="size-5" strokeWidth={1.8} />
          </div>
          <div>
            <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
              3 层深度穿透检测
            </h2>
            <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
              确定性规则优先，语义补充兜底。
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {layers.map((layer) => (
            <DetectionLayer key={layer.id} layer={layer} />
          ))}
        </div>
      </section>
    </div>
  );
}

function DetectionLayer({ layer }: { layer: ScanLayer }) {
  const Icon = layerIcons[layer.id as keyof typeof layerIcons] ?? FileSearch;
  const tone = layerToneClass[layer.tone];

  return (
    <article className="flex items-start gap-4">
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${tone.shell}`}
      >
        <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold leading-5 text-[var(--color-text)]">
              {layer.title}
            </h3>
            <p className="text-xs leading-4 text-[var(--color-muted)]">
              {layer.subtitle}
            </p>
          </div>
          <span className={`shrink-0 text-xs font-bold leading-4 ${tone.text}`}>
            {layer.status}
          </span>
        </div>
        <div
          aria-label={`${layer.title}进度`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={layer.progress}
          className="h-2 overflow-hidden rounded-full bg-[var(--color-border-light)]"
          role="progressbar"
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${tone.bar}`}
            style={{ width: `${layer.progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
          {layer.detail}
        </p>
      </div>
    </article>
  );
}
