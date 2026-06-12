import type { Metadata } from "next";

import { CareerProfilePage } from "@/components/features/career/CareerProfilePage";
import { requireProductPageAccess } from "@/lib/auth/page-access";

export const metadata: Metadata = {
  title: "Career DNA 求职画像 | New Era",
};

export default async function CareerRoute() {
  await requireProductPageAccess("/career");

  return <CareerProfilePage />;
}
