import { Camera } from "lucide-react";
import { ClientEmptyState, ClientPageHeader } from "@/app/components/client/ClientPage";

export const dynamic = "force-dynamic";
export default function ScanMealPage() { return <><ClientPageHeader eyebrow="Meal scan" title="Scan your meal" description="This protected route is ready for the verified photo-capture workflow." /><ClientEmptyState icon={Camera} title="Meal capture is being prepared" description="Camera access, photo review and confirmation will be connected here without changing your sign-in or programme access." /></>; }
