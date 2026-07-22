import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { foodConfirmationRequestSchema } from "@/lib/meal-food-confirmation-contract";
import { confirmMealFoods, getMealFoodConfirmation, type ConfirmationFailureCode } from "@/lib/server/meal-food-confirmation";
import { authorizeMealUpload } from "@/lib/server/meal-upload";
import { createMealFoodConfirmationRepository } from "@/lib/server/supabase-meal-food-confirmation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return errorResponse("analysis_job_not_found", 404, false);
  try {
    const access = authorizeMealUpload(await getAccessContext());
    if (!access.allowed) return errorResponse(access.code, access.status, false);
    const result = await getMealFoodConfirmation(access, id, createMealFoodConfirmationRepository(createAdminClient()));
    if (!result.ok) return errorResponse(result.code, result.status, result.retryable);
    return NextResponse.json({ confirmation: result.confirmation }, { headers: { "Cache-Control": "no-store" } });
  } catch { return errorResponse("database_failure", 503, true); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return errorResponse("analysis_job_not_found", 404, false);
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse("invalid_food_list", 422, false); }
  const parsed = foodConfirmationRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse("invalid_food_list", 422, false);
  try {
    const access = authorizeMealUpload(await getAccessContext());
    if (!access.allowed) return errorResponse(access.code, access.status, false);
    const result = await confirmMealFoods(access, id, parsed.data.foods, createMealFoodConfirmationRepository(createAdminClient()));
    if (!result.ok) return errorResponse(result.code, result.status, result.retryable);
    return NextResponse.json(result.confirmation, { status: result.duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch { return errorResponse("database_failure", 503, true); }
}

function errorResponse(code: ConfirmationFailureCode, status: number, retryable: boolean) {
  const messages: Record<ConfirmationFailureCode, string> = {
    authentication_required: "Sign in again before confirming foods.",
    client_access_required: "Client access is required to confirm foods.",
    client_access_expired: "Active programme access is required to confirm foods.",
    analysis_job_not_found: "This meal analysis is not available.",
    analysis_not_completed: "Food recognition must finish before foods can be confirmed.",
    recognition_not_found: "The recognized food list is not available.",
    invalid_food_list: "Review the food names and remove duplicates before confirming.",
    confirmation_conflict: "These foods were already confirmed and can no longer be changed.",
    database_failure: "The food list could not be saved right now. Please retry.",
  };
  return NextResponse.json({ code, error: messages[code], retryable }, { status, headers: { "Cache-Control": "no-store" } });
}
