"use client";

import { useEffect, useMemo, useState } from "react";
import { Columns2, ScanSearch } from "lucide-react";
import { RiskScanEducation } from "@/components/features/risks/RiskScanEducation";
import { RiskScanInputPanel } from "@/components/features/risks/RiskScanInputPanel";
import { RiskScanResults } from "@/components/features/risks/RiskScanResults";
import { RiskBenchmarkPanel } from "@/components/features/risks/RiskBenchmarkPanel";
import { RiskComparisonWorkspace } from "@/components/features/risks/RiskComparisonWorkspace";
import {
  createIdleLayers,
  createScanningLayers,
  buildPresetScanResult,
  demoJobs,
  findDemoPreset,
  mapApiResponseToScanResult,
  type DemoVariant,
  type ScanResult,
  type ScanRiskApiResponse,
} from "@/components/features/risks/riskScanModel";
import { apiRequest } from "@/lib/api-client";

const MIN_SCAN_LENGTH = 30;
type ScanState = "idle" | "too_short" | "scanning" | "done" | "error";
type RiskScanMode = "single" | "comparison";

export function RiskScanWorkspace() {
  const [mode, setMode] = useState<RiskScanMode>("single");
  const [jobText, setJobText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [selectedDemoId, setSelectedDemoId] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    if (!isScanning) {
      return;
    }

    const timer = window.setInterval(() => {
      setScanStep((current) => {
        if (current >= 3) {
          window.clearInterval(timer);
          return current;
        }

        return current + 1;
      });
    }, 520);

    return () => window.clearInterval(timer);
  }, [isScanning]);

  const layers = useMemo(() => {
    if (isScanning) {
      return createScanningLayers(scanStep);
    }

    return result?.layers ?? createIdleLayers();
  }, [isScanning, result?.layers, scanStep]);

  async function handleScan() {
    const normalized = jobText.trim();

    if (normalized.length < MIN_SCAN_LENGTH) {
      setError(`JD 文本过短，至少需要 ${MIN_SCAN_LENGTH} 个字符。`);
      setScanState("too_short");
      setResult(null);
      return;
    }

    setError(null);
    setResult(null);
    setScanStep(0);
    setScanState("scanning");
    setIsScanning(true);

    try {
      const selectedDemo = selectedDemoId ? findDemoPreset(selectedDemoId) : undefined;
      const body = await apiRequest<Extract<ScanRiskApiResponse, { ok: true }>>(
        "/api/scan-risks",
        {
          errorMessage: "风险扫描失败，请稍后重试。",
          json: {
            jdText: normalized,
            company: selectedDemo?.company,
            role: selectedDemo?.role,
          },
          method: "POST",
        },
      );

      setResult(mapApiResponseToScanResult(body));
      setScanState("done");
    } catch (scanError) {
      const fallbackResult = selectedDemoId
        ? buildPresetScanResult(selectedDemoId)
        : null;

      if (fallbackResult) {
        setResult(fallbackResult);
        setError(null);
        setScanState("done");
      } else {
        setError(
          scanError instanceof Error
            ? scanError.message
            : "风险扫描失败，请稍后重试。",
        );
        setScanState("error");
      }
    } finally {
      setIsScanning(false);
    }
  }

  function handleChange(value: string) {
    setJobText(value);
    setSelectedDemoId(null);
    setScanState("idle");
    setResult(null);

    if (error) {
      setError(null);
    }
  }

  function useDemo(variant: DemoVariant) {
    const demo = demoJobs[variant].jd;
    setJobText(demo);
    setSelectedDemoId(demoJobs[variant].id);
    setError(null);
    setResult(null);
    setIsScanning(false);
    setScanStep(0);
    setScanState("idle");
  }

  function usePresetDemo(id: string) {
    const demo = findDemoPreset(id);

    if (!demo) {
      return;
    }

    setJobText(demo.jdText);
    setSelectedDemoId(demo.id);
    setError(null);
    setResult(null);
    setIsScanning(false);
    setScanStep(0);
    setScanState("idle");
  }

  const selectedDemo = selectedDemoId ? findDemoPreset(selectedDemoId) : undefined;

  return (
    <div className="space-y-8">
      <RiskModeTabs mode={mode} onChange={setMode} />

      {mode === "single" ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-8 lg:col-span-8">
            <RiskScanInputPanel
              error={error}
              isScanning={isScanning}
              layers={layers}
              onChange={handleChange}
              onScan={handleScan}
              onUsePresetDemo={usePresetDemo}
              onUseDemo={useDemo}
              selectedDemoId={selectedDemoId}
              value={jobText}
            />
          </div>

          <aside className="lg:col-span-4">
            <div className="sticky top-6">
              <RiskScanResults
                company={selectedDemo?.company}
                error={error}
                isScanning={isScanning}
                jdText={jobText}
                result={result}
                role={selectedDemo?.role}
                state={scanState}
              />
            </div>
          </aside>
        </div>
      ) : (
        <RiskComparisonWorkspace />
      )}

      <RiskBenchmarkPanel />
      {mode === "single" ? <RiskScanEducation /> : null}
    </div>
  );
}

function RiskModeTabs({
  mode,
  onChange,
}: {
  mode: RiskScanMode;
  onChange: (mode: RiskScanMode) => void;
}) {
  const items: Array<{
    icon: typeof ScanSearch;
    label: string;
    value: RiskScanMode;
  }> = [
    { icon: ScanSearch, label: "单岗验真", value: "single" },
    { icon: Columns2, label: "真假对决", value: "comparison" },
  ];

  return (
    <div
      aria-label="风险扫描模式"
      className="inline-grid w-full grid-cols-2 gap-1 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-sm)] sm:w-auto"
      role="tablist"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = mode === item.value;

        return (
          <button
            aria-selected={isActive}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] px-4 py-2 text-sm font-bold transition-all active:scale-[0.98] ${
              isActive
                ? "bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)]"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)]"
            }`}
            data-testid={`risk-mode-${item.value}`}
            key={item.value}
            onClick={() => onChange(item.value)}
            role="tab"
            type="button"
          >
            <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
