import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { saveMealRequestSchema, safeSavedMealSchema } from "../lib/meal-save-contract.ts";
import { getSavedMeal, saveMeal, validateEatenAt } from "../lib/server/meal-save.ts";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const UPLOAD_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const FOOD_ID = "55555555-5555-4555-8555-555555555555";
const PORTION_ID = "66666666-6666-4666-8666-666666666666";
const NUTRITION_ID = "77777777-7777-4777-8777-777777777777";
const MEAL_ID = "88888888-8888-4888-8888-888888888888";
const NOW = new Date("2026-07-24T08:00:00.000Z");
const EATEN_AT = "2026-07-24T07:30:00.000Z";
const access = { allowed: true, userId: CLIENT_ID };
const input = { analysisJobId: JOB_ID, mealType: "lunch", eatenAt: EATEN_AT };
const migrationSql = readFileSync(new URL("../supabase/migrations/202607240001_saved_meals.sql", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../app/components/client/MealSaveForm.tsx", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../app/api/meals/route.ts", import.meta.url), "utf8");

test("save request accepts only server-issued job, strict meal type, and ISO eaten time", () => {
  assert.equal(saveMealRequestSchema.safeParse(input).success, true);
  assert.equal(saveMealRequestSchema.safeParse({ ...input, mealType: "brunch" }).success, false);
  assert.equal(saveMealRequestSchema.safeParse({ ...input, eatenAt: "today" }).success, false);
  assert.equal(saveMealRequestSchema.safeParse({ ...input, calories: 100 }).success, false);
  for (const forbidden of ["nutrition", "foods", "portions", "clientId", "imagePath"]) {
    assert.equal(saveMealRequestSchema.safeParse({ ...input, [forbidden]: {} }).success, false);
  }
});

test("eaten time accepts clock skew and rejects invalid, future, and stale values", () => {
  assert.equal(validateEatenAt(EATEN_AT, NOW), EATEN_AT);
  assert.equal(validateEatenAt("2026-07-24T08:10:00.000Z", NOW), "2026-07-24T08:10:00.000Z");
  assert.equal(validateEatenAt("2026-07-24T08:10:00.001Z", NOW), null);
  assert.equal(validateEatenAt("2026-06-24T07:59:59.999Z", NOW), null);
  assert.equal(validateEatenAt("not-a-date", NOW), null);
});

test("authenticated active owner saves one authoritative meal chain", async () => {
  const dependencies = createDependencies();
  const result = await saveMeal(access, input, dependencies);
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.meal.mealId, MEAL_ID);
  assert.equal(safeSavedMealSchema.safeParse(result.meal).success, true);
  assert.equal(dependencies.createCalls, 1);
  assert.deepEqual(Object.keys(dependencies.savedMeal).sort(), [
    "client_id", "created_at", "eaten_at", "food_confirmation_id", "id", "meal_analysis_job_id",
    "meal_type", "meal_upload_id", "nutrition_result_id", "portion_confirmation_id",
  ]);
});

test("unauthenticated, wrong-role, and expired clients are rejected", async () => {
  for (const denied of [
    { allowed: false, status: 401, code: "authentication_required" },
    { allowed: false, status: 403, code: "client_access_required" },
    { allowed: false, status: 403, code: "client_access_expired" },
  ]) {
    const result = await saveMeal(denied, input, createDependencies());
    assert.equal(result.ok, false);
    assert.equal(result.code, denied.code);
  }
});

test("job must be owned, completed, and linked to an uploaded image", async () => {
  assert.equal((await saveMeal(access, input, createDependencies({ job: job({ client_id: OTHER_CLIENT_ID }) }))).code, "analysis_job_not_found");
  for (const status of ["queued", "processing", "failed"]) {
    assert.equal((await saveMeal(access, input, createDependencies({ job: job({ status }) }))).code, "analysis_not_completed");
  }
  assert.equal((await saveMeal(access, input, createDependencies({ upload: upload({ upload_status: "upload_failed" }) }))).code, "upload_not_completed");
});

