import { NextResponse } from "next/server";
import { demoAnalysis, mealAnalysisSchema } from "@/lib/meal-analysis";
import { requireActiveApiClient } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  const context = await requireActiveApiClient();
  if (!context) return NextResponse.json({ error: "Your paid programme access is not active." }, { status: 403 });
  const form = await request.formData();
  const image = form.get("image");
  if (form.get("consent") !== "true") return NextResponse.json({ error: "Consent is required before processing a meal photo." }, { status: 400 });
  if (!(image instanceof File)) return NextResponse.json({ error: "Choose a meal photo to continue." }, { status: 400 });
  if (!ALLOWED_TYPES.has(image.type)) return NextResponse.json({ error: "Use a JPG, PNG, WEBP or HEIC photo." }, { status: 415 });
  if (image.size > MAX_BYTES) return NextResponse.json({ error: "This photo is larger than 12 MB." }, { status: 413 });

  const supabase = await createClient();
  const { data: consent } = await supabase.from("consent_records").select("id").eq("user_id", context.userId).eq("consent_type", "meal-photo-processing").is("revoked_at", null).maybeSingle();
  if (!consent) return NextResponse.json({ error: "Please complete consent in onboarding before scanning a meal." }, { status: 403 });

  const now = new Date();
  const imagePath = `${context.userId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}/${crypto.randomUUID()}.${extensionFor(image.type)}`;
  const { error: uploadError } = await supabase.storage.from("meal-images").upload(imagePath, await image.arrayBuffer(), { contentType: image.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: "The private photo upload failed. Please try again." }, { status: 503 });

  try {
    const endpoint = process.env.AI_ANALYSIS_ENDPOINT;
    const apiKey = process.env.AI_API_KEY;
    let raw: unknown;
    if (!endpoint || !apiKey) {
      if (process.env.ALLOW_DEMO_ANALYSIS !== "true" && process.env.NODE_ENV === "production") throw new Error("AI provider is not configured");
      raw = demoAnalysis();
    } else {
      const body = new FormData(); body.set("image", image); body.set("schemaVersion", "1.0"); body.set("nutritionPolicy", "whole-food-plant-based-indian");
      const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": crypto.randomUUID() }, body, signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`Provider returned ${response.status}`);
      raw = await response.json();
    }
    const parsed = mealAnalysisSchema.safeParse(raw);
    if (!parsed.success) throw new Error("Provider response did not match the nutrition schema");
    return NextResponse.json({ analysis: parsed.data, imageKey: imagePath, mode: endpoint ? "live" : "development" });
  } catch (error) {
    await supabase.storage.from("meal-images").remove([imagePath]);
    console.error(JSON.stringify({ event: "analysis_failed", message: error instanceof Error ? error.message : "unknown" }));
    return NextResponse.json({ error: "Meal analysis is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
}

function extensionFor(type: string) { return type === "image/png" ? "png" : type === "image/webp" ? "webp" : type === "image/heic" || type === "image/heif" ? "heic" : "jpg"; }
