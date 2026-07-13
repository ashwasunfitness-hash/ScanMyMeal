import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";

const schema = z.object({
  full_name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email().max(254), phone: z.string().trim().max(30).optional().transform((v) => v || null),
  programme_name: z.string().min(2).max(120), primary_goal: z.string().min(2).max(120), programme_starts_at: z.string().date(), programme_expires_at: z.string().date(),
  assigned_coach_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null), send: z.boolean(),
}).refine((data) => new Date(data.programme_expires_at) > new Date(data.programme_starts_at), { message: "Expiry must be after the start date." });

export async function POST(request: Request) {
  const actor = await requireApiRole(["admin"]);
  if (!actor) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message || "Review the client details." }, { status: 400 });
  const admin = createAdminClient(); const now = new Date().toISOString();
  const { data: invitation, error: invitationError } = await admin.from("invitations").insert({
    email: input.data.email, full_name: input.data.full_name, phone: input.data.phone, intended_role: "client", programme_name: input.data.programme_name,
    primary_goal: input.data.primary_goal, programme_starts_at: new Date(input.data.programme_starts_at).toISOString(), programme_expires_at: new Date(input.data.programme_expires_at).toISOString(),
    assigned_coach_id: input.data.assigned_coach_id, status: "pending", invited_by: actor.userId, sent_at: null, accepted_at: null,
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), created_at: now, updated_at: now,
  }).select("*").single();
  if (invitationError || !invitation) return NextResponse.json({ error: invitationError?.code === "23505" ? "A pending invitation already exists for this email." : "The invitation could not be saved." }, { status: 409 });

  if (input.data.send) {
    const config = serverEnv();
    const { data: authData, error: authError } = await admin.auth.admin.inviteUserByEmail(input.data.email, { data: { full_name: input.data.full_name, intended_role: "client", invitation_id: invitation.id }, redirectTo: `${config.SUPABASE_AUTH_REDIRECT_URL}?next=${encodeURIComponent(`/invite/accept?id=${invitation.id}`)}` });
    if (authError || !authData.user) { await admin.from("invitations").update({ status: "cancelled", updated_at: now }).eq("id", invitation.id); return NextResponse.json({ error: "The invitation was saved, but the email could not be sent. Check email configuration before retrying." }, { status: 502 }); }
    await admin.from("profiles").upsert({ id: authData.user.id, email: input.data.email, full_name: input.data.full_name, phone: input.data.phone, avatar_path: null, role: "client", account_status: "invited", onboarding_step: 1, onboarding_completed_at: null, last_login_at: null, created_at: now, updated_at: now });
    await admin.from("invitations").update({ sent_at: now, updated_at: now }).eq("id", invitation.id);
  }
  await admin.from("audit_logs").insert({ actor_user_id: actor.userId, action: input.data.send ? "invitation.sent" : "invitation.created", target_type: "invitation", target_id: invitation.id, metadata: { intended_role: "client" }, created_at: now });
  return NextResponse.json({ id: invitation.id, sent: input.data.send }, { status: 201 });
}
