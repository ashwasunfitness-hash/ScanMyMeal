import { getAccessContext } from "@/lib/access-control";

export async function requireApiRole(roles: Array<"client" | "coach" | "admin">) {
  const context = await getAccessContext();
  if (!context || !roles.includes(context.profile.role) || context.profile.account_status === "archived" || context.profile.account_status === "suspended") return null;
  return context;
}

export async function requireActiveApiClient() {
  const context = await requireApiRole(["client"]);
  if (!context || context.profile.account_status !== "active" || context.programme?.status !== "active" || new Date(context.programme.expires_at) <= new Date()) return null;
  return context;
}
