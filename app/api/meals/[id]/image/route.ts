import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireApiRole(["client", "coach", "admin"]);
  if (!actor) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid meal." }, { status: 400 });
  const supabase = await createClient();
  const { data: meal } = await supabase.from("meal_entries").select("image_path").eq("id", id).maybeSingle();
  if (!meal?.image_path) return NextResponse.json({ error: "Meal photo not found." }, { status: 404 });
  const { data, error } = await supabase.storage.from("meal-images").createSignedUrl(meal.image_path, 300);
  if (error) return NextResponse.json({ error: "Meal photo is temporarily unavailable." }, { status: 503 });
  return NextResponse.json({ url: data.signedUrl, expiresIn: 300 });
}
