import type { MealSaveDependencies } from "#/lib/server/meal-save";
import type { MealHistoryCursor, MealHistoryDependencies } from "#/lib/server/meal-history";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { MealFoodConfirmationRow, MealNutritionResultRow, MealPortionConfirmationRow, MealUploadRow } from "@/lib/supabase/database.types";

export function createMealSaveRepository(admin: ReturnType<typeof createAdminClient>): MealSaveDependencies {
  return {
    async findUpload(uploadId) {
      const { data, error } = await admin.from("meal_uploads").select("*").eq("id", uploadId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async findJob(jobId) {
      const { data, error } = await admin.from("meal_analysis_jobs").select("*").eq("id", jobId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async findFoodConfirmation(jobId) {
      const { data, error } = await admin.from("meal_food_confirmations").select("*").eq("analysis_job_id", jobId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async findPortionConfirmation(jobId) {
      const { data, error } = await admin.from("meal_portion_confirmations").select("*").eq("analysis_job_id", jobId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async findNutritionResult(jobId) {
      const { data, error } = await admin.from("meal_nutrition_results").select("*").eq("analysis_job_id", jobId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async findSavedMeal(jobId) {
      const { data, error } = await admin.from("meals").select("*").eq("meal_analysis_job_id", jobId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async createSavedMeal(record) {
      const { error } = await admin.from("meals").insert(record);
      return !error;
    },
    randomId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
}

export function createMealHistoryRepository(admin: ReturnType<typeof createAdminClient>): MealHistoryDependencies {
  return {
    async listMeals(clientId, cursor, limit) {
      let query = admin.from("meals").select("*").eq("client_id", clientId)
        .order("eaten_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
      if (cursor) query = applyHistoryCursor(query, cursor);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    async findMeal(clientId, mealId) {
      const { data, error } = await admin.from("meals").select("*").eq("client_id", clientId).eq("id", mealId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async loadRelated(meals) {
      if (meals.length === 0) return { uploads: new Map(), foods: new Map(), portions: new Map(), nutrition: new Map() };
      const [uploads, foods, portions, nutrition] = await Promise.all([
        selectByIds<MealUploadRow>(admin, "meal_uploads", meals.map((meal) => meal.meal_upload_id)),
        selectByIds<MealFoodConfirmationRow>(admin, "meal_food_confirmations", meals.map((meal) => meal.food_confirmation_id)),
        selectByIds<MealPortionConfirmationRow>(admin, "meal_portion_confirmations", meals.map((meal) => meal.portion_confirmation_id)),
        selectByIds<MealNutritionResultRow>(admin, "meal_nutrition_results", meals.map((meal) => meal.nutrition_result_id)),
      ]);
      return { uploads: indexById(uploads), foods: indexById(foods), portions: indexById(portions), nutrition: indexById(nutrition) };
    },
  };
}

function applyHistoryCursor<T extends { or(filter: string): T }>(query: T, cursor: MealHistoryCursor) {
  return query.or(`eaten_at.lt.${cursor.eatenAt},and(eaten_at.eq.${cursor.eatenAt},id.lt.${cursor.id})`);
}

async function selectByIds<T extends { id: string }>(
  admin: ReturnType<typeof createAdminClient>,
  table: "meal_uploads" | "meal_food_confirmations" | "meal_portion_confirmations" | "meal_nutrition_results",
  ids: string[],
) {
  const { data, error } = await admin.from(table).select("*").in("id", [...new Set(ids)]);
  if (error) throw error;
  return data as unknown as T[];
}

function indexById<T extends { id: string }>(records: T[]) {
  return new Map(records.map((record) => [record.id, record]));
}
