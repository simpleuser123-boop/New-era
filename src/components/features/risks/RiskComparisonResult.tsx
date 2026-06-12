import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileText,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { RiskVerificationQuestions } from "@/components/features/risks/RiskVerificationQuestions";
import {
  getPresetTypeLabel,
  type RiskComparisonSideResult,
  type RiskSignal,
  type ScanResult,
} from "@/components/features/risks/riskScanModel";

type RiskComparisonResultProps = {
  left: RiskComparisonSideResult;
  right: RiskComparisonSideResult;
};

const severityLabel = {
  critical: "严重",
  high: "高风险",
  medium: "中风险",
  low: "低风险",
};

export function RiskComparisonResult({
  left,
  right,
}: RiskComparisonResultProps) {
  return (
    <div className="space-y-5" data-testid="risk-comparison-results">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ComparisonSideCard label="岗位 A" side={left} />
        <ComparisonSideCard label="岗位 B" side={right} />
      </div>
      <DifferenceSummary left={left} right={right} />
    </div>
  );
}

function ComparisonSideCard({
  label,
  side,
}: {
  label: string;
  side: RiskComparisonSideResult;
}) {
  const statusBadge = getStatusBadge(side);

  return (
    <article className="flex min-h-[680px] min-w-0 flex-col rounded-[24px] border border-[var(--color-border-light)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] lg:h-[calc(100vh-160px)] sm:p-6">
      <div className="min-h-[138px] border-b border-[var(--color-border-light)] pb-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <span className="rounded-full bg-[var(--color-surface-hover)] px-3 py-1 text-xs font-bold leading-5 text-[var(--color-text-secondary)]">
            {label}
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold leading-5 ${statusBadge.className}`}>
            {statusBadge.icon}
            {statusBadge.text}
          </span>
        </div>
        <h3 className="break-words text-xl font-semibold leading-7 text-[var(--color-text)]">
          {side.preset.title}
        </h3>
        <p className="mt-2 break-words text-sm leading-6 text-[var(--color-text-secondary)]">
          {side.preset.company} · {side.preset.role}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-[#e8f0f5] px-3 py-1 text-xs font-bold leading-5 text-[var(--color-blue)]">
            {getPresetTypeLabel(side.preset.type)}
          </span>
          <span className="rounded-full bg-[var(--color-primary-light)] px-3 py-1 text-xs font-bold leading-5 text-[var(--color-primary)]">
            {side.preset.sourceLabel}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {side.status === "scanning" ? (
          <ScanningState />
        ) : side.status === "error" ? (
          <ErrorState message={side.error ?? "风险扫描失败，请稍后重试。"} />
        ) : side.result ? (
          <ResultDetail side={side} />
        ) : (
          <IdleState />
        )}
      </div>
    </article>
  );
}

function ResultDetail({ side }: { side: RiskComparisonSideResult }) {
  const result = side.result;

  if (!result) {
    return null;
  }

  const tendency = getTendencyLabel(result);
  const topSignals = result.signals.slice(0, 4);
  const evidence = getEvidenceItems(side);

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-5">
      {side.status === "fallback" ? (
        <div className="mb-4 rounded-[16px] border border-[rgba(196,135,58,0.28)] bg-[#fffaf0] p-4">
          <div className="flex items-start gap-2">
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-[var(--color-primary)]"
              strokeWidth={1.8}
            />
            <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
              <span className="font-bold text-[var(--color-text)]">
                Fallback 兜底：
              </span>
              {result.fallbackReason ?? "实时扫描失败，当前展示来自本地 preset 兜底数据。"}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryTile label="风险倾向" value={tendency} />
        <SummaryTile label="风险等级" value={result.level.label} />
        <SummaryTile label="风险指数" value={String(result.level.score)} />
      </div>

      <div className="mt-4 rounded-[16px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4">
        <p className="text-sm font-bold leading-5 text-[var(--color-text)]">
          {result.level.summary}
        </p>
        <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
          {result.level.recommendation}
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-2 text-xs leading-5 text-[var(--color-text-secondary)] sm:grid-cols-2">
          <MetaRow label="风险分数" value={String(result.level.riskScore)} />
          <MetaRow
            label="规则版本"
            value={
              result.source === "preset_fallback"
                ? "preset-fallback（非实时扫描）"
                : result.ruleVersion ?? "未返回"
            }
          />
          <MetaRow label="AI 方向" value={side.preset.aiDirection} />
          <MetaRow label="薪资范围" value={side.preset.salaryRange} />
          <MetaRow label="地点" value={side.preset.location} />
          <MetaRow label="经验要求" value={side.preset.experienceLevel} />
        </dl>
      </div>

      <section className="mt-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldAlert
            aria-hidden="true"
            className="size-4 text-[var(--color-red)]"
            strokeWidth={1.8}
          />
          <h4 className="text-sm font-bold leading-5 text-[var(--color-text)]">
            主要风险信号
          </h4>
        </div>
        {topSignals.length > 0 ? (
          <ul className="space-y-3">
            {topSignals.map((signal) => (
              <SignalItem key={signal.id} signal={signal} />
            ))}
          </ul>
        ) : (
          <EmptySignalNotice />
        )}
      </section>

      <section className="mt-4">
        <div className="mb-3 flex items-center gap-2">
          <FileText
            aria-hidden="true"
            className="size-4 text-[var(--color-blue)]"
            strokeWidth={1.8}
          />
          <h4 className="text-sm font-bold leading-5 text-[var(--color-text)]">
            原文证据
          </h4>
        </div>
        <div className="space-y-3">
          {evidence.map((item) => (
            <blockquote
              className="rounded-[14px] border border-[var(--color-border-light)] bg-white p-4 text-sm leading-6 text-[var(--color-text)]"
              key={`${item.title}-${item.text}`}
            >
              <span className="mb-1 block text-[11px] font-bold leading-4 text-[var(--color-muted)]">
                {item.title}
              </span>
              {item.text}
            </blockquote>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-[16px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4">
        <div className="flex items-start gap-2">
          <Database
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-[var(--color-text-secondary)]"
            strokeWidth={1.8}
          />
          <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
            <span className="font-bold text-[var(--color-text)]">数据来源：</span>
            {side.preset.sourceLabel}，来自 `demo-data/preset-jds.json`，不是实时招聘网站抓取。
          </p>
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
          {side.preset.demoPurpose}
        </p>
      </section>

      <RiskVerificationQuestions
        company={side.preset.company}
        jdText={side.preset.jdText}
        role={side.preset.role}
        surface="inline"
      />
    </div>
  );
}

function DifferenceSummary({
  left,
  right,
}: {
  left: RiskComparisonSideResult;
  right: RiskComparisonSideResult;
}) {
  const rows = buildDifferenceRows(left, right);
  const hasAnyResult = Boolean(left.result || right.result);

  return (
    <section className="rounded-[24px] border border-[var(--color-border-light)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
          <Sparkles aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <h3 className="text-xl font-semibold leading-7 text-[var(--color-text)]">
            关键差异
          </h3>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            差异只读取两侧扫描结果、命中信号和规则版本，不写入报告、Tracker 或历史记录。
          </p>
        </div>
      </div>

      {hasAnyResult ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <article
              className="rounded-[16px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4"
              key={row.label}
            >
              <p className="text-xs font-bold leading-5 text-[var(--color-text-secondary)]">
                {row.label}
              </p>
              <p className="mt-1 break-words text-sm font-bold leading-6 text-[var(--color-text)]">
                {row.value}
              </p>
              {row.note ? (
                <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
                  {row.note}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[16px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-hover)] p-5 text-center">
          <p className="text-sm font-bold leading-5 text-[var(--color-text)]">
            等待扫描结果
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            运行对决后，会根据两侧真实返回的风险等级、信号和原文证据生成差异摘要。
          </p>
        </div>
      )}
    </section>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-24 rounded-[14px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4">
      <p className="text-xs leading-5 text-[var(--color-text-secondary)]">{label}</p>
      <p className="mt-2 break-words text-lg font-bold leading-6 text-[var(--color-text)]">
        {value}
      </p>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-bold text-[var(--color-text)]">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

function SignalItem({ signal }: { signal: RiskSignal }) {
  return (
    <li className="rounded-[14px] border border-[var(--color-border-light)] border-l-4 border-l-[var(--color-red)] bg-[var(--color-surface-hover)] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-[8px] bg-[#f5e8e6] px-2.5 py-1 text-xs font-bold leading-4 text-[var(--color-red)]">
          {severityLabel[signal.severity]}
        </span>
        <span className="text-xs leading-5 text-[var(--color-text-secondary)]">
          {signal.source}
        </span>
      </div>
      <p className="text-sm font-bold leading-5 text-[var(--color-text)]">
        {signal.category}：{signal.title}
      </p>
      <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
        {signal.advice}
      </p>
    </li>
  );
}

function EmptySignalNotice() {
  return (
    <div className="rounded-[14px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4">
      <div className="flex items-start gap-2">
        <CheckCircle2
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-[var(--color-green)]"
          strokeWidth={1.8}
        />
        <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
          当前扫描未命中明显风险信号。建议继续核实团队、技术栈和岗位职责占比。
        </p>
      </div>
    </div>
  );
}

function IdleState() {
  return (
    <div className="flex flex-1 items-center justify-center py-12">
      <div className="max-w-sm rounded-[18px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-hover)] p-5 text-center">
        <ShieldCheck
          aria-hidden="true"
          className="mx-auto mb-3 size-8 text-[var(--color-green)]"
          strokeWidth={1.8}
        />
        <p className="text-sm font-bold leading-5 text-[var(--color-text)]">
          尚未扫描
        </p>
        <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
          点击“开始对决扫描”后会显示风险倾向、证据和建议动作。
        </p>
      </div>
    </div>
  );
}

function ScanningState() {
  return (
    <div className="space-y-4 pt-5">
      <div className="flex items-center gap-2 rounded-[16px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4 text-sm font-bold leading-5 text-[var(--color-text)]">
        <Loader2
          aria-hidden="true"
          className="size-5 animate-spin text-[var(--color-primary)]"
          strokeWidth={1.8}
        />
        正在调用同一套风险扫描 API
      </div>
      {[0, 1, 2, 3].map((item) => (
        <div
          className="h-24 animate-pulse rounded-[16px] bg-[var(--color-surface-hover)]"
          key={item}
        />
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-12">
      <div className="max-w-sm rounded-[18px] border border-[rgba(196,102,90,0.32)] bg-[#fff0ee] p-5 text-center">
        <AlertCircle
          aria-hidden="true"
          className="mx-auto mb-3 size-8 text-[var(--color-red)]"
          strokeWidth={1.8}
        />
        <p className="text-sm font-bold leading-5 text-[var(--color-text)]">
          本侧扫描失败
        </p>
        <p className="mt-2 break-words text-xs leading-5 text-[var(--color-text-secondary)]">
          {message}
        </p>
      </div>
    </div>
  );
}

function getStatusBadge(side: RiskComparisonSideResult) {
  if (side.status === "scanning") {
    return {
      className: "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
      icon: (
        <Loader2
          aria-hidden="true"
          className="size-4 animate-spin"
          strokeWidth={1.8}
        />
      ),
      text: "扫描中",
    };
  }

  if (side.status === "done") {
    return {
      className: "bg-[#eaf0e8] text-[var(--color-green)]",
      icon: <ShieldCheck aria-hidden="true" className="size-4" strokeWidth={1.8} />,
      text: "实时扫描",
    };
  }

  if (side.status === "fallback") {
    return {
      className: "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
      icon: <AlertCircle aria-hidden="true" className="size-4" strokeWidth={1.8} />,
      text: "Fallback 兜底",
    };
  }

  if (side.status === "error") {
    return {
      className: "bg-[#f5e8e6] text-[var(--color-red)]",
      icon: <AlertCircle aria-hidden="true" className="size-4" strokeWidth={1.8} />,
      text: "失败",
    };
  }

  return {
    className: "bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]",
    icon: <ShieldCheck aria-hidden="true" className="size-4" strokeWidth={1.8} />,
    text: "待扫描",
  };
}

function getTendencyLabel(result: ScanResult) {
  if (result.level.tone === "safe") {
    return "真 AI 岗倾向";
  }

  if (result.level.tone === "warning") {
    return "边界岗 / 需要核实";
  }

  return "假 AI 岗风险";
}

function getEvidenceItems(side: RiskComparisonSideResult) {
  const result = side.result;

  if (!result) {
    return [];
  }

  const signalEvidence = result.signals
    .filter((signal) => signal.excerpt.trim().length > 0)
    .slice(0, 3)
    .map((signal) => ({
      text: signal.excerpt,
      title: `${signal.category} · ${signal.title}`,
    }));

  if (signalEvidence.length > 0) {
    return signalEvidence;
  }

  return [
    {
      title: "未命中风险片段，展示原文核验片段",
      text: side.preset.jdText.split("\n").slice(0, 5).join("\n"),
    },
  ];
}

function buildDifferenceRows(
  left: RiskComparisonSideResult,
  right: RiskComparisonSideResult,
) {
  const rows: Array<{ label: string; value: string; note?: string }> = [];
  const leftResult = left.result;
  const rightResult = right.result;

  if (leftResult && rightResult) {
    rows.push({
      label: "风险倾向",
      value: `A：${getTendencyLabel(leftResult)} / B：${getTendencyLabel(rightResult)}`,
      note: "由两侧扫描返回的风险等级和风险语气映射生成。",
    });
    rows.push({
      label: "风险等级与分数",
      value: `A：${leftResult.level.label}，${leftResult.level.riskScore} 分 / B：${rightResult.level.label}，${rightResult.level.riskScore} 分`,
      note: "分数来自同一 POST /api/scan-risks 契约。",
    });
    rows.push({
      label: "主要命中信号",
      value: `A：${summarizeSignals(leftResult)} / B：${summarizeSignals(rightResult)}`,
    });
    rows.push({
      label: "规则版本",
      value:
        leftResult.ruleVersion === rightResult.ruleVersion
          ? `同一版本：${leftResult.ruleVersion ?? "未返回"}`
          : `A：${leftResult.ruleVersion ?? "未返回"} / B：${rightResult.ruleVersion ?? "未返回"}`,
      note:
        left.status === "fallback" || right.status === "fallback"
          ? "包含 preset fallback 的一侧不视为实时扫描成功。"
          : undefined,
    });

    return rows;
  }

  for (const [label, side] of [
    ["岗位 A", left],
    ["岗位 B", right],
  ] as const) {
    if (!side.result) {
      rows.push({
        label,
        value: side.status === "error" ? "扫描失败" : "暂无结果",
        note: side.error ?? "该侧没有可用于差异摘要的扫描结果。",
      });
      continue;
    }

    rows.push({
      label,
      value: `${side.result.level.label}，${side.result.signals.length} 个风险信号`,
      note: summarizeSignals(side.result),
    });
  }

  return rows;
}

function summarizeSignals(result: ScanResult) {
  if (result.signals.length === 0) {
    return "未命中明显风险信号";
  }

  return result.signals
    .slice(0, 2)
    .map((signal) => signal.title)
    .join("；");
}
