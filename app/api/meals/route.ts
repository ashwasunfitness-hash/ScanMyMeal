import { NextResponse } from "next/server";
import { z } from "zod";
import { mealAnalysisSchema } from "@/lib/meal-analysis";
import { requireActiveApiClient } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const schema = z.object({ mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]), notes: z.string().max(1000).optional().default(""), imageKey: z.string().max(500).optional(), analysis: mealAnalysisSchema });

export async function GET() {
  const context = await requireActiveApiClient();
  if (!context) return NextResponse.json({ error: "Your programme access is not active." }, { status: 403 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("meal_entries").select("id, meal_type, title, calories_kcal, protein_g, carbohydrates_g, fat_g, fibre_g, status, created_at").eq("client_id", context.userId).order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "Meal history is temporarily unavailable." }, { status: 503 });
  return NextResponse.json({ meals: data.map((meal) => ({ id: meal.id, mealType: meal.meal_type, title: meal.title, caloriesKcal: meal.calories_kcal, proteinG: meal.protein_g, carbsG: meal.carbohydrates_g, fatG: meal.fat_g, fibreG: meal.fibre_g, status: meal.status, createdAt: new Date(meal.created_at).getTime() })) });
}

export async function POST(request: Request) {
  const context = await requireActiveApiClient();
  if (!context) return NextResponse.json({ error: "Your programme access is not active." }, { status: 403 });
  const input = schema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: "Please review the meal details before saving." }, { status: 400 });
  if (input.data.imageKey && !input.data.imageKey.startsWith(`${context.userId}/`)) return NextResponse.json({ error: "This photo does not belong to your account." }, { status: 403 });
  const supabase = await createClient();
  const id = crypto.randomUUID();
  const { analysis } = input.data;
  const { error } = await supabase.from("meal_entries").insert({ id, client_id: context.userId, programme_id: context.programme?.id ?? null, meal_type: input.data.mealType, title: analysis.mealTitle, image_path: input.data.imageKey ?? null, notes: input.data.notes, calories_kcal: analysis.totals.caloriesKcal, protein_g: analysis.totals.proteinG, carbohydrates_g: analysis.totals.carbsG, fat_g: analysis.totals.fatG, fibre_g: analysis.totals.fibreG, overall_confidence: analysis.overallConfidence, status: "confirmed", analysis_version: analysis.version, ai_provider: process.env.AI_ANALYSIS_ENDPOINT ? "configured-provider" : "development" });
  if (error) return NextResponse.json({ error: "Your meal could not be saved." }, { status: 503 });
  const items = analysis.items.map((item) => ({ id: crypto.randomUUID(), meal_id: id, detected_name: item.detectedName, canonical_name: item.canonicalFoodName, serving_label: item.estimatedServingLabel, grams: item.estimatedGrams, calories_kcal: item.nutrition.caloriesKcal, protein_g: item.nutrition.proteinG, carbohydrates_g: item.nutrition.carbsG, fat_g: item.nutrition.fatG, fibre_g: item.nutrition.fibreG, confidence: Math.min(item.foodConfidence, item.quantityConfidence), nutrition_source: item.nutritionSource }));
  const { error: itemsError } = await supabase.from("meal_items").insert(items);
  if (itemsError) { await supabase.from("meal_entries").delete().eq("id", id); return NextResponse.json({ error: "Your meal items could not be saved." }, { status: 503 }); }
  return NextResponse.json({ id, saved: true }, { status: 201 });
}
