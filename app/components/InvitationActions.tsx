"use client";

import { LoaderCircle, RefreshCw, X } from "lucide-react";
import { useState } from "react";

export function InvitationActions({ id, status }: { id: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function act(action: "resend" | "cancel") {
    if (action === "cancel" && !window.confirm("Cancel this invitation? The client will no longer be able to accept it.")) return;
    setBusy(true); setMessage(null);
    const response = await fetch(`/api/admin/invitations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await response.json(); setBusy(false);
    if (response.ok) { setMessage(action === "resend" ? "Sent" : "Cancelled"); window.setTimeout(() => window.location.reload(), 500); }
    else setMessage(data.error || "Try again");
  }
  if (status !== "pending") return <span className="table-muted">—</span>;
  return <div className="row-actions">{busy ? <LoaderCircle className="spin" /> : <><button onClick={() => act("resend")} title="Resend invitation"><RefreshCw /></button><button onClick={() => act("cancel")} title="Cancel invitation"><X /></button></>} {message && <small>{message}</small>}</div>;
}
