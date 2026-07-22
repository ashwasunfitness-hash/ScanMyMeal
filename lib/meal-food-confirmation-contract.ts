import { z } from "zod";
import { foodCategorySchema } from "#/lib/meal-recognition-contract";

const SAFE_ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const USER_ITEM_ID = /^user-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSAFE_MARKUP = /[<>]|&(?:lt|gt);|javascript:/i;

export function collapseFoodWhitespace(value: string) { return value.trim().replace(/\s+/g, " "); }
export function normalizeFoodName(value: string) {
  const normalized = collapseFoodWhitespace(value);
  return normalized ? normalized.charAt(0).toLocaleUpperCase("en-IN") + normalized.slice(1) : normalized;
}
export function canonicalFoodName(value: string) { return collapseFoodWhitespace(value).toLocaleLowerCase("en-IN"); }

const foodNameSchema = z.string().max(80).transform(normalizeFoodName).pipe(z.string().min(1).max(80)).refine((name) => !UNSAFE_MARKUP.test(name), "Food names cannot contain HTML or script-like content");
const itemIdSchema = z.string().regex(SAFE_ITEM_ID).max(100);

export const recognizedConfirmedFoodSchema = z.object({
  id: itemIdSchema,
  name: foodNameSchema,
  source: z.literal("recognized"),
  originalRecognitionItemId: itemIdSchema,
  category: foodCategorySchema.optional(),
}).strict().superRefine((food, context) => {
  if (food.id !== food.originalRecognitionItemId) context.addIssue({ code: "custom", path: ["id"], message: "Recognized food ID must remain stable" });
});

export const userAddedConfirmedFoodSchema = z.object({
  id: z.string().regex(USER_ITEM_ID),
  name: foodNameSchema,
  source: z.literal("user_added"),
  category: foodCategorySchema.optional(),
}).strict();

export const confirmedFoodSchema = z.discriminatedUnion("source", [recognizedConfirmedFoodSchema, userAddedConfirmedFoodSchema]);
export const confirmedFoodListSchema = z.array(confirmedFoodSchema).min(1).max(20).superRefine((foods, context) => {
  const names = new Set<string>();
  foods.forEach((food, index) => {
    const normalized = canonicalFoodName(food.name);
    if (names.has(normalized)) context.addIssue({ code: "custom", path: [index, "name"], message: "Each food must have a different name" });
    names.add(normalized);
  });
});

export const foodConfirmationRequestSchema = z.object({ foods: confirmedFoodListSchema }).strict();
export const safeFoodConfirmationSchema = z.object({
  confirmationId: z.string().regex(UUID),
  jobId: z.string().regex(UUID),
  status: z.literal("confirmed"),
  foods: confirmedFoodListSchema,
  confirmedAt: z.string().datetime(),
}).strict();

export type ConfirmedFood = z.infer<typeof confirmedFoodSchema>;
export type ConfirmedFoodList = z.infer<typeof confirmedFoodListSchema>;
export type SafeFoodConfirmationPayload = z.infer<typeof safeFoodConfirmationSchema>;

export function comparableFoodList(foods: ConfirmedFoodList) {
  return JSON.stringify([...foods].sort((left, right) => left.id.localeCompare(right.id)).map((food) => ({ ...food, name: normalizeFoodName(food.name) })));
}
