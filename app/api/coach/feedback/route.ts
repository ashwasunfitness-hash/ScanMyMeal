import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ clientId: z.string().uuid(), mealId: z.string().uuid().nullable().optional(), body: z.string().trim().min(1).max(4000), clientVisible: z.boolean().default(true) });

export async function POST(request: Request) {
  const actor = await requireApiRole(["coach", "admin"]);
  if (!actor) return NextResponse.json({ error: "Coach access is required." }, { status: 403 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Review the feedback before saving." }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("coach_feedback").insert({ client_id: input.data.clientId, coach_id: actor.userId, meal_id: input.data.mealId ?? null, body: input.data.body, is_client_visible: input.data.clientVisible }).select("id").single();
  if (error) return NextResponse.json({ error: "Feedback could not be saved for this client." }, { status: 403 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
