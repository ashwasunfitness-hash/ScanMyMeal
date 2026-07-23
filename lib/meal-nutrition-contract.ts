import { z } from "zod";
import { portionSizeSchema, portionUnitSchema } from "#/lib/meal-portion-confirmation-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;

export const nutritionValuesSchema = z.object({
  energyKcal: z.number().finite().nonnegative(),
  proteinG: z.number().finite().nonnegative(),
  carbohydratesG: z.number().finite().nonnegative(),
  fatG: z.number().finite().nonnegative(),
  fibreG: z.number().finite().nonnegative(),
}).strict();

const baseNutritionItemSchema = z.object({
  id: z.string().regex(UUID),
  confirmedFoodItemId: z.string().min(1).max(100),
  portionItemId: z.string().regex(UUID),
  foodName: z.string().trim().min(1).max(80),
  quantity: z.number().finite().positive().max(50),
  unit: portionUnitSchema,
  size: portionSizeSchema.optional(),
});

export const resolvedNutritionItemSchema = baseNutritionItemSchema.extend({
  mappingStatus: z.literal("resolved"),
  catalogueFoodId: z.string().regex(SAFE_ID),
  canonicalFoodName: z.string().trim().min(1).max(100),
  referenceMultiplier: z.number().finite().positive(),
  calculatedReferenceAmount: z.number().finite().positive(),
  nutrition: nutritionValuesSchema,
}).strict();

export const unresolvedNutritionItemSchema = baseNutritionItemSchema.extend({
  mappingStatus: z.literal("unresolved"),
  unresolvedReason: z.enum(["food_not_mapped", "portion_not_supported"]),
}).strict();

export const nutritionResultItemSchema = z.discriminatedUnion("mappingStatus", [resolvedNutritionItemSchema, unresolvedNutritionItemSchema]);
export const nutritionResultItemsSchema = z.array(nutritionResultItemSchema).min(1).max(20);
export const nutritionResultStatusSchema = z.enum(["completed", "partial", "failed"]);

export const safeMealNutritionResultSchema = z.object({
  resultId: z.string().regex(UUID),
  jobId: z.string().regex(UUID),
  status: nutritionResultStatusSchema,
  engineVersion: z.string().regex(SAFE_ID),
  catalogueVersion: z.string().regex(SAFE_ID),
  items: nutritionResultItemsSchema,
  totals: nutritionValuesSchema.optional(),
  totalConfirmedFoodCount: z.number().int().min(1).max(20),
  resolvedItemCount: z.number().int().min(0).max(20),
  unresolvedItemCount: z.number().int().min(0).max(20),
  isComplete: z.boolean(),
  calculatedAt: z.string().datetime(),
}).strict().superRefine((result, context) => {
  if (result.status === "completed" && (!result.totals || !result.isComplete || result.unresolvedItemCount !== 0)) context.addIssue({ code: "custom", message: "Completed nutrition must include complete totals" });
  if (result.status === "partial" && (!result.totals || result.isComplete || result.resolvedItemCount < 1 || result.unresolvedItemCount < 1)) context.addIssue({ code: "custom", message: "Partial nutrition must include incomplete totals" });
  if (result.status === "failed" && (result.totals || result.isComplete || result.resolvedItemCount !== 0)) context.addIssue({ code: "custom", message: "Failed nutrition cannot include totals" });
});

export const nutritionRequestSchema = z.object({}).strict();

export type NutritionValues = z.infer<typeof nutritionValuesSchema>;
export type NutritionResultItem = z.infer<typeof nutritionResultItemSchema>;
export type NutritionResultItems = z.infer<typeof nutritionResultItemsSchema>;
export type SafeMealNutritionResult = z.infer<typeof safeMealNutritionResultSchema>;
