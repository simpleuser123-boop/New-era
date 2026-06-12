import { ArrowLeftRight, ChevronDown, LoaderCircle, Play } from "lucide-react";
import {
  getPresetTypeLabel,
  type DemoPresetOption,
  type RiskComparisonPair,
} from "@/components/features/risks/riskScanModel";

type RiskComparisonSelectorProps = {
  isScanning: boolean;
  leftId: string;
  options: DemoPresetOption[];
  pairs: RiskComparisonPair[];
  rightId: string;
  selectedPairId: string | null;
  onLeftChange: (id: string) => void;
  onPairChange: (id: string) => void;
  onRightChange: (id: string) => void;
  onScan: () => void;
  onSwap: () => void;
};

export function RiskComparisonSelector({
  isScanning,
  leftId,
  options,
  pairs,
  rightId,
  selectedPairId,
  onLeftChange,
  onPairChange,
  onRightChange,
  onScan,
  onSwap,
}: RiskComparisonSelectorProps) {
  const leftPreset = options.find((option) => option.id === leftId);
  const rightPreset = options.find((option) => option.id === rightId);
  const canScan = Boolean(leftPreset && rightPreset && leftId !== rightId);

  return (
    <section className="rounded-[24px] border border-[var(--color-border-light)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
            对决组合
          </p>
          <h2 className="mt-2 text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            选择两份预置 JD
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">
            两侧都会调用同一套风险扫描 API；本页不抓取外部平台，也不会保存对决结果。
          </p>
        </div>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-5 py-3 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] hover:shadow-[var(--shadow-lg)] active:scale-[0.98] disabled:pointer-events-none disabled:bg-[var(--color-border)] disabled:text-[var(--color-muted)]"
          disabled={!canScan || isScanning}
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
            <Play aria-hidden="true" className="size-5" strokeWidth={1.8} />
          )}
          {isScanning ? "双侧扫描中" : "开始对决扫描"}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {pairs.map((pair) => (
          <button
            aria-pressed={selectedPairId === pair.id}
            className={`min-h-24 rounded-[16px] border p-4 text-left transition-all active:scale-[0.99] ${
              selectedPairId === pair.id
                ? "border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                : "border-[var(--color-border-light)] bg-[var(--color-surface-hover)] text-[var(--color-text)] hover:border-[var(--color-primary)]"
            }`}
            key={pair.id}
            onClick={() => onPairChange(pair.id)}
            type="button"
          >
            <span className="block text-sm font-bold leading-5">{pair.label}</span>
            <span className="mt-2 block text-xs leading-5 text-[var(--color-text-secondary)]">
              {pair.description}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
        <PresetSelect
          disabledId={rightId}
          label="岗位 A"
          options={options}
          value={leftId}
          onChange={onLeftChange}
        />
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] px-4 py-3 text-sm font-bold text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] active:scale-[0.98]"
          onClick={onSwap}
          type="button"
        >
          <ArrowLeftRight aria-hidden="true" className="size-5" strokeWidth={1.8} />
          交换左右
        </button>
        <PresetSelect
          disabledId={leftId}
          label="岗位 B"
          options={options}
          value={rightId}
          onChange={onRightChange}
        />
      </div>
    </section>
  );
}

function PresetSelect({
  disabledId,
  label,
  options,
  value,
  onChange,
}: {
  disabledId: string;
  label: string;
  options: DemoPresetOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const selected = options.find((option) => option.id === value);

  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
        {label}
      </span>
      <span className="relative block">
        <select
          className="min-h-12 w-full appearance-none rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] py-3 pl-3 pr-10 text-sm font-bold leading-5 text-[var(--color-text)] outline-none transition-all hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.16)]"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          {options.map((option) => (
            <option
              disabled={option.id === disabledId}
              key={option.id}
              value={option.id}
            >
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-secondary)]"
          strokeWidth={1.8}
        />
      </span>
      {selected ? (
        <span className="mt-2 block text-xs leading-5 text-[var(--color-text-secondary)]">
          {getPresetTypeLabel(selected.type)} · {selected.company} · {selected.role}
        </span>
      ) : null}
    </label>
  );
}
