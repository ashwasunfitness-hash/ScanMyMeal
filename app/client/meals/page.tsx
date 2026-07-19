import { ListChecks } from "lucide-react";
import { ClientEmptyState, ClientPageHeader } from "@/app/components/client/ClientPage";

export const dynamic = "force-dynamic";
export default function MealsPage() { return <><ClientPageHeader eyebrow="Meal history" title="Your meals" description="Your confirmed meal history will live here." /><ClientEmptyState icon={ListChecks} title="No meals to show" description="There is no fabricated history in this pilot shell. Confirmed meals will appear when meal capture is connected." action={{ href: "/client/scan", label: "View meal scan" }} /></>; }
