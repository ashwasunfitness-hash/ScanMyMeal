import { CalendarDays, Mail, ShieldCheck } from "lucide-react";
import { ClientPageHeader } from "@/app/components/client/ClientPage";
import { requireActiveClient } from "@/lib/access-control";

export const dynamic = "force-dynamic";
export default async function ClientProfilePage() {
  const context = await requireActiveClient();
  const name = context.profile.full_name ?? "Client";
  return <><ClientPageHeader eyebrow="Profile" title={name} description="Your verified account and current programme access." /><section className="client-profile-panel"><div className="client-profile-identity"><span>{initials(name)}</span><div><h2>{name}</h2><p>Private client account</p></div><i>{context.profile.account_status}</i></div><div className="client-profile-rows"><div><Mail aria-hidden="true" /><span><small>Email</small><strong>{context.profile.email}</strong></span></div><div><ShieldCheck aria-hidden="true" /><span><small>Programme</small><strong>{context.programme?.programme_name ?? "Not assigned"}</strong></span></div><div><CalendarDays aria-hidden="true" /><span><small>Access</small><strong>{context.programme?.expires_at ? `Until ${formatDate(context.programme.expires_at)}` : "Active"}</strong></span></div></div></section></>;
}
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SM"; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(new Date(value)); }
