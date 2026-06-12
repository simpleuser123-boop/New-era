export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "new-era.themePreference";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readStoredThemePreference(): ThemePreference | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);

    return isThemePreference(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function readThemePreferenceFromSettings(
  rawSettings: unknown,
): ThemePreference | undefined {
  const settings = toRecord(rawSettings);
  const uiPreferences =
    toRecord(settings?.ui_preferences) ?? toRecord(settings?.preferences);

  return isThemePreference(uiPreferences?.theme)
    ? uiPreferences.theme
    : undefined;
}

export function resolveThemePreference(
  preference: ThemePreference,
): ResolvedTheme {
  if (preference !== "system") {
    return preference;
  }

  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyThemePreference(
  preference: ThemePreference,
  options: { persist?: boolean } = {},
): ResolvedTheme {
  const resolvedTheme = resolveThemePreference(preference);

  if (typeof document !== "undefined") {
    const root = document.documentElement;

    root.dataset.theme = resolvedTheme;
    root.dataset.themePreference = preference;
    root.style.colorScheme = resolvedTheme;
  }

  if (options.persist !== false && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Ignore storage failures; the current document theme still applies.
    }
  }

  return resolvedTheme;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
