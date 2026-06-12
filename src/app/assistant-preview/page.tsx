import { notFound } from "next/navigation";

import { AssistantPage } from "@/components/features/assistant/AssistantPage";

export default function AssistantPreviewRoute() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <AssistantPage />;
}
