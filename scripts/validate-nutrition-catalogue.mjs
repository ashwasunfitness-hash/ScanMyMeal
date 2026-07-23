import { ACTIVE_NUTRITION_CATALOGUE_VERSION, NUTRITION_ENGINE_VERSION, getActiveNutritionCatalogue } from "../lib/server/nutrition-catalogue.ts";

const catalogue = getActiveNutritionCatalogue();
const counts = Object.fromEntries([...new Set(catalogue.foods.map((food) => food.category))].sort().map((category) => [category, catalogue.foods.filter((food) => food.category === category).length]));
console.log(JSON.stringify({ valid: true, catalogueVersion: ACTIVE_NUTRITION_CATALOGUE_VERSION, engineVersion: NUTRITION_ENGINE_VERSION, foodCount: catalogue.foods.length, counts }, null, 2));
