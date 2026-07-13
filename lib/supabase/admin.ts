import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { serverEnv } from "@/lib/env";

export function createAdminClient() {
  const config = serverEnv();
  return createClient<Database>(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
