import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { destinationFor } from "@/lib/access-control";

const schema = z.object({ email: z.string().trim().toLowerCase().email(), token: z.string().regex(/^\d{6}$/) });

export async function POST(request: Request) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Enter a valid six-digit code." }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: input.data.email, token: input.data.token, type: "email" });
  if (error || !data.user) return NextResponse.json({ error: "That code is invalid or has expired. Request a new code and try again." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.account_status === "archived") { await supabase.auth.signOut(); return NextResponse.json({ error: "We couldn’t open this account. Please contact the ABC of D® team." }, { status: 403 }); }
  await supabase.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", data.user.id);
  const { data: programmes } = await supabase.from("programmes").select("*").eq("client_id", data.user.id).order("created_at", { ascending: false }).limit(1);
  return NextResponse.json({ redirectTo: destinationFor({ role: profile.role, accountStatus: profile.account_status, onboardingCompleted: Boolean(profile.onboarding_completed_at), programmeStatus: programmes?.[0]?.status }) });
}
