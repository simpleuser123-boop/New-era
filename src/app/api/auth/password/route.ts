import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import {
  requireApiAuth,
  toSafeAuthUser,
  zodErrorDetails,
} from "@/lib/auth/api";
import { verifyPassword } from "@/lib/auth/password";
import { authChangePasswordInputSchema } from "@/lib/schemas";
import {
  getAuthUserPasswordRecordById,
  updateAuthUserPassword,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
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

  const input = authChangePasswordInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_AUTH_PASSWORD_INPUT",
        message: "修改密码信息不正确，请检查当前密码、新密码和确认密码。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const userPassword = getAuthUserPasswordRecordById(auth.currentUser.user.id);

    if (!userPassword) {
      return apiError(
        {
          code: "AUTH_USER_NOT_FOUND",
          message: "当前账号不存在，请重新登录。",
        },
        { status: 401 },
      );
    }

    const passwordMatches = verifyPassword(
      input.data.currentPassword,
      userPassword.passwordHash,
      userPassword.passwordSalt,
      userPassword.passwordParamsJson,
    );

    if (!passwordMatches) {
      return apiError(
        {
          code: "CURRENT_PASSWORD_INCORRECT",
          message: "当前密码不正确，请重新输入。",
        },
        { status: 403 },
      );
    }

    const result = updateAuthUserPassword({
      currentSessionId: auth.currentUser.session.id,
      nextPassword: input.data.nextPassword,
      userId: auth.currentUser.user.id,
    });

    return apiSuccess({
      passwordChanged: true,
      revokedSessions: result.revokedSessions,
      sessionStrategy: "current_session_kept_other_sessions_revoked",
      user: toSafeAuthUser(result.user),
    });
  } catch {
    return apiError(
      {
        code: "AUTH_PASSWORD_CHANGE_FAILED",
        message: "修改密码失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
