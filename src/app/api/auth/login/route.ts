import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { toSafeAuthUser, zodErrorDetails } from "@/lib/auth/api";
import { createAuthSessionCookie } from "@/lib/auth/cookies";
import { verifyPassword } from "@/lib/auth/password";
import { authLoginInputSchema } from "@/lib/schemas";
import {
  createAuthSession,
  getOwnerUserPasswordRecord,
  validateAuthSession,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUTH_USER_AGENT_LENGTH = 500;

function invalidCredentialsError() {
  return apiError(
    {
      code: "INVALID_CREDENTIALS",
      message: "邮箱、手机号或密码不正确。",
    },
    { status: 401 },
  );
}

function getUserAgent(request: NextRequest) {
  return request.headers.get("user-agent")?.slice(0, MAX_AUTH_USER_AGENT_LENGTH) ?? null;
}

export async function POST(request: NextRequest) {
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

  const input = authLoginInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_AUTH_LOGIN_INPUT",
        message: "登录信息不正确，请填写有效账号和密码。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const owner = getOwnerUserPasswordRecord(input.data.identifier);

    if (!owner) {
      return invalidCredentialsError();
    }

    const passwordMatches = verifyPassword(
      input.data.password,
      owner.passwordHash,
      owner.passwordSalt,
      owner.passwordParamsJson,
    );

    if (!passwordMatches) {
      return invalidCredentialsError();
    }

    const createdSession = createAuthSession({
      userAgent: getUserAgent(request),
      userId: owner.id,
    });
    const current = validateAuthSession(createdSession.token);
    const response = apiSuccess({
      user: toSafeAuthUser(current?.user ?? owner),
    });
    const cookie = createAuthSessionCookie(
      createdSession.token,
      createdSession.session.expiresAt,
    );

    response.cookies.set(cookie.name, cookie.value, cookie.options);

    return response;
  } catch {
    return apiError(
      {
        code: "AUTH_LOGIN_FAILED",
        message: "登录失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
