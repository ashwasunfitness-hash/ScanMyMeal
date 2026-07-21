import { z } from "zod";

export const foodConfidenceSchema = z.enum(["high", "medium", "low"]);
export const foodCategorySchema = z.enum(["grain", "pulse", "vegetable", "fruit", "curry", "bread", "beverage", "condiment", "dessert", "unknown"]);

const providerFoodSchema = z.object({
  name: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(100).optional(),
  confidence: foodConfidenceSchema,
  category: foodCategorySchema.optional(),
  evidence: z.string().trim().min(1).max(160).optional(),
}).strict();

export const mealRecognitionProviderSchema = z.object({
  foods: z.array(providerFoodSchema).max(15),
  image_quality: z.enum(["good", "usable", "poor"]),
  needs_user_confirmation: z.literal(true),
}).strict().superRefine((value, context) => {
  const names = new Set<string>();
  value.foods.forEach((food, index) => {
    const normalized = canonicalFoodName(food.name);
    if (names.has(normalized)) context.addIssue({ code: "custom", path: ["foods", index, "name"], message: "Duplicate food name" });
    names.add(normalized);
  });
});

export const recognizedFoodSchema = providerFoodSchema.extend({ id: z.string().min(1).max(100) }).strict();
export const mealRecognitionSchema = z.object({
  foods: z.array(recognizedFoodSchema).max(15),
  imageQuality: z.enum(["good", "usable", "poor"]),
  needsUserConfirmation: z.literal(true),
}).strict();

export type RecognizedFood = z.infer<typeof recognizedFoodSchema>;
export type MealRecognition = z.infer<typeof mealRecognitionSchema>;

export function normalizeMealRecognition(raw: unknown): MealRecognition {
  const parsed = mealRecognitionProviderSchema.parse(raw);
  return {
    foods: parsed.foods.map((food, index) => {
      const name = normalizeDisplayName(food.name);
      return {
        id: `food-${index + 1}-${slugify(name)}`,
        name,
        confidence: food.confidence,
        ...(food.label ? { label: collapseWhitespace(food.label) } : {}),
        ...(food.category ? { category: food.category } : {}),
        ...(food.evidence ? { evidence: collapseWhitespace(food.evidence) } : {}),
      };
    }),
    imageQuality: parsed.image_quality,
    needsUserConfirmation: true,
  };
}

function canonicalFoodName(value: string) { return collapseWhitespace(value).toLocaleLowerCase("en-IN"); }
function normalizeDisplayName(value: string) {
  const name = collapseWhitespace(value);
  return name.charAt(0).toLocaleUpperCase("en-IN") + name.slice(1);
}
function collapseWhitespace(value: string) { return value.trim().replace(/\s+/g, " "); }
function slugify(value: string) { return canonicalFoodName(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "unknown"; }
