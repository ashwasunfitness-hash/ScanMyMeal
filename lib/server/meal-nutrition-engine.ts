import { nutritionResultItemsSchema, nutritionValuesSchema, type NutritionResultItem, type NutritionValues } from "#/lib/meal-nutrition-contract";
import type { ConfirmedFoodList } from "#/lib/meal-food-confirmation-contract";
import type { ConfirmedPortionList } from "#/lib/meal-portion-confirmation-contract";
import type { NutritionCatalogue, NutritionCatalogueFood, NutritionPortionConversion } from "#/lib/server/nutrition-catalogue";

export type NutritionCalculation = {
  status: "completed" | "partial" | "failed";
  items: NutritionResultItem[];
  totals?: NutritionValues;
  totalConfirmedFoodCount: number;
  resolvedItemCount: number;
  unresolvedItemCount: number;
  isComplete: boolean;
};

export function normalizeNutritionFoodName(value: string) {
  return value.trim().toLocaleLowerCase("en-IN").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function findCatalogueFood(name: string, catalogue: NutritionCatalogue): NutritionCatalogueFood | null {
  const normalized = normalizeNutritionFoodName(name);
  const canonical = catalogue.foods.find((food) => food.normalizedName === normalized);
  if (canonical) return canonical;
  return catalogue.foods.find((food) => food.aliases.some((alias) => normalizeNutritionFoodName(alias) === normalized)) ?? null;
}

export function calculateMealNutrition(input: { foods: ConfirmedFoodList; portions: ConfirmedPortionList; catalogue: NutritionCatalogue }): NutritionCalculation {
  const foodById = new Map(input.foods.map((food) => [food.id, food]));
  if (foodById.size !== input.foods.length || input.portions.length !== input.foods.length) throw new Error("Invalid authoritative nutrition input");

  const rawTotals: NutritionValues = { energyKcal: 0, proteinG: 0, carbohydratesG: 0, fatG: 0, fibreG: 0 };
  let resolvedItemCount = 0;
  const items = input.portions.map((portion): NutritionResultItem => {
    const food = foodById.get(portion.confirmedFoodItemId);
    if (!food || food.name !== portion.foodName) throw new Error("Invalid authoritative nutrition relationship");
    const base = { id: portion.id, confirmedFoodItemId: food.id, portionItemId: portion.id, foodName: food.name, quantity: portion.quantity, unit: portion.unit, ...(portion.size ? { size: portion.size } : {}) };
    const catalogueFood = findCatalogueFood(food.name, input.catalogue);
    if (!catalogueFood) return { ...base, mappingStatus: "unresolved", unresolvedReason: "food_not_mapped" };
    const conversion = findConversion(catalogueFood.conversions, portion.unit, portion.size);
    if (!conversion) return { ...base, mappingStatus: "unresolved", unresolvedReason: "portion_not_supported" };
    const calculatedReferenceAmount = portion.quantity * conversion.referenceAmountG;
    const referenceMultiplier = calculatedReferenceAmount / 100;
    const raw = scaleNutrition(catalogueFood.nutrientsPer100g, referenceMultiplier);
    assertFiniteNutrition(raw);
    addNutrition(rawTotals, raw);
    resolvedItemCount += 1;
    return {
      ...base, mappingStatus: "resolved", catalogueFoodId: catalogueFood.id, canonicalFoodName: catalogueFood.canonicalName,
      referenceMultiplier: roundStable(referenceMultiplier, 4), calculatedReferenceAmount: roundStable(calculatedReferenceAmount, 2),
      nutrition: roundNutrition(raw),
    };
  });
  nutritionResultItemsSchema.parse(items);
  const unresolvedItemCount = items.length - resolvedItemCount;
  if (resolvedItemCount === 0) return { status: "failed", items, totalConfirmedFoodCount: input.foods.length, resolvedItemCount, unresolvedItemCount, isComplete: false };
  return {
    status: unresolvedItemCount === 0 ? "completed" : "partial", items, totals: roundNutrition(rawTotals),
    totalConfirmedFoodCount: input.foods.length, resolvedItemCount, unresolvedItemCount, isComplete: unresolvedItemCount === 0,
  };
}

export function roundNutrition(values: NutritionValues): NutritionValues {
  const rounded = {
    energyKcal: normalizeNegativeZero(Math.round(values.energyKcal)),
    proteinG: normalizeNegativeZero(roundStable(values.proteinG, 1)),
    carbohydratesG: normalizeNegativeZero(roundStable(values.carbohydratesG, 1)),
    fatG: normalizeNegativeZero(roundStable(values.fatG, 1)),
    fibreG: normalizeNegativeZero(roundStable(values.fibreG, 1)),
  };
  return nutritionValuesSchema.parse(rounded);
}

function findConversion(conversions: readonly NutritionPortionConversion[], unit: string, size?: string) {
  return conversions.find((conversion) => conversion.unit === unit && conversion.size === size)
    ?? (!size ? conversions.find((conversion) => conversion.unit === unit && conversion.size === undefined) : undefined);
}
function scaleNutrition(values: NutritionValues, multiplier: number): NutritionValues {
  return { energyKcal: values.energyKcal * multiplier, proteinG: values.proteinG * multiplier, carbohydratesG: values.carbohydratesG * multiplier, fatG: values.fatG * multiplier, fibreG: values.fibreG * multiplier };
}
function addNutrition(target: NutritionValues, values: NutritionValues) {
  target.energyKcal += values.energyKcal; target.proteinG += values.proteinG; target.carbohydratesG += values.carbohydratesG; target.fatG += values.fatG; target.fibreG += values.fibreG;
}
function assertFiniteNutrition(values: NutritionValues) { for (const value of Object.values(values)) if (!Number.isFinite(value) || value < 0) throw new Error("Invalid nutrition calculation"); }
function roundStable(value: number, digits: number) { const factor = 10 ** digits; return Math.round((value + Number.EPSILON) * factor) / factor; }
function normalizeNegativeZero(value: number) { return Object.is(value, -0) ? 0 : value; }
