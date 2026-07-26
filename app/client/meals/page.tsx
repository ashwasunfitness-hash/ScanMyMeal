import { ClientPageHeader } from "@/app/components/client/ClientPage";
import { MealHistoryList } from "@/app/components/client/MealHistoryList";

export const dynamic = "force-dynamic";
export default function MealsPage() {
  return <><ClientPageHeader eyebrow="Meal history" title="Your meals" description="Review the meals you saved after confirming their foods, portions and nutrition." /><MealHistoryList /></>;
}
