import { confirmedFoodListSchema } from "#/lib/meal-food-confirmation-contract";
import { confirmedPortionListSchema } from "#/lib/meal-portion-confirmation-contract";
import { nutritionResultItemsSchema, nutritionValuesSchema } from "#/lib/meal-nutrition-contract";
import type { FoodConfirmationForNutrition, NutritionResultRecord, PortionConfirmationForNutrition } from "#/lib/server/meal-nutrition";
import { NUTRITION_ENGINE_VERSION, STARTER_NUTRITION_CATALOGUE } from "#/lib/server/nutrition-catalogue";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Json, MealFoodConfirmationRow, MealNutritionResultRow, MealPortionConfirmationRow } from "@/lib/supabase/database.types";

const FOOD_FIELDS = "id,analysis_job_id,recognition_result_id,meal_upload_id,client_id,status,foods,confirmed_at,created_at,updated_at";
const PORTION_FIELDS = "id,analysis_job_id,food_confirmation_id,meal_upload_id,client_id,status,portions,confirmed_at,created_at,updated_at";
const NUTRITION_FIELDS = "id,analysis_job_id,portion_confirmation_id,food_confirmation_id,meal_upload_id,client_id,status,engine_version,catalogue_version,items,totals,is_complete,total_confirmed_food_count,resolved_item_count,unresolved_item_count,calculated_at,created_at,updated_at";

export function createMealNutritionRepository(admin: ReturnType<typeof createAdminClient>) {
  return {
    async findJob(jobId: string) { const { data, error } = await admin.from("meal_analysis_jobs").select("*").eq("id", jobId).maybeSingle(); if (error) throw error; return data; },
    async findRecognition(jobId: string) { const { data, error } = await admin.from("meal_recognition_results").select("id,analysis_job_id,client_id,meal_upload_id").eq("analysis_job_id", jobId).maybeSingle(); if (error) throw error; return data; },
    async findFoodConfirmation(jobId: string): Promise<FoodConfirmationForNutrition | null> { const { data, error } = await admin.from("meal_food_confirmations").select(FOOD_FIELDS).eq("analysis_job_id", jobId).maybeSingle(); if (error) throw error; return data ? parseFood(data as MealFoodConfirmationRow) : null; },
    async findPortionConfirmation(jobId: string): Promise<PortionConfirmationForNutrition | null> { const { data, error } = await admin.from("meal_portion_confirmations").select(PORTION_FIELDS).eq("analysis_job_id", jobId).maybeSingle(); if (error) throw error; return data ? parsePortion(data as MealPortionConfirmationRow) : null; },
    async findNutritionResult(jobId: string): Promise<NutritionResultRecord | null> { const { data, error } = await admin.from("meal_nutrition_results").select(NUTRITION_FIELDS).eq("analysis_job_id", jobId).maybeSingle(); if (error) throw error; return data ? parseNutrition(data as MealNutritionResultRow) : null; },
    async createNutritionResult(record: NutritionResultRecord) { const { error } = await admin.from("meal_nutrition_results").insert({ ...record, items: record.items as unknown as Json, totals: record.totals as unknown as Json }); return !error; },
    async loadCatalogue() { return STARTER_NUTRITION_CATALOGUE; },
    engineVersion: NUTRITION_ENGINE_VERSION,
    randomId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
}

function parseFood(row: MealFoodConfirmationRow): FoodConfirmationForNutrition { return { ...row, foods: confirmedFoodListSchema.parse(row.foods) }; }
function parsePortion(row: MealPortionConfirmationRow): PortionConfirmationForNutrition { return { ...row, portions: confirmedPortionListSchema.parse(row.portions) }; }
function parseNutrition(row: MealNutritionResultRow): NutritionResultRecord { return { ...row, items: nutritionResultItemsSchema.parse(row.items), totals: row.totals === null ? null : nutritionValuesSchema.parse(row.totals) }; }