test("broken confirmation and nutrition ownership chains are rejected", async () => {
  assert.equal((await saveMeal(access, input, createDependencies({ food: null }))).code, "food_confirmation_not_found");
  assert.equal((await saveMeal(access, input, createDependencies({ food: food({ client_id: OTHER_CLIENT_ID }) }))).code, "food_confirmation_not_found");
  assert.equal((await saveMeal(access, input, createDependencies({ portion: null }))).code, "portion_confirmation_not_found");
  assert.equal((await saveMeal(access, input, createDependencies({ portion: portion({ food_confirmation_id: OTHER_CLIENT_ID }) }))).code, "portion_confirmation_not_found");
  assert.equal((await saveMeal(access, input, createDependencies({ nutrition: null }))).code, "nutrition_result_not_found");
  assert.equal((await saveMeal(access, input, createDependencies({ nutrition: nutrition({ portion_confirmation_id: OTHER_CLIENT_ID }) }))).code, "nutrition_result_not_found");
});

test("complete, partial, and fully unresolved persisted nutrition are saveable", async () => {
  for (const status of ["completed", "partial", "failed"]) {
    const result = await saveMeal(access, input, createDependencies({ nutrition: nutrition({ status }) }));
    assert.equal(result.ok, true);
    assert.equal(result.meal.nutritionStatus, status);
  }
});

test("identical submissions are idempotent and changed submissions conflict", async () => {
  const dependencies = createDependencies();
  const first = await saveMeal(access, input, dependencies);
  const duplicate = await saveMeal(access, input, dependencies);
  const changed = await saveMeal(access, { ...input, mealType: "dinner" }, dependencies);
  assert.equal(first.ok, true);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(changed.ok, false);
  assert.equal(changed.code, "meal_already_saved");
  assert.equal(dependencies.createCalls, 1);
});

test("failed insert race restores the concurrent immutable meal", async () => {
  const dependencies = createDependencies();
  dependencies.createSavedMeal = async (record) => { dependencies.createCalls += 1; dependencies.savedMeal = record; return false; };
  const result = await saveMeal(access, input, dependencies);
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, true);
  assert.equal(dependencies.createCalls, 1);
});

test("database failures are retryable and do not fabricate success", async () => {
  const dependencies = createDependencies();
  dependencies.findSavedMeal = async () => { throw new Error("offline"); };
  const result = await saveMeal(access, input, dependencies);
  assert.deepEqual(result, { ok: false, status: 503, code: "database_failure", retryable: true });
});

test("refresh restores only a safe saved-meal response", async () => {
  const dependencies = createDependencies();
  await saveMeal(access, input, dependencies);
  const restored = await getSavedMeal(access, JOB_ID, dependencies);
  assert.equal(restored.ok, true);
  assert.equal(restored.meal.mealId, MEAL_ID);
  const serialized = JSON.stringify(restored.meal);
  for (const forbidden of ["client_id", "meal_upload_id", "nutrition_result_id", "totals", "items"]) assert.equal(serialized.includes(forbidden), false);
});

test("UI provides local time, duplicate guard, honest partial states, and accessible status", () => {
  for (const text of ["Save this meal", "When did you eat this?", "Meal saved", "Checking for a saved meal", "fully unresolved", "submissionLocked"]) {
    assert.equal(componentSource.includes(text), true);
  }
  assert.match(componentSource, /type="datetime-local"/);
  assert.match(componentSource, /aria-live="polite"/);
  assert.doesNotMatch(componentSource, /calories|protein|carbohydrates|fatG|fibreG/);
  const postSource = routeSource.slice(routeSource.indexOf("export async function POST"));
  assert.doesNotMatch(postSource, /mealAnalysisSchema|input\.data\.analysis|calories_kcal|meal_items/);
});

