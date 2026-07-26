import { z } from "zod";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout", "other"] as const;
export const mealTypeSchema = z.enum(MEAL_TYPES);

export const MEAL_TYPE_LABELS: Readonly<Record<MealType, string>> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  pre_workout: "Pre-workout",
  post_workout: "Post-workout",
  other: "Other",
};

export const saveMealRequestSchema = z.object({
  analysisJobId: z.string().regex(UUID),
  mealType: mealTypeSchema,
  eatenAt: z.string().datetime({ offset: true }),
}).strict();

export const safeSavedMealSchema = z.object({
  mealId: z.string().regex(UUID),
  analysisJobId: z.string().regex(UUID),
  mealType: mealTypeSchema,
  eatenAt: z.string().datetime({ offset: true }),
  nutritionStatus: z.enum(["completed", "partial", "failed"]),
  savedAt: z.string().datetime({ offset: true }),
}).strict();

export type MealType = z.infer<typeof mealTypeSchema>;
export type SaveMealRequest = z.infer<typeof saveMealRequestSchema>;
export type SafeSavedMeal = z.infer<typeof safeSavedMealSchema>;
