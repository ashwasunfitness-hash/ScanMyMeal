import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { nutritionRequestSchema } from "@/lib/meal-nutrition-contract";
import { calculateAndPersistMealNutrition, getMealNutrition, type NutritionFailureCode } from "@/lib/server/meal-nutrition";
import { authorizeMealUpload } from "@/lib/server/meal-upload";
import { createMealNutritionRepository } from "@/lib/server/supabase-meal-nutrition";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return errorResponse("analysis_job_not_found", 404, false);
  try {
    const access = authorizeMealUpload(await getAccessContext());
    if (!access.allowed) return errorResponse(access.code, access.status, false);
    const result = await getMealNutrition(access, id, createMealNutritionRepository(createAdminClient()));
    if (!result.ok) return errorResponse(result.code, result.status, result.retryable);
    return NextResponse.json({ result: result.result }, { headers: { "Cache-Control": "no-store" } });
  } catch { return errorResponse("database_failure", 503, true); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return errorResponse("analysis_job_not_found", 404, false);
  let body: unknown = {};
  try { const text = await request.text(); body = text.trim() ? JSON.parse(text) : {}; }
  catch { return errorResponse("nutrition_calculation_failed", 422, false); }
  if (!nutritionRequestSchema.safeParse(body).success) return errorResponse("nutrition_calculation_failed", 422, false);
  try {
    const access = authorizeMealUpload(await getAccessContext());
    if (!access.allowed) return errorResponse(access.code, access.status, false);
    const result = await calculateAndPersistMealNutrition(access, id, createMealNutritionRepository(createAdminClient()));
    if (!result.ok) return errorResponse(result.code, result.status, result.retryable);
    return NextResponse.json(result.result, { status: result.duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch { return errorResponse("database_failure", 503, true); }
}

function errorResponse(code: NutritionFailureCode, status: number, retryable: boolean) {
  const messages: Record<NutritionFailureCode, string> = {
    authentication_required: "Sign in again before calculating nutrition.",
    client_access_required: "Client access is required to calculate nutrition.",
    client_access_expired: "Active programme access is required to calculate nutrition.",
    analysis_job_not_found: "This meal analysis is not available.",
    analysis_not_completed: "The meal analysis must finish before nutrition can be calculated.",
    food_confirmation_not_found: "Confirm the food list before calculating nutrition.",
    portion_confirmation_not_found: "Confirm every portion before calculating nutrition.",
    nutrition_catalogue_unavailable: "The nutrition catalogue is temporarily unavailable. Please retry.",
    nutrition_mapping_incomplete: "Some foods could not be mapped safely under the current catalogue.",
    nutrition_calculation_failed: "We could not safely calculate this meal. Your confirmations are still saved.",
    database_failure: "The nutrition estimate could not be saved right now. Please retry.",
  };
  return NextResponse.json({ code, error: messages[code], retryable }, { status, headers: { "Cache-Control": "no-store" } });
}
