import { z } from "zod";
import { mealTypeSchema } from "#/lib/meal-save-contract";
import { nutritionValuesSchema } from "#/lib/meal-nutrition-contract";
import { portionSizeSchema, portionUnitSchema } from "#/lib/meal-portion-confirmation-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const mealHistoryStatusSchema = z.enum(["completed", "partial", "failed"]);

export const mealHistorySummarySchema = z.object({
  id: z.string().regex(UUID),
  analysisJobId: z.string().regex(UUID),
  mealType: mealTypeSchema,
  eatenAt: z.string().datetime({ offset: true }),
  savedAt: z.string().datetime({ offset: true }),
  nutritionStatus: mealHistoryStatusSchema,
  foodCount: z.number().int().min(1).max(20),
  unresolvedFoodCount: z.number().int().min(0).max(20),
  totals: nutritionValuesSchema.nullable(),
  hasImage: z.boolean(),
}).strict();

export const mealHistoryPageSchema = z.object({
  meals: z.array(mealHistorySummarySchema).max(20),
  nextCursor: z.string().max(500).nullable(),
}).strict();

export const mealHistoryFoodSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(80),
  quantity: z.number().finite().positive().max(50),
  unit: portionUnitSchema,
  size: portionSizeSchema.optional(),
  mappingStatus: z.enum(["resolved", "unresolved"]),
  nutrition: nutritionValuesSchema.optional(),
  unresolvedReason: z.enum(["food_not_mapped", "portion_not_supported"]).optional(),
}).strict().superRefine((food, context) => {
  if (food.mappingStatus === "resolved" && !food.nutrition) context.addIssue({ code: "custom", message: "Resolved history food requires persisted nutrition" });
  if (food.mappingStatus === "unresolved" && (!food.unresolvedReason || food.nutrition)) context.addIssue({ code: "custom", message: "Unresolved history food cannot contain nutrition" });
});

export const mealHistoryDetailSchema = mealHistorySummarySchema.extend({
  foods: z.array(mealHistoryFoodSchema).min(1).max(20),
  imageEndpoint: z.string().regex(/^\/api\/meals\/[0-9a-f-]+\/image$/i),
}).strict();

export type MealHistorySummary = z.infer<typeof mealHistorySummarySchema>;
export type MealHistoryPage = z.infer<typeof mealHistoryPageSchema>;
export type MealHistoryDetail = z.infer<typeof mealHistoryDetailSchema>;
