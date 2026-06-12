"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  CloudDownload,
  Database,
  Edit3,
  Eraser,
  ExternalLink,
  FileJson,
  KeyRound,
  LockKeyhole,
  LoaderCircle,
  LogOut,
  Mail,
  MapPin,
  MessageSquarePlus,
  Phone,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  UserCog,
  UserRound,
  X,
} from "lucide-react";
import { SettingsCard } from "@/components/features/settings/SettingsCard";
import {
  AssistantControlPanels,
  useAssistantControlPanelState,
} from "@/components/features/assistant/AssistantControlPanels";
import { PageHeader } from "@/components/features/AppShell";
import {
  avatarInitials,
  avatarTone,
  languageOptions,
  notificationSettings,
  preferenceGroups,
  profileDefaults,
  profileIcon,
  profileStats,
  skills,
  targetIndustries,
} from "@/components/features/settings/settingsData";
import { ErrorState } from "@/components/ui/ErrorState";
import { apiRequest } from "@/lib/api-client";
import {
  DATA_CLEAR_CONFIRMATION_TEXT,
  type DataClearCategory,
  type DataClearResultDto,
  type DataExportDto,
} from "@/lib/data-export";
import {
  applyThemePreference,
  type ThemePreference,
} from "@/lib/theme";

type ProfileForm = typeof profileDefaults;
type NotificationKey = "risk_alert" | "report_ready" | "language_sync";
type LoadStatus = "loading" | "ready" | "error";
type SaveStatus = "idle" | "saving" | "success" | "error";
type ExportStatus = "idle" | "exporting" | "success" | "error";
type ClearStatus = "idle" | "clearing" | "success" | "error";
type PasswordStatus = "idle" | "saving" | "success" | "error";
type LogoutStatus = "idle" | "loggingOut" | "error";

type SettingsState = {
  profile: ProfileForm;
  theme: string;
  language: string;
  notifications: boolean[];
};

const USER_FEEDBACK_FORM_URL =
  process.env.NEXT_PUBLIC_USER_FEEDBACK_FORM_URL ?? "https://wj.qq.com/";

type SettingsResponse =
  {
    ok: true;
    settings: unknown;
    updatedAt?: string | null;
    defaultsApplied?: boolean;
  };

type AuthUserState = {
  createdAt: string;
  displayName: string;
  email: string | null;
  id: number;
  lastLoginAt: string | null;
  phone: string | null;
  role: "owner";
};

type AuthMeResponse = {
  ok: true;
  user: AuthUserState;
};

type PasswordChangeResponse = {
  ok: true;
  passwordChanged: true;
  revokedSessions: number;
  sessionStrategy: "current_session_kept_other_sessions_revoked";
  user: AuthUserState;
};

type DataClearResponse = {
  ok: true;
  result: DataClearResultDto;
};

type PasswordForm = {
  confirmPassword: string;
  currentPassword: string;
  nextPassword: string;
};

type PasswordFieldErrors = Partial<Record<keyof PasswordForm, string>>;

const notificationKeys: NotificationKey[] = [
  "risk_alert",
  "report_ready",
  "language_sync",
];

const themeLabels: Record<ThemePreference, string> = {
  light: "浅色",
  dark: "深色",
  system: "自动",
};

const themeValuesByLabel: Record<string, ThemePreference> = {
  浅色: "light",
  深色: "dark",
  自动: "system",
};

const languageLabels: Record<string, string> = {
  "zh-CN": "简体中文",
  en: "English",
  ja: "日本語",
};

const languageValuesByLabel: Record<string, string> = {
  简体中文: "zh-CN",
  English: "en",
  日本語: "ja",
};

const defaultSettingsState: SettingsState = {
  profile: profileDefaults,
  theme: "浅色",
  language: languageOptions[0],
  notifications: notificationSettings.map((item) => item.enabled),
};

const emptyPasswordForm: PasswordForm = {
  confirmPassword: "",
  currentPassword: "",
  nextPassword: "",
};

const MIN_PASSWORD_LENGTH = 8;

