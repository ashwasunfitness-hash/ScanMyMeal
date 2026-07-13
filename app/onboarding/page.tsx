import { requireAccess } from "@/lib/access-control";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "../components/OnboardingFlow";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const context = await requireAccess(["client"]);
  const supabase = await createClient();
  const [{ data: draft }, { data: clientProfile }] = await Promise.all([
    supabase.from("onboarding_drafts").select("*").eq("user_id", context.userId).maybeSingle(),
    supabase.from("client_profiles").select("*").eq("user_id", context.userId).maybeSingle(),
  ]);
  let coachName: string | null = null;
  if (context.programme?.assigned_coach_id) {
    const { data: coach } = await supabase.from("profiles").select("full_name").eq("id", context.programme.assigned_coach_id).maybeSingle();
    coachName = coach?.full_name ?? null;
  }
  return <OnboardingFlow initialStep={draft?.step ?? context.profile.onboarding_step ?? 1} initialDraft={{ ...(clientProfile ?? {}), ...((draft?.payload as Record<string, unknown> | null) ?? {}), full_name: context.profile.full_name ?? "" }} programme={context.programme} coachName={coachName} />;
}
