"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BookOpenText,
  CheckCircle2,
  Code,
  Info,
  LoaderCircle,
  MessageCircle,
  NotebookPen,
} from "lucide-react";

type AuthMode = "login" | "signup";
type SubmitState = "idle" | "loading";
type AuthNotice = {
  tone: "info" | "error" | "success";
  message: string;
};
type FieldErrors = Partial<
  Record<"account" | "confirmPassword" | "displayName" | "password" | "terms", string>
>;
type AuthCardProps = {
  hasOwner: boolean;
  nextPath: string;
};
type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
  ok: false;
};
type ApiSuccessBody = {
  ok: true;
  user?: unknown;
};
type AuthApiBody = ApiErrorBody | ApiSuccessBody;

const MIN_PASSWORD_LENGTH = 8;
const phoneLikePattern = /^[0-9+\-()\s]{6,40}$/;
const emailLikePattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initialNotice(hasOwner: boolean): AuthNotice {
  return hasOwner
    ? {
        tone: "info",
        message: "已检测到管理员账号，请登录后继续使用 New Era。",
      }
    : {
        tone: "info",
        message: "未检测到管理员账号，请先创建管理员账号。",
      };
}

function getApiErrorMessage(body: AuthApiBody | null, fallback: string) {
  if (body && !body.ok && body.error?.message) {
    return body.error.message;
  }

  return fallback;
}

async function readAuthApiBody(response: Response): Promise<AuthApiBody | null> {
  try {
    return (await response.json()) as AuthApiBody;
  } catch {
    return null;
  }
}

function buildAccountPayload(account: string) {
  const trimmedAccount = account.trim();

  if (trimmedAccount.includes("@")) {
    return {
      email: trimmedAccount.toLowerCase(),
      phone: undefined,
    };
  }

  return {
    email: undefined,
    phone: trimmedAccount,
  };
}

