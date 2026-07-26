import { safeSavedMealSchema, type MealType, type SafeSavedMeal } from "#/lib/meal-save-contract";
import type { UploadAccessResult } from "#/lib/server/meal-upload";
import type {
  MealAnalysisJobRow,
  MealFoodConfirmationRow,
  MealNutritionResultRow,
  MealPortionConfirmationRow,
  MealUploadRow,
  SavedMealRow,
} from "@/lib/supabase/database.types";

const FUTURE_ALLOWANCE_MS = 10 * 60 * 1000;
const HISTORY_LIMIT_MS = 30 * 24 * 60 * 60 * 1000;

export type SavedMealRecord = SavedMealRow;
export type MealSaveDependencies = {
  findUpload(uploadId: string): Promise<MealUploadRow | null>;
  findJob(jobId: string): Promise<MealAnalysisJobRow | null>;
  findFoodConfirmation(jobId: string): Promise<MealFoodConfirmationRow | null>;
  findPortionConfirmation(jobId: string): Promise<MealPortionConfirmationRow | null>;
  findNutritionResult(jobId: string): Promise<MealNutritionResultRow | null>;
  findSavedMeal(jobId: string): Promise<SavedMealRecord | null>;
  createSavedMeal(record: SavedMealRecord): Promise<boolean>;
  randomId(): string;
  now(): Date;
};

export type MealSaveFailureCode =
  | "authentication_required" | "client_access_required" | "client_access_expired"
  | "invalid_meal_details" | "eaten_at_out_of_range"
  | "analysis_job_not_found" | "analysis_not_completed" | "upload_not_completed"
  | "food_confirmation_not_found" | "portion_confirmation_not_found"
  | "nutrition_result_not_found" | "nutrition_result_not_saveable"
  | "meal_already_saved" | "database_failure";

export type SaveMealResult =
  | { ok: true; meal: SafeSavedMeal; duplicate: boolean }
  | { ok: false; status: 401 | 403 | 404 | 409 | 422 | 503; code: MealSaveFailureCode; retryable: boolean };

export async function saveMeal(
  access: UploadAccessResult,
  input: { analysisJobId: string; mealType: MealType; eatenAt: string },
  dependencies: MealSaveDependencies,
): Promise<SaveMealResult> {
  if (!access.allowed) return { ok: false, status: access.status, code: access.code, retryable: false };
  const eatenAt = validateEatenAt(input.eatenAt, dependencies.now());
  if (!eatenAt) return failure("eaten_at_out_of_range", 422);
  try {
    const related = await loadAuthoritativeChain(access.userId, input.analysisJobId, dependencies);
    if (!related.ok) return related.failure;
    const existing = await dependencies.findSavedMeal(input.analysisJobId);
    if (existing) return validateExisting(existing, related, access.userId, input.mealType, eatenAt);

    const timestamp = dependencies.now().toISOString();
    const record: SavedMealRecord = {
      id: dependencies.randomId(),
      client_id: access.userId,
      meal_upload_id: related.upload.id,
      meal_analysis_job_id: related.job.id,
      food_confirmation_id: related.foodConfirmation.id,
      portion_confirmation_id: related.portionConfirmation.id,
      nutrition_result_id: related.nutritionResult.id,
      meal_type: input.mealType,
      eaten_at: eatenAt,
      created_at: timestamp,
    };
    if (await dependencies.createSavedMeal(record)) {
      return { ok: true, meal: toSafeSavedMeal(record, related.nutritionResult.status), duplicate: false };
    }
    const concurrent = await dependencies.findSavedMeal(input.analysisJobId);
    return concurrent
      ? validateExisting(concurrent, related, access.userId, input.mealType, eatenAt)
      : failure("database_failure", 503, true);
  } catch {
    return failure("database_failure", 503, true);
  }
}

export async function getSavedMeal(access: UploadAccessResult, jobId: string, dependencies: MealSaveDependencies) {
  if (!access.allowed) return { ok: false as const, status: access.status, code: access.code, retryable: false };
  try {
    const related = await loadAuthoritativeChain(access.userId, jobId, dependencies);
    if (!related.ok) return related.failure;
    const existing = await dependencies.findSavedMeal(jobId);
    if (!existing) return { ok: true as const, meal: null };
    const checked = validateExisting(existing, related, access.userId);
    return checked.ok ? { ok: true as const, meal: checked.meal } : checked;
  } catch {
    return failure("database_failure", 503, true);
  }
}

