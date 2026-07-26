import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mealHistoryDetailSchema, mealHistoryPageSchema } from "../lib/meal-history-contract.ts";
import { decodeHistoryCursor, encodeHistoryCursor, getMealHistoryDetail, listMealHistory, MEAL_HISTORY_PAGE_SIZE } from "../lib/server/meal-history.ts";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const MEAL_ID = "33333333-3333-4333-8333-333333333333";
const UPLOAD_ID = "44444444-4444-4444-8444-444444444444";
const JOB_ID = "55555555-5555-4555-8555-555555555555";
const FOOD_CONFIRMATION_ID = "66666666-6666-4666-8666-666666666666";
const PORTION_CONFIRMATION_ID = "77777777-7777-4777-8777-777777777777";
const NUTRITION_ID = "88888888-8888-4888-8888-888888888888";
const BANANA_PORTION_ID = "99999999-9999-4999-8999-999999999999";
const SAMBAR_PORTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BANANA_NUTRITION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SAMBAR_NUTRITION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EATEN_AT = "2026-07-24T07:30:00.000Z";
const access = { allowed: true, userId: CLIENT_ID };
const listSource = readFileSync(new URL("../app/components/client/MealHistoryList.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../app/components/client/MealHistoryDetail.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../app/api/meals/route.ts", import.meta.url), "utf8");
const detailApiSource = readFileSync(new URL("../app/api/meals/[id]/route.ts", import.meta.url), "utf8");
const imageApiSource = readFileSync(new URL("../app/api/meals/[id]/image/route.ts", import.meta.url), "utf8");

test("history list is authenticated and always derives ownership from access", async () => {
  const dependencies = createDependencies();
  const result = await listMealHistory(access, null, dependencies);
  assert.equal(result.ok, true);
  assert.equal(dependencies.requestedClientId, CLIENT_ID);
  for (const denied of [
    { allowed: false, status: 401, code: "authentication_required" },
    { allowed: false, status: 403, code: "client_access_expired" },
  ]) {
    const rejected = await listMealHistory(denied, null, createDependencies());
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, denied.code);
  }
});

test("history summary uses only immutable saved nutrition and safe fields", async () => {
  const result = await listMealHistory(access, null, createDependencies());
  assert.equal(result.ok, true);
  assert.equal(mealHistoryPageSchema.safeParse(result.value).success, true);
  assert.deepEqual(result.value.meals[0], {
    id: MEAL_ID,
    analysisJobId: JOB_ID,
    mealType: "lunch",
    eatenAt: EATEN_AT,
    savedAt: "2026-07-24T07:35:00.000Z",
    nutritionStatus: "partial",
    foodCount: 2,
    unresolvedFoodCount: 1,
    totals: { energyKcal: 105, proteinG: 1.3, carbohydratesG: 27, fatG: 0.4, fibreG: 3.1 },
    hasImage: true,
  });
  const serialized = JSON.stringify(result.value);
  for (const forbidden of ["client_id", "storage_path", "food_confirmation_id", "catalogue_version", "engine_version"]) assert.equal(serialized.includes(forbidden), false);
});

test("cursor is opaque, validated, and pagination returns a stable next cursor", async () => {
  const cursor = { eatenAt: EATEN_AT, id: MEAL_ID };
  assert.deepEqual(decodeHistoryCursor(encodeHistoryCursor(cursor)), cursor);
  for (const invalid of ["", "not-json", "***", encodeHistoryCursor({ eatenAt: "invalid", id: MEAL_ID })]) assert.equal(decodeHistoryCursor(invalid), null);
  const rows = Array.from({ length: MEAL_HISTORY_PAGE_SIZE + 1 }, (_, index) => savedMeal({ id: uuidFor(index + 20), eaten_at: new Date(Date.parse(EATEN_AT) - index * 60_000).toISOString() }));
  const result = await listMealHistory(access, null, createDependencies({ meals: rows }));
  assert.equal(result.ok, true);
  assert.equal(result.value.meals.length, MEAL_HISTORY_PAGE_SIZE);
  assert.ok(result.value.nextCursor);
});

test("invalid cursor fails without querying history", async () => {
  const dependencies = createDependencies();
  const result = await listMealHistory(access, "unsafe***", dependencies);
  assert.deepEqual(result, { ok: false, status: 400, code: "invalid_cursor", retryable: false });
  assert.equal(dependencies.listCalls, 0);
});

