import { createHash, randomBytes } from "node:crypto";

export const AUTH_SESSION_TOKEN_BYTES = 32;
export const AUTH_SESSION_TTL_DAYS = 7;
export const AUTH_SESSION_TTL_SECONDS = AUTH_SESSION_TTL_DAYS * 24 * 60 * 60;

const AUTH_SESSION_TTL_MS = AUTH_SESSION_TTL_SECONDS * 1000;

export function generateSessionToken(): string {
  return randomBytes(AUTH_SESSION_TOKEN_BYTES).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + AUTH_SESSION_TTL_MS).toISOString();
}
