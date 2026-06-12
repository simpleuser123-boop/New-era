import { BarChart3 } from "lucide-react";

type WeeklyActivity = {
  day: string;
  value: number;
};

type WeeklyActivityCardProps = {
  activity: WeeklyActivity[];
};

export function WeeklyActivityCard({ activity }: WeeklyActivityCardProps) {
  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[var(--color-blue)]">
            <BarChart3 aria-hidden="true" className="size-5" strokeWidth={1.8} />
            <span className="text-xs font-bold uppercase tracking-[0.08em]">
              Weekly
            </span>
          </div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            周活跃趋势
          </h2>
        </div>
        <span className="rounded-full bg-[#e8f0f5] px-2.5 py-1 text-xs font-bold leading-4 text-[var(--color-blue)]">
          +18%
        </span>
      </div>

      <div className="flex h-36 items-end gap-2 px-1" aria-label="本周简历优化活跃趋势">
        {activity.map((item, index) => {
          const isToday = index === activity.length - 1;

          return (
            <div className="flex h-full flex-1 flex-col justify-end gap-2" key={item.day}>
              <div className="flex min-h-0 flex-1 items-end">
                <div
                  className={`h-full w-full origin-bottom rounded-t-[8px] transition-transform duration-500 hover:scale-y-105 ${
                    isToday
                      ? "bg-[var(--color-primary)]"
                      : "bg-[rgba(196,135,58,0.28)]"
                  }`}
                  style={{ transform: `scaleY(${item.value / 100})` }}
                  title={`${item.day}: ${item.value}%`}
                />
              </div>
              <span
                className={`text-center text-[11px] leading-4 ${
                  isToday
                    ? "font-bold text-[var(--color-primary)]"
                    : "text-[var(--color-text-secondary)]"
                }`}
              >
                {item.day}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <ActivityStat label="本周编辑" value="9 次" />
        <ActivityStat label="AI 建议采纳" value="6 条" />
      </div>
    </section>
  );
}

type ActivityStatProps = {
  label: string;
  value: string;
};

function ActivityStat({ label, value }: ActivityStatProps) {
  return (
    <div className="rounded-[14px] bg-[var(--color-surface-hover)] p-3">
      <p className="text-xs leading-4 text-[var(--color-text-secondary)]">{label}</p>
      <p className="mt-1 text-sm font-bold leading-5 text-[var(--color-text)]">
        {value}
      </p>
    </div>
  );
}