test("detail exposes confirmed foods, portions and persisted resolved and unresolved nutrition", async () => {
  const result = await getMealHistoryDetail(access, MEAL_ID, createDependencies());
  assert.equal(result.ok, true);
  assert.equal(mealHistoryDetailSchema.safeParse(result.value).success, true);
  assert.equal(result.value.foods[0].name, "Banana");
  assert.equal(result.value.foods[0].quantity, 1);
  assert.equal(result.value.foods[0].nutrition.energyKcal, 105);
  assert.deepEqual(result.value.foods[1], {
    id: "food-sambar", name: "Sambar", quantity: 1, unit: "katori", size: "standard",
    mappingStatus: "unresolved", unresolvedReason: "food_not_mapped",
  });
  assert.equal(result.value.imageEndpoint, `/api/meals/${MEAL_ID}/image`);
});

test("detail rejects another client and broken immutable relationships", async () => {
  const other = await getMealHistoryDetail(access, MEAL_ID, createDependencies({ meal: savedMeal({ client_id: OTHER_CLIENT_ID }) }));
  assert.equal(other.ok, false);
  assert.equal(other.code, "meal_not_found");
  const broken = await getMealHistoryDetail(access, MEAL_ID, createDependencies({ portion: portionRecord({ food_confirmation_id: OTHER_CLIENT_ID }) }));
  assert.deepEqual(broken, { ok: false, status: 503, code: "history_data_invalid", retryable: false });
});

test("database failures are retryable without exposing internals", async () => {
  const listDependencies = createDependencies();
  listDependencies.listMeals = async () => { throw new Error("database details"); };
  assert.deepEqual(await listMealHistory(access, null, listDependencies), { ok: false, status: 503, code: "database_failure", retryable: true });
  const detailDependencies = createDependencies();
  detailDependencies.findMeal = async () => { throw new Error("database details"); };
  assert.deepEqual(await getMealHistoryDetail(access, MEAL_ID, detailDependencies), { ok: false, status: 503, code: "database_failure", retryable: true });
});

test("failed persisted nutrition remains honest and is never recalculated", async () => {
  const failedNutrition = nutritionRecord({
    status: "failed", totals: null, is_complete: false, resolved_item_count: 0, unresolved_item_count: 2,
    items: [
      { id: BANANA_NUTRITION_ID, confirmedFoodItemId: "food-banana", portionItemId: BANANA_PORTION_ID, foodName: "Banana", quantity: 1, unit: "piece", size: "medium", mappingStatus: "unresolved", unresolvedReason: "food_not_mapped" },
      { id: SAMBAR_NUTRITION_ID, confirmedFoodItemId: "food-sambar", portionItemId: SAMBAR_PORTION_ID, foodName: "Sambar", quantity: 1, unit: "katori", size: "standard", mappingStatus: "unresolved", unresolvedReason: "food_not_mapped" },
    ],
  });
  const result = await getMealHistoryDetail(access, MEAL_ID, createDependencies({ nutrition: failedNutrition }));
  assert.equal(result.ok, true);
  assert.equal(result.value.nutritionStatus, "failed");
  assert.equal(result.value.totals, null);
  assert.equal(result.value.foods.every((food) => food.mappingStatus === "unresolved"), true);
});

test("UI includes grouped dates, list pagination, detail image, and safe states", () => {
  for (const text of ["Loading your meals", "No saved meals yet", "Meal history is unavailable", "Load more meals", "groupMealsByDate"]) assert.equal(listSource.includes(text), true);
  for (const text of ["Original meal photo", "Persisted nutrition estimate", "Confirmed foods and portions", "not been recalculated", "Saved meals are read-only"]) assert.equal(detailSource.includes(text), true);
  assert.doesNotMatch(`${listSource}${detailSource}`, /\b(edit|delete|health score|recommendation)\b/i);
});

test("history and image APIs use new meals and never legacy meal_entries", () => {
  assert.match(apiSource, /listMealHistory/);
  assert.match(detailApiSource, /getMealHistoryDetail/);
  assert.match(imageApiSource, /from\("meals"\)/);
  assert.match(imageApiSource, /\.eq\("client_id", access\.userId\)/);
  for (const source of [apiSource, detailApiSource, imageApiSource]) {
    assert.doesNotMatch(source, /meal_entries|STARTER_NUTRITION_CATALOGUE|calculateMealNutrition|clientId.*searchParams/i);
  }
});

