import type { ReactNode } from "react";
import { requireActiveClient } from "@/lib/access-control";
import { ClientShell } from "@/app/components/client/ClientShell";

export const dynamic = "force-dynamic";
export default async function ClientLayout({ children }: { children: ReactNode }) {
  const context = await requireActiveClient();
  return <ClientShell displayName={context.profile.full_name ?? context.profile.email.split("@")[0]} programmeName={context.programme?.programme_name ?? "Coaching programme"} programmeExpiresAt={context.programme?.expires_at ?? null}>{children}</ClientShell>;
}
