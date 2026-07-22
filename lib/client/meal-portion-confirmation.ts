import type { ConfirmedFoodList } from "#/lib/meal-food-confirmation-contract";
import { portionRequestListSchema, type PortionRequestItem, type PortionSize, type PortionUnit } from "#/lib/meal-portion-confirmation-contract";

export const PORTION_UNITS: PortionUnit[] = ["piece", "roti", "idli", "dosa", "katori", "cup", "bowl", "plate", "glass", "tablespoon", "teaspoon", "ladle", "handful", "slice", "serving"];
export const PORTION_SIZES: PortionSize[] = ["small", "medium", "large", "standard"];

export function suggestedPortionUnits(name: string, category?: string): PortionUnit[] {
  const value = name.toLocaleLowerCase("en-IN");
  if (category === "bread" || /\b(roti|chapati|paratha|bread)\b/.test(value)) return ["roti", "piece", "slice", "serving"];
  if (/\bidli\b/.test(value)) return ["idli", "piece", "serving"];
  if (/\bdosa\b/.test(value)) return ["dosa", "piece", "serving"];
  if (category === "pulse" || category === "curry" || category === "grain" || /\b(dal|rice|curry|sabzi|khichdi|pulao)\b/.test(value)) return ["katori", "bowl", "cup", "ladle", "serving"];
  if (category === "beverage" || /\b(juice|milk|lassi|tea|coffee|water)\b/.test(value)) return ["glass", "cup", "serving"];
  if (category === "condiment" || /\b(chutney|pickle|sauce)\b/.test(value)) return ["tablespoon", "teaspoon", "serving"];
  if (/\b(nut|almond|cashew|peanut|seed)\b/.test(value)) return ["handful", "tablespoon", "serving"];
  if (category === "fruit") return ["piece", "slice", "cup", "serving"];
  if (category === "vegetable" || /\b(salad)\b/.test(value)) return ["plate", "bowl", "cup", "serving"];
  return ["serving", "piece", "bowl", "cup"];
}

export function createPortionDraft(foods: ConfirmedFoodList): PortionRequestItem[] {
  return foods.map((food) => ({ confirmedFoodItemId: food.id, quantity: 1, unit: suggestedPortionUnits(food.name, food.category)[0], size: "standard" }));
}

export function updatePortionDraft(items: PortionRequestItem[], foodId: string, change: Partial<Omit<PortionRequestItem, "confirmedFoodItemId">>) {
  return items.map((item) => item.confirmedFoodItemId === foodId ? { ...item, ...change } : item);
}

export function portionDraftErrors(items: PortionRequestItem[], expectedFoodIds: string[]) {
  const errors: Record<string, string> = {};
  const parsed = portionRequestListSchema.safeParse(items);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const index = typeof issue.path[0] === "number" ? issue.path[0] : -1;
      const id = items[index]?.confirmedFoodItemId;
      if (id && !errors[id]) errors[id] = issue.path[1] === "quantity" ? "Enter a quantity from 0.25 to 50 in quarter-unit steps." : issue.message;
    }
  }
  const submitted = new Set(items.map((item) => item.confirmedFoodItemId));
  for (const id of expectedFoodIds) if (!submitted.has(id)) errors[id] = "Add a portion for this food.";
  return errors;
}

export function canSubmitPortions(items: PortionRequestItem[], expectedFoodIds: string[], busy: boolean, confirmed: boolean) {
  if (busy || confirmed || !portionRequestListSchema.safeParse(items).success) return false;
  return items.length === expectedFoodIds.length && expectedFoodIds.every((id) => items.some((item) => item.confirmedFoodItemId === id));
}

export function formatPortionQuantity(quantity: number) {
  const whole = Math.floor(quantity);
  const fraction = Math.round((quantity - whole) * 4);
  const symbol = fraction === 1 ? "¼" : fraction === 2 ? "½" : fraction === 3 ? "¾" : "";
  return `${whole || ""}${symbol}` || "0";
}

export function formatPortionLabel(quantity: number, unit: PortionUnit, size?: PortionSize) {
  const plural = quantity === 1 ? unit : unit === "glass" ? "glasses" : unit === "piece" ? "pieces" : `${unit}s`;
  return `${formatPortionQuantity(quantity)} ${plural}${size ? `, ${size}` : ""}`;
}
