import assert from "node:assert/strict";
import test from "node:test";
import { calculateMealNutrition, findCatalogueFood } from "../lib/server/meal-nutrition-engine.ts";
import { ACTIVE_NUTRITION_CATALOGUE_VERSION, EXPANDED_NUTRITION_CATALOGUE, LEGACY_NUTRITION_CATALOGUE, NUTRITION_ENGINE_VERSION, STARTER_NUTRITION_CATALOGUE, getActiveNutritionCatalogue } from "../lib/server/nutrition-catalogue.ts";
import { validateNutritionCatalogue } from "../lib/server/nutrition-catalogue-schema.ts";

const UUIDS = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];

test("expanded catalogue is active, valid, versioned, and retains the legacy catalogue", () => {
  assert.equal(ACTIVE_NUTRITION_CATALOGUE_VERSION, "india-plant-starter-v1-2026-07-23");
  assert.equal(NUTRITION_ENGINE_VERSION, "deterministic-household-v1");
  assert.equal(
    getActiveNutritionCatalogue().version,
    STARTER_NUTRITION_CATALOGUE.version,
  );
  assert.equal(EXPANDED_NUTRITION_CATALOGUE.foods.length, 40);
  assert.equal(LEGACY_NUTRITION_CATALOGUE.version, "usda-sr-legacy-starter-2026-07-23");
  assert.equal(LEGACY_NUTRITION_CATALOGUE.foods.length, 2);
});

test("catalogue covers every required plant-food category", () => {
  const counts = countBy(STARTER_NUTRITION_CATALOGUE.foods, (food) => food.category);
  assert.deepEqual(counts, { fruit: 9, cooked_grain: 5, cooked_legume: 9, sprout: 2, vegetable: 8, nut_seed: 7 });
});

test("every production record has complete USDA provenance and an explicit nutrient basis", () => {
  for (const food of STARTER_NUTRITION_CATALOGUE.foods) {
    assert.match(food.provenance.sourceIdentifier, /^FDC \d+$/);
    assert.equal(food.provenance.sourceName, "USDA FoodData Central");
    assert.equal(food.provenance.dataType, "SR Legacy");
    assert.equal(food.provenance.importDate, "2026-07-23");
    assert.equal(food.nutrientBasis.referenceAmount, 100);
    assert.equal(food.nutrientBasis.referenceUnit, "g_edible_portion");
    assert.equal(food.nutrientBasis.energyUnit, "kcal");
    assert.equal(food.nutrientBasis.carbohydrateDefinition, "carbohydrate_by_difference");
    assert.equal(food.nutrientBasis.fibreDefinition, "total_dietary_fibre");
    assert.equal(food.calculationMethod, "single_food");
    assert.equal(food.catalogueVersion, ACTIVE_NUTRITION_CATALOGUE_VERSION);
    assert.doesNotMatch(JSON.stringify(food), /demo|generated|random/i);
  }
});

test("strict validation rejects duplicate IDs, canonical names, aliases, and source identifiers", () => {
  assertInvalid((catalogue) => { catalogue.foods[1].id = catalogue.foods[0].id; }, /duplicate record ID/);
  assertInvalid((catalogue) => { catalogue.foods[1].canonicalName = catalogue.foods[0].canonicalName; catalogue.foods[1].normalizedName = catalogue.foods[0].normalizedName; }, /duplicate canonical name/);
  assertInvalid((catalogue) => { catalogue.foods[1].aliases = [catalogue.foods[0].aliases[0]]; }, /duplicate alias/);
  assertInvalid((catalogue) => { catalogue.foods[1].provenance.sourceIdentifier = catalogue.foods[0].provenance.sourceIdentifier; }, /duplicate source identifier/);
});

