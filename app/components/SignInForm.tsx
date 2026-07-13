"use client";

import { ArrowLeft, ArrowRight, Check, Eye, LoaderCircle, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

type Stage = "email" | "otp";

export function SignInForm({ showDemo = false, serviceAvailable = true }: { showDemo?: boolean; serviceAvailable?: boolean }) {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function sendCode(event?: FormEvent, mode: "otp" | "magic" = "otp") {
    event?.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/auth/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, mode }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Please wait a moment and try again.");
      setMessage(data.message);
      setCooldown(60);
      if (mode === "otp") setStage("otp");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Please try again."); }
    finally { setBusy(false); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (otp.length !== 6) return setError("Enter the complete six-digit code.");
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, token: otp }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "That code could not be verified.");
      window.location.assign(data.redirectTo);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "That code could not be verified."); setBusy(false); }
  }

  if (!serviceAvailable) return <section className="auth-card"><div className="auth-icon"><ShieldCheck /></div><p className="section-kicker">Private pilot</p><h2>Client access is being prepared</h2><p>The coaching team is completing the secure pilot setup. No action is needed yet.</p><a className="button button-primary full-button" href="/contact-support">Contact the ABC of D® team</a></section>;

  return <section className="auth-card">
    {stage === "email" ? <form onSubmit={(event) => sendCode(event)}>
      <div className="auth-icon"><Mail /></div><p className="section-kicker">Welcome</p><h2>Welcome back</h2><p>Enter your registered email address and we’ll send you a secure login code.</p>
      <label>Email address<input type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(event) => setEmail(event.target.value.trimStart())} /></label>
      {error && <div className="form-error" role="alert">{error}</div>}{message && <div className="form-success"><Check />{message}</div>}
      <button className="button button-primary full-button" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Mail />} Send login code</button>
      <button type="button" className="auth-secondary" disabled={busy || !email} onClick={() => sendCode(undefined, "magic")}>Email me a secure link instead <ArrowRight /></button>
      {showDemo && <><div className="auth-divider"><span>Preview without email</span></div><a className="button button-quiet full-button" href="/demo"><Eye /> Preview as demo client</a><small className="demo-login-note">Local preview only · no private information is saved</small></>}
    </form> : <form onSubmit={verify}>
      <button type="button" className="auth-back" onClick={() => { setStage("email"); setOtp(""); setError(null); }}><ArrowLeft /> Change email</button>
      <div className="auth-icon"><Mail /></div><p className="section-kicker">Secure sign in</p><h2>Check your email</h2><p>Enter the six-digit code sent to <strong>{maskEmail(email)}</strong>.</p>
      <label className="otp-label">Login code<input className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} autoFocus value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} aria-describedby="otp-help" /></label>
      <small id="otp-help">Codes expire for your security. Never share this code.</small>
      {error && <div className="form-error" role="alert">{error}</div>}{message && <div className="form-success"><Check />{message}</div>}
      <button className="button button-primary full-button" disabled={busy || otp.length !== 6}>{busy ? <LoaderCircle className="spin" /> : <Check />} Verify and continue</button>
      <button type="button" className="auth-secondary" disabled={busy || cooldown > 0} onClick={() => sendCode(undefined, "otp")}><RefreshCw /> {cooldown ? `Resend in ${cooldown}s` : "Didn’t receive the code? Resend"}</button>
    </form>}
    <div className="auth-support">Need help accessing your account? <a href="/contact-support">Contact the ABC of D® team.</a></div>
  </section>;
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 2)}${"•".repeat(Math.max(2, local.length - 2))}@${domain}`;
}