export function validateEatenAt(value: string, now: Date) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const nowMs = now.getTime();
  if (timestamp > nowMs + FUTURE_ALLOWANCE_MS || timestamp < nowMs - HISTORY_LIMIT_MS) return null;
  return new Date(timestamp).toISOString();
}

async function loadAuthoritativeChain(clientId: string, jobId: string, dependencies: MealSaveDependencies) {
  const job = await dependencies.findJob(jobId);
  if (!job || job.client_id !== clientId) return failedChain("analysis_job_not_found", 404);
  if (job.status !== "completed") return failedChain("analysis_not_completed", 409);
  const upload = await dependencies.findUpload(job.meal_upload_id);
  if (!upload || upload.client_id !== clientId || upload.id !== job.meal_upload_id) return failedChain("analysis_job_not_found", 404);
  if (upload.upload_status !== "uploaded") return failedChain("upload_not_completed", 409);
  const foodConfirmation = await dependencies.findFoodConfirmation(jobId);
  if (!foodConfirmation || foodConfirmation.status !== "confirmed" || foodConfirmation.analysis_job_id !== job.id || foodConfirmation.client_id !== clientId || foodConfirmation.meal_upload_id !== upload.id) return failedChain("food_confirmation_not_found", 404);
  const portionConfirmation = await dependencies.findPortionConfirmation(jobId);
  if (!portionConfirmation || portionConfirmation.status !== "confirmed" || portionConfirmation.analysis_job_id !== job.id || portionConfirmation.food_confirmation_id !== foodConfirmation.id || portionConfirmation.client_id !== clientId || portionConfirmation.meal_upload_id !== upload.id) return failedChain("portion_confirmation_not_found", 404);
  const nutritionResult = await dependencies.findNutritionResult(jobId);
  if (!nutritionResult || nutritionResult.analysis_job_id !== job.id || nutritionResult.portion_confirmation_id !== portionConfirmation.id || nutritionResult.food_confirmation_id !== foodConfirmation.id || nutritionResult.client_id !== clientId || nutritionResult.meal_upload_id !== upload.id) return failedChain("nutrition_result_not_found", 404);
  if (!["completed", "partial", "failed"].includes(nutritionResult.status)) return failedChain("nutrition_result_not_saveable", 409);
  return { ok: true as const, upload, job, foodConfirmation, portionConfirmation, nutritionResult };
}

function validateExisting(
  existing: SavedMealRecord,
  related: Awaited<ReturnType<typeof loadAuthoritativeChain>> & { ok: true },
  clientId: string,
  requestedType?: MealType,
  requestedEatenAt?: string,
): SaveMealResult {
  const sameChain = existing.client_id === clientId
    && existing.meal_upload_id === related.upload.id
    && existing.meal_analysis_job_id === related.job.id
    && existing.food_confirmation_id === related.foodConfirmation.id
    && existing.portion_confirmation_id === related.portionConfirmation.id
    && existing.nutrition_result_id === related.nutritionResult.id;
  if (!sameChain) return failure("analysis_job_not_found", 404);
  if ((requestedType && existing.meal_type !== requestedType) || (requestedEatenAt && existing.eaten_at !== requestedEatenAt)) {
    return failure("meal_already_saved", 409);
  }
  return { ok: true, meal: toSafeSavedMeal(existing, related.nutritionResult.status), duplicate: true };
}

function toSafeSavedMeal(record: SavedMealRecord, nutritionStatus: MealNutritionResultRow["status"]) {
  return safeSavedMealSchema.parse({
    mealId: record.id,
    analysisJobId: record.meal_analysis_job_id,
    mealType: record.meal_type,
    eatenAt: record.eaten_at,
    nutritionStatus,
    savedAt: record.created_at,
  });
}

function failedChain(code: MealSaveFailureCode, status: 404 | 409) {
  return { ok: false as const, failure: failure(code, status) };
}

function failure(code: MealSaveFailureCode, status: 401 | 403 | 404 | 409 | 422 | 503, retryable = false): SaveMealResult & { ok: false } {
  return { ok: false, status, code, retryable };
}
