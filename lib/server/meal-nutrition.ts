import { confirmedFoodListSchema, type ConfirmedFoodList } from "#/lib/meal-food-confirmation-contract";
import { confirmedPortionListSchema, type ConfirmedPortionList } from "#/lib/meal-portion-confirmation-contract";
import { nutritionResultItemsSchema, nutritionValuesSchema, safeMealNutritionResultSchema, type NutritionResultItems, type NutritionValues, type SafeMealNutritionResult } from "#/lib/meal-nutrition-contract";
import { calculateMealNutrition } from "#/lib/server/meal-nutrition-engine";
import type { NutritionCatalogue } from "#/lib/server/nutrition-catalogue";
import type { UploadAccessResult } from "#/lib/server/meal-upload";
import type { MealAnalysisJobRow, MealFoodConfirmationRow, MealNutritionResultRow, MealPortionConfirmationRow, MealRecognitionResultRow } from "@/lib/supabase/database.types";

type RecognitionIdentity = Pick<MealRecognitionResultRow, "id" | "analysis_job_id" | "client_id" | "meal_upload_id">;
export type FoodConfirmationForNutrition = Omit<MealFoodConfirmationRow, "foods"> & { foods: ConfirmedFoodList };
export type PortionConfirmationForNutrition = Omit<MealPortionConfirmationRow, "portions"> & { portions: ConfirmedPortionList };
export type NutritionResultRecord = Omit<MealNutritionResultRow, "items" | "totals"> & { items: NutritionResultItems; totals: NutritionValues | null };

export type MealNutritionDependencies = {
  findJob(jobId: string): Promise<MealAnalysisJobRow | null>;
  findRecognition(jobId: string): Promise<RecognitionIdentity | null>;
  findFoodConfirmation(jobId: string): Promise<FoodConfirmationForNutrition | null>;
  findPortionConfirmation(jobId: string): Promise<PortionConfirmationForNutrition | null>;
  findNutritionResult(jobId: string): Promise<NutritionResultRecord | null>;
  createNutritionResult(record: NutritionResultRecord): Promise<boolean>;
  loadCatalogue(): Promise<NutritionCatalogue | null>;
  engineVersion: string;
  randomId(): string;
  now(): Date;
};

export type NutritionFailureCode = "authentication_required" | "client_access_required" | "client_access_expired" | "analysis_job_not_found" | "analysis_not_completed" | "food_confirmation_not_found" | "portion_confirmation_not_found" | "nutrition_catalogue_unavailable" | "nutrition_mapping_incomplete" | "nutrition_calculation_failed" | "database_failure";
export type CalculateNutritionResult =
  | { ok: true; result: SafeMealNutritionResult; duplicate: boolean }
  | { ok: false; status: 401 | 403 | 404 | 409 | 422 | 503; code: NutritionFailureCode; retryable: boolean };

export async function calculateAndPersistMealNutrition(access: UploadAccessResult, jobId: string, dependencies: MealNutritionDependencies): Promise<CalculateNutritionResult> {
  if (!access.allowed) return { ok: false, status: access.status, code: access.code, retryable: false };
  try {
    const related = await loadAuthoritativeRecords(access.userId, jobId, dependencies);
    if (!related.ok) return related.failure;
    const existing = await dependencies.findNutritionResult(jobId);
    if (existing) return validateExisting(existing, related, access.userId);
    const catalogue = await dependencies.loadCatalogue();
    if (!catalogue) return failure("nutrition_catalogue_unavailable", 503, true);

    let calculation;
    try { calculation = calculateMealNutrition({ foods: related.foodConfirmation.foods, portions: related.portionConfirmation.portions, catalogue }); }
    catch { return failure("nutrition_calculation_failed", 422); }
    const timestamp = dependencies.now().toISOString();
    const record: NutritionResultRecord = {
      id: dependencies.randomId(), analysis_job_id: related.job.id, portion_confirmation_id: related.portionConfirmation.id,
      food_confirmation_id: related.foodConfirmation.id, meal_upload_id: related.job.meal_upload_id, client_id: access.userId,
      status: calculation.status, engine_version: dependencies.engineVersion, catalogue_version: catalogue.version,
      items: calculation.items, totals: calculation.totals ?? null, is_complete: calculation.isComplete,
      total_confirmed_food_count: calculation.totalConfirmedFoodCount, resolved_item_count: calculation.resolvedItemCount,
      unresolved_item_count: calculation.unresolvedItemCount, calculated_at: timestamp, created_at: timestamp, updated_at: timestamp,
    };
    if (await dependencies.createNutritionResult(record)) return { ok: true, result: toSafeNutritionResult(record), duplicate: false };
    const concurrent = await dependencies.findNutritionResult(jobId);
    return concurrent ? validateExisting(concurrent, related, access.userId) : failure("database_failure", 503, true);
  } catch { return failure("database_failure", 503, true); }
}

