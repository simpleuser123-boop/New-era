import { cookies } from "next/headers";

import { validateAuthSession } from "../server-db";
import { AUTH_SESSION_COOKIE_NAME } from "./cookies";
import type { AuthSessionValidationDto } from "./types";

export class AuthRequiredError extends Error {
  constructor() {
    super("Auth is required.");
    this.name = "AuthRequiredError";
  }
}

export async function getCurrentUser(): Promise<AuthSessionValidationDto | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value;

  return token ? validateAuthSession(token) : null;
}

export async function requireCurrentUser(): Promise<AuthSessionValidationDto> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    throw new AuthRequiredError();
  }

  return currentUser;
}
