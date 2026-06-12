import Link from "next/link";
import {
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  ClipboardList,
  FileText,
  Gauge,
  History,
  MessageSquarePlus,
  Settings,
  ShieldCheck,
  TrendingUp,
  Target,
  UserRound,
} from "lucide-react";
import { ProductGuideTriggerButton } from "@/components/features/ProductGuideTriggerButton";

const navItems = [
  { label: "首页", href: "/", icon: Gauge },
  { label: "求职画像", href: "/career", icon: Target },
  { label: "简历管理", href: "/resume", icon: ClipboardList },
  { label: "风险扫描", href: "/risks", icon: ShieldCheck },
  { label: "JD 评估", href: "/evaluate", icon: FileText },
  { label: "投递管理", href: "/applications", icon: BriefcaseBusiness },
  { label: "面试教练", href: "/interview", icon: MessageSquarePlus },
  { label: "求职分析", href: "/analytics", icon: BarChart3 },
  { label: "行业趋势", href: "/insights", icon: TrendingUp },
  { label: "评估历史", href: "/reports", icon: History },
];

export type AppSidebarProps = {
  activeHref?: string;
};

export function AppSidebar({ activeHref = "/" }: AppSidebarProps) {
  const isAssistantActive = activeHref === "/assistant";
  const isSettingsActive = activeHref === "/settings";

  return (
    <aside
      className="fixed left-0 top-0 z-30 hidden h-full w-[240px] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4 lg:flex"
    >
      <div className="mb-8 px-4">
        <Link href="/">
          <h1 className="text-[22px] font-semibold leading-[30px] text-[var(--color-primary)]">
            New Era AI
          </h1>
        </Link>
        <p className="text-xs leading-4 text-[var(--color-text-secondary)]">
          AI 求职助手
        </p>
      </div>

      <Link
        aria-current={isAssistantActive ? "page" : undefined}
        className={`mb-6 flex w-full items-center justify-center gap-2 rounded-[16px] py-3 font-bold transition-all active:scale-[0.98] ${
          isAssistantActive
            ? "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
            : "bg-[var(--color-primary)] text-[#fffdf8] hover:bg-[var(--color-primary-hover)]"
        }`}
        href="/assistant"
      >
        <Bot aria-hidden="true" className="size-5" strokeWidth={1.8} />
        AI 助手
      </Link>

      <nav className="flex-grow space-y-2" aria-label="主导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === activeHref;

          return (
            <Link
              className={`flex items-center gap-3 rounded-[12px] px-4 py-3 transition-all duration-200 ${
                isActive
                  ? "bg-[var(--color-primary-light)] font-bold text-[var(--color-primary)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)]"
              }`}
              href={item.href}
              key={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div
        className="mt-auto mb-2 flex items-center gap-3 border-t border-[var(--color-border)] px-4 pt-6"
      >
        <div
          className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--color-border)] bg-[var(--color-primary-light)]"
        >
          <UserRound
            aria-hidden="true"
            className="size-5 text-[var(--color-primary)]"
            strokeWidth={1.8}
          />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate text-sm font-bold text-[var(--color-text)]">
            周四加油
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <button
              aria-label="通知"
              className="text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)]"
              type="button"
            >
              <Bell aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
            </button>
            <ProductGuideTriggerButton />
          </div>
        </div>
        <Link
          aria-current={isSettingsActive ? "page" : undefined}
          aria-label="设置"
          className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-all ${
            isSettingsActive
              ? "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)]"
          }`}
          href="/settings"
          title="设置"
        >
          <Settings aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </Link>
      </div>
    </aside>
  );
}
