import { requireActiveClient } from "@/lib/access-control";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/app/components/Logo";

export const dynamic = "force-dynamic";
export default async function ClientProfilePage() {
  const context = await requireActiveClient();
  const supabase = await createClient();
  const { data } = await supabase.from("client_profiles").select("*").eq("user_id", context.userId).maybeSingle();
  return <main className="expired-shell"><Logo /><p className="section-kicker">Client profile</p><h1>{context.profile.full_name ?? "Your profile"}</h1><p>{context.profile.email}</p><div className="invite-summary"><span>Programme<strong>{context.programme?.programme_name}</strong></span><span>Primary goal<strong>{data?.primary_goal ?? context.programme?.primary_goal ?? "Not set"}</strong></span><span>Dietary pattern<strong>{data?.dietary_pattern ?? "Not set"}</strong></span><span>Preferred units<strong>{data?.preferred_units ?? "metric"}</strong></span></div><a className="button button-primary" href="/client/dashboard">Back to dashboard</a></main>;
}
