/* eslint-disable @next/next/no-html-link-for-pages */
import { Bot, CalendarClock, Database, Users } from "lucide-react";
import { requireAccess } from "@/lib/access-control";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "../components/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const context = await requireAccess(["admin"]);
  const supabase = await createClient();
  const now = new Date(); const soon = new Date(now.getTime() + 14 * 86400000).toISOString(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const [active, expiring, mealsToday, invitations, recentClients] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "client").eq("account_status", "active"),
    supabase.from("programmes").select("id", { count: "exact", head: true }).eq("status", "active").lte("expires_at", soon).gte("expires_at", now.toISOString()),
    supabase.from("meal_entries").select("id", { count: "exact", head: true }).gte("created_at", today),
    supabase.from("invitations").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("profiles").select("id,full_name,email,account_status,last_login_at").eq("role", "client").order("created_at", { ascending: false }).limit(6),
  ]);
  return <AdminShell active="overview"><header className="page-header"><div><p className="section-kicker">Programme operations</p><h1>Good afternoon, {context.profile.full_name ?? "Dr. Ashu"}.</h1><span>A private overview of client access and programme activity.</span></div><a className="button button-primary" href="/admin/clients/new">Invite a client</a></header><section className="admin-metrics"><AdminMetric label="Active clients" value={String(active.count ?? 0)} note="Current access" icon={<Users />} /><AdminMetric label="Expiring soon" value={String(expiring.count ?? 0)} note="Next 14 days" icon={<CalendarClock />} /><AdminMetric label="Meals today" value={String(mealsToday.count ?? 0)} note="Across active clients" icon={<Bot />} /><AdminMetric label="Pending invitations" value={String(invitations.count ?? 0)} note="Awaiting acceptance" icon={<Database />} /></section><div className="admin-grid"><section className="content-card admin-clients"><div className="card-heading"><div><p className="section-kicker">Clients</p><h2>Recently added</h2></div><a href="/admin/clients">View all</a></div>{recentClients.data?.length ? recentClients.data.map((client) => <a className="admin-client-row" key={client.id} href={`/admin/clients/${client.id}`}><span>{initials(client.full_name ?? client.email)}</span><div><strong>{client.full_name ?? "Invited client"}</strong><small>{client.email}</small></div><i>{client.account_status}</i></a>) : <div className="admin-empty"><Users /><h3>No clients yet</h3><p>Invite your first paid client to begin.</p></div>}</section><section className="content-card admin-alerts"><div className="card-heading"><div><p className="section-kicker">Access health</p><h2>What needs attention</h2></div></div><div><HealthLine title="Pending invitations" detail={`${invitations.count ?? 0} waiting for acceptance`} /><HealthLine title="Programme renewals" detail={`${expiring.count ?? 0} expire in the next 14 days`} /><HealthLine title="Authentication" detail="Email OTP and secure-link access" good /></div></section></div></AdminShell>;
}
function AdminMetric({ label, value, note, icon }: { label: string; value: string; note: string; icon: React.ReactNode }) { return <article className="content-card"><div>{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function HealthLine({ title, detail, good = false }: { title: string; detail: string; good?: boolean }) { return <article><span className={good ? "good" : "attention"}><Database /></span><div><strong>{title}</strong><small>{detail}</small></div><i>{good ? "Healthy" : "Review"}</i></article>; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
