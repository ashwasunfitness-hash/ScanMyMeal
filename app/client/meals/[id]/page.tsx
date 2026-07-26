import { notFound } from "next/navigation";
import { MealHistoryDetail } from "@/app/components/client/MealHistoryDetail";

export const dynamic = "force-dynamic";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function MealHistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();
  return <MealHistoryDetail mealId={id} />;
}
