import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatGrams, formatKcal, incompleteNutritionLabel } from "../lib/client/meal-nutrition-presentation.ts";
import { nutritionRequestSchema, safeMealNutritionResultSchema } from "../lib/meal-nutrition-contract.ts";
import { calculateMealNutrition, findCatalogueFood, normalizeNutritionFoodName, roundNutrition } from "../lib/server/meal-nutrition-engine.ts";
import { calculateAndPersistMealNutrition, getMealNutrition } from "../lib/server/meal-nutrition.ts";
import { NUTRITION_CATALOGUE_VERSION, NUTRITION_ENGINE_VERSION, STARTER_NUTRITION_CATALOGUE } from "../lib/server/nutrition-catalogue.ts";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const UPLOAD_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const RECOGNITION_ID = "55555555-5555-4555-8555-555555555555";
const FOOD_CONFIRMATION_ID = "66666666-6666-4666-8666-666666666666";
const PORTION_CONFIRMATION_ID = "77777777-7777-4777-8777-777777777777";
const RESULT_ID = "88888888-8888-4888-8888-888888888888";
const BANANA_PORTION_ID = "99999999-9999-4999-8999-999999999999";
const RICE_PORTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UNKNOWN_PORTION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2026-07-23T08:00:00.000Z");
const access = { allowed: true, userId: CLIENT_ID };
const bananaFood = { id: "food-banana", name: "Banana", source: "recognized", originalRecognitionItemId: "food-banana", category: "fruit" };
const riceFood = { id: "food-brown-rice", name: "Brown rice", source: "recognized", originalRecognitionItemId: "food-brown-rice", category: "grain" };
const unknownFood = { id: "food-sambar", name: "Sambar", source: "recognized", originalRecognitionItemId: "food-sambar", category: "curry" };
const bananaPortion = { id: BANANA_PORTION_ID, confirmedFoodItemId: bananaFood.id, foodName: bananaFood.name, quantity: 1, unit: "piece", size: "medium" };
const ricePortion = { id: RICE_PORTION_ID, confirmedFoodItemId: riceFood.id, foodName: riceFood.name, quantity: 1, unit: "cup", size: "standard" };
const unknownPortion = { id: UNKNOWN_PORTION_ID, confirmedFoodItemId: unknownFood.id, foodName: unknownFood.name, quantity: 1, unit: "katori", size: "standard" };
const migrationSql = readFileSync(new URL("../supabase/migrations/202607230001_meal_nutrition_results.sql", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../app/components/client/MealNutritionResult.tsx", import.meta.url), "utf8");
const providerSource = readFileSync(new URL("../lib/server/meal-recognition-provider.ts", import.meta.url), "utf8");

test("catalogue provenance and versions are explicit and reviewable", () => {
  assert.equal(NUTRITION_CATALOGUE_VERSION, "india-plant-starter-v1-2026-07-23");
  assert.equal(NUTRITION_ENGINE_VERSION, "deterministic-household-v1");
  assert.equal(STARTER_NUTRITION_CATALOGUE.foods.length, 40);
  assert.equal(STARTER_NUTRITION_CATALOGUE.foods.every((food) => /^FDC \d+$/.test(food.provenance.sourceIdentifier)), true);
});

test("exact canonical, normalized alias, whitespace, case, and approved alias matching are deterministic", () => {
  assert.equal(findCatalogueFood("banana raw", STARTER_NUTRITION_CATALOGUE)?.id, "usda-fdc-173944");
  assert.equal(findCatalogueFood("  BANANA  ", STARTER_NUTRITION_CATALOGUE)?.id, "usda-fdc-173944");
  assert.equal(findCatalogueFood("Cooked brown rice", STARTER_NUTRITION_CATALOGUE)?.id, "usda-fdc-169704");
  assert.equal(normalizeNutritionFoodName("  Brown—rice  "), "brown rice");
  assert.equal(findCatalogueFood("Banana", STARTER_NUTRITION_CATALOGUE), findCatalogueFood("Banana", STARTER_NUTRITION_CATALOGUE));
});

test("ambiguous and fuzzy names remain unresolved and different foods are not merged", () => {
  for (const name of ["Sambar", "Banan", "White rice", "Paratha", "Vegetable curry", "Juice"]) assert.equal(findCatalogueFood(name, STARTER_NUTRITION_CATALOGUE), null);
});

test("quantity, unit, quarter quantity, and configured size conversion are deterministic", () => {
  const one = calculateMealNutrition({ foods: [bananaFood], portions: [bananaPortion], catalogue: STARTER_NUTRITION_CATALOGUE });
  const quarter = calculateMealNutrition({ foods: [bananaFood], portions: [{ ...bananaPortion, quantity: 0.25 }], catalogue: STARTER_NUTRITION_CATALOGUE });
  const small = calculateMealNutrition({ foods: [bananaFood], portions: [{ ...bananaPortion, size: "small" }], catalogue: STARTER_NUTRITION_CATALOGUE });
  assert.equal(one.items[0].calculatedReferenceAmount, 118);
  assert.equal(quarter.items[0].calculatedReferenceAmount, 29.5);
  assert.equal(small.items[0].calculatedReferenceAmount, 101);
  assert.deepEqual(one, calculateMealNutrition({ foods: [bananaFood], portions: [bananaPortion], catalogue: STARTER_NUTRITION_CATALOGUE }));
});

test("unsupported food-unit and generic household measures remain unresolved", () => {
  const bowlBanana = calculateMealNutrition({ foods: [bananaFood], portions: [{ ...bananaPortion, unit: "bowl", size: "standard" }], catalogue: STARTER_NUTRITION_CATALOGUE });
  assert.equal(bowlBanana.items[0].mappingStatus, "unresolved");
  assert.equal(bowlBanana.items[0].unresolvedReason, "portion_not_supported");
  assert.equal(bowlBanana.totals, undefined);
});

test("authoritative food names and portion relationships cannot be changed", () => {
  assert.throws(() => calculateMealNutrition({ foods: [bananaFood], portions: [{ ...bananaPortion, foodName: "Brown rice" }], catalogue: STARTER_NUTRITION_CATALOGUE }));
  assert.throws(() => calculateMealNutrition({ foods: [bananaFood], portions: [{ ...bananaPortion, confirmedFoodItemId: riceFood.id }], catalogue: STARTER_NUTRITION_CATALOGUE }));
});

test("item nutrition, fibre, and meal totals use unrounded values before display rounding", () => {
  const result = calculateMealNutrition({ foods: [bananaFood, riceFood], portions: [bananaPortion, ricePortion], catalogue: STARTER_NUTRITION_CATALOGUE });
  assert.equal(result.status, "completed");
  assert.deepEqual(result.items[0].nutrition, { energyKcal: 105, proteinG: 1.3, carbohydratesG: 27, fatG: 0.4, fibreG: 3.1 });
  assert.deepEqual(result.totals, { energyKcal: 353, proteinG: 6.8, carbohydratesG: 78.6, fatG: 2.3, fibreG: 6.3 });
});

test("display rounding and negative-zero normalization follow policy", () => {
  assert.deepEqual(roundNutrition({ energyKcal: 100.49, proteinG: 1.25, carbohydratesG: 2.24, fatG: -0, fibreG: 0.05 }), { energyKcal: 100, proteinG: 1.3, carbohydratesG: 2.2, fatG: 0, fibreG: 0.1 });
  assert.equal(formatKcal(105.4), "105 kcal");
  assert.equal(formatGrams(3.14), "3.1 g");
  assert.equal(incompleteNutritionLabel(1), "1 food was not included in totals.");
});

test("non-finite catalogue calculations are rejected", () => {
  const unsafe = { version: "unsafe", foods: [{ ...STARTER_NUTRITION_CATALOGUE.foods[0], nutrientsPer100g: { ...STARTER_NUTRITION_CATALOGUE.foods[0].nutrientsPer100g, proteinG: Number.POSITIVE_INFINITY } }] };
  assert.throws(() => calculateMealNutrition({ foods: [bananaFood], portions: [bananaPortion], catalogue: unsafe }));
});

test("unknown foods are excluded and partial results are explicitly incomplete", () => {
  const result = calculateMealNutrition({ foods: [bananaFood, unknownFood], portions: [bananaPortion, unknownPortion], catalogue: STARTER_NUTRITION_CATALOGUE });
  assert.equal(result.status, "partial"); assert.equal(result.isComplete, false); assert.equal(result.resolvedItemCount, 1); assert.equal(result.unresolvedItemCount, 1);
  assert.equal(result.items[1].mappingStatus, "unresolved"); assert.equal(result.items[1].nutrition, undefined);
  assert.deepEqual(result.totals, result.items[0].nutrition);
});

test("fully unresolved meals do not fabricate zero totals", () => {
  const result = calculateMealNutrition({ foods: [unknownFood], portions: [unknownPortion], catalogue: STARTER_NUTRITION_CATALOGUE });
  assert.equal(result.status, "failed"); assert.equal(result.totals, undefined); assert.equal(result.resolvedItemCount, 0);
});

test("nutrition request accepts only an empty body and no browser nutrition values", () => {
  assert.equal(nutritionRequestSchema.safeParse({}).success, true);
  assert.equal(nutritionRequestSchema.safeParse({ totals: { energyKcal: 1 } }).success, false);
  assert.equal(nutritionRequestSchema.safeParse({ clientId: CLIENT_ID }).success, false);
});

test("authenticated owner can calculate and store nutrition once", async () => {
  const dependencies = createDependencies();
  const result = await calculateAndPersistMealNutrition(access, JOB_ID, dependencies);
  assert.equal(result.ok, true); assert.equal(result.result.status, "completed"); assert.equal(dependencies.createCalls, 1);
});

test("unauthenticated and expired clients are rejected", async () => {
  assert.equal((await calculateAndPersistMealNutrition({ allowed: false, status: 401, code: "authentication_required" }, JOB_ID, createDependencies())).code, "authentication_required");
  assert.equal((await calculateAndPersistMealNutrition({ allowed: false, status: 403, code: "client_access_expired" }, JOB_ID, createDependencies())).code, "client_access_expired");
});

test("another client's job and non-completed jobs are rejected", async () => {
  assert.equal((await calculateAndPersistMealNutrition(access, JOB_ID, createDependencies({ job: jobRecord({ client_id: OTHER_CLIENT_ID }) }))).code, "analysis_job_not_found");
  for (const status of ["queued", "processing", "failed"]) assert.equal((await calculateAndPersistMealNutrition(access, JOB_ID, createDependencies({ job: jobRecord({ status }) }))).code, "analysis_not_completed");
});

test("missing confirmations and broken ownership relationships are rejected", async () => {
  assert.equal((await calculateAndPersistMealNutrition(access, JOB_ID, createDependencies({ foodConfirmation: null }))).code, "food_confirmation_not_found");
  assert.equal((await calculateAndPersistMealNutrition(access, JOB_ID, createDependencies({ portionConfirmation: null }))).code, "portion_confirmation_not_found");
  assert.equal((await calculateAndPersistMealNutrition(access, JOB_ID, createDependencies({ recognition: recognitionRecord({ client_id: OTHER_CLIENT_ID }) }))).code, "food_confirmation_not_found");
  assert.equal((await calculateAndPersistMealNutrition(access, JOB_ID, createDependencies({ portionConfirmation: portionConfirmationRecord({ meal_upload_id: OTHER_CLIENT_ID }) }))).code, "portion_confirmation_not_found");
});

test("catalogue unavailability is retryable and calculation failure does not persist", async () => {
  const unavailable = createDependencies(); unavailable.loadCatalogue = async () => null;
  assert.deepEqual(await calculateAndPersistMealNutrition(access, JOB_ID, unavailable), { ok: false, status: 503, code: "nutrition_catalogue_unavailable", retryable: true });
  assert.equal(unavailable.createCalls, 0);
});

test("duplicate, reordered/concurrent requests are idempotent and historical result is not recalculated", async () => {
  const dependencies = createDependencies();
  const first = await calculateAndPersistMealNutrition(access, JOB_ID, dependencies);
  dependencies.portionConfirmation.portions.reverse();
  dependencies.loadCatalogue = async () => { throw new Error("new catalogue must not load"); };
  const second = await calculateAndPersistMealNutrition(access, JOB_ID, dependencies);
  assert.equal(first.ok, true); assert.equal(second.ok, true); assert.equal(second.duplicate, true); assert.equal(dependencies.createCalls, 1);
  assert.equal(second.result.catalogueVersion, NUTRITION_CATALOGUE_VERSION);
});

test("failed insert race returns the concurrently stored immutable result", async () => {
  const dependencies = createDependencies();
  const originalCreate = dependencies.createNutritionResult;
  dependencies.createNutritionResult = async function(record) { await originalCreate.call(this, record); return false; };
  const result = await calculateAndPersistMealNutrition(access, JOB_ID, dependencies);
  assert.equal(result.ok, true); assert.equal(result.duplicate, true); assert.equal(dependencies.createCalls, 1);
});

test("refresh restores saved nutrition and safe response hides catalogue provenance and ownership", async () => {
  const dependencies = createDependencies(); await calculateAndPersistMealNutrition(access, JOB_ID, dependencies);
  const restored = await getMealNutrition(access, JOB_ID, dependencies);
  assert.equal(restored.result.resultId, RESULT_ID);
  assert.equal(safeMealNutritionResultSchema.safeParse(restored.result).success, true);
  const serialized = JSON.stringify(restored.result);
  for (const forbidden of ["sourceName", "sourceReference", "client_id", "meal_upload_id", "vitamin", "mineral", "healthScore"]) assert.equal(serialized.includes(forbidden), false);
});

test("UI handles calculation, complete, partial, unresolved and safe next-step states", () => {
  for (const text of ["Calculating nutrition", "Meal nutrition", "Partial nutrition estimate", "Not included in totals", "Nutrition estimate unavailable", "MealSaveForm"]) assert.equal(componentSource.includes(text), true);
  assert.equal(componentSource.includes("Nutrition values are estimates based on the confirmed foods and household portions."), true);
  assert.doesNotMatch(componentSource, /health score|medical advice|diagnos|supplement/i);
  assert.match(componentSource, /triggerLocked\.current/);
  assert.equal(providerSource.includes("Do not estimate portions or calculate nutrition"), true);
});

test("migration enforces ownership, uniqueness, immutable server-only persistence and RLS", () => {
  assert.match(migrationSql, /foreign key \(portion_confirmation_id, food_confirmation_id, analysis_job_id, client_id, meal_upload_id\)/i);
  assert.match(migrationSql, /join public\.meal_recognition_results/i);
  assert.match(migrationSql, /unique \(portion_confirmation_id\)/i);
  assert.match(migrationSql, /before update or delete on public\.meal_nutrition_results/i);
  assert.match(migrationSql, /revoke all on public\.meal_nutrition_results from anon, authenticated/i);
  assert.doesNotMatch(migrationSql, /grant (insert|update|delete|all).*meal_nutrition_results to authenticated/i);
});

function jobRecord(overrides = {}) { return { id: JOB_ID, client_id: CLIENT_ID, meal_upload_id: UPLOAD_ID, status: "completed", attempt_count: 1, last_error_code: null, last_error_message: null, failure_retryable: false, created_at: NOW.toISOString(), started_at: NOW.toISOString(), completed_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...overrides }; }
function recognitionRecord(overrides = {}) { return { id: RECOGNITION_ID, analysis_job_id: JOB_ID, client_id: CLIENT_ID, meal_upload_id: UPLOAD_ID, ...overrides }; }
function foodConfirmationRecord(overrides = {}) { return { id: FOOD_CONFIRMATION_ID, analysis_job_id: JOB_ID, recognition_result_id: RECOGNITION_ID, meal_upload_id: UPLOAD_ID, client_id: CLIENT_ID, status: "confirmed", foods: [bananaFood, riceFood], confirmed_at: NOW.toISOString(), created_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...overrides }; }
function portionConfirmationRecord(overrides = {}) { return { id: PORTION_CONFIRMATION_ID, analysis_job_id: JOB_ID, food_confirmation_id: FOOD_CONFIRMATION_ID, meal_upload_id: UPLOAD_ID, client_id: CLIENT_ID, status: "confirmed", portions: [bananaPortion, ricePortion], confirmed_at: NOW.toISOString(), created_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...overrides }; }

function createDependencies(overrides = {}) {
  return {
    job: "job" in overrides ? overrides.job : jobRecord(), recognition: "recognition" in overrides ? overrides.recognition : recognitionRecord(),
    foodConfirmation: "foodConfirmation" in overrides ? overrides.foodConfirmation : foodConfirmationRecord(), portionConfirmation: "portionConfirmation" in overrides ? overrides.portionConfirmation : portionConfirmationRecord(),
    nutritionResult: overrides.nutritionResult ?? null, createCalls: 0, catalogueLoads: 0,
    async findJob(id) { return this.job?.id === id ? this.job : null; },
    async findRecognition(id) { return this.recognition?.analysis_job_id === id ? this.recognition : null; },
    async findFoodConfirmation(id) { return this.foodConfirmation?.analysis_job_id === id ? this.foodConfirmation : null; },
    async findPortionConfirmation(id) { return this.portionConfirmation?.analysis_job_id === id ? this.portionConfirmation : null; },
    async findNutritionResult(id) { return this.nutritionResult?.analysis_job_id === id ? this.nutritionResult : null; },
    async createNutritionResult(record) { this.createCalls += 1; if (this.nutritionResult) return false; this.nutritionResult = record; return true; },
    async loadCatalogue() { this.catalogueLoads += 1; return STARTER_NUTRITION_CATALOGUE; },
    engineVersion: NUTRITION_ENGINE_VERSION, randomId: () => RESULT_ID, now: () => NOW,
  };
}
