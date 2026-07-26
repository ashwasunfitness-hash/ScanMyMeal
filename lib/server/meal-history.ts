import { confirmedFoodListSchema } from "#/lib/meal-food-confirmation-contract";
import { mealHistoryDetailSchema, mealHistoryPageSchema, mealHistorySummarySchema, type MealHistoryDetail, type MealHistoryPage } from "#/lib/meal-history-contract";
import { nutritionResultItemsSchema, nutritionValuesSchema } from "#/lib/meal-nutrition-contract";
import { confirmedPortionListSchema } from "#/lib/meal-portion-confirmation-contract";
import type { UploadAccessResult } from "#/lib/server/meal-upload";
import type {
  MealFoodConfirmationRow,
  MealNutritionResultRow,
  MealPortionConfirmationRow,
  MealUploadRow,
  SavedMealRow,
} from "@/lib/supabase/database.types";

export const MEAL_HISTORY_PAGE_SIZE = 12;

export type MealHistoryCursor = { eatenAt: string; id: string };
export type MealHistoryRelated = {
  uploads: Map<string, MealUploadRow>;
  foods: Map<string, MealFoodConfirmationRow>;
  portions: Map<string, MealPortionConfirmationRow>;
  nutrition: Map<string, MealNutritionResultRow>;
};
export type MealHistoryDependencies = {
  listMeals(clientId: string, cursor: MealHistoryCursor | null, limit: number): Promise<SavedMealRow[]>;
  findMeal(clientId: string, mealId: string): Promise<SavedMealRow | null>;
  loadRelated(meals: SavedMealRow[]): Promise<MealHistoryRelated>;
};

export type MealHistoryFailureCode =
  | "authentication_required" | "client_access_required" | "client_access_expired"
  | "invalid_cursor" | "meal_not_found" | "history_data_invalid" | "database_failure";

export type MealHistoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 401 | 403 | 404 | 503; code: MealHistoryFailureCode; retryable: boolean };

export async function listMealHistory(
  access: UploadAccessResult,
  cursorValue: string | null,
  dependencies: MealHistoryDependencies,
): Promise<MealHistoryResult<MealHistoryPage>> {
  if (!access.allowed) return denied(access);
  const cursor = cursorValue ? decodeHistoryCursor(cursorValue) : null;
  if (cursorValue && !cursor) return failure("invalid_cursor", 400);
  let rows: SavedMealRow[];
  let related: MealHistoryRelated;
  try {
    rows = await dependencies.listMeals(access.userId, cursor, MEAL_HISTORY_PAGE_SIZE + 1);
    related = await dependencies.loadRelated(rows.slice(0, MEAL_HISTORY_PAGE_SIZE));
  } catch {
    return failure("database_failure", 503, true);
  }
  try {
    const visibleRows = rows.slice(0, MEAL_HISTORY_PAGE_SIZE);
    const meals = visibleRows.map((meal) => buildSummary(meal, related));
    const last = visibleRows.at(-1);
    const nextCursor = rows.length > MEAL_HISTORY_PAGE_SIZE && last
      ? encodeHistoryCursor({ eatenAt: last.eaten_at, id: last.id })
      : null;
    return { ok: true, value: mealHistoryPageSchema.parse({ meals, nextCursor }) };
  } catch {
    return failure("history_data_invalid", 503);
  }
}

