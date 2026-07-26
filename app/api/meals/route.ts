import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { saveMealRequestSchema } from "@/lib/meal-save-contract";
import { listMealHistory, type MealHistoryFailureCode } from "@/lib/server/meal-history";
import { saveMeal, type MealSaveFailureCode } from "@/lib/server/meal-save";
import { authorizeMealUpload } from "@/lib/server/meal-upload";
import { createMealHistoryRepository, createMealSaveRepository } from "@/lib/server/supabase-meal-save";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cursor = new URL(request.url).searchParams.get("cursor");
  try {
    const access = authorizeMealUpload(await getAccessContext());
    if (!access.allowed) return historyErrorResponse(access.code, access.status, false);
    const result = await listMealHistory(access, cursor, createMealHistoryRepository(createAdminClient()));
    if (!result.ok) return historyErrorResponse(result.code, result.status, result.retryable);
    return NextResponse.json(result.value, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return historyErrorResponse("database_failure", 503, true);
  }
}

function historyErrorResponse(code: MealHistoryFailureCode, status: number, retryable: boolean) {
  const messages: Record<MealHistoryFailureCode, string> = {
    authentication_required: "Sign in again to view meal history.",
    client_access_required: "Client access is required to view meal history.",
    client_access_expired: "Active programme access is required to view meal history.",
    invalid_cursor: "This meal-history page link is invalid. Refresh to start again.",
    meal_not_found: "This saved meal is not available.",
    history_data_invalid: "This saved meal could not be displayed safely.",
    database_failure: "Meal history is temporarily unavailable. Please retry.",
  };
  return NextResponse.json({ code, error: messages[code], retryable }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return errorResponse("invalid_meal_details", 422, false); }
  const input = saveMealRequestSchema.safeParse(body);
  if (!input.success) return errorResponse("invalid_meal_details", 422, false);
  try {
    const access = authorizeMealUpload(await getAccessContext());
    if (!access.allowed) return errorResponse(access.code, access.status, false);
    const result = await saveMeal(access, input.data, createMealSaveRepository(createAdminClient()));
    if (!result.ok) return errorResponse(result.code, result.status, result.retryable);
    return NextResponse.json(result.meal, { status: result.duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse("database_failure", 503, true);
  }
}

function errorResponse(code: MealSaveFailureCode, status: number, retryable: boolean) {
  const messages: Record<MealSaveFailureCode, string> = {
    authentication_required: "Sign in again before saving this meal.",
    client_access_required: "Client access is required to save meals.",
    client_access_expired: "Active programme access is required to save meals.",
    invalid_meal_details: "Choose a meal type and a valid eaten date and time.",
    eaten_at_out_of_range: "Choose a time within the past 30 days and not in the future.",
    analysis_job_not_found: "This meal analysis is not available.",
    analysis_not_completed: "Meal analysis must finish before the meal can be saved.",
    upload_not_completed: "The meal photo must finish uploading before the meal can be saved.",
    food_confirmation_not_found: "Confirm the food list before saving this meal.",
    portion_confirmation_not_found: "Confirm every portion before saving this meal.",
    nutrition_result_not_found: "Calculate and save the nutrition result before saving this meal.",
    nutrition_result_not_saveable: "This nutrition result cannot be saved as a meal.",
    meal_already_saved: "This meal was already saved and cannot be changed.",
    database_failure: "The meal could not be saved right now. Please retry.",
  };
  return NextResponse.json({ code, error: messages[code], retryable }, { status, headers: { "Cache-Control": "no-store" } });
}
