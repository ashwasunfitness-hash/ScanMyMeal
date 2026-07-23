import { formatPortionLabel } from "#/lib/client/meal-portion-confirmation";
import type { NutritionResultItem, NutritionValues } from "#/lib/meal-nutrition-contract";

export const NUTRIENT_LABELS: Array<{ key: keyof NutritionValues; label: string; unit: "kcal" | "g" }> = [
  { key: "energyKcal", label: "Energy", unit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "carbohydratesG", label: "Carbohydrates", unit: "g" },
  { key: "fatG", label: "Fat", unit: "g" },
  { key: "fibreG", label: "Fibre", unit: "g" },
];

export function formatKcal(value: number) { return `${Math.round(value)} kcal`; }
export function formatGrams(value: number) { return `${value.toFixed(1)} g`; }
export function formatNutrient(value: number, unit: "kcal" | "g") { return unit === "kcal" ? formatKcal(value) : formatGrams(value); }
export function incompleteNutritionLabel(unresolvedCount: number) { return `${unresolvedCount} ${unresolvedCount === 1 ? "food was" : "foods were"} not included in totals.`; }
export function formatNutritionItemPortion(item: NutritionResultItem) { return formatPortionLabel(item.quantity, item.unit, item.size); }
