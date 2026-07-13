import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";

const inputSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), mode: z.enum(["otp", "magic"]).default("otp") });
const GENERIC_MESSAGE = "If this email is registered, we’ve sent a login code.";

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const cookieStore = await cookies();
  const lastSent = Number(cookieStore.get("smm_otp_sent")?.value ?? 0);
  if (Date.now() - lastSent < 60_000) return NextResponse.json({ error: "Please wait before requesting another code." }, { status: 429 });

  try {
    const supabase = await createClient();
    const config = serverEnv();
    await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { shouldCreateUser: false, emailRedirectTo: `${config.SUPABASE_AUTH_REDIRECT_URL}?next=/auth/verify` },
    });
  } catch {
    console.warn(JSON.stringify({ event: "otp_request_failed", configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) }));
  }
  cookieStore.set("smm_otp_sent", String(Date.now()), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 });
  return NextResponse.json({ message: parsed.data.mode === "magic" ? "If this email is registered, we’ve sent a secure sign-in link." : GENERIC_MESSAGE });
}
