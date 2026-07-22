import { z } from "zod";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_FOOD_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

export const portionUnitSchema = z.enum([
  "piece", "roti", "idli", "dosa", "katori", "cup", "bowl", "plate", "glass",
  "tablespoon", "teaspoon", "ladle", "handful", "slice", "serving",
]);
export const portionSizeSchema = z.enum(["small", "medium", "large", "standard"]);

export function normalizePortionQuantity(value: number) {
  return Math.round(value * 4) / 4;
}

const quantitySchema = z.number().finite().gt(0).max(50).refine(
  (value) => Math.abs(value * 4 - Math.round(value * 4)) < Number.EPSILON * 16,
  "Quantity must use quarter-unit increments",
).transform(normalizePortionQuantity);

export const portionRequestItemSchema = z.object({
  confirmedFoodItemId: z.string().regex(SAFE_FOOD_ID).max(100),
  quantity: quantitySchema,
  unit: portionUnitSchema,
  size: portionSizeSchema.optional(),
}).strict();

export const portionRequestListSchema = z.array(portionRequestItemSchema).min(1).max(20).superRefine((items, context) => {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    if (ids.has(item.confirmedFoodItemId)) context.addIssue({ code: "custom", path: [index, "confirmedFoodItemId"], message: "Each confirmed food can have only one portion" });
    ids.add(item.confirmedFoodItemId);
  });
});

export const portionConfirmationRequestSchema = z.object({ portions: portionRequestListSchema }).strict();

export const confirmedPortionItemSchema = portionRequestItemSchema.extend({
  id: z.string().regex(UUID),
  foodName: z.string().trim().min(1).max(80),
}).strict();
export const confirmedPortionListSchema = z.array(confirmedPortionItemSchema).min(1).max(20);
export const safePortionConfirmationSchema = z.object({
  confirmationId: z.string().regex(UUID),
  jobId: z.string().regex(UUID),
  status: z.literal("confirmed"),
  portions: confirmedPortionListSchema,
  confirmedAt: z.string().datetime(),
}).strict();

export type PortionUnit = z.infer<typeof portionUnitSchema>;
export type PortionSize = z.infer<typeof portionSizeSchema>;
export type PortionRequestItem = z.infer<typeof portionRequestItemSchema>;
export type PortionRequestList = z.infer<typeof portionRequestListSchema>;
export type ConfirmedPortionItem = z.infer<typeof confirmedPortionItemSchema>;
export type ConfirmedPortionList = z.infer<typeof confirmedPortionListSchema>;
export type SafePortionConfirmationPayload = z.infer<typeof safePortionConfirmationSchema>;

export function comparablePortionList(portions: Array<Pick<ConfirmedPortionItem, "confirmedFoodItemId" | "quantity" | "unit" | "size">>) {
  return JSON.stringify([...portions]
    .sort((left, right) => left.confirmedFoodItemId.localeCompare(right.confirmedFoodItemId))
    .map(({ confirmedFoodItemId, quantity, unit, size }) => ({ confirmedFoodItemId, quantity: normalizePortionQuantity(quantity), unit, ...(size ? { size } : {}) })));
}
