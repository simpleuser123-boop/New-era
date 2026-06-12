import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileWarning,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { RiskVerificationQuestions } from "@/components/features/risks/RiskVerificationQuestions";
import {
  knowledgeItems,
  type RiskSignal,
  type ScanResult,
  type Severity,
} from "@/components/features/risks/riskScanModel";

type RiskScanResultsProps = {
  result: ScanResult | null;
  state: "idle" | "too_short" | "scanning" | "done" | "error";
  isScanning: boolean;
  error: string | null;
  jdText?: string;
  company?: string;
  role?: string;
};

const severityLabel: Record<Severity, string> = {
  critical: "严重",
  high: "高风险",
  medium: "中风险",
  low: "低风险",
};

const severityClass: Record<Severity, string> = {
  critical: "bg-[#f5e8e6] text-[var(--color-red)]",
  high: "bg-[#f5e8e6] text-[var(--color-red)]",
  medium: "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
  low: "bg-[#eaf0e8] text-[var(--color-green)]",
};

export function RiskScanResults({
  company,
  error,
  isScanning,
  jdText = "",
  result,
  role,
  state,
}: RiskScanResultsProps) {
  return (
    <div className="space-y-6">
      <RiskGauge error={error} isScanning={isScanning} result={result} state={state} />
      <RiskSignalList
        isScanning={isScanning}
        signals={result?.signals ?? []}
        state={state}
      />
      {result && state === "done" ? (
        <RiskVerificationQuestions
          company={company}
          jdText={jdText}
          role={role}
          surface="card"
        />
      ) : null}
      <RiskKnowledgeCard />
    </div>
  );
}