test("migration enforces the full chain, uniqueness, immutability, RLS, and server-only writes", () => {
  assert.match(migrationSql, /foreign key \(meal_upload_id, client_id\)/i);
  assert.match(migrationSql, /foreign key \(meal_analysis_job_id, client_id, meal_upload_id\)/i);
  assert.match(migrationSql, /foreign key \(food_confirmation_id, meal_analysis_job_id, client_id, meal_upload_id\)/i);
  assert.match(migrationSql, /foreign key \(portion_confirmation_id, food_confirmation_id, meal_analysis_job_id, client_id, meal_upload_id\)/i);
  assert.match(migrationSql, /foreign key \(nutrition_result_id, portion_confirmation_id, food_confirmation_id, meal_analysis_job_id, client_id, meal_upload_id\)/i);
  assert.match(migrationSql, /unique \(meal_analysis_job_id\)/i);
  assert.match(migrationSql, /before update or delete on public\.meals/i);
  assert.match(migrationSql, /public\.has_active_access\(new\.client_id\)/i);
  assert.match(migrationSql, /revoke all on public\.meals from anon, authenticated/i);
  assert.doesNotMatch(migrationSql, /grant (insert|update|delete|all).*public\.meals to authenticated/i);
});

function upload(overrides = {}) {
  return { id: UPLOAD_ID, client_id: CLIENT_ID, storage_path: `${CLIENT_ID}/meal.jpg`, upload_status: "uploaded", mime_type: "image/jpeg", file_size_bytes: 3, idempotency_key: "key", created_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...overrides };
}
function job(overrides = {}) {
  return { id: JOB_ID, client_id: CLIENT_ID, meal_upload_id: UPLOAD_ID, status: "completed", attempt_count: 1, last_error_code: null, last_error_message: null, failure_retryable: false, created_at: NOW.toISOString(), started_at: NOW.toISOString(), completed_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...overrides };
}
function food(overrides = {}) {
  return { id: FOOD_ID, analysis_job_id: JOB_ID, recognition_result_id: "99999999-9999-4999-8999-999999999999", meal_upload_id: UPLOAD_ID, client_id: CLIENT_ID, status: "confirmed", foods: [], confirmed_at: NOW.toISOString(), created_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...overrides };
}
function portion(overrides = {}) {
  return { id: PORTION_ID, analysis_job_id: JOB_ID, food_confirmation_id: FOOD_ID, meal_upload_id: UPLOAD_ID, client_id: CLIENT_ID, status: "confirmed", portions: [], confirmed_at: NOW.toISOString(), created_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...overrides };
}
function nutrition(overrides = {}) {
  return { id: NUTRITION_ID, analysis_job_id: JOB_ID, portion_confirmation_id: PORTION_ID, food_confirmation_id: FOOD_ID, meal_upload_id: UPLOAD_ID, client_id: CLIENT_ID, status: "completed", engine_version: "engine", catalogue_version: "catalogue", items: [], totals: {}, is_complete: true, total_confirmed_food_count: 1, resolved_item_count: 1, unresolved_item_count: 0, calculated_at: NOW.toISOString(), created_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...overrides };
}
function createDependencies(overrides = {}) {
  return {
    upload: "upload" in overrides ? overrides.upload : upload(),
    job: "job" in overrides ? overrides.job : job(),
    food: "food" in overrides ? overrides.food : food(),
    portion: "portion" in overrides ? overrides.portion : portion(),
    nutrition: "nutrition" in overrides ? overrides.nutrition : nutrition(),
    savedMeal: overrides.savedMeal ?? null,
    createCalls: 0,
    async findUpload(id) { return this.upload?.id === id ? this.upload : null; },
    async findJob(id) { return this.job?.id === id ? this.job : null; },
    async findFoodConfirmation(id) { return this.food?.analysis_job_id === id ? this.food : null; },
    async findPortionConfirmation(id) { return this.portion?.analysis_job_id === id ? this.portion : null; },
    async findNutritionResult(id) { return this.nutrition?.analysis_job_id === id ? this.nutrition : null; },
    async findSavedMeal(id) { return this.savedMeal?.meal_analysis_job_id === id ? this.savedMeal : null; },
    async createSavedMeal(record) { this.createCalls += 1; if (this.savedMeal) return false; this.savedMeal = record; return true; },
    randomId: () => MEAL_ID,
    now: () => NOW,
  };
}
