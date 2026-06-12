import { AUTH_SESSION_TTL_SECONDS } from "./session";

export const AUTH_SESSION_COOKIE_NAME = "new_era_session";

export type AuthCookieOptions = {
  expires?: Date;
  httpOnly: true;
  maxAge: number;
  path: "/";
  sameSite: "lax";
  secure: boolean;
};

export type AuthCookiePayload = {
  name: typeof AUTH_SESSION_COOKIE_NAME;
  options: AuthCookieOptions;
  value: string;
};

export function getAuthSessionCookieOptions(
  expiresAt?: string | Date,
  maxAge = AUTH_SESSION_TTL_SECONDS,
): AuthCookieOptions {
  const expires =
    expiresAt === undefined
      ? undefined
      : expiresAt instanceof Date
        ? expiresAt
        : new Date(expiresAt);

  return {
    ...(expires === undefined ? {} : { expires }),
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  };
}

export function createAuthSessionCookie(
  token: string,
  expiresAt: string | Date,
): AuthCookiePayload {
  return {
    name: AUTH_SESSION_COOKIE_NAME,
    options: getAuthSessionCookieOptions(expiresAt),
    value: token,
  };
}

export function createExpiredAuthSessionCookie(): AuthCookiePayload {
  return {
    name: AUTH_SESSION_COOKIE_NAME,
    options: getAuthSessionCookieOptions(new Date(0), 0),
    value: "",
  };
}
