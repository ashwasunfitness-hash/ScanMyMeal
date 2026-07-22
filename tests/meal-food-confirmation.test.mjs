import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { addDraftFood, canSubmitFoodConfirmation, createFoodConfirmationDraft, removeDraftFood, renameDraftFood } from "../lib/client/meal-food-confirmation.ts";
import { confirmedFoodListSchema, foodConfirmationRequestSchema } from "../lib/meal-food-confirmation-contract.ts";
import { confirmMealFoods, getMealFoodConfirmation } from "../lib/server/meal-food-confirmation.ts";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const UPLOAD_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const RESULT_ID = "55555555-5555-4555-8555-555555555555";
const CONFIRMATION_ID = "66666666-6666-4666-8666-666666666666";
const USER_FOOD_ID = "user-77777777-7777-4777-8777-777777777777";
const NOW = new Date("2026-07-22T08:00:00.000Z");
const access = { allowed: true, userId: CLIENT_ID };
const migrationSql = readFileSync(new URL("../supabase/migrations/202607220001_meal_food_confirmations.sql", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../app/components/client/FoodConfirmation.tsx", import.meta.url), "utf8");

const recognizedFoods = [
  { id: "food-1-mixed-curry", name: "Mixed curry", confidence: "medium", category: "curry" },
  { id: "food-2-flatbread", name: "Flatbread", confidence: "high", category: "bread" },
];

test("recognized foods populate the initial editable draft", () => {
  const draft = createFoodConfirmationDraft(recognizedFoods);
  assert.deepEqual(draft[0], { id: "food-1-mixed-curry", name: "Mixed curry", source: "recognized", originalRecognitionItemId: "food-1-mixed-curry", category: "curry" });
});

test("recognized item rename preserves stable and original recognition IDs", () => {
  const renamed = renameDraftFood(createFoodConfirmationDraft(recognizedFoods), "food-1-mixed-curry", "Beans palya")[0];
  assert.equal(renamed.id, "food-1-mixed-curry");
  assert.equal(renamed.originalRecognitionItemId, "food-1-mixed-curry");
  assert.equal(renamed.name, "Beans palya");
});

test("removing a recognized food updates the draft", () => {
  assert.deepEqual(removeDraftFood(createFoodConfirmationDraft(recognizedFoods), "food-2-flatbread").map((food) => food.id), ["food-1-mixed-curry"]);
});

test("user can add a missing food with a safe stable ID", () => {
  const result = addDraftFood(createFoodConfirmationDraft(recognizedFoods), "  coconut   chutney ", USER_FOOD_ID);
  assert.equal(result.ok, true);
  assert.deepEqual(result.foods.at(-1), { id: USER_FOOD_ID, name: "Coconut chutney", source: "user_added" });
});

test("empty names and duplicate normalized names are rejected", () => {
  assert.equal(addDraftFood([], "   ", USER_FOOD_ID).ok, false);
  assert.equal(addDraftFood(createFoodConfirmationDraft(recognizedFoods), " mixed   CURRY ", USER_FOOD_ID).ok, false);
});

test("maximum 20 foods is enforced", () => {
  const foods = Array.from({ length: 21 }, (_, index) => ({ id: `user-00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, name: `Food ${index}`, source: "user_added" }));
  assert.equal(confirmedFoodListSchema.safeParse(foods).success, false);
});

test("nutrition, portion, and unexpected fields are rejected", () => {
  const unsafe = { id: USER_FOOD_ID, name: "Dal", source: "user_added", calories: 200, grams: 100, portion: "one bowl" };
  assert.equal(confirmedFoodListSchema.safeParse([unsafe]).success, false);
  assert.equal(foodConfirmationRequestSchema.safeParse({ foods: [{ id: USER_FOOD_ID, name: "Dal", source: "user_added" }], clientId: CLIENT_ID }).success, false);
});

test("HTML and script-like food names are rejected and never rendered as HTML", () => {
  assert.equal(confirmedFoodListSchema.safeParse([{ id: USER_FOOD_ID, name: "<script>alert(1)</script>", source: "user_added" }]).success, false);
  assert.equal(componentSource.includes("dangerouslySetInnerHTML"), false);
});

test("client submission guard prevents duplicate rapid submissions", () => {
  const foods = createFoodConfirmationDraft(recognizedFoods);
  assert.equal(canSubmitFoodConfirmation(foods, false, false), true);
  assert.equal(canSubmitFoodConfirmation(foods, true, false), false);
  assert.equal(canSubmitFoodConfirmation(foods, false, true), false);
});

test("owner can confirm foods for a completed job exactly once", async () => {
  const dependencies = createDependencies();
  const result = await confirmMealFoods(access, JOB_ID, createFoodConfirmationDraft(recognizedFoods), dependencies);
  assert.equal(result.ok, true);
  assert.equal(result.confirmation.status, "confirmed");
  assert.equal(dependencies.createCalls, 1);
});

test("unauthenticated and expired clients are rejected", async () => {
  assert.deepEqual(await confirmMealFoods({ allowed: false, status: 401, code: "authentication_required" }, JOB_ID, [], createDependencies()), { ok: false, status: 401, code: "authentication_required", retryable: false });
  assert.deepEqual(await confirmMealFoods({ allowed: false, status: 403, code: "client_access_expired" }, JOB_ID, [], createDependencies()), { ok: false, status: 403, code: "client_access_expired", retryable: false });
});

test("client cannot confirm another client's job", async () => {
  const result = await confirmMealFoods(access, JOB_ID, createFoodConfirmationDraft(recognizedFoods), createDependencies({ job: jobRecord({ client_id: OTHER_CLIENT_ID }) }));
  assert.deepEqual(result, { ok: false, status: 404, code: "analysis_job_not_found", retryable: false });
});

for (const status of ["queued", "processing", "failed"]) {
  test(`${status} job cannot be confirmed`, async () => {
    const result = await confirmMealFoods(access, JOB_ID, createFoodConfirmationDraft(recognizedFoods), createDependencies({ job: jobRecord({ status }) }));
    assert.deepEqual(result, { ok: false, status: 409, code: "analysis_not_completed", retryable: false });
  });
}

test("recognition result ownership and job relationships are verified", async () => {
  const wrongOwner = createDependencies({ recognition: recognitionRecord({ client_id: OTHER_CLIENT_ID }) });
  assert.deepEqual(await confirmMealFoods(access, JOB_ID, createFoodConfirmationDraft(recognizedFoods), wrongOwner), { ok: false, status: 404, code: "recognition_not_found", retryable: false });
  const wrongUpload = createDependencies({ recognition: recognitionRecord({ meal_upload_id: OTHER_CLIENT_ID }) });
  assert.deepEqual(await confirmMealFoods(access, JOB_ID, createFoodConfirmationDraft(recognizedFoods), wrongUpload), { ok: false, status: 404, code: "recognition_not_found", retryable: false });
});

test("recognized submissions must reference the persisted recognition item", async () => {
  const foods = [{ id: "food-not-real", name: "Rice", source: "recognized", originalRecognitionItemId: "food-not-real" }];
  assert.deepEqual(await confirmMealFoods(access, JOB_ID, foods, createDependencies()), { ok: false, status: 422, code: "invalid_food_list", retryable: false });
});

test("identical repeated submission is idempotent and order-insensitive", async () => {
  const dependencies = createDependencies();
  const foods = createFoodConfirmationDraft(recognizedFoods);
  const first = await confirmMealFoods(access, JOB_ID, foods, dependencies);
  const second = await confirmMealFoods(access, JOB_ID, [...foods].reverse(), dependencies);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(dependencies.createCalls, 1);
});

test("different repeated submission conflicts and confirmed list cannot be edited", async () => {
  const dependencies = createDependencies();
  await confirmMealFoods(access, JOB_ID, createFoodConfirmationDraft(recognizedFoods), dependencies);
  const changed = renameDraftFood(createFoodConfirmationDraft(recognizedFoods), "food-1-mixed-curry", "Beans palya");
  assert.deepEqual(await confirmMealFoods(access, JOB_ID, changed, dependencies), { ok: false, status: 409, code: "confirmation_conflict", retryable: false });
  assert.equal(dependencies.createCalls, 1);
});

test("empty AI result can be manually populated and confirmed", async () => {
  const dependencies = createDependencies({ recognition: recognitionRecord({ foods: [] }) });
  const manual = [{ id: USER_FOOD_ID, name: "Dal", source: "user_added" }];
  assert.equal((await confirmMealFoods(access, JOB_ID, manual, dependencies)).ok, true);
});

test("refresh restores the saved confirmation", async () => {
  const dependencies = createDependencies();
  await confirmMealFoods(access, JOB_ID, createFoodConfirmationDraft(recognizedFoods), dependencies);
  const restored = await getMealFoodConfirmation(access, JOB_ID, dependencies);
  assert.equal(restored.ok, true);
  assert.equal(restored.confirmation.confirmationId, CONFIRMATION_ID);
});

test("safe response exposes only confirmation fields", async () => {
  const result = await confirmMealFoods(access, JOB_ID, createFoodConfirmationDraft(recognizedFoods), createDependencies());
  assert.deepEqual(Object.keys(result.confirmation).sort(), ["confirmationId", "confirmedAt", "foods", "jobId", "status"]);
  const serialized = JSON.stringify(result.confirmation);
  for (const forbidden of ["confidence", "evidence", "model", "storage_path", "calories", "grams", "portion"]) assert.equal(serialized.includes(forbidden), false);
});

test("final confirmation UI contains no portion or nutrition inputs", () => {
  assert.doesNotMatch(componentSource, /<input[^>]+(?:id|name)=["'][^"']*(?:portion|quantity|grams|calories|protein|carbs|fat)/i);
});

test("migration enforces completed-job ownership, immutability, uniqueness, and server-only writes", () => {
  assert.match(migrationSql, /foreign key \(analysis_job_id, client_id, meal_upload_id\)/i);
  assert.match(migrationSql, /foreign key \(recognition_result_id, analysis_job_id, client_id, meal_upload_id\)/i);
  assert.match(migrationSql, /unique \(analysis_job_id\)/i);
  assert.match(migrationSql, /job\.status = 'completed'/i);
  assert.match(migrationSql, /before update or delete on public\.meal_food_confirmations/i);
  assert.match(migrationSql, /revoke all on public\.meal_food_confirmations from anon, authenticated/i);
  assert.doesNotMatch(migrationSql, /grant (insert|update|delete|all).*meal_food_confirmations to authenticated/i);
});

function jobRecord(overrides = {}) { return { id: JOB_ID, client_id: CLIENT_ID, meal_upload_id: UPLOAD_ID, status: "completed", attempt_count: 1, last_error_code: null, last_error_message: null, failure_retryable: false, created_at: NOW.toISOString(), started_at: NOW.toISOString(), completed_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...overrides }; }
function recognitionRecord(overrides = {}) { return { id: RESULT_ID, analysis_job_id: JOB_ID, client_id: CLIENT_ID, meal_upload_id: UPLOAD_ID, foods: recognizedFoods, ...overrides }; }

function createDependencies(overrides = {}) {
  const dependencies = {
    job: overrides.job ?? jobRecord(), recognition: overrides.recognition ?? recognitionRecord(), confirmation: overrides.confirmation ?? null, createCalls: 0,
    async findJob(id) { return this.job?.id === id ? this.job : null; },
    async findRecognition(id) { return this.recognition?.analysis_job_id === id ? this.recognition : null; },
    async findConfirmation(id) { return this.confirmation?.analysis_job_id === id ? this.confirmation : null; },
    async createConfirmation(record) { this.createCalls += 1; if (this.confirmation) return false; this.confirmation = record; return true; },
    randomId: () => CONFIRMATION_ID,
    now: () => NOW,
  };
  return dependencies;
}
