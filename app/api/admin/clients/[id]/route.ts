import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ clientId: z.string().optional(), account_status: z.enum(["invited","onboarding","active","expired","suspended","archived"]), programme_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null), programme_status: z.enum(["scheduled","active","expired","paused","cancelled"]).optional(), starts_at: z.string().date().optional().or(z.literal("")), expires_at: z.string().date().optional().or(z.literal("")), assigned_coach_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireApiRole(["admin"]); if (!actor) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const { id } = await params; if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid client." }, { status: 400 });
  const input = schema.safeParse(await request.json().catch(() => null)); if (!input.success) return NextResponse.json({ error: "Review the access settings." }, { status: 400 });
  if (input.data.starts_at && input.data.expires_at && new Date(input.data.expires_at) <= new Date(input.data.starts_at)) return NextResponse.json({ error: "Expiry must be after the programme start." }, { status: 400 });
  const admin = createAdminClient(); const now = new Date().toISOString();
  const { data: target } = await admin.from("profiles").select("id,role,account_status").eq("id", id).eq("role", "client").maybeSingle();
  if (!target) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  await admin.from("profiles").update({ account_status: input.data.account_status, updated_at: now }).eq("id", id);
  if (input.data.programme_id) {
    await admin.from("programmes").update({ status: input.data.programme_status, starts_at: input.data.starts_at ? new Date(input.data.starts_at).toISOString() : undefined, expires_at: input.data.expires_at ? new Date(input.data.expires_at).toISOString() : undefined, assigned_coach_id: input.data.assigned_coach_id, updated_at: now }).eq("id", input.data.programme_id).eq("client_id", id);
    await admin.from("coach_assignments").update({ is_active: false, ends_at: now }).eq("client_id", id).eq("is_active", true);
    if (input.data.assigned_coach_id) await admin.from("coach_assignments").insert({ coach_id: input.data.assigned_coach_id, client_id: id, starts_at: now, ends_at: null, is_active: true, assigned_by: actor.userId, created_at: now });
  }
  await admin.from("audit_logs").insert({ actor_user_id: actor.userId, action: "client.access_updated", target_type: "profile", target_id: id, metadata: { account_status: input.data.account_status, programme_status: input.data.programme_status ?? null }, created_at: now });
  return NextResponse.json({ updated: true });
}
