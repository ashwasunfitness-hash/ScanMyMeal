import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { getSavedMeal, type MealSaveFailureCode } from "@/lib/server/meal-save";
import { authorizeMealUpload } from "@/lib/server/meal-upload";
import { createMealSaveRepository } from "@/lib/server/supabase-meal-save";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return errorResponse("analysis_job_not_found", 404, false);
  try {
    const access = authorizeMealUpload(await getAccessContext());
    if (!access.allowed) return errorResponse(access.code, access.status, false);
    const result = await getSavedMeal(access, id, createMealSaveRepository(createAdminClient()));
    if (!result.ok) return errorResponse(result.code as MealSaveFailureCode, result.status, result.retryable);
    return NextResponse.json({ meal: result.meal }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse("database_failure", 503, true);
  }
}

function errorResponse(code: MealSaveFailureCode, status: number, retryable: boolean) {
  const messages: Partial<Record<MealSaveFailureCode, string>> = {
    authentication_required: "Sign in again before checking this meal.",
    client_access_required: "Client access is required to check saved meals.",
    client_access_expired: "Active programme access is required to check saved meals.",
    analysis_job_not_found: "This meal analysis is not available.",
    analysis_not_completed: "Meal analysis must finish before the saved meal can be checked.",
    upload_not_completed: "The meal photo has not finished uploading.",
    food_confirmation_not_found: "The confirmed food list is not available.",
    portion_confirmation_not_found: "The confirmed portions are not available.",
    nutrition_result_not_found: "The saved nutrition result is not available.",
    nutrition_result_not_saveable: "This nutrition result cannot be saved as a meal.",
    database_failure: "The saved meal could not be checked right now. Please retry.",
  };
  return NextResponse.json({ code, error: messages[code] ?? "The saved meal is not available.", retryable }, { status, headers: { "Cache-Control": "no-store" } });
}
