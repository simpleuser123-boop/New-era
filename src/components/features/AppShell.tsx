import * as React from "react";
import { cn } from "@/lib/cn";
import { AppSidebar } from "@/components/features/AppSidebar";
import { ProductGuide } from "@/components/features/ProductGuide";
import { ProductGuideMobileTriggerButton } from "@/components/features/ProductGuideTriggerButton";

type AppShellProps = {
  activeHref?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  contained?: boolean;
  mainClassName?: string;
};

export function AppShell({
  activeHref = "/",
  children,
  className,
  contained = true,
  contentClassName,
  mainClassName,
}: AppShellProps) {
  const content = contained ? (
    <PageContainer className={contentClassName}>
      {children}
    </PageContainer>
  ) : (
    children
  );

  return (
    <div
      className={cn(
        "min-h-[100dvh] bg-[var(--color-bg)] text-[var(--color-text)]",
        className,
      )}
    >
      <AppSidebar activeHref={activeHref} />
      <main className={cn("min-h-[100dvh] lg:ml-[240px]", mainClassName)}>
        {content}
      </main>
      <ProductGuideMobileTriggerButton />
      <ProductGuide />
    </div>
  );
}

type PageContainerProps = React.HTMLAttributes<HTMLDivElement>;

export function PageContainer({
  className,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn("mx-auto max-w-[1200px] px-5 pb-10 sm:px-10", className)}
      {...props}
    />
  );
}

type PageHeaderProps = React.HTMLAttributes<HTMLElement> & {
  actions?: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
  titleAction?: React.ReactNode;
};

export function PageHeader({
  actions,
  className,
  description,
  eyebrow,
  icon,
  title,
  titleAction,
  ...props
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 border-b border-[var(--color-sticky-header-border)] bg-[var(--color-sticky-header-bg)] backdrop-blur-md",
        className,
      )}
      {...props}
    >
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-5 py-6 sm:px-10 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {icon ? (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <div className="mb-3 inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold leading-4 text-[var(--color-primary)] shadow-[var(--shadow-sm)]">
                {eyebrow}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-semibold leading-[38px] text-[var(--color-text)] sm:text-[34px] sm:leading-[44px]">
                {title}
              </h1>
              {titleAction}
            </div>
            {description ? (
              <p className="mt-1 max-w-[720px] text-sm leading-5 text-[var(--color-text-secondary)] sm:text-base sm:leading-6">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex w-full shrink-0 justify-start 2xl:w-auto 2xl:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
