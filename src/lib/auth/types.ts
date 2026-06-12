import type { DateTimeString, JsonObject } from "../types";

export const AUTH_ROLES = ["owner"] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export const AUTH_EVENT_TYPES = [
  "owner_created",
  "login_succeeded",
  "login_failed",
  "logout",
  "session_created",
  "session_revoked",
  "password_changed",
] as const;

export type AuthEventType = (typeof AUTH_EVENT_TYPES)[number];

export type PasswordHashParams = {
  algorithm: "scrypt";
  keyLength: number;
  N: number;
  p: number;
  r: number;
  saltBytes: number;
};

export type PasswordHashResult = {
  passwordHash: string;
  passwordParamsJson: string;
  passwordSalt: string;
};

export type AuthOwnerCreateInput = {
  displayName?: string;
  email?: string;
  password: string;
  phone?: string;
};

export type AuthRegisterInput = AuthOwnerCreateInput & {
  confirmPassword: string;
};

export type AuthLoginInput = {
  identifier: string;
  password: string;
  remember?: boolean;
};

export type AuthChangePasswordInput = {
  confirmPassword: string;
  currentPassword: string;
  nextPassword: string;
};

export type AuthSessionCreateInput = {
  expiresAt?: DateTimeString;
  userAgent?: string | null;
  userId: number;
};

export type AuthEventCreateInput = {
  detail?: JsonObject;
  eventType: AuthEventType;
  userId?: number | null;
};

export type AuthUserRow = {
  created_at: DateTimeString;
  display_name: string;
  email: string | null;
  id: number;
  last_login_at: DateTimeString | null;
  password_hash: string;
  password_params_json: string;
  password_salt: string;
  phone: string | null;
  role: AuthRole | string;
  updated_at: DateTimeString;
};

export type AuthSessionRow = {
  created_at: DateTimeString;
  expires_at: DateTimeString;
  id: number;
  last_seen_at: DateTimeString;
  revoked_at: DateTimeString | null;
  token_hash: string;
  user_agent: string | null;
  user_id: number;
};

export type AuthEventRow = {
  created_at: DateTimeString;
  detail_json: string;
  event_type: AuthEventType | string;
  id: number;
  user_id: number | null;
};

export type AuthUserDto = {
  createdAt: DateTimeString;
  displayName: string;
  email: string | null;
  id: number;
  lastLoginAt: DateTimeString | null;
  phone: string | null;
  role: AuthRole;
  updatedAt: DateTimeString;
};

export type AuthUserPasswordRecord = AuthUserDto & {
  passwordHash: string;
  passwordParamsJson: string;
  passwordSalt: string;
};

export type AuthSessionDto = {
  createdAt: DateTimeString;
  expiresAt: DateTimeString;
  id: number;
  lastSeenAt: DateTimeString;
  revokedAt: DateTimeString | null;
  userAgent: string | null;
  userId: number;
};

export type AuthSessionCreatedDto = {
  session: AuthSessionDto;
  token: string;
};

export type AuthSessionValidationDto = {
  session: AuthSessionDto;
  user: AuthUserDto;
};

export type AuthEventDto = {
  createdAt: DateTimeString;
  detail: JsonObject;
  eventType: AuthEventType;
  id: number;
  userId: number | null;
};
