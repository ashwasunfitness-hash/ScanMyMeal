import { requireAccess } from "@/lib/access-control";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/app/components/Logo";

export const dynamic = "force-dynamic";
export default async function CoachPage() {
  const context = await requireAccess(["coach"]);
  const supabase = await createClient();
  const { data: assignments } = await supabase.from("coach_assignments").select("client_id").eq("coach_id", context.userId).eq("is_active", true);
  const ids = assignments?.map((item) => item.client_id) ?? [];
  const { data: clients } = ids.length ? await supabase.from("profiles").select("id, full_name, email, account_status").in("id", ids) : { data: [] };
  return <main className="expired-shell"><Logo /><p className="section-kicker">Coach workspace</p><h1>Your assigned clients</h1><p>Only clients currently assigned to you appear here.</p><div className="invite-summary">{clients?.length ? clients.map((client) => <span key={client.id}>{client.full_name ?? client.email}<strong>{client.account_status}</strong></span>) : <span>No active assignments<strong>Ask an administrator to assign a client.</strong></span>}</div><form action="/api/auth/sign-out" method="post"><button className="button button-quiet">Sign out</button></form></main>;
}
