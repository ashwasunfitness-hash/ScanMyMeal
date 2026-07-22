import { confirmedFoodListSchema } from "#/lib/meal-food-confirmation-contract";
import { confirmedPortionListSchema } from "#/lib/meal-portion-confirmation-contract";
import type { FoodConfirmationForPortions, PortionConfirmationRecord } from "#/lib/server/meal-portion-confirmation";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Json, MealFoodConfirmationRow, MealPortionConfirmationRow } from "@/lib/supabase/database.types";

const FOOD_FIELDS = "id,analysis_job_id,recognition_result_id,meal_upload_id,client_id,status,foods,confirmed_at,created_at,updated_at";
const PORTION_FIELDS = "id,analysis_job_id,food_confirmation_id,meal_upload_id,client_id,status,portions,confirmed_at,created_at,updated_at";

export function createMealPortionConfirmationRepository(admin: ReturnType<typeof createAdminClient>) {
  return {
    async findJob(jobId: string) {
      const { data, error } = await admin.from("meal_analysis_jobs").select("*").eq("id", jobId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async findRecognition(jobId: string) {
      const { data, error } = await admin.from("meal_recognition_results").select("id,analysis_job_id,client_id,meal_upload_id").eq("analysis_job_id", jobId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async findFoodConfirmation(jobId: string): Promise<FoodConfirmationForPortions | null> {
      const { data, error } = await admin.from("meal_food_confirmations").select(FOOD_FIELDS).eq("analysis_job_id", jobId).maybeSingle();
      if (error) throw error;
      return data ? parseFoodConfirmation(data as MealFoodConfirmationRow) : null;
    },
    async findPortionConfirmation(jobId: string): Promise<PortionConfirmationRecord | null> {
      const { data, error } = await admin.from("meal_portion_confirmations").select(PORTION_FIELDS).eq("analysis_job_id", jobId).maybeSingle();
      if (error) throw error;
      return data ? parsePortionConfirmation(data as MealPortionConfirmationRow) : null;
    },
    async createPortionConfirmation(record: PortionConfirmationRecord) {
      const { error } = await admin.from("meal_portion_confirmations").insert({ ...record, portions: record.portions as unknown as Json });
      return !error;
    },
    randomId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
}

function parseFoodConfirmation(row: MealFoodConfirmationRow): FoodConfirmationForPortions { return { ...row, foods: confirmedFoodListSchema.parse(row.foods) }; }
function parsePortionConfirmation(row: MealPortionConfirmationRow): PortionConfirmationRecord { return { ...row, portions: confirmedPortionListSchema.parse(row.portions) }; }
