import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccessContext } from "@/lib/access-control";
import { authorizeMealUpload } from "@/lib/server/meal-upload";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid meal." }, { status: 400 });
  const access = authorizeMealUpload(await getAccessContext());
  if (!access.allowed) return NextResponse.json({ error: access.status === 401 ? "Sign in is required." : "Active client access is required." }, { status: access.status });
  try {
    const admin = createAdminClient();
    const { data: meal, error: mealError } = await admin.from("meals").select("meal_upload_id").eq("id", id).eq("client_id", access.userId).maybeSingle();
    if (mealError) throw mealError;
    if (!meal) return NextResponse.json({ error: "Meal photo not found." }, { status: 404 });
    const { data: upload, error: uploadError } = await admin.from("meal_uploads").select("storage_path,upload_status,client_id").eq("id", meal.meal_upload_id).eq("client_id", access.userId).maybeSingle();
    if (uploadError) throw uploadError;
    if (!upload || upload.upload_status !== "uploaded" || upload.client_id !== access.userId) return NextResponse.json({ error: "Meal photo not found." }, { status: 404 });
    const { data, error } = await admin.storage.from("meal-images").createSignedUrl(upload.storage_path, 300);
    if (error) throw error;
    return NextResponse.json({ url: data.signedUrl, expiresIn: 300 }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Meal photo is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
