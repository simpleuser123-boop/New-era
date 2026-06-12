import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { toSafeAuthUser, zodErrorDetails } from "@/lib/auth/api";
import { authRegisterInputSchema } from "@/lib/schemas";
import {
  createOwnerUser,
  OwnerUserAlreadyExistsError,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const input = authRegisterInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_AUTH_REGISTER_INPUT",
        message: "注册信息不正确，请检查邮箱、手机号、显示名和两次输入的密码。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const user = createOwnerUser({
      displayName: input.data.displayName,
      email: input.data.email,
      password: input.data.password,
      phone: input.data.phone,
    });

    return apiSuccess(
      {
        user: toSafeAuthUser(user),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof OwnerUserAlreadyExistsError) {
      return apiError(
        {
          code: "OWNER_ALREADY_EXISTS",
          message: "本机 owner 账号已存在，不能重复注册。",
        },
        { status: 409 },
      );
    }

    return apiError(
      {
        code: "AUTH_REGISTER_FAILED",
        message: "注册失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
