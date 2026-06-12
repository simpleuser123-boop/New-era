"use client";

import { useEffect } from "react";
import { apiRequest } from "@/lib/api-client";
import {
  applyThemePreference,
  readStoredThemePreference,
  readThemePreferenceFromSettings,
} from "@/lib/theme";

type SettingsResponse = {
  ok: true;
  settings: unknown;
};

export function ThemeController() {
  useEffect(() => {
    const storedPreference = readStoredThemePreference();

    if (storedPreference) {
      applyThemePreference(storedPreference);
    }

    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      if (document.documentElement.dataset.themePreference === "system") {
        applyThemePreference("system");
      }
    };

    mediaQuery?.addEventListener("change", handleSystemThemeChange);

    let cancelled = false;

    async function loadSavedThemePreference() {
      try {
        const body = await apiRequest<SettingsResponse>("/api/settings", {
          cache: "no-store",
          credentials: "same-origin",
          errorMessage: "主题偏好读取失败。",
        });
        const savedPreference = readThemePreferenceFromSettings(body.settings);

        if (!cancelled && savedPreference) {
          applyThemePreference(savedPreference);
        }
      } catch {
        // Anonymous/auth-loading pages can keep the locally cached theme.
      }
    }

    void loadSavedThemePreference();

    return () => {
      cancelled = true;
      mediaQuery?.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  return null;
}
