import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { getAccessContext } from "@/lib/access-control";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthShell } from "../../components/AuthShell";

export const dynamic = "force-dynamic";
export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams; const context = await getAccessContext();
  if (!context) redirect(`/sign-in?next=${encodeURIComponent(id ? `/invite/accept?id=${id}` : "/invite/accept")}`);
  if (!id) return <AuthShell eyebrow="Invitation"><section className="auth-card"><div className="form-error">This invitation link is incomplete. Contact the ABC of D® team for a fresh invitation.</div></section></AuthShell>;
  const admin = createAdminClient(); const { data: invitation } = await admin.from("invitations").select("*").eq("id", id).eq("email", context.email.toLowerCase()).maybeSingle();
  if (!invitation || invitation.status !== "pending" || new Date(invitation.expires_at) <= new Date()) return <AuthShell eyebrow="Invitation"><section className="auth-card"><div className="auth-icon"><MailCheck /></div><h2>Invitation unavailable</h2><p>This invitation has expired, was cancelled or has already been used. Contact the ABC of D® team for help.</p><a className="button button-primary full-button" href="/contact-support">Contact support</a></section></AuthShell>;
  return <AuthShell eyebrow="Your invitation"><section className="auth-card"><div className="auth-icon"><MailCheck /></div><p className="section-kicker">Scan My Meal</p><h2>Welcome, {invitation.full_name?.split(" ")[0] ?? "there"}</h2><p>Your private access to <strong>{invitation.programme_name ?? "Dr. Ashu’s coaching programme"}</strong> is ready.</p><div className="invite-summary"><span>Primary goal<strong>{invitation.primary_goal ?? "To be confirmed"}</strong></span><span>Programme dates<strong>{formatDate(invitation.programme_starts_at)} – {formatDate(invitation.programme_expires_at)}</strong></span></div><form action={`/api/invitations/${id}/accept`} method="post"><button className="button button-primary full-button">Accept invitation &amp; begin</button></form></section></AuthShell>;
}
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "To be confirmed"; }
