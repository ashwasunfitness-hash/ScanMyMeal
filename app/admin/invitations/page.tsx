/* eslint-disable @next/next/no-html-link-for-pages */
import { MailPlus } from "lucide-react";
import { requireAccess } from "@/lib/access-control";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "../../components/AdminShell";
import { InvitationActions } from "../../components/InvitationActions";

export const dynamic = "force-dynamic";
export default async function InvitationsPage() { await requireAccess(["admin"]); const supabase = await createClient(); const { data: invitations } = await supabase.from("invitations").select("*").order("created_at", { ascending: false }).limit(100); return <AdminShell active="invitations"><header className="page-header"><div><p className="section-kicker">Access invitations</p><h1>Invitations</h1><span>Single-use, time-limited entry for paid clients.</span></div><a className="button button-primary" href="/admin/clients/new"><MailPlus /> New invitation</a></header><section className="admin-table-card invitations-table"><div className="admin-table-head"><span>Client</span><span>Programme</span><span>Sent</span><span>Expires</span><span>Status</span><span>Actions</span></div>{invitations?.map((invite) => <div className="admin-table-row" key={invite.id}><span><strong>{invite.full_name ?? "Invited client"}</strong><small>{invite.email}</small></span><span>{invite.programme_name ?? "—"}</span><span>{formatDate(invite.sent_at)}</span><span>{formatDate(invite.expires_at)}</span><span><i className={`status-${invite.status}`}>{invite.status}</i></span><InvitationActions id={invite.id} status={invite.status} /></div>)}</section></AdminShell>; }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "Not sent"; }