export async function getMealNutrition(access: UploadAccessResult, jobId: string, dependencies: MealNutritionDependencies) {
  if (!access.allowed) return { ok: false as const, status: access.status, code: access.code, retryable: false };
  try {
    const related = await loadAuthoritativeRecords(access.userId, jobId, dependencies);
    if (!related.ok) return related.failure;
    const existing = await dependencies.findNutritionResult(jobId);
    if (!existing) return { ok: true as const, result: null };
    const checked = validateExisting(existing, related, access.userId);
    return checked.ok ? { ok: true as const, result: checked.result } : checked;
  } catch { return failure("database_failure", 503, true); }
}

async function loadAuthoritativeRecords(clientId: string, jobId: string, dependencies: MealNutritionDependencies) {
  const job = await dependencies.findJob(jobId);
  if (!job || job.client_id !== clientId) return { ok: false as const, failure: failure("analysis_job_not_found", 404) };
  if (job.status !== "completed") return { ok: false as const, failure: failure("analysis_not_completed", 409) };
  const recognition = await dependencies.findRecognition(jobId);
  const foodConfirmation = await dependencies.findFoodConfirmation(jobId);
  if (!recognition || !foodConfirmation || recognition.analysis_job_id !== job.id || recognition.client_id !== clientId || recognition.meal_upload_id !== job.meal_upload_id || foodConfirmation.analysis_job_id !== job.id || foodConfirmation.recognition_result_id !== recognition.id || foodConfirmation.client_id !== clientId || foodConfirmation.meal_upload_id !== job.meal_upload_id) {
    return { ok: false as const, failure: failure("food_confirmation_not_found", 404) };
  }
  const foods = confirmedFoodListSchema.safeParse(foodConfirmation.foods);
  if (!foods.success) return { ok: false as const, failure: failure("food_confirmation_not_found", 404) };
  const portionConfirmation = await dependencies.findPortionConfirmation(jobId);
  if (!portionConfirmation || portionConfirmation.analysis_job_id !== job.id || portionConfirmation.food_confirmation_id !== foodConfirmation.id || portionConfirmation.client_id !== clientId || portionConfirmation.meal_upload_id !== job.meal_upload_id) {
    return { ok: false as const, failure: failure("portion_confirmation_not_found", 404) };
  }
  const portions = confirmedPortionListSchema.safeParse(portionConfirmation.portions);
  if (!portions.success) return { ok: false as const, failure: failure("portion_confirmation_not_found", 404) };
  return { ok: true as const, job, foodConfirmation: { ...foodConfirmation, foods: foods.data }, portionConfirmation: { ...portionConfirmation, portions: portions.data } };
}

function validateExisting(existing: NutritionResultRecord, related: { job: MealAnalysisJobRow; foodConfirmation: FoodConfirmationForNutrition; portionConfirmation: PortionConfirmationForNutrition }, clientId: string): CalculateNutritionResult {
  if (existing.client_id !== clientId || existing.analysis_job_id !== related.job.id || existing.meal_upload_id !== related.job.meal_upload_id || existing.food_confirmation_id !== related.foodConfirmation.id || existing.portion_confirmation_id !== related.portionConfirmation.id) return failure("analysis_job_not_found", 404);
  try { return { ok: true, result: toSafeNutritionResult(existing), duplicate: true }; }
  catch { return failure("database_failure", 503, true); }
}

export function toSafeNutritionResult(record: NutritionResultRecord): SafeMealNutritionResult {
  return safeMealNutritionResultSchema.parse({
    resultId: record.id, jobId: record.analysis_job_id, status: record.status, engineVersion: record.engine_version,
    catalogueVersion: record.catalogue_version, items: nutritionResultItemsSchema.parse(record.items),
    ...(record.totals ? { totals: nutritionValuesSchema.parse(record.totals) } : {}),
    totalConfirmedFoodCount: record.total_confirmed_food_count, resolvedItemCount: record.resolved_item_count,
    unresolvedItemCount: record.unresolved_item_count, isComplete: record.is_complete, calculatedAt: record.calculated_at,
  });
}

function failure(code: NutritionFailureCode, status: 401 | 403 | 404 | 409 | 422 | 503, retryable = false): CalculateNutritionResult & { ok: false } {
  return { ok: false, status, code, retryable };
}
