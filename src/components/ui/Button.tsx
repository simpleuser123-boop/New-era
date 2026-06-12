import * as React from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--color-primary-hover)]",
  secondary:
    "bg-[var(--color-primary-light)] text-[var(--color-primary)] hover:bg-[rgba(196,135,58,0.18)]",
  ghost:
    "text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]",
  outline:
    "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)]",
  danger:
    "bg-[var(--color-red)] text-white shadow-[var(--shadow-sm)] hover:bg-[#b75a4f]",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
  icon: "size-10 p-0",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      leftIcon,
      rightIcon,
      size = "md",
      type = "button",
      variant = "primary",
      ...props
    },
    ref,
  ) => {
    return (
      <button
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-2 rounded-[12px] font-bold leading-5 outline-none transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
          "focus-visible:ring-2 focus-visible:ring-[rgba(196,135,58,0.28)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]",
          variantClass[variant],
          sizeClass[size],
          className,
        )}
        ref={ref}
        type={type}
        {...props}
      >
        {leftIcon}
        {children}
        {rightIcon}
      </button>
    );
  },
);

Button.displayName = "Button";
