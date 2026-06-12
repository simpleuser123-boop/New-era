"use client";

import { useState } from "react";
import { RiskComparisonResult } from "@/components/features/risks/RiskComparisonResult";
import { RiskComparisonSelector } from "@/components/features/risks/RiskComparisonSelector";
import {
  buildPresetScanResult,
  demoPresetOptions,
  findDemoPreset,
  mapApiResponseToScanResult,
  riskComparisonPairs,
  type DemoPresetOption,
  type RiskComparisonSideResult,
  type ScanRiskApiResponse,
} from "@/components/features/risks/riskScanModel";
import { apiRequest, readErrorMessage } from "@/lib/api-client";

const initialPair = riskComparisonPairs[0];

export function RiskComparisonWorkspace() {
  const [selectedPairId, setSelectedPairId] = useState<string | null>(initialPair.id);
  const [leftId, setLeftId] = useState(initialPair.leftId);
  const [rightId, setRightId] = useState(initialPair.rightId);
  const [leftState, setLeftState] = useState<RiskComparisonSideResult>(() =>
    createIdleSide(initialPair.leftId),
  );
  const [rightState, setRightState] = useState<RiskComparisonSideResult>(() =>
    createIdleSide(initialPair.rightId),
  );

  const isScanning =
    leftState.status === "scanning" || rightState.status === "scanning";

  function updateSelection(nextLeftId: string, nextRightId: string, pairId: string | null) {
    if (nextLeftId === nextRightId) {
      return;
    }

    const nextLeft = findDemoPreset(nextLeftId);
    const nextRight = findDemoPreset(nextRightId);

    if (!nextLeft || !nextRight) {
      return;
    }

    setLeftId(nextLeftId);
    setRightId(nextRightId);
    setSelectedPairId(pairId);
    setLeftState(createIdleSide(nextLeftId));
    setRightState(createIdleSide(nextRightId));
  }

  function handlePairChange(pairId: string) {
    const pair = riskComparisonPairs.find((item) => item.id === pairId);

    if (!pair) {
      return;
    }

    updateSelection(pair.leftId, pair.rightId, pair.id);
  }

  function handleLeftChange(nextLeftId: string) {
    updateSelection(nextLeftId, rightId, findMatchingPairId(nextLeftId, rightId));
  }

  function handleRightChange(nextRightId: string) {
    updateSelection(leftId, nextRightId, findMatchingPairId(leftId, nextRightId));
  }

  function handleSwap() {
    updateSelection(rightId, leftId, findMatchingPairId(rightId, leftId));
  }

  async function handleScan() {
    const leftPreset = findDemoPreset(leftId);
    const rightPreset = findDemoPreset(rightId);

    if (!leftPreset || !rightPreset || leftPreset.id === rightPreset.id) {
      return;
    }

    setLeftState({ error: null, preset: leftPreset, result: null, status: "scanning" });
    setRightState({ error: null, preset: rightPreset, result: null, status: "scanning" });

    const [nextLeft, nextRight] = await Promise.all([
      scanComparisonPreset(leftPreset),
      scanComparisonPreset(rightPreset),
    ]);

    setLeftState(nextLeft);
    setRightState(nextRight);
  }

  return (
    <div className="space-y-6" data-testid="risk-comparison-workspace">
      <RiskComparisonSelector
        isScanning={isScanning}
        leftId={leftId}
        options={demoPresetOptions}
        pairs={riskComparisonPairs}
        rightId={rightId}
        selectedPairId={selectedPairId}
        onLeftChange={handleLeftChange}
        onPairChange={handlePairChange}
        onRightChange={handleRightChange}
        onScan={handleScan}
        onSwap={handleSwap}
      />

      <RiskComparisonResult left={leftState} right={rightState} />
    </div>
  );
}

function createIdleSide(id: string): RiskComparisonSideResult {
  const preset = findDemoPreset(id) ?? demoPresetOptions[0];

  return {
    error: null,
    preset,
    result: null,
    status: "idle",
  };
}

function findMatchingPairId(leftId: string, rightId: string) {
  return (
    riskComparisonPairs.find(
      (pair) => pair.leftId === leftId && pair.rightId === rightId,
    )?.id ?? null
  );
}

async function scanComparisonPreset(
  preset: DemoPresetOption,
): Promise<RiskComparisonSideResult> {
  try {
    const body = await apiRequest<Extract<ScanRiskApiResponse, { ok: true }>>(
      "/api/scan-risks",
      {
        errorMessage: "风险扫描失败，请稍后重试。",
        json: {
          company: preset.company,
          jdText: preset.jdText,
          role: preset.role,
        },
        method: "POST",
      },
    );

    return {
      error: null,
      preset,
      result: mapApiResponseToScanResult(body),
      status: "done",
    };
  } catch (error) {
    const message = readErrorMessage(error, "风险扫描失败，请稍后重试。");
    const fallback = buildPresetScanResult(preset.id);

    if (!fallback) {
      return {
        error: message,
        preset,
        result: null,
        status: "error",
      };
    }

    return {
      error: message,
      preset,
      result: {
        ...fallback,
        fallbackReason: `实时扫描失败（${message}），当前结果来自本地 preset 兜底数据。`,
      },
      status: "fallback",
    };
  }
}
