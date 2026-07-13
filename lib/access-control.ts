import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, ProgrammeRow } from "@/lib/supabase/database.types";
import { destinationFor } from "@/lib/access-rules";
export { destinationFor, safeReturnTo } from "@/lib/access-rules";

export type UserRole = ProfileRow["role"];
export type AccountStatus = ProfileRow["account_status"];
export type ProgrammeStatus = ProgrammeRow["status"];

export type AccessContext = {
  userId: string;
  email: string;
  profile: ProfileRow;
  programme: ProgrammeRow | null;
};

export async function getAccessContext(): Promise<AccessContext | null> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  const email = typeof claimsData?.claims?.email === "string" ? claimsData.claims.email : "";
  if (claimsError || !userId) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile) return null;
  const { data: programmes } = await supabase.from("programmes").select("*").eq("client_id", userId).order("created_at", { ascending: false }).limit(1);
  return { userId, email: email || profile.email, profile, programme: programmes?.[0] ?? null };
}

export async function requireAccess(allowedRoles?: UserRole[]) {
  const context = await getAccessContext();
  if (!context) redirect("/sign-in");
  if (context.profile.account_status === "suspended") redirect("/account-suspended");
  if (context.profile.account_status === "archived") redirect("/sign-in?message=access");
  if (allowedRoles && !allowedRoles.includes(context.profile.role)) redirect(destinationFor({ role: context.profile.role, accountStatus: context.profile.account_status, onboardingCompleted: Boolean(context.profile.onboarding_completed_at), programmeStatus: context.programme?.status }));
  return context;
}

export async function requireActiveClient() {
  const context = await requireAccess(["client"]);
  const destination = destinationFor({ role: context.profile.role, accountStatus: context.profile.account_status, onboardingCompleted: Boolean(context.profile.onboarding_completed_at), programmeStatus: context.programme?.status });
  if (destination !== "/client/dashboard") redirect(destination);
  return context;
}

export async function redirectAfterAuthentication() {
  const context = await getAccessContext();
  if (!context) redirect("/sign-in?message=access");
  redirect(destinationFor({ role: context.profile.role, accountStatus: context.profile.account_status, onboardingCompleted: Boolean(context.profile.onboarding_completed_at), programmeStatus: context.programme?.status }));
}
