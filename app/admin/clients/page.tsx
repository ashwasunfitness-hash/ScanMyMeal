/* eslint-disable @next/next/no-html-link-for-pages */
import { Search, UserPlus } from "lucide-react";
import { requireAccess } from "@/lib/access-control";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "../../components/AdminShell";

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAccess(["admin"]); const params = await searchParams; const supabase = await createClient();
  let query = supabase.from("profiles").select("id,full_name,email,phone,account_status,last_login_at,created_at").eq("role", "client").order("created_at", { ascending: false }).range(0, 24);
  if (params.q) query = query.or(`full_name.ilike.%${safeSearch(params.q)}%,email.ilike.%${safeSearch(params.q)}%`);
  if (params.status) query = query.eq("account_status", params.status as never);
  const { data: clients } = await query;
  const ids = clients?.map((client) => client.id) ?? [];
  const { data: programmes } = ids.length ? await supabase.from("programmes").select("*").in("client_id", ids).order("created_at", { ascending: false }) : { data: [] };
  return <AdminShell active="clients"><header className="page-header"><div><p className="section-kicker">Client management</p><h1>Clients</h1><span>Access, programme dates and coaching assignments.</span></div><a className="button button-primary" href="/admin/clients/new"><UserPlus /> Invite client</a></header><form className="admin-filters"><label><Search /><input name="q" placeholder="Search name or email" defaultValue={params.q} /></label><select name="status" defaultValue={params.status ?? ""}><option value="">All account statuses</option><option value="invited">Invited</option><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="expired">Expired</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select><button className="button button-quiet">Apply filters</button></form><section className="admin-table-card"><div className="admin-table-head"><span>Client</span><span>Programme</span><span>Goal</span><span>Expires</span><span>Status</span><span>Last login</span></div>{clients?.length ? clients.map((client) => { const programme = programmes?.find((item) => item.client_id === client.id); return <a className="admin-table-row" href={`/admin/clients/${client.id}`} key={client.id}><span><strong>{client.full_name ?? "Invited client"}</strong><small>{client.email}</small></span><span>{programme?.programme_name ?? "Not assigned"}</span><span>{programme?.primary_goal ?? "—"}</span><span>{formatDate(programme?.expires_at)}</span><span><i className={`status-${client.account_status}`}>{client.account_status}</i></span><span>{formatDate(client.last_login_at)}</span></a>; }) : <div className="admin-empty"><Search /><h3>No matching clients</h3><p>Try a different search or invite a new client.</p></div>}</section></AdminShell>;
}
function safeSearch(value: string) { return value.replace(/[%_,()]/g, "").slice(0, 80); }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "—"; }