export function AuthCard({ hasOwner, nextPath }: AuthCardProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(hasOwner ? "login" : "signup");
  const [ownerExists, setOwnerExists] = useState(hasOwner);
  const [displayName, setDisplayName] = useState("");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [notice, setNotice] = useState<AuthNotice>(() => initialNotice(hasOwner));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const isSubmitting = submitState === "loading";
  const actionLabel =
    mode === "login" ? "登录账号" : "创建管理员账号";
  const signupDisabled = mode === "signup" && ownerExists;

  useEffect(() => {
    let cancelled = false;

    async function redirectIfAlreadySignedIn() {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const body = await readAuthApiBody(response);

        if (!cancelled && response.ok && body?.ok) {
          setNotice({
            tone: "success",
            message: "已登录，正在返回原页面。",
          });
          router.replace(nextPath);
          router.refresh();
        }
      } catch {
        // The server page also checks auth; unauthenticated clients stay here.
      }
    }

    void redirectIfAlreadySignedIn();

    return () => {
      cancelled = true;
    };
  }, [nextPath, router]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setFieldErrors({});
    setNotice(
      nextMode === "signup" && ownerExists
        ? {
            tone: "error",
            message: "本机已经存在 owner 账号，不能重复注册。请直接登录。",
          }
        : initialNotice(ownerExists),
    );
  }

  function validateAccount(nextErrors: FieldErrors) {
    const trimmedAccount = account.trim();

    if (!trimmedAccount) {
      nextErrors.account = "请输入邮箱或手机号。";
      return;
    }

    if (trimmedAccount.includes("@") && !emailLikePattern.test(trimmedAccount)) {
      nextErrors.account = "请输入有效的邮箱地址。";
      return;
    }

    if (!trimmedAccount.includes("@") && !phoneLikePattern.test(trimmedAccount)) {
      nextErrors.account = "手机号或联系电话需为 6-40 位数字、空格或常见分隔符。";
    }
  }

  function validateForm() {
    const nextErrors: FieldErrors = {};

    validateAccount(nextErrors);

    if (password.length < MIN_PASSWORD_LENGTH) {
      nextErrors.password = `密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符。`;
    }

    if (mode === "signup") {
      if (!displayName.trim()) {
        nextErrors.displayName = "请填写显示名称。";
      }

      if (password !== confirmPassword) {
        nextErrors.confirmPassword = "两次输入的密码不一致。";
      }

      if (!termsAccepted) {
        nextErrors.terms = "请先确认本地账号与 AI 服务说明。";
      }
    }

    setFieldErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  }

  async function loginOwner() {
    const response = await fetch("/api/auth/login", {
      body: JSON.stringify({
        identifier: account.trim(),
        password,
      }),
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const body = await readAuthApiBody(response);

    if (!response.ok || !body?.ok) {
      throw new Error(
        getApiErrorMessage(body, "登录失败，请检查账号和密码后重试。"),
      );
    }

    return body;
  }

  async function registerOwner() {
    const accountPayload = buildAccountPayload(account);
    const response = await fetch("/api/auth/register", {
      body: JSON.stringify({
        ...accountPayload,
        confirmPassword,
        displayName: displayName.trim(),
        password,
      }),
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const body = await readAuthApiBody(response);

    if (!response.ok || !body?.ok) {
      if (!body?.ok && body?.error?.code === "OWNER_ALREADY_EXISTS") {
        setOwnerExists(true);
        setMode("login");
      }

      throw new Error(
        getApiErrorMessage(body, "注册失败，请检查账号信息后重试。"),
      );
    }

    setOwnerExists(true);

    return body;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (signupDisabled) {
      setNotice({
        tone: "error",
        message: "本机已经存在 owner 账号，不能重复注册。请直接登录。",
      });
      return;
    }

    if (!validateForm()) {
      setNotice({
        tone: "error",
        message: "请先修正表单中的错误。",
      });
      return;
    }

    setSubmitState("loading");
    setNotice({
      tone: "info",
      message: mode === "login" ? "正在登录账号..." : "正在创建管理员账号...",
    });

    try {
      if (mode === "signup") {
        await registerOwner();
        setNotice({
          tone: "success",
          message: "注册成功，正在自动登录并进入 New Era。",
        });
        await loginOwner();
      } else {
        await loginOwner();
        setNotice({
          tone: "success",
          message: "登录成功，正在返回原页面。",
        });
      }

      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : mode === "login"
              ? "登录失败，请稍后重试。"
              : "注册失败，请稍后重试。",
      });
      setSubmitState("idle");
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(var(--color-border)_0.5px,transparent_0.5px)] [background-size:24px_24px]" />

      <header className="sticky top-0 z-20 mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between bg-[var(--color-bg)]/90 px-5 backdrop-blur sm:px-10">
        <Link
          className="text-[22px] font-bold text-[var(--color-primary)]"
          href="/"
        >
          New Era AI
        </Link>
        <nav aria-label="登录页导航" className="hidden items-center gap-6 md:flex">
          <a
            className="font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)]"
            href="#"
          >
            职业路径
          </a>
          <a
            className="font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)]"
            href="#"
          >
            资源中心
          </a>
        </nav>
      </header>

      <main className="relative z-10 flex min-h-[calc(100dvh-8rem)] items-center justify-center px-4 py-12 md:py-20">
        <section className="grid min-w-0 w-full max-w-5xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-px hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-lg)] md:grid-cols-2">
          <VisualPanel />
          <div className="flex min-w-0 flex-col justify-center bg-[var(--color-surface)] p-6 sm:p-8 md:p-12 lg:p-16">
            <div className="mb-8">
              <h1 className="text-[28px] font-semibold leading-[38px] text-[var(--color-text)]">
                欢迎开启
              </h1>
              <p className="mt-2 text-base leading-6 text-[var(--color-text-secondary)]">
                新纪元 AI：您的职场成长智能助手
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[rgba(196,135,58,0.24)] bg-[var(--color-primary-light)] px-3 py-1 text-xs font-bold leading-4 text-[var(--color-primary)]">
                <Info aria-hidden="true" className="size-4" strokeWidth={1.8} />
                管理员账号保护
              </div>
            </div>

            <div className="mb-8 flex gap-8 border-b border-[var(--color-border)]">
              <AuthTab
                active={mode === "login"}
                label="登 录"
                onClick={() => switchMode("login")}
              />
              <AuthTab
                active={mode === "signup"}
                label="注 册"
                onClick={() => switchMode("signup")}
              />
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              {mode === "signup" ? (
                <TextField
                  autoComplete="name"
                  disabled={isSubmitting || signupDisabled}
                  error={fieldErrors.displayName}
                  id="displayName"
                  label="显示名称"
                  onChange={(value) => setDisplayName(value)}
                  placeholder="例如：张三"
                  value={displayName}
                />
              ) : null}

              <TextField
                autoComplete="username"
                disabled={isSubmitting || signupDisabled}
                error={fieldErrors.account}
                id="account"
                inputMode={account.includes("@") ? "email" : "text"}
                label="邮箱或手机号"
                onChange={(value) => setAccount(value)}
                placeholder="用于管理员账号登录"
                value={account}
              />

              <TextField
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                disabled={isSubmitting || signupDisabled}
                error={fieldErrors.password}
                id="password"
                label="密码"
                onChange={(value) => setPassword(value)}
                placeholder="至少 8 个字符"
                type="password"
                value={password}
              />

              {mode === "signup" ? (
                <>
                  <TextField
                    autoComplete="new-password"
                    disabled={isSubmitting || signupDisabled}
                    error={fieldErrors.confirmPassword}
                    id="confirmPassword"
                    label="确认密码"
                    onChange={(value) => setConfirmPassword(value)}
                    placeholder="再次输入密码"
                    type="password"
                    value={confirmPassword}
                  />
                  <AgreementField
                    checked={termsAccepted}
                    disabled={isSubmitting || signupDisabled}
                    error={fieldErrors.terms}
                    onChange={setTermsAccepted}
                  />
                </>
              ) : null}

              <AuthStatusNotice notice={notice} />

              <button
                className="mt-4 flex h-14 w-full items-center justify-center rounded-[12px] bg-[var(--color-primary)] px-6 text-lg font-medium text-white shadow-[0_8px_18px_rgba(196,135,58,0.18)] transition-all hover:-translate-y-px hover:bg-[var(--color-primary-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-80"
                disabled={isSubmitting || signupDisabled}
                type="submit"
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle
                      aria-hidden="true"
                      className="mr-2 size-5 animate-spin"
                      strokeWidth={1.8}
                    />
                    处理中...
                  </>
                ) : (
                  actionLabel
                )}
              </button>
            </form>

            <SocialLogin
              onUnavailableClick={(label) => {
                setNotice({
                  tone: "error",
                  message: `${label}登录暂未接入。本地版本请使用 owner 邮箱或手机号登录。`,
                });
              }}
            />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function AuthStatusNotice({ notice }: { notice: AuthNotice }) {
  const isError = notice.tone === "error";
  const isSuccess = notice.tone === "success";
  const Icon = isError ? AlertCircle : isSuccess ? CheckCircle2 : Info;

  return (
    <div
      className={`flex gap-2 rounded-[14px] border px-3 py-2 text-xs leading-5 ${
        isError
          ? "border-[#efd4d0] bg-[#fff0ee] text-[var(--color-red)]"
          : isSuccess
            ? "border-[#cfe5d6] bg-[#edf8f0] text-[#287144]"
          : "border-[var(--color-border)] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]"
      }`}
      role={isError ? "alert" : "status"}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
      <span>{notice.message}</span>
    </div>
  );
}

function VisualPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-[#f8ece2] p-12 md:flex md:min-h-[620px] md:items-center md:justify-center">
      <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(90deg,var(--color-border)_1px,transparent_1px),linear-gradient(var(--color-border)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="absolute -left-24 -top-24 size-72 rounded-full bg-[var(--color-primary-light)] blur-3xl" />
      <div className="absolute -bottom-28 -right-28 size-80 rounded-full bg-[#ebe2cd] blur-3xl" />

      <div className="relative z-10 max-w-sm space-y-6 text-center">
        <div className="mx-auto flex size-20 items-center justify-center rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)]/70 shadow-[var(--shadow-sm)]">
          <NotebookPen
            aria-hidden="true"
            className="size-10 text-[var(--color-primary)]"
            strokeWidth={1.6}
          />
        </div>
        <h2 className="text-[40px] font-bold leading-[52px] text-[var(--color-primary)]">
          静谧智慧
        </h2>
        <p className="mx-auto max-w-xs text-lg font-medium leading-7 text-[var(--color-text-secondary)]">
          为您打造的职场规划触感避风港。在飞速发展的 AI
          时代，保持内心的专注与平静。
        </p>
        <div className="mx-auto mt-8 flex w-fit items-center gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/65 px-5 py-3 text-sm font-medium text-[var(--color-text-secondary)]">
          <BookOpenText
            aria-hidden="true"
            className="size-5 text-[var(--color-primary)]"
            strokeWidth={1.7}
          />
          职场成长手帐
        </div>
      </div>
    </div>
  );
}

function AuthTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`border-b-2 pb-2 text-sm font-medium leading-5 transition-all ${
        active
          ? "border-[var(--color-primary)] text-[var(--color-primary)]"
          : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function TextField({
  autoComplete,
  disabled,
  error,
  id,
  inputMode,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  autoComplete?: string;
  disabled?: boolean;
  error?: string;
  id: string;
  inputMode?: "email" | "numeric" | "search" | "tel" | "text" | "url";
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  const errorId = `${id}-error`;

  return (
    <div className="space-y-2">
      <label
        className="text-sm font-medium text-[var(--color-text-secondary)]"
        htmlFor={id}
      >
        {label}
      </label>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? "true" : "false"}
        autoComplete={autoComplete}
        className="h-12 w-full min-w-0 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-base outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-hover)] disabled:opacity-70"
        disabled={disabled}
        id={id}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
      {error ? (
        <p className="text-xs leading-5 text-[var(--color-red)]" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AgreementField({
  checked,
  disabled,
  error,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  error?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-start gap-3">
        <input
          aria-describedby={error ? "agreement-error" : undefined}
          aria-invalid={error ? "true" : "false"}
          checked={checked}
          className="mt-1 size-4 rounded border-[var(--color-border)] accent-[var(--color-primary)] focus:ring-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          id="agreement"
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <label
          className="text-xs leading-relaxed text-[var(--color-text-secondary)]"
          htmlFor="agreement"
        >
          我确认这是管理员账号，并已阅读数据与服务说明。长期写入只会在我主动提交后发生。
        </label>
      </div>
      {error ? (
        <p className="pl-7 text-xs leading-5 text-[var(--color-red)]" id="agreement-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SocialLogin({
  onUnavailableClick,
}: {
  onUnavailableClick: (label: string) => void;
}) {
  return (
    <div className="mt-12">
      <div className="mb-8 flex items-center justify-center">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <span className="mx-4 bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text-secondary)]">
          其他登录方式
        </span>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>
      <div className="flex justify-center gap-8">
        <SocialButton
          icon="wechat"
          label="微信"
          onUnavailableClick={onUnavailableClick}
        />
        <SocialButton
          icon="github"
          label="GitHub"
          onUnavailableClick={onUnavailableClick}
        />
      </div>
    </div>
  );
}

function SocialButton({
  icon,
  label,
  onUnavailableClick,
}: {
  icon: "wechat" | "github";
  label: string;
  onUnavailableClick: (label: string) => void;
}) {
  const Icon = icon === "wechat" ? MessageCircle : Code;

  return (
    <button
      className="group flex flex-col items-center gap-2"
      onClick={() => onUnavailableClick(label)}
      type="button"
    >
      <span className="flex size-12 items-center justify-center rounded-full border border-[var(--color-border)] transition-all group-hover:border-[var(--color-primary)] group-hover:bg-[rgba(196,135,58,0.06)]">
        <Icon
          aria-hidden="true"
          className="size-5 text-[var(--color-text-secondary)] transition-colors group-hover:text-[var(--color-primary)]"
          strokeWidth={1.8}
        />
      </span>
      <span className="text-xs text-[var(--color-text-secondary)] transition-colors group-hover:text-[var(--color-primary)]">
        {label}（暂未接入）
      </span>
    </button>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 w-full border-t border-[var(--color-border)] bg-[var(--color-bg)] py-8">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 px-5 sm:px-10 md:flex-row">
        <div className="text-sm font-bold text-[var(--color-text)]">
          New Era AI
        </div>
        <div className="text-center text-xs text-[var(--color-text-secondary)]">
          © 2026 New Era AI. Your tactile sanctuary for career growth.
        </div>
        <div className="flex gap-6 text-xs">
          <a
            className="text-[var(--color-text-secondary)] underline hover:text-[var(--color-primary)]"
            href="#"
          >
            Privacy Policy
          </a>
          <a
            className="text-[var(--color-text-secondary)] underline hover:text-[var(--color-primary)]"
            href="#"
          >
            Terms of Service
          </a>
          <a
            className="text-[var(--color-text-secondary)] underline hover:text-[var(--color-primary)]"
            href="#"
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