function savedMeal(overrides = {}) {
  return { id: MEAL_ID, client_id: CLIENT_ID, meal_upload_id: UPLOAD_ID, meal_analysis_job_id: JOB_ID, food_confirmation_id: FOOD_CONFIRMATION_ID, portion_confirmation_id: PORTION_CONFIRMATION_ID, nutrition_result_id: NUTRITION_ID, meal_type: "lunch", eaten_at: EATEN_AT, created_at: "2026-07-24T07:35:00.000Z", ...overrides };
}
function uploadRecord(overrides = {}) {
  return { id: UPLOAD_ID, client_id: CLIENT_ID, storage_path: `${CLIENT_ID}/2026/07/photo.jpg`, upload_status: "uploaded", mime_type: "image/jpeg", file_size_bytes: 100, idempotency_key: "key", created_at: EATEN_AT, updated_at: EATEN_AT, ...overrides };
}
function foodRecord(overrides = {}) {
  return { id: FOOD_CONFIRMATION_ID, analysis_job_id: JOB_ID, recognition_result_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", meal_upload_id: UPLOAD_ID, client_id: CLIENT_ID, status: "confirmed", foods: [
    { id: "food-banana", name: "Banana", source: "recognized", originalRecognitionItemId: "food-banana", category: "fruit" },
    { id: "food-sambar", name: "Sambar", source: "recognized", originalRecognitionItemId: "food-sambar", category: "curry" },
  ], confirmed_at: EATEN_AT, created_at: EATEN_AT, updated_at: EATEN_AT, ...overrides };
}
function portionRecord(overrides = {}) {
  return { id: PORTION_CONFIRMATION_ID, analysis_job_id: JOB_ID, food_confirmation_id: FOOD_CONFIRMATION_ID, meal_upload_id: UPLOAD_ID, client_id: CLIENT_ID, status: "confirmed", portions: [
    { id: BANANA_PORTION_ID, confirmedFoodItemId: "food-banana", foodName: "Banana", quantity: 1, unit: "piece", size: "medium" },
    { id: SAMBAR_PORTION_ID, confirmedFoodItemId: "food-sambar", foodName: "Sambar", quantity: 1, unit: "katori", size: "standard" },
  ], confirmed_at: EATEN_AT, created_at: EATEN_AT, updated_at: EATEN_AT, ...overrides };
}
function nutritionRecord(overrides = {}) {
  return { id: NUTRITION_ID, analysis_job_id: JOB_ID, portion_confirmation_id: PORTION_CONFIRMATION_ID, food_confirmation_id: FOOD_CONFIRMATION_ID, meal_upload_id: UPLOAD_ID, client_id: CLIENT_ID, status: "partial", engine_version: "engine-v1", catalogue_version: "catalogue-v1", items: [
    { id: BANANA_NUTRITION_ID, confirmedFoodItemId: "food-banana", portionItemId: BANANA_PORTION_ID, foodName: "Banana", quantity: 1, unit: "piece", size: "medium", mappingStatus: "resolved", catalogueFoodId: "banana", canonicalFoodName: "Banana raw", referenceMultiplier: 1.18, calculatedReferenceAmount: 118, nutrition: { energyKcal: 105, proteinG: 1.3, carbohydratesG: 27, fatG: 0.4, fibreG: 3.1 } },
    { id: SAMBAR_NUTRITION_ID, confirmedFoodItemId: "food-sambar", portionItemId: SAMBAR_PORTION_ID, foodName: "Sambar", quantity: 1, unit: "katori", size: "standard", mappingStatus: "unresolved", unresolvedReason: "food_not_mapped" },
  ], totals: { energyKcal: 105, proteinG: 1.3, carbohydratesG: 27, fatG: 0.4, fibreG: 3.1 }, is_complete: false, total_confirmed_food_count: 2, resolved_item_count: 1, unresolved_item_count: 1, calculated_at: EATEN_AT, created_at: EATEN_AT, updated_at: EATEN_AT, ...overrides };
}

function createDependencies(overrides = {}) {
  const meal = "meal" in overrides ? overrides.meal : savedMeal();
  const meals = overrides.meals ?? (meal ? [meal] : []);
  const upload = overrides.upload ?? uploadRecord();
  const food = overrides.food ?? foodRecord();
  const portion = overrides.portion ?? portionRecord();
  const nutrition = overrides.nutrition ?? nutritionRecord();
  return {
    requestedClientId: null,
    listCalls: 0,
    async listMeals(clientId, _cursor, limit) { this.requestedClientId = clientId; this.listCalls += 1; return meals.filter((item) => item.client_id === clientId).slice(0, limit); },
    async findMeal(clientId, id) { this.requestedClientId = clientId; return meal?.id === id && meal.client_id === clientId ? meal : null; },
    async loadRelated(sourceMeals) {
      return {
        uploads: new Map(sourceMeals.map((item) => [item.meal_upload_id, upload])),
        foods: new Map(sourceMeals.map((item) => [item.food_confirmation_id, food])),
        portions: new Map(sourceMeals.map((item) => [item.portion_confirmation_id, portion])),
        nutrition: new Map(sourceMeals.map((item) => [item.nutrition_result_id, nutrition])),
      };
    },
  };
}

function uuidFor(value) {
  return `${value.toString(16).padStart(8, "0")}-1111-4111-8111-${value.toString(16).padStart(12, "0")}`;
}
