import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/access-control";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const draftSchema = z.object({ step: z.number().int().min(1).max(7), payload: z.record(z.string(), z.unknown()) });
const completionSchema = z.object({ payload: z.object({
  full_name: z.string().trim().min(2).max(120), date_of_birth: z.string().date(), gender: z.string().max(80).optional(),
  height_cm: z.coerce.number().min(50).max(260), current_weight_kg: z.coerce.number().min(15).max(500), location: z.string().trim().min(2).max(120),
  preferred_units: z.enum(["metric", "imperial"]).default("metric"), primary_goal: z.string().max(120).optional(), activity_level: z.string().max(80).optional(),
  workout_frequency: z.string().max(80).optional(), typical_meal_schedule: z.string().max(300).optional(), dietary_pattern: z.string().max(120).optional(),
  preferred_cuisines: z.array(z.string().max(80)).max(20).default([]), allergies: z.array(z.string().max(80)).max(30).default([]), foods_avoided: z.array(z.string().max(80)).max(30).default([]),
  privacy_consent: z.literal(true), photo_consent: z.literal(true), nutrition_consent: z.literal(true), ai_consent: z.literal(true),
}).passthrough() });

export async function PUT(request: Request) {
  const context = await requireAccess(["client"]);
  if (!["invited", "onboarding"].includes(context.profile.account_status) && context.profile.onboarding_completed_at) return NextResponse.json({ error: "Onboarding is already complete." }, { status: 409 });
  const input = draftSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Review this step and try again." }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("onboarding_drafts").upsert({ user_id: context.userId, step: input.data.step, payload: input.data.payload as Json, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: "Your progress could not be saved." }, { status: 500 });
  await supabase.from("profiles").update({ onboarding_step: input.data.step }).eq("id", context.userId);
  return NextResponse.json({ saved: true });
}

export async function POST(request: Request) {
  const context = await requireAccess(["client"]);
  const input = completionSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Complete all required details and accept each consent." }, { status: 400 });
  const data = input.data.payload;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error: profileError } = await admin.from("client_profiles").upsert({
    user_id: context.userId, date_of_birth: data.date_of_birth, gender: data.gender ?? null, height_cm: data.height_cm, current_weight_kg: data.current_weight_kg,
    location: data.location, dietary_pattern: data.dietary_pattern ?? null, preferred_cuisines: data.preferred_cuisines, allergies: data.allergies, foods_avoided: data.foods_avoided,
    primary_goal: data.primary_goal ?? null, activity_level: data.activity_level ?? null, workout_frequency: data.workout_frequency ?? null, typical_meal_schedule: data.typical_meal_schedule ?? null,
    relevant_health_context: null, preferred_units: data.preferred_units, created_at: now, updated_at: now,
  });
  if (profileError) return NextResponse.json({ error: "Your profile could not be saved." }, { status: 500 });
  await admin.from("consent_records").insert([
    { user_id: context.userId, consent_type: "privacy", document_version: "2026-07", accepted_at: now, created_at: now },
    { user_id: context.userId, consent_type: "meal-photo-processing", document_version: "2026-07", accepted_at: now, created_at: now },
    { user_id: context.userId, consent_type: "nutrition-estimates", document_version: "2026-07", accepted_at: now, created_at: now },
    { user_id: context.userId, consent_type: "ai-assisted-analysis", document_version: "2026-07", accepted_at: now, created_at: now },
  ]);
  await admin.from("profiles").update({ full_name: data.full_name, account_status: "active", onboarding_step: 7, onboarding_completed_at: now, updated_at: now }).eq("id", context.userId);
  await admin.from("onboarding_drafts").delete().eq("user_id", context.userId);
  await admin.from("audit_logs").insert({ actor_user_id: context.userId, action: "onboarding.completed", target_type: "profile", target_id: context.userId, metadata: { consent_version: "2026-07" }, created_at: now });
  return NextResponse.json({ completed: true });
}
