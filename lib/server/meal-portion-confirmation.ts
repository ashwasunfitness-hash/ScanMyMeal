import { confirmedFoodListSchema, type ConfirmedFoodList } from "#/lib/meal-food-confirmation-contract";
import { comparablePortionList, confirmedPortionListSchema, portionRequestListSchema, type ConfirmedPortionList, type PortionRequestList } from "#/lib/meal-portion-confirmation-contract";
import type { UploadAccessResult } from "#/lib/server/meal-upload";
import type { MealAnalysisJobRow, MealFoodConfirmationRow, MealPortionConfirmationRow, MealRecognitionResultRow } from "@/lib/supabase/database.types";

export type FoodConfirmationForPortions = Omit<MealFoodConfirmationRow, "foods"> & { foods: ConfirmedFoodList };
export type PortionConfirmationRecord = Omit<MealPortionConfirmationRow, "portions"> & { portions: ConfirmedPortionList };
type RecognitionIdentity = Pick<MealRecognitionResultRow, "id" | "analysis_job_id" | "client_id" | "meal_upload_id">;

export type PortionConfirmationDependencies = {
  findJob(jobId: string): Promise<MealAnalysisJobRow | null>;
  findRecognition(jobId: string): Promise<RecognitionIdentity | null>;
  findFoodConfirmation(jobId: string): Promise<FoodConfirmationForPortions | null>;
  findPortionConfirmation(jobId: string): Promise<PortionConfirmationRecord | null>;
  createPortionConfirmation(record: PortionConfirmationRecord): Promise<boolean>;
  randomId(): string;
  now(): Date;
};

export type SafePortionConfirmation = { confirmationId: string; jobId: string; status: "confirmed"; portions: ConfirmedPortionList; confirmedAt: string };
export type PortionFailureCode = "authentication_required" | "client_access_required" | "client_access_expired" | "analysis_job_not_found" | "analysis_not_completed" | "food_confirmation_not_found" | "invalid_portion_list" | "portion_confirmation_conflict" | "database_failure";
export type ConfirmPortionsResult =
  | { ok: true; confirmation: SafePortionConfirmation; duplicate: boolean }
  | { ok: false; status: 401 | 403 | 404 | 409 | 422 | 503; code: PortionFailureCode; retryable: boolean };

export async function confirmMealPortions(access: UploadAccessResult, jobId: string, rawPortions: unknown, dependencies: PortionConfirmationDependencies): Promise<ConfirmPortionsResult> {
  if (!access.allowed) return { ok: false, status: access.status, code: access.code, retryable: false };
  const submitted = portionRequestListSchema.safeParse(rawPortions);
  if (!submitted.success) return failure("invalid_portion_list", 422);

  try {
    const related = await loadAuthoritativeRecords(access.userId, jobId, dependencies);
    if (!related.ok) return related.failure;
    const authoritative = constructAuthoritativePortions(submitted.data, related.foodConfirmation.foods, dependencies.randomId);
    if (!authoritative) return failure("invalid_portion_list", 422);

    const existing = await dependencies.findPortionConfirmation(jobId);
    if (existing) return compareExisting(existing, authoritative);

    const timestamp = dependencies.now().toISOString();
    const record: PortionConfirmationRecord = {
      id: dependencies.randomId(), analysis_job_id: related.job.id, food_confirmation_id: related.foodConfirmation.id,
      meal_upload_id: related.job.meal_upload_id, client_id: access.userId, status: "confirmed", portions: authoritative,
      confirmed_at: timestamp, created_at: timestamp, updated_at: timestamp,
    };
    if (await dependencies.createPortionConfirmation(record)) return { ok: true, confirmation: toSafePortionConfirmation(record), duplicate: false };
    const concurrent = await dependencies.findPortionConfirmation(jobId);
    return concurrent ? compareExisting(concurrent, authoritative) : failure("database_failure", 503, true);
  } catch { return failure("database_failure", 503, true); }
}

export async function getMealPortionConfirmation(access: UploadAccessResult, jobId: string, dependencies: PortionConfirmationDependencies) {
  if (!access.allowed) return { ok: false as const, status: access.status, code: access.code, retryable: false };
  try {
    const related = await loadAuthoritativeRecords(access.userId, jobId, dependencies);
    if (!related.ok) return related.failure;
    const confirmation = await dependencies.findPortionConfirmation(jobId);
    if (confirmation && (confirmation.client_id !== access.userId || confirmation.analysis_job_id !== related.job.id || confirmation.meal_upload_id !== related.job.meal_upload_id || confirmation.food_confirmation_id !== related.foodConfirmation.id)) return failure("analysis_job_not_found", 404);
    return { ok: true as const, confirmation: confirmation ? toSafePortionConfirmation(confirmation) : null };
  } catch { return failure("database_failure", 503, true); }
}

async function loadAuthoritativeRecords(clientId: string, jobId: string, dependencies: PortionConfirmationDependencies) {
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
  return { ok: true as const, job, foodConfirmation: { ...foodConfirmation, foods: foods.data } };
}

function constructAuthoritativePortions(submitted: PortionRequestList, foods: ConfirmedFoodList, randomId: () => string): ConfirmedPortionList | null {
  if (submitted.length !== foods.length) return null;
  const byFoodId = new Map(submitted.map((item) => [item.confirmedFoodItemId, item]));
  if (byFoodId.size !== foods.length) return null;
  const portions = foods.map((food) => {
    const item = byFoodId.get(food.id);
    return item ? { id: randomId(), confirmedFoodItemId: food.id, foodName: food.name, quantity: item.quantity, unit: item.unit, ...(item.size ? { size: item.size } : {}) } : null;
  });
  if (portions.some((portion) => portion === null)) return null;
  const parsed = confirmedPortionListSchema.safeParse(portions);
  return parsed.success ? parsed.data : null;
}

function compareExisting(existing: PortionConfirmationRecord, portions: ConfirmedPortionList): ConfirmPortionsResult {
  return comparablePortionList(existing.portions) === comparablePortionList(portions)
    ? { ok: true, confirmation: toSafePortionConfirmation(existing), duplicate: true }
    : failure("portion_confirmation_conflict", 409);
}

export function toSafePortionConfirmation(record: PortionConfirmationRecord): SafePortionConfirmation {
  return { confirmationId: record.id, jobId: record.analysis_job_id, status: "confirmed", portions: confirmedPortionListSchema.parse(record.portions), confirmedAt: record.confirmed_at };
}

function failure(code: PortionFailureCode, status: 401 | 403 | 404 | 409 | 422 | 503, retryable = false): ConfirmPortionsResult & { ok: false } {
  return { ok: false, status, code, retryable };
}