function RiskGauge({
  error,
  isScanning,
  result,
  state,
}: {
  result: ScanResult | null;
  state: RiskScanResultsProps["state"];
  isScanning: boolean;
  error: string | null;
}) {
  const score = result?.level.score ?? 0;
  const circumference = 2 * Math.PI * 80;
  const dashOffset = circumference - (score / 100) * circumference;
  const tone = result?.level.tone ?? (state === "too_short" || state === "error" ? "danger" : "warning");
  const Icon = isScanning ? Loader2 : tone === "safe" ? ShieldCheck : ShieldAlert;

  const cardClass =
    tone === "safe"
      ? "border-[#d8e5d6]"
      : tone === "danger"
        ? "border-[rgba(196,102,90,0.32)]"
        : "border-[rgba(196,135,58,0.32)]";

  const accentClass =
    tone === "safe"
      ? "text-[var(--color-green)]"
      : tone === "danger"
        ? "text-[var(--color-red)]"
        : "text-[var(--color-primary)]";

  return (
    <section
      className={`relative overflow-hidden rounded-[24px] border-2 bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] ${cardClass}`}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-[var(--color-text-secondary)]">
            风险综合评估
          </p>
          <h2 className={`mt-2 text-[22px] font-semibold leading-[30px] ${accentClass}`}>
            {getGaugeTitle({ result, state, isScanning })}
          </h2>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
            tone === "safe"
              ? "bg-[#eaf0e8] text-[var(--color-green)]"
              : tone === "danger"
                ? "bg-[#f5e8e6] text-[var(--color-red)]"
                : "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
          }`}
        >
          <Icon
            aria-hidden="true"
            className={`size-4 ${isScanning ? "animate-spin" : ""}`}
            strokeWidth={1.8}
          />
          {getBadgeText({ result, state, isScanning })}
        </span>
      </div>

      <div className="relative mx-auto flex size-48 items-center justify-center">
        <svg className="-rotate-90" height="192" viewBox="0 0 192 192" width="192">
          <circle
            cx="96"
            cy="96"
            fill="transparent"
            r="80"
            stroke="var(--color-border-light)"
            strokeWidth="12"
          />
          <circle
            cx="96"
            cy="96"
            fill="transparent"
            r="80"
            stroke={tone === "safe" ? "var(--color-green)" : tone === "danger" ? "var(--color-red)" : "var(--color-primary)"}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            strokeWidth="12"
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className={`text-[40px] font-bold leading-none ${accentClass}`}>
            {isScanning ? "--" : score}
          </span>
          <span className="mt-1 text-xs leading-4 text-[var(--color-text-secondary)]">
            风险指数
          </span>
        </div>
      </div>

      <p className="mt-5 text-center text-sm font-medium leading-6 text-[var(--color-text)]">
        {getGaugeSummary({ error, result, state, isScanning })}
      </p>
      <p className="mt-2 text-center text-xs leading-5 text-[var(--color-text-secondary)]">
        {getGaugeRecommendation({ result, state, isScanning })}
      </p>

      {result ? (
        <div className="mt-4 rounded-[14px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-3 text-center text-xs leading-5 text-[var(--color-text-secondary)]">
          <span className="font-bold text-[var(--color-text)]">规则版本：</span>
          {result.source === "preset_fallback"
            ? "preset-fallback（非实时扫描）"
            : result.ruleVersion ?? "未返回"}
          {result.source === "preset_fallback" ? (
            <span className="mt-1 block text-[var(--color-primary)]">
              Fallback 兜底：{result.fallbackReason ?? "当前结果来自本地 preset 兜底数据。"}
            </span>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <>
          <div className="mt-5 grid grid-cols-4 gap-2 rounded-[14px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-3">
            {(["critical", "high", "medium", "low"] as Severity[]).map((severity) => (
              <div className="text-center" key={severity}>
                <p className="text-lg font-bold leading-6 text-[var(--color-text)]">
                  {result.counts[severity]}
                </p>
                <p className="text-[10px] leading-4 text-[var(--color-muted)]">
                  {severityLabel[severity]}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-[14px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-3">
            <div className="text-center">
              <p className="text-lg font-bold leading-6 text-[var(--color-text)]">
                {result.level.riskScore}
              </p>
              <p className="text-[10px] leading-4 text-[var(--color-muted)]">
                风险分数
              </p>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function RiskSignalList({
  isScanning,
  signals,
  state,
}: {
  signals: RiskSignal[];
  state: RiskScanResultsProps["state"];
  isScanning: boolean;
}) {
  return (
    <section className="rounded-[24px] border border-[var(--color-border-light)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <FileWarning
          aria-hidden="true"
          className="size-5 text-[var(--color-red)]"
          strokeWidth={1.8}
        />
        <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
          风险信号
        </h2>
      </div>

      {isScanning ? (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div
              className="animate-pulse rounded-[18px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4"
              key={item}
            >
              <div className="mb-3 h-4 w-24 rounded-full bg-[var(--color-border-light)]" />
              <div className="h-4 w-4/5 rounded-full bg-[var(--color-border-light)]" />
              <div className="mt-4 h-16 rounded-[12px] bg-[var(--color-border-light)]" />
            </div>
          ))}
        </div>
      ) : signals.length > 0 ? (
        <ul className="space-y-4">
          {signals.map((signal) => (
            <RiskSignalItem key={signal.id} signal={signal} />
          ))}
        </ul>
      ) : (
        <div className="rounded-[18px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-hover)] p-5 text-center">
          <CheckCircle2
            aria-hidden="true"
            className="mx-auto mb-3 size-8 text-[var(--color-green)]"
            strokeWidth={1.8}
          />
          <p className="text-sm font-bold text-[var(--color-text)]">
            {state === "done" ? "未检测到风险信号" : "暂无风险信号"}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            {state === "done"
              ? "当前 JD 未命中明显风险信号，可继续进入常规岗位评估。"
              : "扫描完成后，命中的原文和建议动作会显示在这里。"}
          </p>
        </div>
      )}
    </section>
  );
}

function RiskSignalItem({ signal }: { signal: RiskSignal }) {
  return (
    <li className="rounded-[18px] border border-[var(--color-border-light)] border-l-4 border-l-[var(--color-red)] bg-[var(--color-surface-hover)] p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span
          className={`rounded-[8px] px-2.5 py-1 text-xs font-bold ${severityClass[signal.severity]}`}
        >
          {severityLabel[signal.severity]}
        </span>
      </div>
      <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
        {signal.category}：{signal.title}
      </h3>
      <blockquote className="mt-3 rounded-[12px] border border-[var(--color-border)] bg-white p-3 text-sm leading-6 text-[var(--color-text)]">
        <span className="mb-1 block text-[10px] font-bold leading-4 text-[var(--color-muted)]">
          原文片段
        </span>
        <HighlightedText terms={signal.matchTerms} text={signal.excerpt} />
      </blockquote>
      <p className="mt-3 text-xs leading-5 text-[var(--color-text-secondary)]">
        <span className="font-bold text-[var(--color-text)]">解读：</span>
        {signal.interpretation}
      </p>
      <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
        <span className="font-bold text-[var(--color-text)]">建议：</span>
        {signal.advice}
      </p>
    </li>
  );
}

function getGaugeTitle({
  result,
  state,
  isScanning,
}: {
  result: ScanResult | null;
  state: RiskScanResultsProps["state"];
  isScanning: boolean;
}) {
  if (isScanning) {
    return "扫描中";
  }

  if (state === "too_short") {
    return "文本过短";
  }

  if (state === "error") {
    return "扫描失败";
  }

  return result?.level.label ?? "等待扫描";
}

function getBadgeText({
  result,
  state,
  isScanning,
}: {
  result: ScanResult | null;
  state: RiskScanResultsProps["state"];
  isScanning: boolean;
}) {
  if (isScanning) {
    return "检测中";
  }

  if (state === "too_short") {
    return "需补全文本";
  }

  if (state === "error") {
    return "可重试";
  }

  return result ? result.level.label : "未开始";
}

function getGaugeSummary({
  error,
  result,
  state,
  isScanning,
}: {
  error: string | null;
  result: ScanResult | null;
  state: RiskScanResultsProps["state"];
  isScanning: boolean;
}) {
  if (isScanning) {
    return "正在分析 JD 中的风险信号。";
  }

  if (state === "too_short" || state === "error") {
    return error ?? "请调整 JD 文本后重新扫描。";
  }

  return result?.level.summary ?? "粘贴 JD 后开始扫描，结果会在这里汇总。";
}

function getGaugeRecommendation({
  result,
  state,
  isScanning,
}: {
  result: ScanResult | null;
  state: RiskScanResultsProps["state"];
  isScanning: boolean;
}) {
  if (isScanning) {
    return "完成后会展示风险等级、风险分数、原文片段和建议动作。";
  }

  if (state === "too_short") {
    return "至少输入 30 个字符，建议包含岗位职责、任职要求、薪资和培训说明。";
  }

  if (state === "error") {
    return "可以修改文本后重新扫描。";
  }

  return result?.level.recommendation ?? "系统会按严重、高、中、低四级归类风险信号。";
}

function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  const activeTerms = terms.filter((term) => text.toLowerCase().includes(term.toLowerCase()));

  if (activeTerms.length === 0) {
    return <span>{text}</span>;
  }

  const pattern = new RegExp(`(${activeTerms.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);

  return (
    <span>
      {parts.map((part, index) => {
        const isMatch = activeTerms.some(
          (term) => term.toLowerCase() === part.toLowerCase(),
        );

        return isMatch ? (
          <mark
            className="rounded-[6px] bg-[#f5e8e6] px-1 font-bold text-[var(--color-red)]"
            key={`${part}-${index}`}
          >
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        );
      })}
    </span>
  );
}

function RiskKnowledgeCard() {
  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(245,236,215,0.45)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold leading-5 text-[var(--color-text-secondary)]">
          求职避雷百科
        </h2>
        <BookOpen
          aria-hidden="true"
          className="size-5 text-[var(--color-text-secondary)]"
          strokeWidth={1.8}
        />
      </div>

      <div className="mb-4 overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="grid grid-cols-[1fr_auto] gap-4">
          <div>
            <p className="text-sm font-bold leading-5 text-[var(--color-text)]">
              如何识别 AI 培训坑
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
              先看是否收费，再看技术栈是否可核验，最后确认劳动合同和社保主体。
            </p>
          </div>
          <div className="flex size-12 items-center justify-center rounded-[14px] bg-[#f5e8e6] text-[var(--color-red)]">
            <AlertTriangle aria-hidden="true" className="size-6" strokeWidth={1.8} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {knowledgeItems.slice(0, 2).map((item) => (
          <article key={item.title}>
            <h3 className="text-xs font-bold leading-4 text-[var(--color-text)]">
              {item.title}
            </h3>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
              {item.method}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
