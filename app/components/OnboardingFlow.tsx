"use client";

import { ArrowLeft, ArrowRight, Check, Leaf, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import type { Json, ProgrammeRow } from "@/lib/supabase/database.types";

type Draft = Record<string, Json | undefined>;
const stepNames = ["Welcome", "Your profile", "Goals", "Food preferences", "Programme", "Consent", "Ready"];

export function OnboardingFlow({ initialStep, initialDraft, programme, coachName }: { initialStep: number; initialDraft: Draft; programme: ProgrammeRow | null; coachName: string | null }) {
  const [step, setStep] = useState(Math.min(7, Math.max(1, initialStep)));
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField(name: string, value: Json) { setDraft((current) => ({ ...current, [name]: value })); }
  async function saveAndMove(next: number) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/onboarding", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: next, payload: draft }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your progress could not be saved.");
      setStep(next); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your progress could not be saved."); }
    finally { setBusy(false); }
  }
  async function complete() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload: draft }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Please review the required details.");
      setStep(7);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Onboarding could not be completed."); }
    finally { setBusy(false); }
  }

  return <main className="onboarding-page">
    <header><div className="onboarding-brand"><Leaf /><span><strong>Scan My Meal</strong><small>by Dr. Ashu</small></span></div><span>Step {step} of 7</span></header>
    <div className="onboarding-progress" aria-label={`Onboarding step ${step} of 7`}><i style={{ width: `${step / 7 * 100}%` }} /></div>
    <section className="onboarding-shell">
      <aside><p className="section-kicker">Getting started</p><h1>A few details make your guidance more personal.</h1><ol>{stepNames.map((name, index) => <li className={index + 1 === step ? "active" : index + 1 < step ? "done" : ""} key={name}><span>{index + 1 < step ? <Check /> : index + 1}</span>{name}</li>)}</ol></aside>
      <div className="onboarding-card">
        {step === 1 && <StepIntro icon={<Sparkles />} kicker="Welcome" title="Welcome to Scan My Meal" text="Your personal meal-tracking companion from Dr. Ashu and ABC of D®."><div className="welcome-features"><span>Scan meals</span><span>Understand estimated nutrition</span><span>Track progress</span><span>Receive coaching feedback</span></div></StepIntro>}
        {step === 2 && <><StepHeading kicker="About you" title="Let’s begin with the basics" text="These details help your coaching team understand your context." /><div className="form-grid"><Field label="Full name" name="full_name" value={draft.full_name} onChange={setField} required /><Field label="Date of birth" name="date_of_birth" type="date" value={draft.date_of_birth} onChange={setField} required /><Select label="Gender" name="gender" value={draft.gender} onChange={setField} options={["Woman","Man","Non-binary","Prefer to self-describe","Prefer not to say"]} /><Field label="Height (cm)" name="height_cm" type="number" value={draft.height_cm} onChange={setField} required /><Field label="Weight (kg)" name="current_weight_kg" type="number" value={draft.current_weight_kg} onChange={setField} required /><Field label="City / location" name="location" value={draft.location} onChange={setField} required /><Select label="Preferred units" name="preferred_units" value={draft.preferred_units ?? "metric"} onChange={setField} options={["metric","imperial"]} /></div></>}
        {step === 3 && <><StepHeading kicker="Goals & lifestyle" title="What are you working towards?" text="Your coach can refine these starting details later." /><div className="form-grid"><Select label="Primary goal" name="primary_goal" value={draft.primary_goal} onChange={setField} options={["Fat loss","Muscle gain","Weight maintenance","General fitness","Sports performance","Improved meal quality","Disease-reversal coaching support"]} /><Select label="Activity level" name="activity_level" value={draft.activity_level} onChange={setField} options={["Mostly seated","Lightly active","Moderately active","Very active"]} /><Select label="Workout frequency" name="workout_frequency" value={draft.workout_frequency} onChange={setField} options={["Not currently","1–2 times a week","3–4 times a week","5+ times a week"]} /><Field label="Typical meal schedule" name="typical_meal_schedule" value={draft.typical_meal_schedule} onChange={setField} placeholder="e.g. breakfast 8 am, lunch 1 pm" /><Field label="Preferred cuisine" name="preferred_cuisines" value={arrayText(draft.preferred_cuisines)} onChange={(name, value) => setField(name, String(value).split(",").map((item) => item.trim()).filter(Boolean))} placeholder="South Indian, Gujarati" /></div></>}
        {step === 4 && <><StepHeading kicker="Food preferences" title="Help us understand your meals" text="You do not need to already follow a fully plant-based diet. Automated suggestions will remain whole-food plant-based." /><div className="form-grid"><Select label="Current dietary pattern" name="dietary_pattern" value={draft.dietary_pattern} onChange={setField} options={["Whole-food plant-based","Vegan","Vegetarian","Mixed diet","Other"]} /><Field label="Allergies" name="allergies" value={arrayText(draft.allergies)} onChange={(name, value) => setField(name, splitList(value))} placeholder="Peanuts, sesame" /><Field label="Foods avoided" name="foods_avoided" value={arrayText(draft.foods_avoided)} onChange={(name, value) => setField(name, splitList(value))} placeholder="Foods you choose not to eat" /><Field label="Preferred Indian cuisines" name="preferred_cuisines" value={arrayText(draft.preferred_cuisines)} onChange={(name, value) => setField(name, splitList(value))} placeholder="Kannada, Punjabi, Bengali" /></div></>}
        {step === 5 && <><StepHeading kicker="Your programme" title="Your coaching plan" text="Programme details are set by your coaching team and cannot be edited here." /><div className="programme-summary"><Summary label="Programme" value={programme?.programme_name ?? "To be assigned"} /><Summary label="Primary goal" value={programme?.primary_goal ?? String(draft.primary_goal ?? "To be confirmed")} /><Summary label="Starts" value={formatDate(programme?.starts_at)} /><Summary label="Ends" value={formatDate(programme?.expires_at)} /><Summary label="Assigned coach" value={coachName ?? "Coaching team"} /></div></>}
        {step === 6 && <><StepHeading kicker="Privacy & consent" title="Review before you begin" text="Your meal records and health context are treated as sensitive personal information." /><div className="consent-copy"><ShieldCheck /><p><strong>Nutrition-estimate disclaimer</strong>Meal recognition, serving sizes, calories and nutrient values are estimates based on the image, your corrections and available nutrition-reference data. Actual values can vary according to ingredients, quantities and preparation.</p></div><Consent name="privacy_consent" checked={Boolean(draft.privacy_consent)} onChange={setField}>I accept the privacy notice.</Consent><Consent name="photo_consent" checked={Boolean(draft.photo_consent)} onChange={setField}>I consent to secure processing of meal photographs.</Consent><Consent name="nutrition_consent" checked={Boolean(draft.nutrition_consent)} onChange={setField}>I understand that nutrition values are estimates.</Consent><Consent name="ai_consent" checked={Boolean(draft.ai_consent)} onChange={setField}>I understand that meal recognition uses AI-assisted analysis.</Consent></>}
        {step === 7 && <StepIntro icon={<Check />} kicker="All set" title="You’re ready to begin" text="Scan your next meal and start building a clearer picture of your nutrition."><a className="button button-primary full-button" href="/client/dashboard">Go to my dashboard <ArrowRight /></a></StepIntro>}
        {error && <div className="form-error" role="alert">{error}</div>}
        {step < 7 && <footer className="onboarding-actions">{step > 1 ? <button className="button button-quiet" disabled={busy} onClick={() => saveAndMove(step - 1)}><ArrowLeft /> Back</button> : <span />}{step === 6 ? <button className="button button-primary" disabled={busy || !allConsents(draft)} onClick={complete}>{busy ? <LoaderCircle className="spin" /> : <Check />} Accept &amp; complete</button> : <button className="button button-primary" disabled={busy} onClick={() => saveAndMove(step + 1)}>{busy ? <LoaderCircle className="spin" /> : null} Continue <ArrowRight /></button>}</footer>}
      </div>
    </section>
  </main>;
}

