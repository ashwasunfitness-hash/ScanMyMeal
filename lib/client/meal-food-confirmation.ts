import type { RecognizedFood } from "#/lib/meal-recognition-contract";
import { confirmedFoodListSchema, normalizeFoodName, userAddedConfirmedFoodSchema, type ConfirmedFood } from "#/lib/meal-food-confirmation-contract";

export function createFoodConfirmationDraft(foods: RecognizedFood[]): ConfirmedFood[] {
  return foods.map((food) => ({ id: food.id, name: normalizeFoodName(food.name), source: "recognized", originalRecognitionItemId: food.id, ...(food.category ? { category: food.category } : {}) }));
}

export function renameDraftFood(foods: ConfirmedFood[], id: string, name: string) { return foods.map((food) => food.id === id ? { ...food, name } : food); }
export function removeDraftFood(foods: ConfirmedFood[], id: string) { return foods.filter((food) => food.id !== id); }

export function addDraftFood(foods: ConfirmedFood[], name: string, id: string) {
  const candidate = userAddedConfirmedFoodSchema.safeParse({ id, name, source: "user_added" });
  if (!candidate.success) return { ok: false as const, error: firstIssue(candidate.error) };
  const duplicate = foods.some((food) => normalizeFoodName(food.name).toLocaleLowerCase("en-IN") === candidate.data.name.toLocaleLowerCase("en-IN"));
  if (duplicate) return { ok: false as const, error: "That food is already in your list." };
  return { ok: true as const, foods: [...foods, candidate.data] };
}

export function validateFoodConfirmationDraft(foods: ConfirmedFood[]) {
  const result = confirmedFoodListSchema.safeParse(foods);
  return result.success ? { ok: true as const, foods: result.data } : { ok: false as const, error: firstIssue(result.error) };
}

export function canSubmitFoodConfirmation(foods: ConfirmedFood[], submitting: boolean, confirmed: boolean) {
  return !submitting && !confirmed && confirmedFoodListSchema.safeParse(foods).success;
}

export function foodDraftErrors(foods: ConfirmedFood[]) {
  const errors: Record<string, string> = {};
  const result = confirmedFoodListSchema.safeParse(foods);
  if (result.success) return errors;
  for (const issue of result.error.issues) {
    const index = typeof issue.path[0] === "number" ? issue.path[0] : null;
    if (index !== null && foods[index] && !errors[foods[index].id]) errors[foods[index].id] = issue.message;
  }
  return errors;
}

function firstIssue(error: { issues: Array<{ message: string }> }) { return error.issues[0]?.message ?? "Review the food list before continuing."; }
