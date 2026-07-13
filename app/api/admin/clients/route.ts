import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export async function GET() {
  const actor = await requireApiRole(["coach", "admin"]);
  if (!actor) return NextResponse.json({ error: "You do not have access to client records." }, { status: 403 });
  const supabase = await createClient();
  let ids: string[] | null = null;
  if (actor.profile.role === "coach") {
    const { data } = await supabase.from("coach_assignments").select("client_id").eq("coach_id", actor.userId).eq("is_active", true);
    ids = data?.map((row) => row.client_id) ?? [];
    if (!ids.length) return NextResponse.json({ clients: [] });
  }
  let query = supabase.from("profiles").select("id, full_name, email, account_status, created_at").eq("role", "client").order("full_name");
  if (ids) query = query.in("id", ids);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Client records are temporarily unavailable." }, { status: 503 });
  return NextResponse.json({ clients: data });
}
