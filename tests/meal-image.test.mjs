import assert from "node:assert/strict";
import test from "node:test";
import { initialMealImageState, MAX_MEAL_IMAGE_BYTES, mealImageReducer, validateMealImage } from "../lib/client/meal-image.ts";

const image = (overrides = {}) => ({ name: "meal.jpg", type: "image/jpeg", size: 2 * 1024 * 1024, ...overrides });

test("valid meal image selection is accepted", () => {
  const file = image();
  assert.equal(validateMealImage(file), null);
  assert.deepEqual(mealImageReducer(initialMealImageState, { type: "select", file }), { file, error: null, confirmed: false });
});

test("unsupported meal image type is rejected", () => {
  const state = mealImageReducer(initialMealImageState, { type: "select", file: image({ name: "meal.gif", type: "image/gif" }) });
  assert.equal(state.file, null);
  assert.match(state.error, /JPEG, PNG, HEIC or WebP/);
});

test("oversized meal image is rejected", () => {
  const state = mealImageReducer(initialMealImageState, { type: "select", file: image({ size: MAX_MEAL_IMAGE_BYTES + 1 }) });
  assert.equal(state.file, null);
  assert.match(state.error, /larger than 12 MB/);
});

test("selected meal image can be removed and replaced", () => {
  const first = image({ name: "first.jpg" });
  const replacement = image({ name: "replacement.webp", type: "image/webp" });
  const selected = mealImageReducer(initialMealImageState, { type: "select", file: first });
  const removed = mealImageReducer(selected, { type: "remove" });
  const replaced = mealImageReducer(removed, { type: "select", file: replacement });

  assert.deepEqual(removed, initialMealImageState);
  assert.equal(replaced.file, replacement);
  assert.equal(replaced.error, null);
});
