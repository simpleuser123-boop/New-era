import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { toSafeAuthUser } from "@/lib/auth/api";
import {
  AUTH_SESSION_COOKIE_NAME,
  createExpiredAuthSessionCookie,
} from "@/lib/auth/cookies";
import { validateAuthSession } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sessionExpiredError() {
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

export function GET(request: NextRequest) {
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
    return sessionExpiredError();
  }

  return apiSuccess({
    user: toSafeAuthUser(current.user),
  });
}
