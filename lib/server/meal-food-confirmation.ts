import { confirmedFoodListSchema, comparableFoodList, type ConfirmedFoodList } from "#/lib/meal-food-confirmation-contract";
import { recognizedFoodSchema, type RecognizedFood } from "#/lib/meal-recognition-contract";
import { z } from "zod";
import type { UploadAccessResult } from "#/lib/server/meal-upload";
import type { MealAnalysisJobRow, MealFoodConfirmationRow, MealRecognitionResultRow } from "@/lib/supabase/database.types";

export type FoodConfirmationRecord = Omit<MealFoodConfirmationRow, "foods"> & { foods: ConfirmedFoodList };
export type RecognitionForConfirmation = Pick<MealRecognitionResultRow, "id" | "analysis_job_id" | "client_id" | "meal_upload_id" | "foods">;

export type FoodConfirmationDependencies = {
  findJob(jobId: string): Promise<MealAnalysisJobRow | null>;
  findRecognition(jobId: string): Promise<RecognitionForConfirmation | null>;
  findConfirmation(jobId: string): Promise<FoodConfirmationRecord | null>;
  createConfirmation(record: FoodConfirmationRecord): Promise<boolean>;
  randomId(): string;
  now(): Date;
};

export type SafeFoodConfirmation = { confirmationId: string; jobId: string; status: "confirmed"; foods: ConfirmedFoodList; confirmedAt: string };
export type ConfirmationFailureCode = "authentication_required" | "client_access_required" | "client_access_expired" | "analysis_job_not_found" | "analysis_not_completed" | "recognition_not_found" | "invalid_food_list" | "confirmation_conflict" | "database_failure";

export type ConfirmFoodResult =
  | { ok: true; confirmation: SafeFoodConfirmation; duplicate: boolean }
  | { ok: false; status: 401 | 403 | 404 | 409 | 422 | 503; code: ConfirmationFailureCode; retryable: boolean };

export async function confirmMealFoods(access: UploadAccessResult, jobId: string, rawFoods: unknown, dependencies: FoodConfirmationDependencies): Promise<ConfirmFoodResult> {
  if (!access.allowed) return { ok: false, status: access.status, code: access.code, retryable: false };
  const foods = confirmedFoodListSchema.safeParse(rawFoods);
  if (!foods.success) return failure("invalid_food_list", 422);

  let job: MealAnalysisJobRow | null;
  let recognition: RecognitionForConfirmation | null;
  try {
    job = await dependencies.findJob(jobId);
    if (!job || job.client_id !== access.userId) return failure("analysis_job_not_found", 404);
    if (job.status !== "completed") return failure("analysis_not_completed", 409);
    recognition = await dependencies.findRecognition(jobId);
  } catch { return failure("database_failure", 503, true); }

  if (!recognition || recognition.analysis_job_id !== job.id || recognition.client_id !== access.userId || recognition.meal_upload_id !== job.meal_upload_id) return failure("recognition_not_found", 404);
  const recognized = z.array(recognizedFoodSchema).max(15).safeParse(recognition.foods);
  if (!recognized.success || !recognizedReferencesAreValid(foods.data, recognized.data)) return failure("invalid_food_list", 422);

  try {
    const existing = await dependencies.findConfirmation(jobId);
    if (existing) return compareExisting(existing, foods.data);

    const timestamp = dependencies.now().toISOString();
    const record: FoodConfirmationRecord = {
      id: dependencies.randomId(), analysis_job_id: job.id, recognition_result_id: recognition.id,
      meal_upload_id: job.meal_upload_id, client_id: access.userId, status: "confirmed", foods: foods.data,
      confirmed_at: timestamp, created_at: timestamp, updated_at: timestamp,
    };
    if (await dependencies.createConfirmation(record)) return { ok: true, confirmation: toSafeFoodConfirmation(record), duplicate: false };
    const concurrent = await dependencies.findConfirmation(jobId);
    return concurrent ? compareExisting(concurrent, foods.data) : failure("database_failure", 503, true);
  } catch { return failure("database_failure", 503, true); }
}

export async function getMealFoodConfirmation(access: UploadAccessResult, jobId: string, dependencies: FoodConfirmationDependencies) {
  if (!access.allowed) return { ok: false as const, status: access.status, code: access.code, retryable: false };
  try {
    const job = await dependencies.findJob(jobId);
    if (!job || job.client_id !== access.userId) return failure("analysis_job_not_found", 404);
    const confirmation = await dependencies.findConfirmation(jobId);
    if (confirmation && (confirmation.client_id !== access.userId || confirmation.analysis_job_id !== job.id || confirmation.meal_upload_id !== job.meal_upload_id)) return failure("analysis_job_not_found", 404);
    return { ok: true as const, confirmation: confirmation ? toSafeFoodConfirmation(confirmation) : null };
  } catch { return failure("database_failure", 503, true); }
}

export function toSafeFoodConfirmation(record: FoodConfirmationRecord): SafeFoodConfirmation {
  return { confirmationId: record.id, jobId: record.analysis_job_id, status: "confirmed", foods: confirmedFoodListSchema.parse(record.foods), confirmedAt: record.confirmed_at };
}

function recognizedReferencesAreValid(foods: ConfirmedFoodList, recognitionFoods: RecognizedFood[]) {
  const recognizedIds = new Set(recognitionFoods.map((food) => food.id));
  return foods.every((food) => food.source === "user_added" || recognizedIds.has(food.originalRecognitionItemId));
}

function compareExisting(existing: FoodConfirmationRecord, foods: ConfirmedFoodList): ConfirmFoodResult {
  return comparableFoodList(existing.foods) === comparableFoodList(foods)
    ? { ok: true, confirmation: toSafeFoodConfirmation(existing), duplicate: true }
    : failure("confirmation_conflict", 409);
}

function failure(code: ConfirmationFailureCode, status: 401 | 403 | 404 | 409 | 422 | 503, retryable = false): ConfirmFoodResult & { ok: false } {
  return { ok: false, status, code, retryable };
}
