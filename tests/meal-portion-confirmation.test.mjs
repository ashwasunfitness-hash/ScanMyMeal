import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canSubmitPortions, createPortionDraft, formatPortionQuantity, suggestedPortionUnits, updatePortionDraft } from "../lib/client/meal-portion-confirmation.ts";
import { portionConfirmationRequestSchema, portionRequestListSchema } from "../lib/meal-portion-confirmation-contract.ts";
import { confirmMealPortions, getMealPortionConfirmation } from "../lib/server/meal-portion-confirmation.ts";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const UPLOAD_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const RESULT_ID = "55555555-5555-4555-8555-555555555555";
const FOOD_CONFIRMATION_ID = "66666666-6666-4666-8666-666666666666";
const PORTION_CONFIRMATION_ID = "77777777-7777-4777-8777-777777777777";
const PORTION_ITEM_IDS = ["88888888-8888-4888-8888-888888888888", "99999999-9999-4999-8999-999999999999"];
const NOW = new Date("2026-07-22T10:00:00.000Z");
const access = { allowed: true, userId: CLIENT_ID };
const foods = [
  { id: "food-jowar-roti", name: "Jowar roti", source: "recognized", originalRecognitionItemId: "food-jowar-roti", category: "bread" },
  { id: "user-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Dal", source: "user_added", category: "pulse" },
];
const validPortions = [
  { confirmedFoodItemId: foods[0].id, quantity: 2, unit: "roti", size: "medium" },
  { confirmedFoodItemId: foods[1].id, quantity: 1, unit: "katori", size: "standard" },
];
const migrationSql = readFileSync(new URL("../supabase/migrations/202607220002_meal_portion_confirmations.sql", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../app/components/client/PortionConfirmation.tsx", import.meta.url), "utf8");
const clientHelperSource = readFileSync(new URL("../lib/client/meal-portion-confirmation.ts", import.meta.url), "utf8");

test("initial draft includes every confirmed food with deterministic Indian household units", () => {
  const draft = createPortionDraft(foods);
  assert.deepEqual(draft.map((item) => item.confirmedFoodItemId), foods.map((food) => food.id));
  assert.equal(draft[0].unit, "roti");
  assert.equal(draft[1].unit, "katori");
  assert.deepEqual(suggestedPortionUnits("Jowar roti", "bread"), suggestedPortionUnits("Jowar roti", "bread"));
});

test("user can change quantity, unit, and optional size without changing the food ID", () => {
  let draft = createPortionDraft(foods);
  draft = updatePortionDraft(draft, foods[0].id, { quantity: 0.5 });
  draft = updatePortionDraft(draft, foods[0].id, { unit: "bowl", size: "small" });
  assert.deepEqual(draft[0], { confirmedFoodItemId: foods[0].id, quantity: 0.5, unit: "bowl", size: "small" });
});

test("quarter quantities and friendly fraction display are supported", () => {
  for (const quantity of [0.25, 0.5, 0.75, 1, 1.25, 1.5]) assert.equal(portionRequestListSchema.safeParse([{ ...validPortions[0], quantity }]).success, true);
  assert.deepEqual([0.25, 0.5, 0.75, 1.5].map(formatPortionQuantity), ["¼", "½", "¾", "1½"]);
});

test("zero, negative, excessive, NaN, infinity, and non-quarter quantities are rejected", () => {
  for (const quantity of [0, -1, 50.25, Number.NaN, Number.POSITIVE_INFINITY, 0.3]) {
    assert.equal(portionRequestListSchema.safeParse([{ ...validPortions[0], quantity }]).success, false);
  }
});

test("unsupported units, sizes, grams, millilitres, and nutrition properties are rejected", () => {
  assert.equal(portionRequestListSchema.safeParse([{ ...validPortions[0], unit: "grams" }]).success, false);
  assert.equal(portionRequestListSchema.safeParse([{ ...validPortions[0], unit: "millilitres" }]).success, false);
  assert.equal(portionRequestListSchema.safeParse([{ ...validPortions[0], size: "extra_large" }]).success, false);
  assert.equal(portionRequestListSchema.safeParse([{ ...validPortions[0], calories: 200 }]).success, false);
  assert.equal(portionConfirmationRequestSchema.safeParse({ portions: validPortions, clientId: CLIENT_ID }).success, false);
});

test("duplicate confirmed-food IDs are rejected", () => {
  assert.equal(portionRequestListSchema.safeParse([validPortions[0], { ...validPortions[0], quantity: 1 }]).success, false);
});

test("authenticated owner can store portions once for a completed job", async () => {
  const dependencies = createDependencies();
  const result = await confirmMealPortions(access, JOB_ID, validPortions, dependencies);
  assert.equal(result.ok, true);
  assert.equal(result.confirmation.portions[0].foodName, "Jowar roti");
  assert.equal(dependencies.createCalls, 1);
});

test("unauthenticated and expired clients are rejected", async () => {
  assert.deepEqual(await confirmMealPortions({ allowed: false, status: 401, code: "authentication_required" }, JOB_ID, validPortions, createDependencies()), { ok: false, status: 401, code: "authentication_required", retryable: false });
  assert.deepEqual(await confirmMealPortions({ allowed: false, status: 403, code: "client_access_expired" }, JOB_ID, validPortions, createDependencies()), { ok: false, status: 403, code: "client_access_expired", retryable: false });
});

test("a client cannot confirm another client's job", async () => {
  const result = await confirmMealPortions(access, JOB_ID, validPortions, createDependencies({ job: jobRecord({ client_id: OTHER_CLIENT_ID }) }));
  assert.deepEqual(result, { ok: false, status: 404, code: "analysis_job_not_found", retryable: false });
});

for (const status of ["queued", "processing", "failed"]) {
  test(`${status} jobs cannot accept portions`, async () => {
    const result = await confirmMealPortions(access, JOB_ID, validPortions, createDependencies({ job: jobRecord({ status }) }));
    assert.deepEqual(result, { ok: false, status: 409, code: "analysis_not_completed", retryable: false });
  });
}

test("completed job without a food confirmation is rejected", async () => {
  const result = await confirmMealPortions(access, JOB_ID, validPortions, createDependencies({ foodConfirmation: null }));
  assert.deepEqual(result, { ok: false, status: 404, code: "food_confirmation_not_found", retryable: false });
});

test("recognition and food-confirmation ownership relationships are verified", async () => {
  const wrongRecognition = createDependencies({ recognition: recognitionRecord({ meal_upload_id: OTHER_CLIENT_ID }) });
  assert.equal((await confirmMealPortions(access, JOB_ID, validPortions, wrongRecognition)).code, "food_confirmation_not_found");
  const wrongFoodOwner = createDependencies({ foodConfirmation: foodConfirmationRecord({ client_id: OTHER_CLIENT_ID }) });
  assert.equal((await confirmMealPortions(access, JOB_ID, validPortions, wrongFoodOwner)).code, "food_confirmation_not_found");
  const wrongResult = createDependencies({ foodConfirmation: foodConfirmationRecord({ recognition_result_id: OTHER_CLIENT_ID }) });
  assert.equal((await confirmMealPortions(access, JOB_ID, validPortions, wrongResult)).code, "food_confirmation_not_found");
});

test("every confirmed food must appear exactly once with no unknown food", async () => {
  assert.equal((await confirmMealPortions(access, JOB_ID, [validPortions[0]], createDependencies())).code, "invalid_portion_list");
  assert.equal((await confirmMealPortions(access, JOB_ID, [...validPortions, { confirmedFoodItemId: "unknown-food", quantity: 1, unit: "piece" }], createDependencies())).code, "invalid_portion_list");
});

test("food names are resolved from authoritative confirmation and cannot be submitted", async () => {
  assert.equal(portionRequestListSchema.safeParse([{ ...validPortions[0], foodName: "Changed name" }]).success, false);
  const result = await confirmMealPortions(access, JOB_ID, validPortions, createDependencies());
  assert.equal(result.confirmation.portions[0].foodName, foods[0].name);
});

test("double-submission UI guard disables while saving or confirmed", () => {
  const ids = foods.map((food) => food.id);
  assert.equal(canSubmitPortions(validPortions, ids, false, false), true);
  assert.equal(canSubmitPortions(validPortions, ids, true, false), false);
  assert.equal(canSubmitPortions(validPortions, ids, false, true), false);
});

test("identical and reordered repeated submissions are idempotent", async () => {
  const dependencies = createDependencies();
  assert.equal((await confirmMealPortions(access, JOB_ID, validPortions, dependencies)).duplicate, false);
  assert.equal((await confirmMealPortions(access, JOB_ID, [...validPortions].reverse(), dependencies)).duplicate, true);
  assert.equal(dependencies.createCalls, 1);
});

test("different repeated submission conflicts and cannot edit the confirmed record", async () => {
  const dependencies = createDependencies();
  await confirmMealPortions(access, JOB_ID, validPortions, dependencies);
  const changed = validPortions.map((item, index) => index === 0 ? { ...item, quantity: 3 } : item);
  assert.deepEqual(await confirmMealPortions(access, JOB_ID, changed, dependencies), { ok: false, status: 409, code: "portion_confirmation_conflict", retryable: false });
  assert.equal(dependencies.createCalls, 1);
});

test("refresh restores saved portions and response exposes only safe fields", async () => {
  const dependencies = createDependencies();
  await confirmMealPortions(access, JOB_ID, validPortions, dependencies);
  const restored = await getMealPortionConfirmation(access, JOB_ID, dependencies);
  assert.equal(restored.confirmation.confirmationId, PORTION_CONFIRMATION_ID);
  assert.deepEqual(Object.keys(restored.confirmation).sort(), ["confirmationId", "confirmedAt", "jobId", "portions", "status"]);
  for (const forbidden of ["client_id", "meal_upload_id", "calories", "grams", "protein"]) assert.equal(JSON.stringify(restored.confirmation).includes(forbidden), false);
});

test("transient database failure is retryable", async () => {
  const dependencies = createDependencies();
  dependencies.findJob = async () => { throw new Error("offline"); };
  assert.deepEqual(await confirmMealPortions(access, JOB_ID, validPortions, dependencies), { ok: false, status: 503, code: "database_failure", retryable: true });
});

test("portion UI includes Indian measures and excludes nutrition and food-editing controls", () => {
  for (const unit of ["roti", "idli", "dosa", "katori", "tablespoon", "handful"]) assert.equal(clientHelperSource.includes(unit), true);
  assert.doesNotMatch(componentSource, /type="(?:text|number)"[^>]+(?:calorie|protein|carbohydrate|fat|fibre|gram)/i);
  assert.doesNotMatch(componentSource, /Add food|Remove food|Rename food/);
  assert.match(componentSource, /Confirm portions/);
});

test("migration enforces ownership, completed state, uniqueness, immutability, and server-only writes", () => {
  assert.match(migrationSql, /foreign key \(analysis_job_id, client_id, meal_upload_id\)/i);
  assert.match(migrationSql, /foreign key \(food_confirmation_id, analysis_job_id, client_id, meal_upload_id\)/i);
  assert.match(migrationSql, /join public\.meal_recognition_results/i);
  assert.match(migrationSql, /unique \(analysis_job_id\)/i);
  assert.match(migrationSql, /unique \(food_confirmation_id\)/i);
  assert.match(migrationSql, /job\.status = 'completed'/i);
  assert.match(migrationSql, /before update or delete on public\.meal_portion_confirmations/i);
  assert.match(migrationSql, /revoke all on public\.meal_portion_confirmations from anon, authenticated/i);
  assert.doesNotMatch(migrationSql, /grant (insert|update|delete|all).*meal_portion_confirmations to authenticated/i);
});

function jobRecord(overrides = {}) { return { id: JOB_ID, client_id: CLIENT_ID, meal_upload_id: UPLOAD_ID, status: "completed", attempt_count: 1, last_error_code: null, last_error_message: null, failure_retryable: false, created_at: NOW.toISOString(), started_at: NOW.toISOString(), completed_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...overrides }; }
function recognitionRecord(overrides = {}) { return { id: RESULT_ID, analysis_job_id: JOB_ID, client_id: CLIENT_ID, meal_upload_id: UPLOAD_ID, ...overrides }; }
function foodConfirmationRecord(overrides = {}) { return { id: FOOD_CONFIRMATION_ID, analysis_job_id: JOB_ID, recognition_result_id: RESULT_ID, meal_upload_id: UPLOAD_ID, client_id: CLIENT_ID, status: "confirmed", foods, confirmed_at: NOW.toISOString(), created_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...overrides }; }

function createDependencies(overrides = {}) {
  let idIndex = 0;
  return {
    job: "job" in overrides ? overrides.job : jobRecord(), recognition: "recognition" in overrides ? overrides.recognition : recognitionRecord(),
    foodConfirmation: "foodConfirmation" in overrides ? overrides.foodConfirmation : foodConfirmationRecord(), portionConfirmation: overrides.portionConfirmation ?? null, createCalls: 0,
    async findJob(id) { return this.job?.id === id ? this.job : null; },
    async findRecognition(id) { return this.recognition?.analysis_job_id === id ? this.recognition : null; },
    async findFoodConfirmation(id) { return this.foodConfirmation?.analysis_job_id === id ? this.foodConfirmation : null; },
    async findPortionConfirmation(id) { return this.portionConfirmation?.analysis_job_id === id ? this.portionConfirmation : null; },
    async createPortionConfirmation(record) { this.createCalls += 1; if (this.portionConfirmation) return false; this.portionConfirmation = record; return true; },
    randomId() { const ids = [...PORTION_ITEM_IDS, PORTION_CONFIRMATION_ID]; return ids[idIndex++ % ids.length]; },
    now: () => NOW,
  };
}
