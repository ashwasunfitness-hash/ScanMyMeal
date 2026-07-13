import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeReturnTo } from "@/lib/access-control";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeReturnTo(url.searchParams.get("next"), "/auth/verify");
  const supabase = await createClient();
  const result = code ? await supabase.auth.exchangeCodeForSession(code) : tokenHash && type ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type }) : { error: new Error("Missing authentication token") };
  if (result.error) return NextResponse.redirect(new URL("/sign-in?message=expired", url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
