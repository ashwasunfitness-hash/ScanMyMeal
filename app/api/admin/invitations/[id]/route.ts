import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";

const schema = z.object({ action: z.enum(["resend", "cancel"]) });
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireApiRole(["admin"]); if (!actor) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const { id } = await params; if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid invitation." }, { status: 400 });
  const input = schema.safeParse(await request.json().catch(() => null)); if (!input.success) return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  const admin = createAdminClient(); const { data: invitation } = await admin.from("invitations").select("*").eq("id", id).maybeSingle();
  if (!invitation || invitation.status !== "pending") return NextResponse.json({ error: "This invitation is no longer pending." }, { status: 409 });
  const now = new Date().toISOString();
  if (input.data.action === "cancel") await admin.from("invitations").update({ status: "cancelled", updated_at: now }).eq("id", id);
  else {
    const config = serverEnv(); const authClient = createAdminClient();
    const { error } = await authClient.auth.signInWithOtp({ email: invitation.email, options: { shouldCreateUser: false, emailRedirectTo: `${config.SUPABASE_AUTH_REDIRECT_URL}?next=${encodeURIComponent(`/invite/accept?id=${id}`)}` } });
    if (error) return NextResponse.json({ error: "The email could not be resent. Check SMTP and Auth settings." }, { status: 502 });
    await admin.from("invitations").update({ sent_at: now, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), updated_at: now }).eq("id", id);
  }
  await admin.from("audit_logs").insert({ actor_user_id: actor.userId, action: `invitation.${input.data.action}`, target_type: "invitation", target_id: id, metadata: {}, created_at: now });
  return NextResponse.json({ updated: true });
}
