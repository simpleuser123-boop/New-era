import { redirect } from "next/navigation";

import { getCurrentUser } from "./current-user";

export const AUTH_PAGE_PATH = "/auth";
export const DEFAULT_AUTHENTICATED_PATH = "/";

type PageSearchParams = Record<string, string | string[] | undefined>;

export function buildProtectedNextPath(
  pathname: string,
  searchParams?: PageSearchParams,
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
      continue;
    }

    if (value !== undefined) {
      query.set(key, value);
    }
  }

  const queryString = query.toString();

  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function resolveSafeNextPath(value: string | string[] | undefined) {
  const rawNext = Array.isArray(value) ? value[0] : value;

  if (!rawNext || !rawNext.startsWith("/") || rawNext.startsWith("//")) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(rawNext, "http://new-era.local");
  } catch {
    return null;
  }

  if (
    parsed.origin !== "http://new-era.local" ||
    parsed.pathname === AUTH_PAGE_PATH ||
    parsed.pathname.startsWith("/api/") ||
    parsed.pathname.startsWith("/_next/")
  ) {
    return null;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function buildAuthRedirectPath(nextPath: string) {
  const safeNextPath = resolveSafeNextPath(nextPath) ?? DEFAULT_AUTHENTICATED_PATH;
  const encodedNextPath = encodeURIComponent(safeNextPath).replaceAll(
    "%2F",
    "/",
  );

  return `${AUTH_PAGE_PATH}?next=${encodedNextPath}`;
}

export async function requireProductPageAccess(nextPath: string) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect(buildAuthRedirectPath(nextPath));
  }
}

export async function redirectAuthenticatedUserFromAuth(
  next?: string | string[],
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  redirect(resolveSafeNextPath(next) ?? DEFAULT_AUTHENTICATED_PATH);
}
