import { DashboardApp } from "@/app/components/DashboardApp";
import { requireActiveClient } from "@/lib/access-control";

export const dynamic = "force-dynamic";
export default async function ClientDashboardPage() {
  const context = await requireActiveClient();
  return <DashboardApp displayName={context.profile.full_name ?? context.profile.email.split("@")[0]} programmeName={context.programme?.programme_name ?? "Coaching programme"} programmeExpiresAt={context.programme?.expires_at ?? null} />;
}
