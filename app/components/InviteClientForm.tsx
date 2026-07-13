"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { ArrowLeft, Check, LoaderCircle, MailPlus } from "lucide-react";
import { FormEvent, useState } from "react";

type Coach = { id: string; full_name: string | null; email: string };

export function InviteClientForm({ coaches }: { coaches: Coach[] }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>, send: boolean) {
    event.preventDefault(); await submitForm(event.currentTarget, send);
  }
  async function submitForm(formElement: HTMLFormElement, send: boolean) {
    setBusy(true); setError(null); setResult(null);
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/admin/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, send }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The invitation could not be saved.");
      setResult(send ? "Invitation saved and sent." : "Invitation saved as pending.");
      formElement.reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The invitation could not be saved."); }
    finally { setBusy(false); }
  }

  return <form className="admin-form-card" onSubmit={(event) => submit(event, true)}>
    <div className="admin-form-heading"><div><p className="section-kicker">Invitation-only access</p><h2>Client details</h2><p>Only the registered email will be able to enter this programme.</p></div><span><MailPlus /></span></div>
    <div className="admin-form-grid"><label>Full name<input name="full_name" required minLength={2} maxLength={120} /></label><label>Email address<input name="email" type="email" required autoComplete="off" /></label><label>Phone <small>optional</small><input name="phone" type="tel" /></label><label>Programme<select name="programme_name" required defaultValue=""><option value="" disabled>Choose programme</option><option>Whole-food wellness</option><option>Fat-loss foundations</option><option>Muscle-building support</option><option>General wellness</option><option>Disease-reversal coaching support</option></select></label><label>Primary goal<select name="primary_goal" required defaultValue=""><option value="" disabled>Choose goal</option><option>Fat loss</option><option>Muscle gain</option><option>Weight maintenance</option><option>General fitness</option><option>Improved meal quality</option><option>Disease-reversal coaching support</option></select></label><label>Assigned coach<select name="assigned_coach_id" defaultValue=""><option value="">Assign later</option>{coaches.map((coach) => <option value={coach.id} key={coach.id}>{coach.full_name ?? coach.email}</option>)}</select></label><label>Programme starts<input name="programme_starts_at" type="date" required /></label><label>Programme expires<input name="programme_expires_at" type="date" required /></label></div>
    {error && <div className="form-error" role="alert">{error}</div>}{result && <div className="form-success"><Check />{result}</div>}
    <footer><a className="button button-quiet" href="/admin/clients"><ArrowLeft /> Cancel</a><button type="button" className="button button-quiet" disabled={busy} onClick={(event) => event.currentTarget.form && submitForm(event.currentTarget.form, false)}>Save without sending</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <MailPlus />} Save and send invitation</button></footer>
  </form>;
}
