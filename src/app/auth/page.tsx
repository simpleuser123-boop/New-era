import type { Metadata } from "next";
import { AuthCard } from "@/components/features/AuthCard";
import {
  DEFAULT_AUTHENTICATED_PATH,
  redirectAuthenticatedUserFromAuth,
  resolveSafeNextPath,
} from "@/lib/auth/page-access";
import { getOwnerUser } from "@/lib/server-db";

export const metadata: Metadata = {
  title: "登录与注册 | New Era",
  description: "New Era AI 求职助手登录与注册界面",
};

type AuthPageProps = {
  searchParams?: Promise<{
    next?: string | string[];
  }>;
};

export default async function AuthPage({ searchParams }: AuthPageProps) {
  const params = searchParams ? await searchParams : {};
  await redirectAuthenticatedUserFromAuth(params.next);
  const nextPath = resolveSafeNextPath(params.next) ?? DEFAULT_AUTHENTICATED_PATH;
  const hasOwner = getOwnerUser() !== null;

  return <AuthCard hasOwner={hasOwner} nextPath={nextPath} />;
}