test("strict validation rejects invalid nutrients and missing provenance", () => {
  assertInvalid((catalogue) => { catalogue.foods[0].nutrientsPer100g.energyKcal = -1; }, /energyKcal/);
  assertInvalid((catalogue) => { catalogue.foods[0].nutrientsPer100g.proteinG = Number.POSITIVE_INFINITY; }, /proteinG/);
  assertInvalid((catalogue) => { delete catalogue.foods[0].nutrientsPer100g.fibreG; }, /fibreG/);
  assertInvalid((catalogue) => { catalogue.foods[0].provenance.sourceIdentifier = ""; }, /sourceIdentifier/);
  assertInvalid((catalogue) => { catalogue.foods[0].nutrientBasis.energyUnit = "kJ"; }, /energyUnit/);
});

test("strict validation rejects invalid state, unit, size, weight, aliases, and conversion provenance", () => {
  assertInvalid((catalogue) => { catalogue.foods[0].preparationState = "fried"; }, /preparationState/);
  assertInvalid((catalogue) => { catalogue.foods[0].conversions[0].unit = "gram"; }, /unit/);
  assertInvalid((catalogue) => { catalogue.foods[0].conversions[0].size = "extra_large"; }, /size/);
  assertInvalid((catalogue) => { catalogue.foods[0].conversions[0].referenceAmountG = 0; }, /referenceAmountG/);
  assertInvalid((catalogue) => { catalogue.foods[0].conversions[0].sourcePortionId = ""; }, /sourcePortionId/);
  assertInvalid((catalogue) => { catalogue.foods[0].aliases[0] = "Not Normalized"; }, /must already be normalized/);
});

test("approved Indian aliases resolve while remaining preparation aware", () => {
  const cases = {
    "cooked kabuli chana": "usda-fdc-173757", "cooked rajma": "usda-fdc-175194", "cooked moong": "usda-fdc-174257",
    "cooked toor": "usda-fdc-172437", "raw moong sprouts": "usda-fdc-169957", "raw groundnut": "usda-fdc-172430",
  };
  for (const [alias, id] of Object.entries(cases)) assert.equal(findCatalogueFood(`  ${alias.toUpperCase()}  `, STARTER_NUTRITION_CATALOGUE)?.id, id);
  for (const unsafe of ["chickpeas", "rajma", "moong", "toor", "groundnut", "sprouts"]) assert.equal(findCatalogueFood(unsafe, STARTER_NUTRITION_CATALOGUE), null);
});

test("ambiguous dishes and uncontrolled fuzzy matches remain unresolved", () => {
  for (const name of ["rice", "dal", "curry", "sabzi", "chutney", "salad", "juice", "nuts", "roti", "biryani", "banan"]) assert.equal(findCatalogueFood(name, STARTER_NUTRITION_CATALOGUE), null);
});

test("raw and cooked identities are not merged", () => {
  assert.equal(findCatalogueFood("cooked mung beans", STARTER_NUTRITION_CATALOGUE)?.preparationState, "boiled");
  assert.equal(findCatalogueFood("raw mung beans", STARTER_NUTRITION_CATALOGUE), null);
  assert.equal(findCatalogueFood("cooked white rice", STARTER_NUTRITION_CATALOGUE)?.preparationState, "cooked");
  assert.equal(findCatalogueFood("raw white rice", STARTER_NUTRITION_CATALOGUE), null);
});

test("all conversions are source-backed and no generic vessel or handful conversion exists", () => {
  for (const food of STARTER_NUTRITION_CATALOGUE.foods) for (const conversion of food.conversions) {
    assert.match(conversion.sourcePortionId, /^FDC portion \d+$/);
    assert.ok(conversion.sourcePortionDescription.length > 0);
    assert.ok(conversion.referenceAmountG > 0);
    assert.ok(Math.abs(conversion.referenceAmountG - conversion.sourceGramWeight / conversion.sourceAmount) < 0.001);
    assert.notEqual(conversion.unit, "katori"); assert.notEqual(conversion.unit, "bowl"); assert.notEqual(conversion.unit, "handful");
  }
});

