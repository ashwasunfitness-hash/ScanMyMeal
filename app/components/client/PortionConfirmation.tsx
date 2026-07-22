"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { PORTION_SIZES, PORTION_UNITS, canSubmitPortions, createPortionDraft, formatPortionLabel, portionDraftErrors, suggestedPortionUnits, updatePortionDraft } from "@/lib/client/meal-portion-confirmation";
import type { ConfirmedFoodList } from "@/lib/meal-food-confirmation-contract";
import { safePortionConfirmationSchema, type PortionRequestItem, type PortionSize, type PortionUnit, type SafePortionConfirmationPayload } from "@/lib/meal-portion-confirmation-contract";

export function PortionConfirmation({ jobId, foods }: { jobId: string; foods: ConfirmedFoodList }) {
  const [portions, setPortions] = useState<PortionRequestItem[]>(() => createPortionDraft(foods));
  const [confirmation, setConfirmation] = useState<SafePortionConfirmationPayload | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const submissionLocked = useRef(false);
  const foodIds = useMemo(() => foods.map((food) => food.id), [foods]);
  const errors = useMemo(() => portionDraftErrors(portions, foodIds), [portions, foodIds]);

  useEffect(() => {
    let cancelled = false;
    void requestSavedPortions(jobId).then((saved) => {
      if (cancelled) return;
      if (saved) {
        setConfirmation(saved);
        setPortions(saved.portions.map(({ confirmedFoodItemId, quantity, unit, size }) => ({ confirmedFoodItemId, quantity, unit, ...(size ? { size } : {}) })));
      }
      setLoadingSaved(false);
    }).catch(() => {
      if (!cancelled) { setNotice("We could not check for saved portions. Your draft is still available."); setLoadingSaved(false); }
    });
    return () => { cancelled = true; };
  }, [jobId]);

  function updateQuantity(foodId: string, value: string) {
    setPortions((current) => updatePortionDraft(current, foodId, { quantity: value === "" ? 0 : Number(value) }));
    setNotice(null);
  }

  function updateUnit(foodId: string, unit: PortionUnit) {
    setPortions((current) => updatePortionDraft(current, foodId, { unit }));
    setNotice(null);
  }

  function updateSize(foodId: string, size: PortionSize | "") {
    setPortions((current) => current.map((item) => item.confirmedFoodItemId === foodId
      ? { confirmedFoodItemId: item.confirmedFoodItemId, quantity: item.quantity, unit: item.unit, ...(size ? { size } : {}) }
      : item));
    setNotice(null);
  }

  async function confirmPortions() {
    if (submissionLocked.current || confirmation || !canSubmitPortions(portions, foodIds, false, false)) return;
    submissionLocked.current = true;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/meal-analysis-jobs/${jobId}/portion-confirmation`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portions }),
      });
      const payload: unknown = await response.json();
      const parsed = response.ok ? safePortionConfirmationSchema.safeParse(payload) : null;
      if (parsed?.success) setConfirmation(parsed.data);
      else setNotice(readApiError(payload));
    } catch { setNotice("Your connection was interrupted. The portions are still here, so you can retry."); }
    finally { submissionLocked.current = false; setSaving(false); }
  }

  if (confirmation) return <section className="portion-confirmation portion-confirmed" aria-labelledby="portions-confirmed-title">
    <div className="portion-heading"><CheckCircle2 aria-hidden="true" /><div><h3 id="portions-confirmed-title">Portions confirmed</h3><p>Your meal is ready for nutrition analysis.</p></div></div>
    <p className="sr-only" role="status" aria-live="polite">Portions saved successfully.</p>
    <ul className="confirmed-portion-list">{confirmation.portions.map((portion) => <li key={portion.id}><strong>{portion.foodName}</strong><span>{formatPortionLabel(portion.quantity, portion.unit, portion.size)}</span></li>)}</ul>
    <button className="nutrition-next-placeholder" type="button" disabled>Nutrition analysis coming next</button>
  </section>;

  if (foods.length === 0) return <section className="portion-confirmation" aria-labelledby="portion-review-title"><h3 id="portion-review-title">Review portions</h3><p role="alert">The confirmed food list is empty. Return to the food-confirmation step before adding portions.</p></section>;

  return <section className="portion-confirmation" aria-labelledby="portion-review-title">
    <div className="portion-heading"><div><h3 id="portion-review-title">Review portions</h3><p>Tell us approximately how much you ate using familiar household measures.</p></div></div>
    {loadingSaved && <p className="portion-load-status" role="status"><LoaderCircle className="status-spinner" aria-hidden="true" />Checking for saved portions…</p>}
    <div className="portion-list">{foods.map((food, index) => {
      const item = portions.find((portion) => portion.confirmedFoodItemId === food.id);
      if (!item) return <div className="portion-card" key={food.id}><h4>{food.name}</h4><p className="portion-field-error" role="alert">Add a portion for this food.</p></div>;
      const errorId = `portion-error-${index}`;
      const suggestions = suggestedPortionUnits(food.name, food.category);
      const units = [...suggestions, ...PORTION_UNITS.filter((unit) => !suggestions.includes(unit))];
      return <fieldset className="portion-card" key={food.id} aria-describedby={errors[food.id] ? errorId : undefined}>
        <legend>{food.name}</legend>
        <div className="portion-fields">
          <label><span>Quantity</span><input type="number" inputMode="decimal" min="0.25" max="50" step="0.25" value={item.quantity || ""} aria-invalid={Boolean(errors[food.id])} aria-describedby={errors[food.id] ? errorId : `portion-hint-${index}`} onChange={(event) => updateQuantity(food.id, event.target.value)} /></label>
          <label><span>Unit</span><select value={item.unit} onChange={(event) => updateUnit(food.id, event.target.value as PortionUnit)}>{units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
          <label><span>Size <small>(optional)</small></span><select value={item.size ?? ""} onChange={(event) => updateSize(food.id, event.target.value as PortionSize | "")}><option value="">Not specified</option>{PORTION_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        </div>
        <small id={`portion-hint-${index}`} className="portion-fraction-hint">Quarter portions are welcome: ¼, ½, ¾ or 1¼.</small>
        {errors[food.id] && <small id={errorId} className="portion-field-error">{errors[food.id]}</small>}
      </fieldset>;
    })}</div>
    {notice && <p className="portion-api-notice" role="alert" aria-live="assertive">{notice}</p>}
    <button className="confirm-portions-action" type="button" disabled={!canSubmitPortions(portions, foodIds, saving || loadingSaved, false)} onClick={confirmPortions}>{saving ? <><LoaderCircle className="status-spinner" aria-hidden="true" />Saving portions…</> : <><CheckCircle2 aria-hidden="true" />Confirm portions</>}</button>
    <small className="confirmation-lock-note">After confirmation, these portions cannot be edited in this workflow.</small>
  </section>;
}

function readApiError(payload: unknown) {
  return payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
    ? (payload as { error: string }).error
    : "The portions could not be confirmed. Please retry.";
}

async function requestSavedPortions(jobId: string) {
  const response = await fetch(`/api/meal-analysis-jobs/${jobId}/portion-confirmation`, { cache: "no-store" });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("refresh_failed");
  const saved = payload && typeof payload === "object" ? (payload as { confirmation?: unknown }).confirmation : null;
  if (!saved) return null;
  const parsed = safePortionConfirmationSchema.safeParse(saved);
  if (!parsed.success) throw new Error("refresh_failed");
  return parsed.data;
}
