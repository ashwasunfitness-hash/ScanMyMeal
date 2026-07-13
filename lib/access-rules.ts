export type AccessRole = "client" | "coach" | "admin";
export type AccessAccountStatus = "invited" | "onboarding" | "active" | "expired" | "suspended" | "archived";
export type AccessProgrammeStatus = "scheduled" | "active" | "expired" | "paused" | "cancelled";

export function destinationFor(input: { role: AccessRole; accountStatus: AccessAccountStatus; onboardingCompleted: boolean; programmeStatus?: AccessProgrammeStatus | null }) {
  if (input.accountStatus === "suspended" || input.programmeStatus === "paused") return "/account-suspended";
  if (input.accountStatus === "expired" || input.programmeStatus === "expired" || input.programmeStatus === "cancelled") return "/access-expired";
  if (input.accountStatus === "archived") return "/sign-in?message=access";
  if (input.role === "admin") return "/admin";
  if (input.role === "coach") return "/coach";
  if (input.accountStatus === "invited" || input.accountStatus === "onboarding" || !input.onboardingCompleted) return "/onboarding";
  if (input.programmeStatus === "scheduled") return "/access-expired?state=scheduled";
  return "/client/dashboard";
}

export function safeReturnTo(value: string | null | undefined, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const parsed = new URL(value, "https://app.local");
    return parsed.origin === "https://app.local" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch { return fallback; }
}
