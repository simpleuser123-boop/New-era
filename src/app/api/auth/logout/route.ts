import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import {
  AUTH_SESSION_COOKIE_NAME,
  createExpiredAuthSessionCookie,
} from "@/lib/auth/cookies";
import { revokeAuthSession, validateAuthSession } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function setExpiredAuthCookie(response: NextResponse) {
  const cookie = createExpiredAuthSessionCookie();

  response.cookies.set(cookie.name, cookie.value, cookie.options);

  return response;
}

export function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return apiError(
      {
        code: "UNAUTHENTICATED",
        message: "请先登录。",
      },
      { status: 401 },
    );
  }

  const current = validateAuthSession(token);

  if (!current) {
    return setExpiredAuthCookie(
      apiError(
        {
          code: "SESSION_EXPIRED",
          message: "登录状态已过期，请重新登录。",
        },
        { status: 401 },
      ),
    );
  }

  try {
    revokeAuthSession(token);

    return setExpiredAuthCookie(
      apiSuccess({
        loggedOut: true,
      }),
    );
  } catch {
    return apiError(
      {
        code: "AUTH_LOGOUT_FAILED",
        message: "退出登录失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
