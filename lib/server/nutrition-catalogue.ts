import type { NutritionValues } from "#/lib/meal-nutrition-contract";
import type { PortionSize, PortionUnit } from "#/lib/meal-portion-confirmation-contract";

export const NUTRITION_CATALOGUE_VERSION = "usda-sr-legacy-starter-2026-07-23";
export const NUTRITION_ENGINE_VERSION = "deterministic-household-v1";

export type NutritionPortionConversion = { unit: PortionUnit; size?: PortionSize; referenceAmountG: number };
export type NutritionCatalogueFood = {
  id: string;
  canonicalName: string;
  normalizedName: string;
  aliases: readonly string[];
  nutrientsPer100g: NutritionValues;
  conversions: readonly NutritionPortionConversion[];
  sourceName: string;
  sourceReference: string;
};
export type NutritionCatalogue = { version: string; foods: readonly NutritionCatalogueFood[] };

// Deliberately small and reviewable. Values and gram weights come from USDA FoodData Central
// SR Legacy records, which USDA publishes under CC0. Mixed dishes are intentionally absent.
export const STARTER_NUTRITION_CATALOGUE: NutritionCatalogue = {
  version: NUTRITION_CATALOGUE_VERSION,
  foods: [
    {
      id: "usda-fdc-173944",
      canonicalName: "Banana, raw",
      normalizedName: "banana raw",
      aliases: ["banana", "bananas", "raw banana"],
      nutrientsPer100g: { energyKcal: 89, proteinG: 1.09, carbohydratesG: 22.84, fatG: 0.33, fibreG: 2.6 },
      conversions: [
        { unit: "piece", size: "small", referenceAmountG: 101 },
        { unit: "piece", size: "medium", referenceAmountG: 118 },
        { unit: "piece", size: "large", referenceAmountG: 136 },
        { unit: "piece", size: "standard", referenceAmountG: 126 },
        { unit: "cup", referenceAmountG: 150 },
        { unit: "cup", size: "standard", referenceAmountG: 150 },
      ],
      sourceName: "USDA FoodData Central, SR Legacy",
      sourceReference: "FDC 173944; nutrient basis per 100 g; listed edible portion weights",
    },
    {
      id: "usda-fdc-169704",
      canonicalName: "Brown rice, long-grain, cooked",
      normalizedName: "brown rice long grain cooked",
      aliases: ["brown rice", "cooked brown rice", "brown rice cooked"],
      nutrientsPer100g: { energyKcal: 123, proteinG: 2.74, carbohydratesG: 25.58, fatG: 0.97, fibreG: 1.6 },
      conversions: [
        { unit: "cup", referenceAmountG: 202 },
        { unit: "cup", size: "standard", referenceAmountG: 202 },
      ],
      sourceName: "USDA FoodData Central, SR Legacy",
      sourceReference: "FDC 169704; nutrient basis per 100 g; 1 cup = 202 g",
    },
  ],
};