export function SettingsWorkspace() {
  const [savedSettings, setSavedSettings] =
    useState<SettingsState>(defaultSettingsState);
  const [account, setAccount] = useState<AuthUserState | null>(null);
  const [profile, setProfile] = useState<ProfileForm>(defaultSettingsState.profile);
  const [theme, setTheme] = useState(defaultSettingsState.theme);
  const [language, setLanguage] = useState(defaultSettingsState.language);
  const [notifications, setNotifications] = useState(defaultSettingsState.notifications);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [feedbackMessage, setFeedbackMessage] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialSettings() {
      try {
        const [nextSettings, nextAccount] = await Promise.all([
          fetchSettingsState(controller.signal),
          fetchCurrentAccount(controller.signal),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        setSavedSettings(nextSettings);
        setAccount(nextAccount);
        setProfile(nextSettings.profile);
        setTheme(nextSettings.theme);
        applyThemeLabel(nextSettings.theme);
        setLanguage(nextSettings.language);
        setNotifications(nextSettings.notifications);
        setLoadStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setFeedbackMessage(
          error instanceof Error ? error.message : "设置读取失败，请稍后重试。",
        );
        setLoadStatus("error");
      }
    }

    void loadInitialSettings();

    return () => controller.abort();
  }, []);

  async function reloadSettings() {
    setLoadStatus("loading");
    setFeedbackMessage(undefined);

    try {
      const [nextSettings, nextAccount] = await Promise.all([
        fetchSettingsState(),
        fetchCurrentAccount(),
      ]);

      setSavedSettings(nextSettings);
      setAccount(nextAccount);
      setProfile(nextSettings.profile);
      setTheme(nextSettings.theme);
      applyThemeLabel(nextSettings.theme);
      setLanguage(nextSettings.language);
      setNotifications(nextSettings.notifications);
      setLoadStatus("ready");
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error ? error.message : "设置读取失败，请稍后重试。",
      );
      setLoadStatus("error");
    }
  }

  const hasChanges = useMemo(() => {
    const profileChanged = Object.entries(savedSettings.profile).some(
      ([key, value]) => profile[key as keyof ProfileForm] !== value,
    );
    const notificationChanged = savedSettings.notifications.some(
      (enabled, index) => enabled !== notifications[index],
    );

    return (
      profileChanged ||
      theme !== savedSettings.theme ||
      language !== savedSettings.language ||
      notificationChanged
    );
  }, [language, notifications, profile, savedSettings, theme]);

  const resetChanges = () => {
    setProfile(savedSettings.profile);
    setTheme(savedSettings.theme);
    applyThemeLabel(savedSettings.theme);
    setLanguage(savedSettings.language);
    setNotifications(savedSettings.notifications);
    setSaveStatus("idle");
    setFeedbackMessage(undefined);
  };

  const updateProfile = (field: keyof ProfileForm, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
    setSaveStatus("idle");
    setFeedbackMessage(undefined);
  };

  const saveSettings = async () => {
    if (!hasChanges || saveStatus === "saving") {
      return;
    }

    const nextSettings: SettingsState = {
      profile,
      theme,
      language,
      notifications,
    };

    setSaveStatus("saving");
    setFeedbackMessage(undefined);

    try {
      const body = await apiRequest<SettingsResponse>("/api/settings", {
        errorMessage: "设置保存失败，请稍后重试。",
        json: buildSettingsPayload(nextSettings),
        method: "PUT",
      });

      const normalized = normalizeSettings(body.settings);

      setSavedSettings(normalized);
      setProfile(normalized.profile);
      setTheme(normalized.theme);
      applyThemeLabel(normalized.theme);
      setLanguage(normalized.language);
      setNotifications(normalized.notifications);
      setSaveStatus("success");
      setFeedbackMessage("设置已保存。");
      window.setTimeout(() => {
        setSaveStatus((current) => (current === "success" ? "idle" : current));
      }, 1800);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "设置保存失败，请稍后重试。";

      setSaveStatus("error");
      setFeedbackMessage(`${message} 可重试保存或取消更改。`);
    }
  };

  if (loadStatus === "loading") {
    return (
      <>
        <SettingsHeader />
        <div className="mx-auto max-w-[1200px] px-5 pb-28 pt-6 sm:px-10 lg:pb-32">
          <SettingsStats />
          <div className="mt-8">
            <SettingsSkeleton />
          </div>
        </div>
      </>
    );
  }

  if (loadStatus === "error") {
    return (
      <>
        <SettingsHeader />
        <div className="mx-auto max-w-[1200px] px-5 pb-28 pt-6 sm:px-10 lg:pb-32">
          <SettingsStats />
          <div className="mt-8">
            <ErrorState
              action={
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-5 py-2 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
                  onClick={() => {
                    setLoadStatus("loading");
                    setFeedbackMessage(undefined);
                    void reloadSettings();
                  }}
                  type="button"
                >
                  <RefreshCw
                    aria-hidden="true"
                    className="size-4"
                    strokeWidth={1.8}
                  />
                  重新加载
                </button>
              }
              description={feedbackMessage}
              title="设置加载失败"
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SettingsHeader />

      <div className="mx-auto max-w-[1200px] px-5 pb-40 pt-6 sm:px-10 lg:pb-32">
        <SettingsStats />

        <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-12">
          <div className="space-y-8 xl:col-span-8">
            <ProfileCard profile={profile} updateProfile={updateProfile} />
            <ProfessionalSummary />
            <NotificationCard
              notifications={notifications}
              setNotifications={(next) => {
                setNotifications(next);
                setSaveStatus("idle");
                setFeedbackMessage(undefined);
              }}
            />
            <SettingsAssistantControlPanels />
          </div>

          <aside className="space-y-8 xl:col-span-4">
            <AccountSecurityCard
              account={account}
              onAccountChanged={setAccount}
            />
            <PreferencesCard
              language={language}
              setLanguage={(next) => {
                setLanguage(next);
                setSaveStatus("idle");
                setFeedbackMessage(undefined);
              }}
              setTheme={(next) => {
                setTheme(next);
                applyThemeLabel(next, { persist: false });
                setSaveStatus("idle");
                setFeedbackMessage(undefined);
              }}
              theme={theme}
            />
            <DataPrivacyCard />
          </aside>
        </div>

        <SaveFeedback message={feedbackMessage} status={saveStatus} />
        <SaveActionBar
          hasChanges={hasChanges}
          onCancel={resetChanges}
          onSave={saveSettings}
          saveStatus={saveStatus}
        />
      </div>
    </>
  );
}

function SettingsAssistantControlPanels() {
  const assistantControlPanelState = useAssistantControlPanelState();

  return (
    <AssistantControlPanels
      {...assistantControlPanelState}
      className="space-y-8"
      showSessionPicker
    />
  );
}

function SettingsHeader() {
  return (
    <PageHeader
      actions={
        <a
          aria-label="打开腾讯问卷反馈"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-bold leading-4 text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)] transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)] active:scale-[0.98]"
          href={USER_FEEDBACK_FORM_URL}
          rel="noreferrer"
          target="_blank"
          title="打开腾讯问卷反馈"
        >
          <MessageSquarePlus
            aria-hidden="true"
            className="size-4"
            strokeWidth={1.8}
          />
          反馈
          <ExternalLink
            aria-hidden="true"
            className="size-3.5"
            strokeWidth={1.8}
          />
        </a>
      }
      description="管理您的个人信息、账号安全及偏好设置。"
      eyebrow="Account Settings"
      icon={<Settings2 aria-hidden="true" className="size-5" strokeWidth={1.8} />}
      title="设置"
    />
  );
}

