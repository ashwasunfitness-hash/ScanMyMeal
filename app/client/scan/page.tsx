import { ClientPageHeader } from "@/app/components/client/ClientPage";
import { MealImageCapture } from "@/app/components/client/MealImageCapture";

export const dynamic = "force-dynamic";
export default function ScanMealPage() {
  return <>
    <ClientPageHeader eyebrow="Meal scan" title="Scan your meal" description="Take or choose a clear meal photo, then confirm it before continuing." />
    <MealImageCapture />
  </>;
}
