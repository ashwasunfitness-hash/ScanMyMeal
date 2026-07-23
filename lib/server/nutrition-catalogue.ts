import { EXPANDED_NUTRITION_CATALOGUE_VERSION, EXPANDED_NUTRITION_FOODS } from "#/lib/server/nutrition-catalogue-data";
import { validateNutritionCatalogue, type NutritionCatalogue, type NutritionCatalogueFood, type NutritionPortionConversion } from "#/lib/server/nutrition-catalogue-schema";

export type { NutritionCatalogue, NutritionCatalogueFood, NutritionPortionConversion } from "#/lib/server/nutrition-catalogue-schema";

export const LEGACY_NUTRITION_CATALOGUE_VERSION = "usda-sr-legacy-starter-2026-07-23";
export const NUTRITION_CATALOGUE_VERSION = EXPANDED_NUTRITION_CATALOGUE_VERSION;
export const ACTIVE_NUTRITION_CATALOGUE_VERSION = NUTRITION_CATALOGUE_VERSION;
export const NUTRITION_ENGINE_VERSION = "deterministic-household-v1";

export const EXPANDED_NUTRITION_CATALOGUE = validateNutritionCatalogue({
  version: EXPANDED_NUTRITION_CATALOGUE_VERSION,
  foods: EXPANDED_NUTRITION_FOODS,
});

// Kept as an immutable, addressable version for historical reproduction. Existing persisted
// results are returned before any catalogue is loaded, so they are never silently recalculated.
export const LEGACY_NUTRITION_CATALOGUE = validateNutritionCatalogue({
  version: LEGACY_NUTRITION_CATALOGUE_VERSION,
  foods: [
    legacyFood(EXPANDED_NUTRITION_CATALOGUE.foods.find((food) => food.id === "usda-fdc-173944")!, [{
      unit: "piece", size: "standard", referenceAmountG: 126, sourcePortionId: "FDC portion 93518",
      sourcePortionDescription: "1 NLEA serving retained for legacy standard-piece reproduction", sourceAmount: 1, sourceGramWeight: 126,
    }]),
    legacyFood(EXPANDED_NUTRITION_CATALOGUE.foods.find((food) => food.id === "usda-fdc-169704")!),
  ],
});

export const NUTRITION_CATALOGUES_BY_VERSION: Readonly<Record<string, NutritionCatalogue>> = Object.freeze({
  [LEGACY_NUTRITION_CATALOGUE.version]: LEGACY_NUTRITION_CATALOGUE,
  [EXPANDED_NUTRITION_CATALOGUE.version]: EXPANDED_NUTRITION_CATALOGUE,
});

export const STARTER_NUTRITION_CATALOGUE = getActiveNutritionCatalogue();

export function getActiveNutritionCatalogue() {
  const catalogue = NUTRITION_CATALOGUES_BY_VERSION[ACTIVE_NUTRITION_CATALOGUE_VERSION];
  if (!catalogue) throw new Error(`Active nutrition catalogue '${ACTIVE_NUTRITION_CATALOGUE_VERSION}' is unavailable`);
  return validateNutritionCatalogue(catalogue);
}

function legacyFood(food: NutritionCatalogueFood, extraConversions: NutritionPortionConversion[] = []): NutritionCatalogueFood {
  return { ...food, catalogueVersion: LEGACY_NUTRITION_CATALOGUE_VERSION, conversions: [...food.conversions, ...extraConversions] };
}