export async function getMealHistoryDetail(
  access: UploadAccessResult,
  mealId: string,
  dependencies: MealHistoryDependencies,
): Promise<MealHistoryResult<MealHistoryDetail>> {
  if (!access.allowed) return denied(access);
  let meal: SavedMealRow | null;
  let related: MealHistoryRelated;
  try {
    meal = await dependencies.findMeal(access.userId, mealId);
    if (!meal || meal.client_id !== access.userId) return failure("meal_not_found", 404);
    related = await dependencies.loadRelated([meal]);
  } catch {
    return failure("database_failure", 503, true);
  }
  try {
    const summary = buildSummary(meal, related);
    const foodRecord = required(related.foods, meal.food_confirmation_id);
    const portionRecord = required(related.portions, meal.portion_confirmation_id);
    const nutritionRecord = required(related.nutrition, meal.nutrition_result_id);
    assertChain(meal, related);
    const confirmedFoods = confirmedFoodListSchema.parse(foodRecord.foods);
    const confirmedPortions = confirmedPortionListSchema.parse(portionRecord.portions);
    const nutritionItems = nutritionResultItemsSchema.parse(nutritionRecord.items);
    const portionsByFood = new Map(confirmedPortions.map((portion) => [portion.confirmedFoodItemId, portion]));
    const nutritionByFood = new Map(nutritionItems.map((item) => [item.confirmedFoodItemId, item]));
    const foods = confirmedFoods.map((food) => {
      const portion = portionsByFood.get(food.id);
      const nutrition = nutritionByFood.get(food.id);
      if (!portion || !nutrition || portion.foodName !== food.name || nutrition.portionItemId !== portion.id || nutrition.foodName !== food.name) throw new Error("Broken immutable history relationship");
      return nutrition.mappingStatus === "resolved"
        ? { id: food.id, name: food.name, quantity: portion.quantity, unit: portion.unit, ...(portion.size ? { size: portion.size } : {}), mappingStatus: "resolved" as const, nutrition: nutrition.nutrition }
        : { id: food.id, name: food.name, quantity: portion.quantity, unit: portion.unit, ...(portion.size ? { size: portion.size } : {}), mappingStatus: "unresolved" as const, unresolvedReason: nutrition.unresolvedReason };
    });
    return { ok: true, value: mealHistoryDetailSchema.parse({ ...summary, foods, imageEndpoint: `/api/meals/${meal.id}/image` }) };
  } catch {
    return failure("history_data_invalid", 503, false);
  }
}

export function encodeHistoryCursor(cursor: MealHistoryCursor) {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeHistoryCursor(value: string): MealHistoryCursor | null {
  try {
    if (!/^[A-Za-z0-9_-]{1,500}$/.test(value)) return null;
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const parsed: unknown = JSON.parse(atob(base64));
    if (!parsed || typeof parsed !== "object") return null;
    const eatenAt = (parsed as { eatenAt?: unknown }).eatenAt;
    const id = (parsed as { id?: unknown }).id;
    if (typeof eatenAt !== "string" || !Number.isFinite(Date.parse(eatenAt)) || typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) return null;
    return { eatenAt: new Date(eatenAt).toISOString(), id };
  } catch {
    return null;
  }
}

function buildSummary(meal: SavedMealRow, related: MealHistoryRelated) {
  assertChain(meal, related);
  const upload = required(related.uploads, meal.meal_upload_id);
  const nutrition = required(related.nutrition, meal.nutrition_result_id);
  return mealHistorySummarySchema.parse({
    id: meal.id,
    analysisJobId: meal.meal_analysis_job_id,
    mealType: meal.meal_type,
    eatenAt: meal.eaten_at,
    savedAt: meal.created_at,
    nutritionStatus: nutrition.status,
    foodCount: nutrition.total_confirmed_food_count,
    unresolvedFoodCount: nutrition.unresolved_item_count,
    totals: nutrition.totals === null ? null : nutritionValuesSchema.parse(nutrition.totals),
    hasImage: upload.upload_status === "uploaded" && Boolean(upload.storage_path),
  });
}

function assertChain(meal: SavedMealRow, related: MealHistoryRelated) {
  const upload = required(related.uploads, meal.meal_upload_id);
  const food = required(related.foods, meal.food_confirmation_id);
  const portion = required(related.portions, meal.portion_confirmation_id);
  const nutrition = required(related.nutrition, meal.nutrition_result_id);
  const consistent = upload.client_id === meal.client_id
    && food.client_id === meal.client_id && food.analysis_job_id === meal.meal_analysis_job_id && food.meal_upload_id === meal.meal_upload_id
    && portion.client_id === meal.client_id && portion.analysis_job_id === meal.meal_analysis_job_id && portion.meal_upload_id === meal.meal_upload_id && portion.food_confirmation_id === food.id
    && nutrition.client_id === meal.client_id && nutrition.analysis_job_id === meal.meal_analysis_job_id && nutrition.meal_upload_id === meal.meal_upload_id
    && nutrition.food_confirmation_id === food.id && nutrition.portion_confirmation_id === portion.id;
  if (!consistent) throw new Error("Broken saved meal chain");
}

function required<T>(records: Map<string, T>, id: string) {
  const value = records.get(id);
  if (!value) throw new Error("Missing history relationship");
  return value;
}

function denied(access: Exclude<UploadAccessResult, { allowed: true }>) {
  return { ok: false as const, status: access.status, code: access.code, retryable: false };
}

function failure(code: MealHistoryFailureCode, status: 400 | 404 | 503, retryable = false) {
  return { ok: false as const, status, code, retryable };
}
