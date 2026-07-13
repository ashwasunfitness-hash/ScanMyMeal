import { redirectAfterAuthentication, getAccessContext } from "@/lib/access-control";
import { isSupabaseConfigured } from "@/lib/env";
import { AuthShell } from "../components/AuthShell";
import { SignInForm } from "../components/SignInForm";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const configured = isSupabaseConfigured();
  if (configured && await getAccessContext()) await redirectAfterAuthentication();
  return <AuthShell><SignInForm showDemo={process.env.NODE_ENV !== "production"} serviceAvailable={configured || process.env.NODE_ENV !== "production"} /></AuthShell>;
}
