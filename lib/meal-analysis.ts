import { z } from "zod";

export const nutritionSchema = z.object({
  caloriesKcal: z.number().nonnegative().max(5000),
  proteinG: z.number().nonnegative().max(500),
  carbsG: z.number().nonnegative().max(1000),
  fatG: z.number().nonnegative().max(500),
  fibreG: z.number().nonnegative().max(200),
});

export const mealItemSchema = z.object({
  id: z.string().min(1),
  detectedName: z.string().min(1).max(120),
  canonicalFoodName: z.string().max(120).nullable(),
  regionalAliases: z.array(z.string().max(80)).max(12),
  estimatedServingLabel: z.string().min(1).max(80),
  estimatedGrams: z.number().positive().max(3000).nullable(),
  quantityConfidence: z.number().min(0).max(1),
  foodConfidence: z.number().min(0).max(1),
  preparationMethod: z.string().max(100).nullable(),
  likelyIngredients: z.array(z.string().max(80)).max(30),
  nutrition: nutritionSchema,
  nutritionSource: z.string().min(1).max(160),
  uncertaintyNotes: z.array(z.string().max(240)).max(8),
});

export const mealAnalysisSchema = z.object({
  version: z.literal("1.0"),
  mealTitle: z.string().min(1).max(120),
  mealTypeSuggestion: z.enum(["breakfast", "lunch", "dinner", "snack", "unknown"]),
  overallConfidence: z.number().min(0).max(1),
  needsUserConfirmation: z.boolean(),
  clarificationQuestions: z.array(z.object({
    id: z.string().min(1),
    question: z.string().min(1).max(200),
    reason: z.string().min(1).max(300),
    affectedItemIds: z.array(z.string()).max(12),
  })).max(3),
  items: z.array(mealItemSchema).min(1).max(30),
  totals: nutritionSchema,
  limitations: z.array(z.string().max(300)).max(10),
});

export type MealAnalysis = z.infer<typeof mealAnalysisSchema>;
export type MealItem = z.infer<typeof mealItemSchema>;

export function calculateTotals(items: Array<Pick<MealItem, "nutrition">>) {
  const raw = items.reduce((sum, item) => ({
    caloriesKcal: sum.caloriesKcal + item.nutrition.caloriesKcal,
    proteinG: sum.proteinG + item.nutrition.proteinG,
    carbsG: sum.carbsG + item.nutrition.carbsG,
    fatG: sum.fatG + item.nutrition.fatG,
    fibreG: sum.fibreG + item.nutrition.fibreG,
  }), { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0 });

  return {
    caloriesKcal: Math.round(raw.caloriesKcal),
    proteinG: round1(raw.proteinG),
    carbsG: round1(raw.carbsG),
    fatG: round1(raw.fatG),
    fibreG: round1(raw.fibreG),
  };
}

export function scaleItem(item: MealItem, grams: number): MealItem {
  const original = item.estimatedGrams || grams;
  const ratio = grams / original;
  const nutrition = {
    caloriesKcal: Math.round(item.nutrition.caloriesKcal * ratio),
    proteinG: round1(item.nutrition.proteinG * ratio),
    carbsG: round1(item.nutrition.carbsG * ratio),
    fatG: round1(item.nutrition.fatG * ratio),
    fibreG: round1(item.nutrition.fibreG * ratio),
  };
  return { ...item, estimatedGrams: grams, nutrition };
}

export function confidenceLabel(value: number) {
  if (value >= 0.82) return "High confidence";
  if (value >= 0.62) return "Medium confidence";
  return "Needs confirmation";
}

export function demoAnalysis(): MealAnalysis {
  const items: MealItem[] = [
    {
      id: "dal", detectedName: "Moong dal", canonicalFoodName: "Cooked moong dal", regionalAliases: ["dal"],
      estimatedServingLabel: "1 medium katori", estimatedGrams: 180, quantityConfidence: 0.72, foodConfidence: 0.94,
      preparationMethod: "Pressure-cooked, tempered", likelyIngredients: ["moong dal", "tomato", "spices"],
      nutrition: { caloriesKcal: 210, proteinG: 13, carbsG: 34, fatG: 3, fibreG: 8 },
      nutritionSource: "Indian food reference, serving adjusted", uncertaintyNotes: ["Tempering oil is not clearly visible."],
    },
    {
      id: "rice", detectedName: "Steamed rice", canonicalFoodName: "Cooked white rice", regionalAliases: ["chawal"],
      estimatedServingLabel: "¾ cup", estimatedGrams: 150, quantityConfidence: 0.68, foodConfidence: 0.95,
      preparationMethod: "Steamed", likelyIngredients: ["rice", "water"],
      nutrition: { caloriesKcal: 195, proteinG: 4, carbsG: 43, fatG: 0.5, fibreG: 0.6 },
      nutritionSource: "Indian food reference, serving adjusted", uncertaintyNotes: ["Plate depth may change the portion estimate."],
    },
    {
      id: "palya", detectedName: "Beans-carrot palya", canonicalFoodName: "Mixed vegetable palya", regionalAliases: ["sabzi", "poriyal"],
      estimatedServingLabel: "1 cup", estimatedGrams: 140, quantityConfidence: 0.78, foodConfidence: 0.86,
      preparationMethod: "Stir-cooked", likelyIngredients: ["green beans", "carrot", "mustard seeds", "coconut"],
      nutrition: { caloriesKcal: 125, proteinG: 4, carbsG: 18, fatG: 5, fibreG: 6 },
      nutritionSource: "Recipe reference, serving adjusted", uncertaintyNotes: ["Coconut and oil quantities are estimated."],
    },
  ];
  return {
    version: "1.0", mealTitle: "Dal, rice & vegetable palya", mealTypeSuggestion: "lunch",
    overallConfidence: 0.76, needsUserConfirmation: true,
    clarificationQuestions: [{ id: "rice-portion", question: "Was this about ¾ cup or 1½ cups of rice?", reason: "The plate depth is difficult to judge from one image.", affectedItemIds: ["rice"] }],
    items, totals: calculateTotals(items),
    limitations: ["Photo-based portions and nutrition are estimates.", "Hidden oil, sugar and ingredients cannot always be identified from an image."],
  };
}

function round1(value: number) { return Math.round(value * 10) / 10; }
