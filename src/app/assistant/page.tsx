import type { Metadata } from "next";

import { AssistantPage } from "@/components/features/assistant/AssistantPage";
import { requireProductPageAccess } from "@/lib/auth/page-access";

export const metadata: Metadata = {
  title: "AI 助手 | New Era",
};

export default async function AssistantRoute() {
  await requireProductPageAccess("/assistant");

  return <AssistantPage />;
}
