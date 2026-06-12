import type { NextRequest } from "next/server";
import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import {
  careerProfileSettingsSchema,
  jsonObjectSchema,
  notificationPreferencesSchema,
  notificationSettingSchema,
  preferenceSettingsSchema,
  productGuideSettingsSchema,
  profileSettingsSchema,
  settingsUpsertInputSchema,
  themePreferenceSchema,
} from "@/lib/schemas";
import { listSettings, upsertSettings } from "@/lib/server-db";
import type { JsonObject, JsonValue, SettingDto, SettingKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const settingEntrySchema = settingsUpsertInputSchema;
const settingEntriesSchema = z.array(settingEntrySchema).min(1).max(20);
const notificationValueSchema = z.union([
  z.array(notificationSettingSchema).max(100),
  notificationPreferencesSchema,
]);
const settingsObjectSchema = z
  .strictObject({
    profile: profileSettingsSchema.optional(),
    preferences: preferenceSettingsSchema.optional(),
    ui_preferences: preferenceSettingsSchema.optional(),
    notifications: notificationValueSchema.optional(),
    notification_preferences: notificationPreferencesSchema.optional(),
    security: jsonObjectSchema.optional(),
    language: z.string().trim().min(1).max(240).optional(),
    theme: themePreferenceSchema.optional(),
    model_provider: jsonObjectSchema.optional(),
    data_export: jsonObjectSchema.optional(),
    career_profile: careerProfileSettingsSchema.optional(),
    product_guide: productGuideSettingsSchema.optional(),
  })
  .refine((settings) => hasDefinedValue(settings), {
    message: "At least one setting key is required.",
  });
const settingsPutRequestSchema = z.union([
  z.strictObject({
    settings: settingsObjectSchema,
  }),
  z.strictObject({
    entries: settingEntriesSchema,
  }),
  settingsObjectSchema,
]);

const DEFAULT_SETTINGS = {
  profile: {
    name: "陈默",
    role: "高级 AI 产品经理",
    city: "上海，中国",
    bio: "专注 AI 驱动的效率工具开发，深耕互联网行业 8 年。目前主要研究大模型应用层在职场场景的落地。",
    targetIndustries: ["人工智能", "企业服务", "FinTech"],
    skills: ["大语言模型 (LLM)", "产品架构", "用户增长"],
  },
  notification_preferences: {
    risk_alert: true,
    report_ready: true,
    language_sync: false,
  },
  ui_preferences: {
    theme: "light",
    language: "zh-CN",
  },
} satisfies JsonObject;

const SENSITIVE_SETTING_KEY_PATTERN =
  /(?:api[_-]?key|access[_-]?key|secret|token|password|authorization|bearer)/i;

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function hasDefinedValue(value: Record<string, unknown>): boolean {
  return Object.values(value).some((item) => item !== undefined);
}

function parseSettingsPayload(payload: unknown) {
  const parsed = settingsPutRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return parsed;
  }

  if ("entries" in parsed.data) {
    return settingEntriesSchema.safeParse(parsed.data.entries);
  }

  const settings = "settings" in parsed.data ? parsed.data.settings : parsed.data;

  return settingEntriesSchema.safeParse(settingsObjectToEntries(settings));
}

function sanitizeEntriesBeforeSave(
  entries: z.infer<typeof settingEntriesSchema>,
): z.infer<typeof settingEntriesSchema> {
  return entries.map((entry) => ({
    ...entry,
    value: sanitizeJsonValue(entry.value),
  })) as z.infer<typeof settingEntriesSchema>;
}

function settingsObjectToEntries(
  settings: z.infer<typeof settingsObjectSchema>,
): z.input<typeof settingEntrySchema>[] {
  const entries: z.input<typeof settingEntrySchema>[] = [];

  pushEntry(entries, "profile", settings.profile);
  pushEntry(entries, "preferences", settings.preferences);
  pushEntry(entries, "ui_preferences", settings.ui_preferences);

  if (settings.notifications !== undefined) {
    if (Array.isArray(settings.notifications)) {
      pushEntry(entries, "notifications", settings.notifications);
    } else {
      pushEntry(entries, "notification_preferences", settings.notifications);
    }
  }

  pushEntry(
    entries,
    "notification_preferences",
    settings.notification_preferences,
  );
  pushEntry(entries, "security", settings.security);
  pushEntry(entries, "language", settings.language);
  pushEntry(entries, "theme", settings.theme);
  pushEntry(entries, "model_provider", settings.model_provider);
  pushEntry(entries, "data_export", settings.data_export);
  pushEntry(entries, "career_profile", settings.career_profile);
  pushEntry(entries, "product_guide", settings.product_guide);

  return entries;
}

