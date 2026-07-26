import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { getMealHistoryDetail, type MealHistoryFailureCode } from "@/lib/server/meal-history";
import { authorizeMealUpload } from "@/lib/server/meal-upload";
import { createMealHistoryRepository } from "@/lib/server/supabase-meal-save";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return errorResponse("meal_not_found", 404, false);
  try {
    const access = authorizeMealUpload(await getAccessContext());
    if (!access.allowed) return errorResponse(access.code, access.status, false);
    const result = await getMealHistoryDetail(access, id, createMealHistoryRepository(createAdminClient()));
    if (!result.ok) return errorResponse(result.code, result.status, result.retryable);
    return NextResponse.json(result.value, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse("database_failure", 503, true);
  }
}

function errorResponse(code: MealHistoryFailureCode, status: number, retryable: boolean) {
  const messages: Record<MealHistoryFailureCode, string> = {
    authentication_required: "Sign in again to view this meal.",
    client_access_required: "Client access is required to view this meal.",
    client_access_expired: "Active programme access is required to view this meal.",
    invalid_cursor: "The meal request is invalid.",
    meal_not_found: "This saved meal is not available.",
    history_data_invalid: "This saved meal could not be displayed safely.",
    database_failure: "The saved meal is temporarily unavailable. Please retry.",
  };
  return NextResponse.json({ code, error: messages[code], retryable }, { status, headers: { "Cache-Control": "no-store" } });
}
