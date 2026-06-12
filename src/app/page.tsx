import { HomeDashboard } from "@/components/features/HomeDashboard";
import { requireProductPageAccess } from "@/lib/auth/page-access";

export default async function Home() {
  await requireProductPageAccess("/");

  return <HomeDashboard />;
}