function pushEntry(
  entries: z.input<typeof settingEntrySchema>[],
  key: SettingKey,
  value: JsonValue | undefined,
) {
  if (value === undefined) {
    return;
  }

  entries.push({ key, value } as z.input<typeof settingEntrySchema>);
}

function buildSettingsResponse(entries: SettingDto[]) {
  const sanitizedEntries = entries.map((entry) => ({
    id: entry.id,
    key: entry.key,
    value: sanitizeJsonValue(entry.value),
    updatedAt: entry.updatedAt,
  }));
  const settings: JsonObject = {
    ...DEFAULT_SETTINGS,
  };

  for (const entry of sanitizedEntries) {
    settings[entry.key] = entry.value;
  }

  if (!settings.ui_preferences && settings.preferences) {
    settings.ui_preferences = settings.preferences;
  }

  if (!settings.preferences && settings.ui_preferences) {
    settings.preferences = settings.ui_preferences;
  }

  if (!settings.notification_preferences && settings.notifications) {
    settings.notification_preferences = notificationArrayToRecord(
      settings.notifications,
    );
  }

  if (!settings.notifications && settings.notification_preferences) {
    settings.notifications = notificationRecordToArray(
      settings.notification_preferences,
    );
  }

  return {
    settings,
    entries: sanitizedEntries,
    count: sanitizedEntries.length,
    updatedAt: latestUpdatedAt(sanitizedEntries),
    defaultsApplied: sanitizedEntries.length === 0,
  };
}

function latestUpdatedAt(entries: { updatedAt: string }[]): string | null {
  return (
    entries
      .map((entry) => entry.updatedAt)
      .sort((first, second) => second.localeCompare(first))[0] ?? null
  );
}

function notificationArrayToRecord(value: JsonValue): JsonObject {
  if (!Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    value
      .filter(isJsonObject)
      .map((item): [string, JsonValue | undefined] => [
        String(item.key ?? ""),
        item.enabled,
      ])
      .filter(
        ([key, enabled]) =>
          key.length > 0 && typeof enabled === "boolean",
      ),
  ) as JsonObject;
}

function notificationRecordToArray(value: JsonValue): JsonValue[] {
  if (!isJsonObject(value)) {
    return [];
  }

  return Object.entries(value)
    .filter(([, enabled]) => typeof enabled === "boolean")
    .map(([key, enabled]) => ({
      key,
      enabled,
    }));
}

function sanitizeJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sanitizeJsonValue);
  }

  if (!isJsonObject(value)) {
    return value;
  }

  const sanitized: JsonObject = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (SENSITIVE_SETTING_KEY_PATTERN.test(key)) {
      continue;
    }

    sanitized[key] = sanitizeJsonValue(nestedValue);
  }

  return sanitized;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return apiSuccess(buildSettingsResponse(listSettings()));
  } catch {
    return apiError(
      {
        code: "SETTINGS_READ_FAILED",
        message: "设置读取失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return apiError(
      {
        code: "INVALID_JSON",
        message: "请求体必须是合法 JSON。",
      },
      { status: 400 },
    );
  }

  const input = parseSettingsPayload(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_SETTINGS_INPUT",
        message: "设置格式不正确，请提交 settings 对象或 entries 数组。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const savedEntries = upsertSettings(sanitizeEntriesBeforeSave(input.data));

    return apiSuccess({
      saved: savedEntries.map((entry) => ({
        id: entry.id,
        key: entry.key,
        value: sanitizeJsonValue(entry.value),
        updatedAt: entry.updatedAt,
      })),
      ...buildSettingsResponse(listSettings()),
    });
  } catch {
    return apiError(
      {
        code: "SETTINGS_SAVE_FAILED",
        message: "设置保存失败，当前更改未保存，可稍后重试。",
      },
      { status: 500 },
    );
  }
}