function SettingsStats() {
  return (
    <section
      aria-label="设置概览"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {profileStats.map((stat) => {
        const Icon = stat.icon;

        return (
          <div
            className="rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-[var(--shadow-sm)]"
            key={stat.label}
          >
            <Icon
              aria-hidden="true"
              className="mb-2 size-4 text-[var(--color-primary)]"
              strokeWidth={1.8}
            />
            <p className="text-lg font-semibold leading-6 text-[var(--color-text)]">
              {stat.value}
            </p>
            <p className="text-[11px] leading-4 text-[var(--color-text-secondary)]">
              {stat.label}
            </p>
          </div>
        );
      })}
    </section>
  );
}

function ProfileCard({
  profile,
  updateProfile,
}: {
  profile: ProfileForm;
  updateProfile: (field: keyof ProfileForm, value: string) => void;
}) {
  return (
    <SettingsCard className="p-6 sm:p-8">
      <CardTitle icon={UserRound} title="个人信息" />

      <div className="mt-6 flex flex-col gap-8 md:flex-row md:items-start">
        <div className="flex shrink-0 flex-col items-start gap-4">
          <div
            className="relative flex size-32 items-center justify-center overflow-hidden rounded-[24px] border-2 border-[rgba(196,135,58,0.22)] text-4xl font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
            style={{ background: avatarTone }}
            aria-label="头像预览"
          >
            <span>{avatarInitials}</span>
            <div className="absolute inset-x-0 bottom-0 h-10 bg-[linear-gradient(180deg,transparent,rgba(45,42,38,0.34))]" />
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-bold leading-5 text-[var(--color-primary)] transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] active:scale-[0.98]"
            type="button"
          >
            <Camera aria-hidden="true" className="size-4" strokeWidth={1.8} />
            更换头像
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-5 md:grid-cols-2">
          <TextField
            label="姓名"
            onChange={(value) => updateProfile("name", value)}
            value={profile.name}
          />
          <TextField
            label="职业身份"
            onChange={(value) => updateProfile("role", value)}
            value={profile.role}
          />
          <TextField
            className="md:col-span-2"
            icon={MapPin}
            label="所在城市"
            onChange={(value) => updateProfile("city", value)}
            value={profile.city}
          />
          <TextAreaField
            className="md:col-span-2"
            label="简介"
            onChange={(value) => updateProfile("bio", value)}
            value={profile.bio}
          />
        </div>
      </div>
    </SettingsCard>
  );
}

