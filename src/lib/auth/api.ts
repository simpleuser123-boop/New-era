import type { NextResponse } from "next/server";
import type { ZodError } from "zod";

import { apiError } from "../api-response";
import { validateAuthSession } from "../server-db";
import {
  AUTH_SESSION_COOKIE_NAME,
  createExpiredAuthSessionCookie,
} from "./cookies";
import type { AuthSessionValidationDto, AuthUserDto } from "./types";

export type ApiAuthResult =
  | {
      currentUser: AuthSessionValidationDto;
      ok: true;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export type SafeAuthUserDto = Pick<
  AuthUserDto,
  | "createdAt"
  | "displayName"
  | "email"
  | "id"
  | "lastLoginAt"
  | "phone"
  | "role"
>;

export function toSafeAuthUser(user: AuthUserDto): SafeAuthUserDto {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

function getSessionTokenFromRequest(request: Request): string | null {
  const requestWithCookies = request as Request & {
    cookies?: {
      get(name: string): { value?: string } | undefined;
    };
  };
  const nextCookieToken = requestWithCookies.cookies?.get(
    AUTH_SESSION_COOKIE_NAME,
  )?.value;

  if (nextCookieToken) {
    return nextCookieToken;
  }

  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = cookie.split("=");
    const name = rawName?.trim();

    if (name !== AUTH_SESSION_COOKIE_NAME) {
      continue;
    }

    const rawValue = rawValueParts.join("=").trim();

    if (!rawValue) {
      return null;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

function unauthenticatedResponse(): NextResponse {
  return apiError(
    {
      code: "UNAUTHENTICATED",
      message: "请先登录。",
    },
    { status: 401 },
  );
}

function expiredSessionResponse(): NextResponse {
  const response = apiError(
    {
      code: "SESSION_EXPIRED",
      message: "登录状态已过期，请重新登录。",
    },
    { status: 401 },
  );
  const cookie = createExpiredAuthSessionCookie();

  response.cookies.set(cookie.name, cookie.value, cookie.options);

  return response;
}

export function requireApiAuth(request: Request): ApiAuthResult {
  const token = getSessionTokenFromRequest(request);

  if (!token) {
    return {
      ok: false,
      response: unauthenticatedResponse(),
    };
  }

  const currentUser = validateAuthSession(token);

  if (!currentUser) {
    return {
      ok: false,
      response: expiredSessionResponse(),
    };
  }

  return {
    currentUser,
    ok: true,
  };
}

export function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
