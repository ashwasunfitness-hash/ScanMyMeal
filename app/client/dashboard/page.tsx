import Link from "next/link";
import { ArrowRight, Camera, Leaf, MessageCircle } from "lucide-react";
import { ClientEmptyState, ClientPageHeader } from "@/app/components/client/ClientPage";
import { requireActiveClient } from "@/lib/access-control";

export const dynamic = "force-dynamic";
export default async function ClientDashboardPage() {
  const context = await requireActiveClient();
  const name = context.profile.full_name ?? context.profile.email.split("@")[0];
  return <>
    <ClientPageHeader eyebrow="Client home" title={`Welcome, ${name.split(" ")[0]}`} description="A calm, private space for your Scan My Meal programme." />
    <section className="client-welcome-card"><div><span className="client-welcome-mark"><Leaf aria-hidden="true" /></span><p className="section-kicker">Programme access</p><h2>{context.programme?.programme_name ?? "Your coaching programme"}</h2><p>Your protected client workspace is ready. Meal tools will appear here as each pilot feature is connected and verified.</p><Link href="/client/scan">Go to meal scan <ArrowRight aria-hidden="true" /></Link></div><div className="client-welcome-orbit" aria-hidden="true"><span /><span /><Camera /></div></section>
    <div className="client-home-grid"><ClientEmptyState icon={Camera} title="No meal activity yet" description="Confirmed meals will appear here once the meal-capture workflow is connected." action={{ href: "/client/scan", label: "View meal scan" }} /><ClientEmptyState icon={MessageCircle} title="No shared feedback yet" description="Guidance shared by your assigned coach will appear in the feedback section." action={{ href: "/client/feedback", label: "View feedback" }} /></div>
  </>;
}
