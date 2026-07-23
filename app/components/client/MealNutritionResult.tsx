"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { NUTRIENT_LABELS, formatNutrient, formatNutritionItemPortion, incompleteNutritionLabel } from "@/lib/client/meal-nutrition-presentation";
import { safeMealNutritionResultSchema, type SafeMealNutritionResult } from "@/lib/meal-nutrition-contract";

export function MealNutritionResult({ jobId }: { jobId: string }) {
  const [result, setResult] = useState<SafeMealNutritionResult | null>(null);
  const [state, setState] = useState<"checking" | "calculating" | "error">("checking");
  const [notice, setNotice] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const triggerLocked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function restoreOrCalculate() {
      try {
        const saved = await requestSavedNutrition(jobId);
        if (cancelled) return;
        if (saved) { setResult(saved); return; }
        await triggerCalculation();
      } catch { if (!cancelled) { setState("error"); setRetryable(true); setNotice("We could not check the saved nutrition estimate. Please retry."); } }
    }
    async function triggerCalculation() {
      if (triggerLocked.current || cancelled) return;
      triggerLocked.current = true;
      setState("calculating"); setNotice(null);
      try {
        const response = await fetch(`/api/meal-analysis-jobs/${jobId}/nutrition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const payload: unknown = await response.json();
        const parsed = response.ok ? safeMealNutritionResultSchema.safeParse(payload) : null;
        if (cancelled) return;
        if (parsed?.success) setResult(parsed.data);
        else { setState("error"); setRetryable(readRetryable(payload)); setNotice(readApiError(payload)); }
      } catch { if (!cancelled) { setState("error"); setRetryable(true); setNotice("Your connection was interrupted. Your confirmed foods and portions are still saved."); } }
      finally { triggerLocked.current = false; }
    }
    void restoreOrCalculate();
    return () => { cancelled = true; };
  }, [jobId]);

  async function retry() {
    if (triggerLocked.current) return;
    triggerLocked.current = true; setState("calculating"); setNotice(null);
    try {
      const response = await fetch(`/api/meal-analysis-jobs/${jobId}/nutrition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const payload: unknown = await response.json();
      const parsed = response.ok ? safeMealNutritionResultSchema.safeParse(payload) : null;
      if (parsed?.success) setResult(parsed.data);
      else { setState("error"); setRetryable(readRetryable(payload)); setNotice(readApiError(payload)); }
    } catch { setState("error"); setRetryable(true); setNotice("Your connection was interrupted. Please retry when you are ready."); }
    finally { triggerLocked.current = false; }
  }

  if (result) return <NutritionResultView result={result} />;
  if (state === "error") return <section className="meal-nutrition-result nutrition-unavailable" aria-labelledby="nutrition-error-title">
    <div className="nutrition-heading"><AlertCircle aria-hidden="true" /><div><h3 id="nutrition-error-title">Nutrition estimate unavailable</h3><p>We couldn’t safely calculate this meal yet. Your confirmed foods and portions are still saved.</p></div></div>
    {notice && <p className="nutrition-api-notice" role="alert" aria-live="assertive">{notice}</p>}
    {retryable && <button className="nutrition-retry-action" type="button" onClick={retry}>Retry nutrition estimate</button>}
  </section>;
  return <section className="meal-nutrition-result nutrition-calculating" aria-labelledby="nutrition-calculating-title" aria-live="polite">
    <LoaderCircle className="status-spinner" aria-hidden="true" />
    <div><h3 id="nutrition-calculating-title">Calculating nutrition</h3><p>We’re estimating the nutrition from your confirmed foods and portions.</p></div>
  </section>;
}

function NutritionResultView({ result }: { result: SafeMealNutritionResult }) {
  if (result.status === "failed") return <section className="meal-nutrition-result nutrition-unavailable" aria-labelledby="nutrition-unavailable-title">
    <div className="nutrition-heading"><AlertCircle aria-hidden="true" /><div><h3 id="nutrition-unavailable-title">Nutrition estimate unavailable</h3><p>We couldn’t safely calculate this meal yet. Your confirmed foods and portions are still saved.</p></div></div>
    <UnresolvedFoods result={result} />
  </section>;
  const partial = result.status === "partial";
  return <section className="meal-nutrition-result" aria-labelledby="meal-nutrition-title">
    <div className="nutrition-heading"><CheckCircle2 aria-hidden="true" /><div><h3 id="meal-nutrition-title">{partial ? "Partial nutrition estimate" : "Meal nutrition"}</h3><p>{partial ? "Some foods could not be matched safely, so these totals do not represent the complete meal." : "Nutrition values are estimates based on the confirmed foods and household portions."}</p></div></div>
    {partial && <p className="nutrition-incomplete-note" role="status">{incompleteNutritionLabel(result.unresolvedItemCount)}</p>}
    {result.totals && <section className="nutrition-total-card" aria-labelledby="estimated-total-title"><h4 id="estimated-total-title">Estimated meal total{partial ? " (incomplete)" : ""}</h4><dl>{NUTRIENT_LABELS.map(({ key, label, unit }) => <div key={key}><dt>{label}</dt><dd>{formatNutrient(result.totals![key], unit)}</dd></div>)}</dl></section>}
    <section className="nutrition-item-breakdown" aria-labelledby="nutrition-breakdown-title"><h4 id="nutrition-breakdown-title">Food breakdown</h4><div>{result.items.map((item) => item.mappingStatus === "resolved" ? <article key={item.id} className="nutrition-item-card"><header><div><h5>{item.foodName}</h5><span>{formatNutritionItemPortion(item)}</span></div><small>Estimated</small></header><dl>{NUTRIENT_LABELS.map(({ key, label, unit }) => <div key={key}><dt>{label}</dt><dd>{formatNutrient(item.nutrition[key], unit)}</dd></div>)}</dl></article> : <article key={item.id} className="nutrition-item-card unresolved"><header><div><h5>{item.foodName}</h5><span>{formatNutritionItemPortion(item)}</span></div></header><strong>Not included in totals</strong><p>No safe catalogue match and portion conversion were available.</p></article>)}</div></section>
    <p className="nutrition-estimate-note">Nutrition values are estimates based on the confirmed foods and household portions.</p>
    <button className="save-meal-placeholder" type="button" disabled>Save meal coming next</button>
  </section>;
}

function UnresolvedFoods({ result }: { result: SafeMealNutritionResult }) {
  return <div className="nutrition-unresolved-list"><strong>Not included in totals</strong><ul>{result.items.map((item) => <li key={item.id}>{item.foodName} — {formatNutritionItemPortion(item)}</li>)}</ul></div>;
}

function readApiError(payload: unknown) { return payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string" ? (payload as { error: string }).error : "The nutrition estimate could not be calculated."; }
function readRetryable(payload: unknown) { return Boolean(payload && typeof payload === "object" && (payload as { retryable?: unknown }).retryable === true); }
async function requestSavedNutrition(jobId: string) {
  const response = await fetch(`/api/meal-analysis-jobs/${jobId}/nutrition`, { cache: "no-store" });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("refresh_failed");
  const saved = payload && typeof payload === "object" ? (payload as { result?: unknown }).result : null;
  if (!saved) return null;
  const parsed = safeMealNutritionResultSchema.safeParse(saved);
  if (!parsed.success) throw new Error("refresh_failed");
  return parsed.data;
}