function ProfessionalSummary() {
  return (
    <SettingsCard className="p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle icon={profileIcon} title="专业背景摘要" />
        <button
          className="inline-flex items-center gap-2 self-start rounded-full px-1 text-sm font-bold leading-5 text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary-hover)]"
          type="button"
        >
          <Edit3 aria-hidden="true" className="size-4" strokeWidth={1.8} />
          编辑
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-[18px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-5">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
            主要技能
          </p>
          <div className="flex flex-wrap gap-2">
            {skills.map((skill) => (
              <span
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs leading-4 text-[var(--color-text)]"
                key={skill}
              >
                {skill}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-[18px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-5">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
            目标行业
          </p>
          <p className="text-base font-medium leading-7 text-[var(--color-text)]">
            {targetIndustries}
          </p>
        </div>
      </div>
    </SettingsCard>
  );
}

function NotificationCard({
  notifications,
  setNotifications,
}: {
  notifications: boolean[];
  setNotifications: (value: boolean[]) => void;
}) {
  return (
    <SettingsCard className="p-6 sm:p-8">
      <CardTitle icon={Check} title="通知与同步" />
      <div className="mt-6 divide-y divide-[var(--color-border-light)]">
        {notificationSettings.map((item, index) => {
          const Icon = item.icon;
          const checked = notifications[index];

          return (
            <label
              className="flex cursor-pointer items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
              key={item.label}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
                  <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
                </span>
                <span>
                  <span className="block text-sm font-bold leading-5 text-[var(--color-text)]">
                    {item.label}
                  </span>
                  <span className="block text-xs leading-5 text-[var(--color-text-secondary)]">
                    {item.detail}
                  </span>
                </span>
              </span>
              <input
                checked={checked}
                className="size-5 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[rgba(196,135,58,0.24)]"
                onChange={(event) => {
                  const next = [...notifications];
                  next[index] = event.target.checked;
                  setNotifications(next);
                }}
                type="checkbox"
              />
            </label>
          );
        })}
      </div>
    </SettingsCard>
  );
}

function AccountSecurityCard({
  account,
  onAccountChanged,
}: {
  account: AuthUserState | null;
  onAccountChanged: (account: AuthUserState) => void;
}) {
  const router = useRouter();
  const [passwordForm, setPasswordForm] =
    useState<PasswordForm>(emptyPasswordForm);
  const [passwordErrors, setPasswordErrors] = useState<PasswordFieldErrors>({});
  const [passwordMessage, setPasswordMessage] = useState<string>();
  const [passwordStatus, setPasswordStatus] = useState<PasswordStatus>("idle");
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutMessage, setLogoutMessage] = useState<string>();
  const [logoutStatus, setLogoutStatus] = useState<LogoutStatus>("idle");
  const isChangingPassword = passwordStatus === "saving";
  const isLoggingOut = logoutStatus === "loggingOut";
  const accountItems = [
    {
      label: "显示名称",
      value: account?.displayName ?? "未读取",
      icon: UserRound,
    },
    {
      label: "邮箱",
      value: account?.email ?? "未填写",
      icon: Mail,
    },
    {
      label: "电话",
      value: account?.phone ?? "未填写",
      icon: Phone,
    },
    {
      label: "账号角色",
      value: account?.role === "owner" ? "管理员" : "未知",
      icon: UserCog,
    },
    {
      label: "创建时间",
      value: formatAccountDate(account?.createdAt),
      icon: CalendarDays,
    },
    {
      label: "最近登录",
      value: formatAccountDate(account?.lastLoginAt, "暂无登录记录"),
      icon: ShieldCheck,
    },
  ];

  function updatePasswordField(field: keyof PasswordForm, value: string) {
    setPasswordForm((current) => ({ ...current, [field]: value }));
    setPasswordErrors((current) => ({ ...current, [field]: undefined }));
    setPasswordStatus("idle");
    setPasswordMessage(undefined);
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isChangingPassword) {
      return;
    }

    const nextErrors = validatePasswordForm(passwordForm);

    setPasswordErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setPasswordStatus("error");
      setPasswordMessage("请先修正密码表单中的错误。");
      return;
    }

    setPasswordStatus("saving");
    setPasswordMessage(undefined);

    try {
      const body = await apiRequest<PasswordChangeResponse>("/api/auth/password", {
        errorMessage: "修改密码失败，请稍后重试。",
        json: passwordForm,
        method: "PATCH",
      });

      onAccountChanged(body.user);
      setPasswordForm(emptyPasswordForm);
      setPasswordErrors({});
      setPasswordStatus("success");
      setPasswordMessage(
        `密码已修改。当前会话继续保留，已撤销 ${body.revokedSessions} 个其他登录会话。`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "修改密码失败，请稍后重试。";

      setPasswordStatus("error");
      setPasswordMessage(message);
      if (message.includes("当前密码")) {
        setPasswordErrors((current) => ({
          ...current,
          currentPassword: message,
        }));
      }
    }
  }

  function openLogoutConfirm() {
    setLogoutConfirmOpen(true);
    setLogoutStatus("idle");
    setLogoutMessage(undefined);
  }

  async function confirmLogout() {
    if (isLoggingOut) {
      return;
    }

    setLogoutStatus("loggingOut");
    setLogoutMessage(undefined);

    try {
      await apiRequest<{ loggedOut: true; ok: true }>("/api/auth/logout", {
        errorMessage: "退出登录失败，请稍后重试。",
        method: "POST",
      });

      router.replace("/auth");
      router.refresh();
    } catch (error) {
      setLogoutStatus("error");
      setLogoutMessage(
        error instanceof Error ? error.message : "退出登录失败，请稍后重试。",
      );
    }
  }

  return (
    <SettingsCard className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold leading-6 text-[var(--color-text)]">
            <LockKeyhole
              aria-hidden="true"
              className="size-5 text-[var(--color-primary)]"
              strokeWidth={1.8}
            />
            账号安全
          </h2>
          <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
            管理员账号与登录状态。
          </p>
        </div>
        <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-bold leading-4 text-[var(--color-text-secondary)]">
          管理员
        </span>
      </div>

      <dl
        className="mt-5 space-y-3"
        data-testid="account-security-fields"
      >
        {accountItems.map((item) => {
          const Icon = item.icon;

          return (
            <div
              className="flex gap-3 rounded-[14px] bg-[var(--color-surface-hover)] px-3 py-3"
              key={item.label}
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[12px] bg-[var(--color-surface)] text-[var(--color-primary)]">
                <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <dt className="text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
                  {item.label}
                </dt>
                <dd className="mt-1 break-words text-sm font-bold leading-5 text-[var(--color-text)]">
                  {item.value}
                </dd>
              </div>
            </div>
          );
        })}
      </dl>

      <form
        className="mt-6 border-t border-[var(--color-border-light)] pt-5"
        data-testid="password-change-form"
        onSubmit={(event) => void handlePasswordSubmit(event)}
      >
        <h3 className="flex items-center gap-2 text-sm font-bold leading-5 text-[var(--color-text)]">
          <KeyRound
            aria-hidden="true"
            className="size-4 text-[var(--color-primary)]"
            strokeWidth={1.8}
          />
          修改密码
        </h3>
        <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
          新密码至少 {MIN_PASSWORD_LENGTH} 位。修改成功后保留当前会话，并撤销其他有效会话。
        </p>

        <div className="mt-4 space-y-3">
          <PasswordField
            autoComplete="current-password"
            error={passwordErrors.currentPassword}
            label="当前密码"
            onChange={(value) => updatePasswordField("currentPassword", value)}
            value={passwordForm.currentPassword}
          />
          <PasswordField
            autoComplete="new-password"
            error={passwordErrors.nextPassword}
            label="新密码"
            onChange={(value) => updatePasswordField("nextPassword", value)}
            value={passwordForm.nextPassword}
          />
          <PasswordField
            autoComplete="new-password"
            error={passwordErrors.confirmPassword}
            label="确认新密码"
            onChange={(value) => updatePasswordField("confirmPassword", value)}
            value={passwordForm.confirmPassword}
          />
        </div>

        {passwordMessage ? (
          <div
            className={`mt-4 rounded-[14px] border px-3 py-3 text-xs font-bold leading-5 ${
              passwordStatus === "success"
                ? "border-[#d7e7d2] bg-[#eef6eb] text-[#5f7f50]"
                : "border-[#efd4d0] bg-[#fff0ee] text-[var(--color-red)]"
            }`}
            role="status"
          >
            {passwordMessage}
          </div>
        ) : null}

        <button
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--color-primary)] px-4 py-3 text-sm font-bold leading-5 text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="password-change-submit"
          disabled={isChangingPassword}
          type="submit"
        >
          {isChangingPassword ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin"
              strokeWidth={1.8}
            />
          ) : (
            <KeyRound aria-hidden="true" className="size-4" strokeWidth={1.8} />
          )}
          {isChangingPassword ? "正在修改..." : "保存新密码"}
        </button>
      </form>

      <div className="mt-6 border-t border-[var(--color-border-light)] pt-5">
        <button
          className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] border border-[#efd4d0] bg-[#fff0ee] px-4 py-3 text-sm font-bold leading-5 text-[var(--color-red)] transition-all hover:bg-[#ffe6e2] active:scale-[0.98]"
          data-testid="logout-open"
          onClick={openLogoutConfirm}
          type="button"
        >
          <LogOut aria-hidden="true" className="size-4" strokeWidth={1.8} />
          退出登录
        </button>
      </div>

      {logoutConfirmOpen ? (
        <div
          aria-labelledby="logout-confirm-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(45,42,38,0.38)] px-5 backdrop-blur-sm"
          data-testid="logout-confirm-dialog"
          role="dialog"
        >
          <div className="w-full max-w-[420px] rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[0_24px_80px_rgba(45,42,38,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  className="text-lg font-semibold leading-7 text-[var(--color-text)]"
                  id="logout-confirm-title"
                >
                  确认退出登录？
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                  退出后将清除当前会话并跳转到登录页，受保护页面需要重新登录后才能访问。
                </p>
              </div>
              <button
                aria-label="关闭退出登录确认"
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                disabled={isLoggingOut}
                onClick={() => setLogoutConfirmOpen(false)}
                type="button"
              >
                <X aria-hidden="true" className="size-5" strokeWidth={1.8} />
              </button>
            </div>

            {logoutMessage ? (
              <div
                className="mt-4 rounded-[14px] border border-[#efd4d0] bg-[#fff0ee] px-3 py-3 text-xs font-bold leading-5 text-[var(--color-red)]"
                role="status"
              >
                {logoutMessage}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="rounded-full border border-[var(--color-border)] px-5 py-2.5 text-sm font-bold leading-5 text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="logout-cancel"
                disabled={isLoggingOut}
                onClick={() => setLogoutConfirmOpen(false)}
                type="button"
              >
                继续留在设置
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-red)] px-5 py-2.5 text-sm font-bold leading-5 text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="logout-confirm"
                disabled={isLoggingOut}
                onClick={() => void confirmLogout()}
                type="button"
              >
                {isLoggingOut ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                    strokeWidth={1.8}
                  />
                ) : (
                  <LogOut
                    aria-hidden="true"
                    className="size-4"
                    strokeWidth={1.8}
                  />
                )}
                {isLoggingOut ? "正在退出..." : "确认退出"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </SettingsCard>
  );
}

function PasswordField({
  autoComplete,
  error,
  label,
  onChange,
  value,
}: {
  autoComplete: string;
  error?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
        {label}
      </span>
      <input
        autoComplete={autoComplete}
        className={`w-full rounded-[14px] border bg-[var(--color-surface)] px-3 py-2.5 text-sm leading-5 text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)] ${
          error ? "border-[#e3a29a]" : "border-[var(--color-border)]"
        }`}
        onChange={(event) => onChange(event.target.value)}
        type="password"
        value={value}
      />
      {error ? (
        <span className="block text-xs font-bold leading-4 text-[var(--color-red)]">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function PreferencesCard({
  language,
  setLanguage,
  setTheme,
  theme,
}: {
  language: string;
  setLanguage: (value: string) => void;
  setTheme: (value: string) => void;
  theme: string;
}) {
  const group = preferenceGroups[0];
  const Icon = group.icon;

  return (
    <SettingsCard className="p-6">
      <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
        通用偏好
      </h2>

      <div className="mt-5 space-y-6">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-bold leading-5 text-[var(--color-text)]">
            <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
            {group.label}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {group.options.map((option) => {
              const selected = option === theme;

              return (
                <button
                  className={`rounded-[12px] border px-3 py-2 text-xs font-bold leading-4 transition-all active:scale-[0.98] ${
                    selected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]"
                  }`}
                  key={option}
                  onClick={() => setTheme(option)}
                  type="button"
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold leading-5 text-[var(--color-text)]">
            系统语言
          </label>
          <select
            className="w-full cursor-pointer rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-4 py-2.5 text-sm leading-5 text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]"
            onChange={(event) => setLanguage(event.target.value)}
            value={language}
          >
            {languageOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
      </div>
    </SettingsCard>
  );
}

const dataClearOptions: Array<{
  detail: string;
  key: DataClearCategory;
  label: string;
}> = [
  {
    detail: "评估报告、JD 文本和风险结果；保留 Tracker 时会解除报告关联。",
    key: "reports",
    label: "报告",
  },
  {
    detail: "简历档案和相关优化运行；保留 Tracker 时会解除简历关联。",
    key: "resumes",
    label: "简历",
  },
  {
    detail: "Tracker 投递记录和事件时间线。",
    key: "applications",
    label: "投递记录",
  },
  {
    detail: "设置项与 Career DNA 求职画像。",
    key: "settings",
    label: "设置",
  },
];

const privacyBoundaryItems = [
  {
    detail: "报告、简历、Tracker、设置等长期数据可按需导出与清理。",
    icon: Database,
    title: "数据管理",
  },
  {
    detail:
      "评估、简历解析/优化、Assistant 和面试教练可能把当前任务需要的 JD、简历片段或上下文发给模型服务；不会发送整库导出，也不会读取环境变量密钥写入导出。",
    icon: Bot,
    title: "AI 分析",
  },
  {
    detail: "当前不接招聘平台授权，不自动投递，也不自动联系 HR。",
    icon: ShieldCheck,
    title: "平台边界",
  },
];

function DataPrivacyCard() {
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [clearStatus, setClearStatus] = useState<ClearStatus>("idle");
  const [selectedCategories, setSelectedCategories] = useState<
    DataClearCategory[]
  >([]);
  const [confirmText, setConfirmText] = useState("");
  const [dataMessage, setDataMessage] = useState<string>();
  const [lastClearResult, setLastClearResult] =
    useState<DataClearResultDto | null>(null);

  const canClear =
    selectedCategories.length > 0 &&
    confirmText === DATA_CLEAR_CONFIRMATION_TEXT &&
    clearStatus !== "clearing";
  const isExporting = exportStatus === "exporting";
  const isClearing = clearStatus === "clearing";

  async function downloadExport() {
    if (isExporting) {
      return;
    }

    setExportStatus("exporting");
    setDataMessage(undefined);

    try {
      const exportData = await apiRequest<DataExportDto>("/api/export", {
        cache: "no-store",
        errorMessage: "数据导出失败，请稍后重试。",
      });
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = buildExportFilename(exportData.exportedAt);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);

      setExportStatus("success");
      setDataMessage(
        `已导出 JSON：${formatExportSummary(exportData)}。`,
      );
    } catch (error) {
      setExportStatus("error");
      setDataMessage(
        error instanceof Error ? error.message : "数据导出失败，请稍后重试。",
      );
    }
  }

  async function clearSelectedData() {
    if (!canClear || isClearing) {
      return;
    }

    setClearStatus("clearing");
    setDataMessage(undefined);

    try {
      const body = await apiRequest<DataClearResponse>("/api/data/clear", {
        errorMessage: "数据清除失败，请稍后重试。",
        json: {
          categories: selectedCategories,
          confirmText,
        },
        method: "POST",
      });

      setLastClearResult(body.result);
      setSelectedCategories([]);
      setConfirmText("");
      setClearStatus("success");
      setDataMessage(formatClearResult(body.result));
    } catch (error) {
      setClearStatus("error");
      setDataMessage(
        error instanceof Error ? error.message : "数据清除失败，请稍后重试。",
      );
    }
  }

  function toggleCategory(category: DataClearCategory) {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
    setClearStatus("idle");
    setDataMessage(undefined);
  }

  return (
    <SettingsCard className="overflow-hidden p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold leading-6 text-[var(--color-text)]">
            <FileJson
              aria-hidden="true"
              className="size-5 text-[var(--color-primary)]"
              strokeWidth={1.8}
            />
            数据与隐私
          </h2>
          <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
            管理数据导出、清除范围和服务设置。
          </p>
        </div>
        <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-bold leading-4 text-[var(--color-text-secondary)]">
          数据管理
        </span>
      </div>

      <button
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--color-primary)] px-4 py-3 text-sm font-bold leading-5 text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="data-export-button"
        disabled={isExporting}
        onClick={() => void downloadExport()}
        type="button"
      >
        {isExporting ? (
          <LoaderCircle
            aria-hidden="true"
            className="size-4 animate-spin"
            strokeWidth={1.8}
          />
        ) : (
          <CloudDownload
            aria-hidden="true"
            className="size-4"
            strokeWidth={1.8}
          />
        )}
        {isExporting ? "正在导出..." : "导出 JSON 文件"}
      </button>

      <div className="mt-4 rounded-[14px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] px-4 py-3">
        <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
          导出文件包含已保存的报告、简历、Tracker、设置和求职画像记录。
        </p>
      </div>

      <div className="mt-5 space-y-3">
        {privacyBoundaryItems.map((item) => {
          const Icon = item.icon;

          return (
            <div className="flex gap-3" key={item.title}>
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[12px] bg-[var(--color-surface-hover)] text-[var(--color-primary)]">
                <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold leading-5 text-[var(--color-text)]">
                  {item.title}
                </span>
                <span className="block break-words text-xs leading-5 text-[var(--color-text-secondary)]">
                  {item.detail}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-6 border-t border-[var(--color-border-light)] pt-5">
        <div className="flex items-center gap-2 text-sm font-bold leading-5 text-[var(--color-red)]">
          <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.8} />
          清除本地数据
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
          建议先导出备份。清除只影响选中的类别，不会触发外部平台操作。
        </p>

        <div className="mt-4 space-y-2">
          {dataClearOptions.map((option) => {
            const checked = selectedCategories.includes(option.key);

            return (
              <label
                className={`flex cursor-pointer gap-3 rounded-[14px] border px-3 py-3 transition-colors ${
                  checked
                    ? "border-[rgba(196,135,58,0.48)] bg-[var(--color-primary-light)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-hover)] hover:border-[var(--color-primary)]"
                }`}
                key={option.key}
              >
                <input
                  checked={checked}
                  className="mt-1 size-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[rgba(196,135,58,0.24)]"
                  data-testid={`data-clear-category-${option.key}`}
                  onChange={() => toggleCategory(option.key)}
                  type="checkbox"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold leading-5 text-[var(--color-text)]">
                    {option.label}
                  </span>
                  <span className="block text-xs leading-5 text-[var(--color-text-secondary)]">
                    {option.detail}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <label className="mt-4 block space-y-2">
          <span className="block text-xs font-bold leading-4 text-[var(--color-text-secondary)]">
            输入确认文本
          </span>
          <input
            className="w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm leading-5 text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]"
            data-testid="data-clear-confirm-input"
            onChange={(event) => {
              setConfirmText(event.target.value);
              setClearStatus("idle");
              setDataMessage(undefined);
            }}
            placeholder={DATA_CLEAR_CONFIRMATION_TEXT}
            type="text"
            value={confirmText}
          />
          <span className="block break-words text-[11px] leading-4 text-[var(--color-text-secondary)]">
            必须完整输入 {DATA_CLEAR_CONFIRMATION_TEXT}。
          </span>
        </label>

        <button
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--color-red)] px-4 py-3 text-sm font-bold leading-5 text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="data-clear-submit"
          disabled={!canClear || isClearing}
          onClick={() => void clearSelectedData()}
          type="button"
        >
          {isClearing ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin"
              strokeWidth={1.8}
            />
          ) : (
            <Eraser aria-hidden="true" className="size-4" strokeWidth={1.8} />
          )}
          {isClearing ? "正在清除..." : "确认清除所选数据"}
        </button>
      </div>

      {dataMessage ? (
        <div
          className={`mt-4 rounded-[14px] border px-3 py-3 text-xs font-bold leading-5 ${
            exportStatus === "error" || clearStatus === "error"
              ? "border-[#efd4d0] bg-[#fff0ee] text-[var(--color-red)]"
              : "border-[#d7e7d2] bg-[#eef6eb] text-[#5f7f50]"
          }`}
          role="status"
        >
          {dataMessage}
        </div>
      ) : null}

      {lastClearResult ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
          {dataClearOptions.map((option) => (
            <div
              className="rounded-[12px] bg-[var(--color-surface-hover)] px-3 py-2"
              key={option.key}
            >
              <dt className="leading-4 text-[var(--color-text-secondary)]">
                {option.label}
              </dt>
              <dd className="mt-1 text-sm font-bold leading-5 text-[var(--color-text)]">
                {lastClearResult.cleared[option.key]}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </SettingsCard>
  );
}

function SaveActionBar({
  hasChanges,
  onCancel,
  onSave,
  saveStatus,
}: {
  hasChanges: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveStatus: SaveStatus;
}) {
  const isSaving = saveStatus === "saving";

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-5 z-20 flex justify-center lg:left-[280px] lg:right-8">
      <div className="pointer-events-auto flex w-full max-w-[640px] flex-col gap-3 rounded-[24px] border border-[var(--color-floating-bar-border)] bg-[var(--color-floating-bar-bg)] px-5 py-4 shadow-[var(--shadow-floating-bar)] backdrop-blur-md sm:w-auto sm:flex-row sm:items-center sm:gap-6 sm:rounded-full sm:px-8">
        <p className="text-center text-xs leading-4 text-[var(--color-text-secondary)] sm:text-left">
          {saveStatus === "error"
            ? "保存失败，当前更改未保存"
            : hasChanges
              ? "您有未保存的更改"
              : "当前设置已是最新"}
        </p>
        <div className="flex justify-center gap-3">
          <button
            className="rounded-full border border-[var(--color-border)] px-5 py-2 text-sm font-bold leading-5 text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasChanges || isSaving}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-6 py-2 text-sm font-bold leading-5 text-white shadow-[0_8px_20px_rgba(196,135,58,0.24)] transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!hasChanges || isSaving}
            onClick={onSave}
            type="button"
          >
            {isSaving ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
                strokeWidth={1.8}
              />
            ) : (
              <Save aria-hidden="true" className="size-4" strokeWidth={1.8} />
            )}
            {isSaving ? "保存中..." : "保存设置"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveFeedback({
  message,
  status,
}: {
  message?: string;
  status: SaveStatus;
}) {
  if (!message || status === "idle" || status === "saving") {
    return null;
  }

  const isSuccess = status === "success";
  const Icon = isSuccess ? CheckCircle2 : AlertTriangle;

  return (
    <div className="fixed right-5 top-5 z-40 lg:left-[260px] lg:right-auto">
      <div
        className={`flex max-w-sm items-center gap-3 rounded-[16px] border px-4 py-3 shadow-[var(--shadow-md)] ${
          isSuccess
            ? "border-[#d7e7d2] bg-[#eef6eb] text-[#5f7f50]"
            : "border-[#efd4d0] bg-[#fff0ee] text-[var(--color-red)]"
        }`}
        role="status"
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.8} />
        <p className="text-sm font-bold leading-5">{message}</p>
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-12">
      <div className="space-y-8 xl:col-span-8">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            className="min-h-64 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8"
            key={index}
          >
            <div className="h-7 w-40 animate-pulse rounded-full bg-[var(--color-border-light)]" />
            <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="h-12 animate-pulse rounded-[14px] bg-[var(--color-border-light)]" />
              <div className="h-12 animate-pulse rounded-[14px] bg-[var(--color-border-light)]" />
              <div className="h-28 animate-pulse rounded-[14px] bg-[var(--color-border-light)] md:col-span-2" />
            </div>
          </div>
        ))}
      </div>
      <aside className="space-y-8 xl:col-span-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            className="min-h-48 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)]"
            key={index}
          >
            <div className="h-4 w-28 animate-pulse rounded-full bg-[var(--color-border-light)]" />
            <div className="mt-6 space-y-3">
              <div className="h-10 animate-pulse rounded-[14px] bg-[var(--color-border-light)]" />
              <div className="h-10 animate-pulse rounded-[14px] bg-[var(--color-border-light)]" />
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}

function CardTitle({
  icon: Icon,
  title,
}: {
  icon: typeof UserRound;
  title: string;
}) {
  return (
    <h2 className="flex items-center gap-2 text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
      <Icon aria-hidden="true" className="size-5 text-[var(--color-primary)]" strokeWidth={1.8} />
      {title}
    </h2>
  );
}

function TextField({
  className = "",
  icon: Icon,
  label,
  onChange,
  value,
}: {
  className?: string;
  icon?: typeof MapPin;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className={`space-y-2 ${className}`}>
      <span className="block text-sm font-bold leading-5 text-[var(--color-text-secondary)]">
        {label}
      </span>
      <span className="relative block">
        {Icon ? (
          <Icon
            aria-hidden="true"
            className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]"
            strokeWidth={1.8}
          />
        ) : null}
        <input
          className={`w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base leading-6 text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)] ${
            Icon ? "pl-10" : ""
          }`}
          onChange={(event) => onChange(event.target.value)}
          type="text"
          value={value}
        />
      </span>
    </label>
  );
}

function TextAreaField({
  className = "",
  label,
  onChange,
  value,
}: {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className={`space-y-2 ${className}`}>
      <span className="block text-sm font-bold leading-5 text-[var(--color-text-secondary)]">
        {label}
      </span>
      <textarea
        className="min-h-28 w-full resize-none rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base leading-6 text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function buildExportFilename(exportedAt: string): string {
  const safeDate = exportedAt
    .replace(/[:.]/g, "-")
    .replace("T", "-")
    .replace("Z", "Z");

  return `new-era-export-${safeDate}.json`;
}

function formatExportSummary(exportData: DataExportDto): string {
  return [
    `${exportData.tables.reports.length} 份报告`,
    `${exportData.tables.resumes.length} 份简历`,
    `${exportData.tables.applications.length} 条投递记录`,
    `${exportData.tables.settings.length} 个设置项`,
  ].join("、");
}

function formatClearResult(result: DataClearResultDto): string {
  const selectedLabels = result.requestedCategories.map(getClearCategoryLabel);
  const clearedCount = Object.values(result.cleared).reduce(
    (total, count) => total + count,
    0,
  );

  if (clearedCount === 0) {
    return `${selectedLabels.join("、")} 已检查，无可清除数据。`;
  }

  return `${selectedLabels.join("、")} 已清除 ${clearedCount} 条主记录。`;
}

function getClearCategoryLabel(category: DataClearCategory): string {
  return (
    dataClearOptions.find((option) => option.key === category)?.label ??
    category
  );
}

function normalizeSettings(rawSettings: unknown): SettingsState {
  const settings = toRecord(rawSettings);
  const profile = toRecord(settings?.profile);
  const uiPreferences =
    toRecord(settings?.ui_preferences) ?? toRecord(settings?.preferences);
  const notificationPreferences = toRecord(settings?.notification_preferences);

  return {
    profile: {
      name: readString(profile?.name) ?? profileDefaults.name,
      role: readString(profile?.role) ?? profileDefaults.role,
      city: readString(profile?.city) ?? profileDefaults.city,
      bio: readString(profile?.bio) ?? profileDefaults.bio,
    },
    theme: readThemeLabel(uiPreferences?.theme),
    language: readLanguageLabel(uiPreferences?.language),
    notifications: notificationKeys.map((key, index) => {
      const value = notificationPreferences?.[key];

      return typeof value === "boolean"
        ? value
        : notificationSettings[index]?.enabled ?? false;
    }),
  };
}

async function fetchCurrentAccount(
  signal?: AbortSignal,
): Promise<AuthUserState> {
  const body = await apiRequest<AuthMeResponse>("/api/auth/me", {
    cache: "no-store",
    credentials: "same-origin",
    errorMessage: "账号状态读取失败，请重新登录。",
    signal,
  });

  return body.user;
}

async function fetchSettingsState(signal?: AbortSignal): Promise<SettingsState> {
  const body = await apiRequest<SettingsResponse>("/api/settings", {
    cache: "no-store",
    errorMessage: "设置读取失败，请稍后重试。",
    signal,
  });

  return normalizeSettings(body.settings);
}

function validatePasswordForm(form: PasswordForm): PasswordFieldErrors {
  const errors: PasswordFieldErrors = {};

  if (form.currentPassword.length < MIN_PASSWORD_LENGTH) {
    errors.currentPassword = `当前密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符。`;
  }

  if (form.nextPassword.length < MIN_PASSWORD_LENGTH) {
    errors.nextPassword = `新密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符。`;
  }

  if (form.confirmPassword.length < MIN_PASSWORD_LENGTH) {
    errors.confirmPassword = `确认密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符。`;
  } else if (form.nextPassword !== form.confirmPassword) {
    errors.confirmPassword = "两次输入的新密码不一致。";
  }

  return errors;
}

function formatAccountDate(value?: string | null, fallback = "未记录"): string {
  if (!value) {
    return fallback;
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function buildSettingsPayload(settings: SettingsState) {
  return {
    settings: {
      profile: settings.profile,
      notification_preferences: Object.fromEntries(
        notificationKeys.map((key, index) => [key, settings.notifications[index]]),
      ),
      ui_preferences: {
        theme: themeValuesByLabel[settings.theme] ?? "light",
        language: languageValuesByLabel[settings.language] ?? "zh-CN",
      },
    },
  };
}

function readThemeLabel(value: unknown): string {
  if (value === "light" || value === "dark" || value === "system") {
    return themeLabels[value];
  }

  return defaultSettingsState.theme;
}

function applyThemeLabel(
  label: string,
  options?: Parameters<typeof applyThemePreference>[1],
) {
  applyThemePreference(themeValuesByLabel[label] ?? "light", options);
}

function readLanguageLabel(value: unknown): string {
  if (typeof value === "string" && languageLabels[value]) {
    return languageLabels[value];
  }

  return defaultSettingsState.language;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