function StepHeading({ kicker, title, text }: { kicker: string; title: string; text: string }) { return <div className="step-heading"><p className="section-kicker">{kicker}</p><h2>{title}</h2><p>{text}</p></div>; }
function StepIntro({ icon, kicker, title, text, children }: { icon: React.ReactNode; kicker: string; title: string; text: string; children: React.ReactNode }) { return <div className="step-intro"><div>{icon}</div><p className="section-kicker">{kicker}</p><h2>{title}</h2><p>{text}</p>{children}</div>; }
function Field({ label, name, value, onChange, type = "text", placeholder, required }: { label: string; name: string; value: Json | undefined; onChange: (name: string, value: Json) => void; type?: string; placeholder?: string; required?: boolean }) { return <label>{label}<input type={type} required={required} placeholder={placeholder} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={(event) => onChange(name, type === "number" ? Number(event.target.value) : event.target.value)} /></label>; }
function Select({ label, name, value, onChange, options }: { label: string; name: string; value: Json | undefined; onChange: (name: string, value: Json) => void; options: string[] }) { return <label>{label}<select value={typeof value === "string" ? value : ""} onChange={(event) => onChange(name, event.target.value)}><option value="">Choose an option</option>{options.map((option) => <option key={option} value={option}>{title(option)}</option>)}</select></label>; }
function Consent({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: (name: string, value: Json) => void; children: React.ReactNode }) { return <label className="onboarding-consent"><input type="checkbox" checked={checked} onChange={(event) => onChange(name, event.target.checked)} /><span><Check /></span><p>{children}</p></label>; }
function Summary({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function splitList(value: Json) { return String(value).split(",").map((item) => item.trim()).filter(Boolean); }
function arrayText(value: Json | undefined) { return Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : ""; }
function allConsents(draft: Draft) { return Boolean(draft.privacy_consent && draft.photo_consent && draft.nutrition_consent && draft.ai_consent); }
function formatDate(value?: string) { return value ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "To be confirmed"; }
function title(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
