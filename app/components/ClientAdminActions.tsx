"use client";

import { Check, LoaderCircle } from "lucide-react";
import { FormEvent, useState } from "react";

export function ClientAdminActions({ clientId, accountStatus, programmeId, startsAt, expiresAt, programmeStatus, assignedCoachId, coaches }: { clientId: string; accountStatus: string; programmeId?: string; startsAt?: string; expiresAt?: string; programmeStatus?: string; assignedCoachId?: string; coaches: Array<{ id: string; full_name: string | null; email: string }> }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null); setError(null);
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`/api/admin/clients/${clientId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, programme_id: programmeId }) });
    const data = await response.json(); setBusy(false);
    if (response.ok) setMessage("Client access updated."); else setError(data.error || "Changes could not be saved.");
  }
  return <form className="client-admin-form" onSubmit={submit}><div className="admin-form-grid"><label>Account status<select name="account_status" defaultValue={accountStatus}><option value="active">Active</option><option value="expired">Expired</option><option value="suspended">Suspended</option><option value="archived">Archived</option><option value="onboarding">Onboarding</option></select></label><label>Programme status<select name="programme_status" defaultValue={programmeStatus}><option value="scheduled">Scheduled</option><option value="active">Active</option><option value="paused">Paused</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></select></label><label>Programme starts<input name="starts_at" type="date" defaultValue={startsAt?.slice(0, 10)} /></label><label>Programme expires<input name="expires_at" type="date" defaultValue={expiresAt?.slice(0, 10)} /></label><label>Assigned coach<select name="assigned_coach_id" defaultValue={assignedCoachId ?? ""}><option value="">Unassigned</option>{coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.full_name ?? coach.email}</option>)}</select></label></div>{error && <div className="form-error">{error}</div>}{message && <div className="form-success"><Check />{message}</div>}<button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Check />} Save access changes</button></form>;
}
