"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, LockKeyhole } from "lucide-react";
import {
  MEAL_TYPES,
  MEAL_TYPE_LABELS,
  safeSavedMealSchema,
  type MealType,
  type SafeSavedMeal,
} from "@/lib/meal-save-contract";

export function MealSaveForm({ jobId, nutritionStatus }: { jobId: string; nutritionStatus: "completed" | "partial" | "failed" }) {
  const [mealType, setMealType] = useState<MealType | "">("");
  const [eatenAt, setEatenAt] = useState(() => localDateTimeValue(new Date()));
  const [dateBounds] = useState(() => {
    const now = new Date();
    return {
      min: localDateTimeValue(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)),
      max: localDateTimeValue(new Date(now.getTime() + 10 * 60 * 1000)),
    };
  });
  const [savedMeal, setSavedMeal] = useState<SafeSavedMeal | null>(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const submissionLocked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void requestSavedMeal(jobId).then((meal) => {
      if (cancelled) return;
      if (meal) {
        setSavedMeal(meal);
        setMealType(meal.mealType);
        setEatenAt(localDateTimeValue(new Date(meal.eatenAt)));
      }
    }).catch(() => {
      if (!cancelled) setNotice("We could not check whether this meal was already saved. Please retry.");
    }).finally(() => {
      if (!cancelled) setChecking(false);
    });
    return () => { cancelled = true; };
  }, [jobId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLocked.current || saving || savedMeal) return;
    const date = new Date(eatenAt);
    if (!mealType || !Number.isFinite(date.getTime())) {
      setNotice("Choose a meal type and a valid eaten date and time.");
      return;
    }
    submissionLocked.current = true;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisJobId: jobId, mealType, eatenAt: date.toISOString() }),
      });
      const payload: unknown = await response.json();
      const parsed = response.ok ? safeSavedMealSchema.safeParse(payload) : null;
      if (parsed?.success) setSavedMeal(parsed.data);
      else setNotice(readApiError(payload));
    } catch {
      setNotice("Your connection was interrupted. The meal is still ready, so you can retry.");
    } finally {
      submissionLocked.current = false;
      setSaving(false);
    }
  }

  if (savedMeal) return <section className="meal-save-card meal-saved" aria-labelledby="meal-saved-title" role="status" aria-live="polite">
    <CheckCircle2 aria-hidden="true" />
    <div>
      <p className="section-kicker">Saved securely</p>
      <h4 id="meal-saved-title">Meal saved</h4>
      <p>{MEAL_TYPE_LABELS[savedMeal.mealType]} · {formatSavedTime(savedMeal.eatenAt)}</p>
      {savedMeal.nutritionStatus !== "completed" && <small>The meal was saved with its honest {savedMeal.nutritionStatus === "partial" ? "partial" : "fully unresolved"} nutrition result.</small>}
    </div>
  </section>;

  return <form className="meal-save-card" onSubmit={submit} aria-labelledby="save-meal-title">
    <div className="meal-save-heading">
      <div><p className="section-kicker">Final step</p><h4 id="save-meal-title">Save this meal</h4><p>Confirm the meal type and when you ate it.</p></div>
      <LockKeyhole aria-hidden="true" />
    </div>
    {nutritionStatus !== "completed" && <p className="meal-save-honesty-note">{nutritionStatus === "partial"
      ? "This meal will be saved with incomplete totals because some foods could not be matched safely."
      : "This meal will be saved without nutrition totals because none of its foods could be mapped safely."}</p>}
    <fieldset disabled={checking || saving}>
      <legend>Meal type</legend>
      <div className="meal-type-options">{MEAL_TYPES.map((type) => <label key={type}>
        <input type="radio" name="meal-type" value={type} checked={mealType === type} onChange={() => { setMealType(type); setNotice(null); }} />
        <span>{MEAL_TYPE_LABELS[type]}</span>
      </label>)}</div>
    </fieldset>
    <label className="meal-eaten-field" htmlFor={`meal-eaten-at-${jobId}`}>
      <span>When did you eat this?</span>
      <input id={`meal-eaten-at-${jobId}`} type="datetime-local" required value={eatenAt} max={dateBounds.max} min={dateBounds.min} disabled={checking || saving} onChange={(event) => { setEatenAt(event.target.value); setNotice(null); }} />
      <small>This uses the date and time on your device.</small>
    </label>
    {checking && <p className="meal-save-status" role="status"><LoaderCircle className="status-spinner" aria-hidden="true" />Checking for a saved meal…</p>}
    {notice && <p className="meal-save-error" role="alert" aria-live="assertive">{notice}</p>}
    <button className="save-meal-action" type="submit" disabled={checking || saving || !mealType}>
      {saving ? <><LoaderCircle className="status-spinner" aria-hidden="true" />Saving meal…</> : <><CheckCircle2 aria-hidden="true" />Save meal</>}
    </button>
    <small className="confirmation-lock-note">After saving, this meal cannot be edited in this workflow.</small>
  </form>;
}

async function requestSavedMeal(jobId: string) {
  const response = await fetch(`/api/meal-analysis-jobs/${jobId}/meal`, { cache: "no-store" });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("refresh_failed");
  const meal = payload && typeof payload === "object" ? (payload as { meal?: unknown }).meal : null;
  if (!meal) return null;
  const parsed = safeSavedMealSchema.safeParse(meal);
  if (!parsed.success) throw new Error("refresh_failed");
  return parsed.data;
}

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatSavedTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function readApiError(payload: unknown) {
  return payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
    ? (payload as { error: string }).error
    : "The meal could not be saved. Please retry.";
}
