import { MessageCircle } from "lucide-react";
import { ClientEmptyState, ClientPageHeader } from "@/app/components/client/ClientPage";

export const dynamic = "force-dynamic";
export default function FeedbackPage() { return <><ClientPageHeader eyebrow="Coach feedback" title="Guidance from your coach" description="Shared coaching notes will appear in this private section." /><ClientEmptyState icon={MessageCircle} title="No feedback has been shared" description="When your assigned coach publishes a note for you, it will be shown here." /></>; }
