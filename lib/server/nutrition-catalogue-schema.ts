import { z } from "zod";
import { nutritionValuesSchema } from "#/lib/meal-nutrition-contract";
import { portionSizeSchema, portionUnitSchema } from "#/lib/meal-portion-confirmation-contract";

export const nutritionFoodCategorySchema = z.enum(["fruit", "cooked_grain", "cooked_legume", "sprout", "vegetable", "nut_seed"]);
export const nutritionPreparationStateSchema = z.enum(["raw", "cooked", "boiled", "sprouted_raw", "dried", "source_unspecified"]);

export const nutritionPortionConversionSchema = z.object({
  unit: portionUnitSchema,
  size: portionSizeSchema.optional(),
  referenceAmountG: z.number().finite().positive(),
  sourcePortionId: z.string().regex(/^FDC portion \d+$/),
  sourcePortionDescription: z.string().trim().min(1).max(180),
  sourceAmount: z.number().finite().positive(),
  sourceGramWeight: z.number().finite().positive(),
}).strict();

export const nutritionCatalogueFoodSchema = z.object({
  id: z.string().regex(/^usda-fdc-\d+$/),
  catalogueVersion: z.string().trim().min(1).max(120),
  canonicalName: z.string().trim().min(1).max(120),
  normalizedName: z.string().trim().min(1).max(120),
  category: nutritionFoodCategorySchema,
  preparationState: nutritionPreparationStateSchema,
  calculationMethod: z.literal("single_food"),
  aliases: z.array(z.string().trim().min(1).max(100)).max(12),
  nutrientBasis: z.object({
    referenceAmount: z.literal(100),
    referenceUnit: z.literal("g_edible_portion"),
    energyUnit: z.literal("kcal"),
    carbohydrateDefinition: z.literal("carbohydrate_by_difference"),
    fibreDefinition: z.literal("total_dietary_fibre"),
  }).strict(),
  nutrientsPer100g: nutritionValuesSchema,
  conversions: z.array(nutritionPortionConversionSchema).max(16),
  provenance: z.object({
    sourceName: z.literal("USDA FoodData Central"),
    sourceIdentifier: z.string().regex(/^FDC \d+$/),
    dataType: z.literal("SR Legacy"),
    sourceDescription: z.string().trim().min(1).max(260),
    importDate: z.string().date(),
  }).strict(),
}).strict();

export const nutritionCatalogueSchema = z.object({
  version: z.string().trim().min(1).max(120),
  foods: z.array(nutritionCatalogueFoodSchema).min(1).max(100),
}).strict();

export type NutritionPortionConversion = z.infer<typeof nutritionPortionConversionSchema>;
export type NutritionCatalogueFood = z.infer<typeof nutritionCatalogueFoodSchema>;
export type NutritionCatalogue = z.infer<typeof nutritionCatalogueSchema>;

export function normalizeCatalogueLabel(value: string) {
  return value.trim().toLocaleLowerCase("en-IN").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function validateNutritionCatalogue(value: unknown): NutritionCatalogue {
  const catalogue = nutritionCatalogueSchema.parse(value);
  const ids = new Map<string, string>();
  const canonicalNames = new Map<string, string>();
  const sourceIds = new Map<string, string>();
  const labels = new Map<string, string>();

  for (const food of catalogue.foods) {
    assertUnique(ids, food.id, food.canonicalName, "record ID");
    if (food.catalogueVersion !== catalogue.version) throw new Error(`${food.id}: catalogue version does not match ${catalogue.version}`);
    const expectedName = normalizeCatalogueLabel(food.canonicalName);
    if (food.normalizedName !== expectedName) throw new Error(`${food.id}: normalized name must be '${expectedName}'`);
    assertUnique(canonicalNames, food.normalizedName, food.id, "canonical name");
    assertUnique(sourceIds, food.provenance.sourceIdentifier, food.id, "source identifier");
    assertUnique(labels, food.normalizedName, food.id, "catalogue label");
    const conversionKeys = new Map<string, string>();
    for (const alias of food.aliases) {
      const normalized = normalizeCatalogueLabel(alias);
      if (alias !== normalized) throw new Error(`${food.id}: alias '${alias}' must already be normalized`);
      assertUnique(labels, normalized, food.id, "alias");
    }
    for (const conversion of food.conversions) {
      assertUnique(conversionKeys, `${conversion.unit}:${conversion.size ?? "unspecified"}`, food.id, "conversion");
      const derivedWeight = conversion.sourceGramWeight / conversion.sourceAmount;
      if (Math.abs(derivedWeight - conversion.referenceAmountG) > 0.001) throw new Error(`${food.id}: conversion ${conversion.unit}/${conversion.size ?? "unspecified"} does not match its source amount and gram weight`);
    }
  }
  return catalogue;
}

function assertUnique(index: Map<string, string>, key: string, owner: string, label: string) {
  const existing = index.get(key);
  if (existing) throw new Error(`${owner}: duplicate ${label} '${key}' already used by ${existing}`);
  index.set(key, owner);
}
