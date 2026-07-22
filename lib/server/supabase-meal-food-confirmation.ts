import { confirmedFoodListSchema } from "#/lib/meal-food-confirmation-contract";
import type { FoodConfirmationRecord, RecognitionForConfirmation } from "#/lib/server/meal-food-confirmation";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Json, MealFoodConfirmationRow } from "@/lib/supabase/database.types";

const CONFIRMATION_FIELDS = "id,analysis_job_id,recognition_result_id,meal_upload_id,client_id,status,foods,confirmed_at,created_at,updated_at";

export function createMealFoodConfirmationRepository(admin: ReturnType<typeof createAdminClient>) {
  return {
    async findJob(jobId: string) {
      const { data, error } = await admin.from("meal_analysis_jobs").select("*").eq("id", jobId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async findRecognition(jobId: string): Promise<RecognitionForConfirmation | null> {
      const { data, error } = await admin.from("meal_recognition_results").select("id,analysis_job_id,client_id,meal_upload_id,foods").eq("analysis_job_id", jobId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async findConfirmation(jobId: string): Promise<FoodConfirmationRecord | null> {
      const { data, error } = await admin.from("meal_food_confirmations").select(CONFIRMATION_FIELDS).eq("analysis_job_id", jobId).maybeSingle();
      if (error) throw error;
      return data ? parseConfirmation(data as MealFoodConfirmationRow) : null;
    },
    async createConfirmation(record: FoodConfirmationRecord) {
      const { error } = await admin.from("meal_food_confirmations").insert({ ...record, foods: record.foods as unknown as Json });
      return !error;
    },
    randomId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
}

function parseConfirmation(row: MealFoodConfirmationRow): FoodConfirmationRecord {
  return { ...row, foods: confirmedFoodListSchema.parse(row.foods) };
}
