import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccessContext } from "@/lib/access-control";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAccessContext(); if (!context) return NextResponse.redirect(new URL("/sign-in", request.url), { status: 303 });
  const { id } = await params; if (!z.string().uuid().safeParse(id).success) return NextResponse.redirect(new URL("/contact-support", request.url), { status: 303 });
  const admin = createAdminClient(); const { data: invite } = await admin.from("invitations").select("*").eq("id", id).eq("email", context.email.toLowerCase()).maybeSingle();
  if (!invite || invite.status !== "pending" || new Date(invite.expires_at) <= new Date()) return NextResponse.redirect(new URL("/contact-support?reason=invitation", request.url), { status: 303 });
  const now = new Date().toISOString();
  await admin.from("invitations").update({ status: "accepted", accepted_at: now, updated_at: now }).eq("id", id).eq("status", "pending");
  await admin.from("profiles").update({ full_name: invite.full_name, phone: invite.phone, role: invite.intended_role, account_status: "onboarding", onboarding_step: 1, updated_at: now }).eq("id", context.userId);
  if (invite.intended_role === "client" && invite.programme_name && invite.programme_starts_at && invite.programme_expires_at) {
    const status = new Date(invite.programme_starts_at) > new Date() ? "scheduled" : "active";
    const { data: programme } = await admin.from("programmes").insert({ client_id: context.userId, programme_name: invite.programme_name, primary_goal: invite.primary_goal, starts_at: invite.programme_starts_at, expires_at: invite.programme_expires_at, status, assigned_coach_id: invite.assigned_coach_id, created_by: invite.invited_by, created_at: now, updated_at: now }).select("id").single();
    if (invite.assigned_coach_id) await admin.from("coach_assignments").insert({ coach_id: invite.assigned_coach_id, client_id: context.userId, starts_at: now, ends_at: null, is_active: true, assigned_by: invite.invited_by, created_at: now });
    if (programme) await admin.from("audit_logs").insert({ actor_user_id: context.userId, action: "invitation.accepted", target_type: "programme", target_id: programme.id, metadata: { invitation_id: id }, created_at: now });
  }
  return NextResponse.redirect(new URL(invite.intended_role === "client" ? "/onboarding" : invite.intended_role === "coach" ? "/coach" : "/admin", request.url), { status: 303 });
}