test("piece, cup, tablespoon, quarter quantity, and configured sizes remain food-specific", () => {
  assert.equal(calculate("Apple, raw, with skin", "piece", 1, "medium").items[0].calculatedReferenceAmount, 182);
  assert.equal(calculate("Brown rice, long-grain, cooked", "cup", 1, "standard").items[0].calculatedReferenceAmount, 202);
  assert.equal(calculate("Lentils, cooked, boiled, without salt", "tablespoon", 0.25, "standard").items[0].calculatedReferenceAmount, 3.08);
  assert.equal(calculate("Tomato, red, ripe, raw", "slice", 1, "large").items[0].calculatedReferenceAmount, 27);
  assert.equal(calculate("Banana, raw", "piece", 1, "standard").status, "failed");
});

test("new foods calculate across every category and unsupported conversions stay unresolved", () => {
  const cases = [
    ["Apple, raw, with skin", "piece", "medium"], ["White rice, long-grain, cooked", "cup", "standard"],
    ["Chickpeas, cooked, boiled, without salt", "cup", "standard"], ["Mung bean sprouts, raw", "cup", "standard"],
    ["Potato, boiled, without skin or salt", "piece", "medium"], ["Almonds, source preparation unspecified", "piece", "standard"],
  ];
  for (const [name, unit, size] of cases) assert.equal(calculate(name, unit, 1, size).status, "completed");
  for (const name of ["Cashew nuts, raw", "Chia seeds, dried"]) assert.equal(calculate(name, "handful", 1, "standard").status, "failed");
});

test("mixed meals total supported items and preserve partial and fully unresolved behaviour", () => {
  const supported = make("Apple, raw, with skin", "piece", 1, "medium", UUIDS[0]);
  const unknownFood = { id: "food-unknown", name: "Vegetable curry", source: "user_added" };
  const unknownPortion = { id: UUIDS[1], confirmedFoodItemId: unknownFood.id, foodName: unknownFood.name, quantity: 1, unit: "katori", size: "standard" };
  const partial = calculateMealNutrition({ foods: [supported.food, unknownFood], portions: [supported.portion, unknownPortion], catalogue: STARTER_NUTRITION_CATALOGUE });
  assert.equal(partial.status, "partial"); assert.equal(partial.isComplete, false); assert.ok(partial.totals); assert.equal(partial.items[1].nutrition, undefined);
  const failed = calculateMealNutrition({ foods: [unknownFood], portions: [unknownPortion], catalogue: STARTER_NUTRITION_CATALOGUE });
  assert.equal(failed.status, "failed"); assert.equal(failed.totals, undefined);
});

test("existing banana and brown-rice calculations remain stable in the expanded version", () => {
  assert.deepEqual(calculate("Banana, raw", "piece", 1, "medium").items[0].nutrition, { energyKcal: 105, proteinG: 1.3, carbohydratesG: 27, fatG: 0.4, fibreG: 3.1 });
  assert.deepEqual(calculate("Brown rice, long-grain, cooked", "cup", 1, "standard").items[0].nutrition, { energyKcal: 248, proteinG: 5.5, carbohydratesG: 51.7, fatG: 2, fibreG: 3.2 });
});

function calculate(name, unit, quantity, size) {
  const { food, portion } = make(name, unit, quantity, size, UUIDS[2]);
  return calculateMealNutrition({ foods: [food], portions: [portion], catalogue: STARTER_NUTRITION_CATALOGUE });
}
function make(name, unit, quantity, size, id) {
  const catalogueFood = findCatalogueFood(name, STARTER_NUTRITION_CATALOGUE);
  const food = { id: `food-${id.slice(0, 8)}`, name, source: "user_added" };
  const portion = { id, confirmedFoodItemId: food.id, foodName: food.name, quantity, unit, ...(size ? { size } : {}) };
  assert.ok(catalogueFood || ["Vegetable curry"].includes(name));
  return { food, portion };
}
function assertInvalid(mutate, pattern) {
  const clone = structuredClone(EXPANDED_NUTRITION_CATALOGUE);
  mutate(clone);
  assert.throws(() => validateNutritionCatalogue(clone), pattern);
}
function countBy(items, key) { return Object.fromEntries([...new Set(items.map(key))].map((value) => [value, items.filter((item) => key(item) === value).length])); }
