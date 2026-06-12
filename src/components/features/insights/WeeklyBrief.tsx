import { RefreshCw, Sparkles } from "lucide-react";
import type { WeeklyBrief as WeeklyBriefModel } from "@/components/features/insights/insightsModel";

type WeeklyBriefProps = {
  brief: WeeklyBriefModel;
  generatingText?: string;
  isGenerating: boolean;
  notice?: string;
  onRefresh: () => void;
};

export function WeeklyBrief({
  brief,
  generatingText = "AI 正在分析市场数据...",
  isGenerating,
  notice,
  onRefresh,
}: WeeklyBriefProps) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[linear-gradient(135deg,var(--color-surface)_0%,var(--color-primary-light)_54%,var(--color-surface-hover)_100%)] p-6 shadow-[var(--shadow-md)] sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[var(--color-primary)] text-white">
            <Sparkles aria-hidden="true" className="size-5" strokeWidth={1.8} />
          </div>
          <div>
            <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
              {brief.title ?? "AI 招聘市场周报"}
            </h2>
            <p className="mt-1 text-sm leading-5 text-[var(--color-text-secondary)]">
              {formatBriefPeriod(brief)}
            </p>
          </div>
        </div>

        <button
          aria-busy={isGenerating}
          className="inline-flex w-fit items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-bold text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)] active:scale-[0.98]"
          disabled={isGenerating}
          onClick={onRefresh}
          type="button"
        >
          <RefreshCw
            aria-hidden="true"
            className={`size-4 ${isGenerating ? "animate-spin" : ""}`}
            strokeWidth={1.8}
          />
          {isGenerating ? "生成中" : "刷新周报"}
        </button>
      </div>

      {notice ? (
        <p className="mt-5 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-primary-light)] px-4 py-3 text-xs leading-5 text-[var(--color-text-secondary)]">
          {notice}
        </p>
      ) : null}

      {isGenerating ? (
        <BriefGeneratingState text={generatingText} />
      ) : (
        <>
          <p className="mt-7 text-sm leading-6 text-[var(--color-text-secondary)] sm:text-base sm:leading-7">
            {brief.summary}
          </p>

          <ol className="mt-6 space-y-4">
            {brief.highlights.map((item, index) => (
              <li className="flex gap-4" key={item.id ?? item.title}>
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold leading-4 text-white">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
                    {item.title}
                  </h3>
                  {item.detail ? (
                    <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
                      {item.detail}
                    </p>
                  ) : null}
                  {item.impact ? (
                    <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
                      影响：{item.impact}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          {brief.recommendedActions.length > 0 ? (
            <div className="mt-6 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4">
              <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
                本周建议
              </h3>
              <ul className="mt-3 space-y-2">
                {brief.recommendedActions.map((action) => (
                  <li
                    className="text-xs leading-5 text-[var(--color-text-secondary)]"
                    key={action}
                  >
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function BriefGeneratingState({ text }: { text: string }) {
  return (
    <div className="mt-7 space-y-4" aria-live="polite">
      <p className="text-sm font-bold leading-5 text-[var(--color-primary)]">
        {text}
      </p>
      <div className="space-y-3">
        <div className="h-4 w-11/12 animate-pulse rounded-full bg-[var(--color-border)]" />
        <div className="h-4 w-4/5 animate-pulse rounded-full bg-[var(--color-border)]" />
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-[var(--color-border)]" />
      </div>
    </div>
  );
}

function formatBriefPeriod(brief: WeeklyBriefModel): string {
  if (brief.period?.start && brief.period.end) {
    return `${brief.period.start} 至 ${brief.period.end}`;
  }

  return "本周简报";
}
