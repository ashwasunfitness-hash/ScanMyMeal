export type PilotCheck = { key: string; label: string; ready: boolean; required: boolean; guidance: string };

export function evaluatePilotReadiness(env: Record<string, string | undefined>): PilotCheck[] {
  const appUrl = parseUrl(env.NEXT_PUBLIC_APP_URL);
  const callbackUrl = parseUrl(env.SUPABASE_AUTH_REDIRECT_URL);
  const supabaseUrl = parseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const production = env.NODE_ENV === "production";
  return [
    check("supabase_url", "Supabase project", Boolean(supabaseUrl && !supabaseUrl.hostname.includes("YOUR_PROJECT")), "Add the Supabase project URL."),
    check("publishable_key", "Supabase publishable key", Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.length >= 20), "Add the project publishable key."),
    check("service_key", "Supabase server key", Boolean(env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY.length >= 30), "Add the service-role key as a protected server secret."),
    check("app_url", "Application URL", Boolean(appUrl && (!production || appUrl.protocol === "https:")), "Use the exact HTTPS pilot URL."),
    check("callback", "Authentication callback", Boolean(appUrl && callbackUrl && callbackUrl.origin === appUrl.origin && callbackUrl.pathname === "/auth/callback"), "Use the pilot origin followed by /auth/callback."),
    check("analysis_endpoint", "Meal-analysis provider", Boolean(parseUrl(env.AI_ANALYSIS_ENDPOINT)), "Add the approved server-side analysis endpoint."),
    check("analysis_key", "Meal-analysis credential", Boolean(env.AI_API_KEY && env.AI_API_KEY.length >= 16), "Add the analysis provider secret."),
    check("demo_disabled", "Production demo safety", !production || env.ALLOW_DEMO_ANALYSIS !== "true", "Remove ALLOW_DEMO_ANALYSIS=true from production."),
  ];
}

export function pilotIsReady(env: Record<string, string | undefined>) {
  return evaluatePilotReadiness(env).every((item) => !item.required || item.ready);
}

function check(key: string, label: string, ready: boolean, guidance: string): PilotCheck {
  return { key, label, ready, required: true, guidance };
}

function parseUrl(value?: string) {
  if (!value) return null;
  try { return new URL(value); } catch { return null; }
}
