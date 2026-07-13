import { requireAccess } from "@/lib/access-control";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "../../../components/AdminShell";
import { InviteClientForm } from "../../../components/InviteClientForm";

export const dynamic = "force-dynamic";
export default async function NewClientPage() { await requireAccess(["admin"]); const supabase = await createClient(); const { data: coaches } = await supabase.from("profiles").select("id,full_name,email").eq("role", "coach").eq("account_status", "active").order("full_name"); return <AdminShell active="clients"><header className="page-header"><div><p className="section-kicker">New paid client</p><h1>Send a private invitation</h1><span>Create programme access without opening public registration.</span></div></header><InviteClientForm coaches={coaches ?? []} /></AdminShell>; }
