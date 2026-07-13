import assert from "node:assert/strict";
import test from "node:test";
import { calculateTotals, confidenceLabel, demoAnalysis, mealAnalysisSchema, scaleItem } from "../lib/meal-analysis.ts";

test("demo analysis satisfies the strict response contract", () => {
  const parsed = mealAnalysisSchema.safeParse(demoAnalysis());
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.version, "1.0");
  assert.equal(parsed.data.needsUserConfirmation, true);
});

test("nutrition totals use sensible rounding", () => {
  const totals = calculateTotals([
    { nutrition: { caloriesKcal: 100.4, proteinG: 5.14, carbsG: 10.25, fatG: 2.16, fibreG: 1.25 } },
    { nutrition: { caloriesKcal: 50.4, proteinG: 2.14, carbsG: 5.25, fatG: 1.16, fibreG: 0.25 } },
  ]);
  assert.deepEqual(totals, { caloriesKcal: 151, proteinG: 7.3, carbsG: 15.5, fatG: 3.3, fibreG: 1.5 });
});

test("portion correction recalculates nutrients", () => {
  const item = demoAnalysis().items[0];
  const scaled = scaleItem(item, 90);
  assert.equal(scaled.estimatedGrams, 90);
  assert.equal(scaled.nutrition.caloriesKcal, 105);
  assert.equal(scaled.nutrition.proteinG, 6.5);
});

test("confidence labels avoid false precision", () => {
  assert.equal(confidenceLabel(0.9), "High confidence");
  assert.equal(confidenceLabel(0.7), "Medium confidence");
  assert.equal(confidenceLabel(0.4), "Needs confirmation");
});

test("malformed or implausible AI nutrition is rejected", () => {
  const analysis = demoAnalysis();
  analysis.items[0].nutrition.caloriesKcal = 99999;
  assert.equal(mealAnalysisSchema.safeParse(analysis).success, false);
});
