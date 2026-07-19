import { TrendingUp } from "lucide-react";
import { ClientEmptyState, ClientPageHeader } from "@/app/components/client/ClientPage";

export const dynamic = "force-dynamic";
export default function ProgressPage() { return <><ClientPageHeader eyebrow="Progress" title="Your patterns over time" description="Only verified, confirmed meal information will be used here." /><ClientEmptyState icon={TrendingUp} title="Progress begins with confirmed meals" description="Charts and summaries will appear after real meal records are available. Missing data is never replaced with invented trends." action={{ href: "/client/meals", label: "View meals" }} /></>; }
