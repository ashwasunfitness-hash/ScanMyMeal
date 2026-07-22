"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ImagePlus, LoaderCircle, Plus, RotateCcw, Trash2 } from "lucide-react";
import { addDraftFood, canSubmitFoodConfirmation, createFoodConfirmationDraft, foodDraftErrors, removeDraftFood, renameDraftFood, validateFoodConfirmationDraft } from "@/lib/client/meal-food-confirmation";
import { safeFoodConfirmationSchema, type ConfirmedFood, type SafeFoodConfirmationPayload } from "@/lib/meal-food-confirmation-contract";
import type { MealRecognition } from "@/lib/meal-recognition-contract";
import { PortionConfirmation } from "@/app/components/client/PortionConfirmation";

export function FoodConfirmation({ jobId, recognition, onReplace }: { jobId: string; recognition: MealRecognition; onReplace: () => void }) {
  const [foods, setFoods] = useState<ConfirmedFood[]>(() => createFoodConfirmationDraft(recognition.foods));
  const [confirmation, setConfirmation] = useState<SafeFoodConfirmationPayload | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ food: ConfirmedFood; index: number } | null>(null);
  const submissionLocked = useRef(false);
  const fieldErrors = useMemo(() => foodDraftErrors(foods), [foods]);
  const recognizedById = useMemo(() => new Map(recognition.foods.map((food) => [food.id, food])), [recognition.foods]);

  async function restoreConfirmation() {
    setLoadingSaved(true);
    setNotice(null);
    try {
      const saved = await requestSavedConfirmation(jobId);
      if (saved) {
        setConfirmation(saved);
        setFoods(saved.foods);
      }
    } catch { setNotice("We could not check for a saved confirmation. You can retry the refresh or continue reviewing safely."); }
    finally { setLoadingSaved(false); }
  }

  useEffect(() => {
    let cancelled = false;
    void requestSavedConfirmation(jobId).then((saved) => {
      if (cancelled) return;
      if (saved) { setConfirmation(saved); setFoods(saved.foods); }
      setLoadingSaved(false);
    }).catch(() => {
      if (!cancelled) { setNotice("We could not check for a saved confirmation. You can retry the refresh or continue reviewing safely."); setLoadingSaved(false); }
    });
    return () => { cancelled = true; };
  }, [jobId]);

  function updateName(id: string, name: string) {
    setFoods((current) => renameDraftFood(current, id, name));
    setRemoved(null);
    setNotice(null);
  }

  function removeFood(food: ConfirmedFood) {
    setFoods((current) => {
      const index = current.findIndex((item) => item.id === food.id);
      setRemoved({ food, index: Math.max(0, index) });
      return removeDraftFood(current, food.id);
    });
    setNotice(null);
  }

  function undoRemove() {
    if (!removed) return;
    setFoods((current) => [...current.slice(0, removed.index), removed.food, ...current.slice(removed.index)]);
    setRemoved(null);
  }

  function addFood() {
    if (foods.length >= 20) { setAddError("A meal can contain at most 20 foods."); return; }
    const id = globalThis.crypto?.randomUUID?.();
    if (!id) { setAddError("Adding food is not supported by this browser."); return; }
    const result = addDraftFood(foods, addName, `user-${id}`);
    if (!result.ok) { setAddError(result.error); return; }
    setFoods(result.foods);
    setAddName("");
    setAddError(null);
    setRemoved(null);
    setNotice(null);
  }

  async function confirmFoods() {
    if (submissionLocked.current || confirmation) return;
    const validated = validateFoodConfirmationDraft(foods);
    if (!validated.ok) { setNotice(validated.error); return; }
    submissionLocked.current = true;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/meal-analysis-jobs/${jobId}/food-confirmation`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foods: validated.foods }),
      });
      const payload: unknown = await response.json();
      const parsed = response.ok ? safeFoodConfirmationSchema.safeParse(payload) : null;
      if (parsed?.success) {
        setConfirmation(parsed.data);
        setFoods(parsed.data.foods);
      } else {
        const message = payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string" ? (payload as { error: string }).error : "The food list could not be confirmed. Please retry.";
        setNotice(message);
      }
    } catch { setNotice("Your connection was interrupted. The food list is still here, so you can retry."); }
    finally { submissionLocked.current = false; setSaving(false); }
  }

  if (confirmation) return <><section className="food-confirmation confirmed" aria-labelledby="foods-confirmed-title">
    <div className="food-confirmation-heading"><CheckCircle2 aria-hidden="true" /><div><h3 id="foods-confirmed-title">Foods confirmed</h3><p>Your food list is ready for portion review.</p></div></div>
    <ul className="confirmed-food-list">{confirmation.foods.map((food) => <li key={food.id}><span>{food.name}</span><small>{food.source === "user_added" ? "Added by you" : "Recognized and confirmed"}</small></li>)}</ul>
  </section><PortionConfirmation jobId={jobId} foods={confirmation.foods} /></>;

  return <section className="food-confirmation" aria-labelledby="food-review-title">
    <div className="food-confirmation-heading"><div><h3 id="food-review-title">Review detected foods</h3><p>Keep what is correct, edit anything inaccurate, and add foods the AI missed.</p></div></div>
    {loadingSaved && <p className="confirmation-load-status" role="status"><LoaderCircle className="status-spinner" aria-hidden="true" />Checking for a saved confirmation…</p>}
    {recognition.foods.length === 0 && <div className="food-empty-recognition"><strong>No recognizable food was found.</strong><span>If you know what was on the plate, add it below—or choose another photo.</span><button type="button" onClick={onReplace}><ImagePlus aria-hidden="true" />Choose another photo</button></div>}
    <div className="food-edit-list">{foods.map((food, index) => {
      const recognized = food.source === "recognized" ? recognizedById.get(food.originalRecognitionItemId) : null;
      const errorId = `food-error-${food.id}`;
      return <div className="food-edit-row" key={food.id}>
        <div className="food-edit-field"><label htmlFor={`food-name-${food.id}`}>Food {index + 1} name</label><input id={`food-name-${food.id}`} value={food.name} maxLength={80} aria-invalid={Boolean(fieldErrors[food.id])} aria-describedby={fieldErrors[food.id] ? errorId : undefined} onChange={(event) => updateName(food.id, event.target.value)} />{fieldErrors[food.id] && <small id={errorId} className="food-field-error">{fieldErrors[food.id]}</small>}</div>
        <div className="food-edit-meta"><span>{food.source === "user_added" ? "Added by you" : recognized ? confidenceText(recognized.confidence) : "Recognized"}</span>{food.category && <span>{food.category}</span>}</div>
        <button className="food-remove-action" type="button" aria-label={`Remove ${food.name || `food ${index + 1}`}`} onClick={() => removeFood(food)}><Trash2 aria-hidden="true" /></button>
      </div>;
    })}</div>
    {foods.length === 0 && <p className="food-list-empty" role="status">Add at least one food before confirming this meal.</p>}
    {removed && <p className="food-undo" role="status"><span>{removed.food.name} removed.</span><button type="button" onClick={undoRemove}><RotateCcw aria-hidden="true" />Undo</button></p>}
    <div className="add-food-control"><label htmlFor="add-food-name">Add another food</label><div><input id="add-food-name" value={addName} maxLength={80} aria-invalid={Boolean(addError)} aria-describedby={addError ? "add-food-error" : undefined} placeholder="e.g. Dal or coconut chutney" onChange={(event) => { setAddName(event.target.value); setAddError(null); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addFood(); } }} /><button type="button" onClick={addFood}><Plus aria-hidden="true" />Add food</button></div>{addError && <small id="add-food-error" className="food-field-error">{addError}</small>}</div>
    {notice && <div className="food-confirmation-notice" role="alert">{notice}<button type="button" onClick={restoreConfirmation}>Check saved list</button></div>}
    <button className="confirm-foods-action" type="button" disabled={!canSubmitFoodConfirmation(foods, saving || loadingSaved, false)} aria-disabled={!canSubmitFoodConfirmation(foods, saving || loadingSaved, false)} onClick={confirmFoods}>{saving ? <><LoaderCircle className="status-spinner" aria-hidden="true" />Saving foods…</> : <><CheckCircle2 aria-hidden="true" />Confirm foods</>}</button>
    <small className="confirmation-lock-note">After confirmation, this food list cannot be edited in this workflow.</small>
  </section>;
}

function confidenceText(value: "high" | "medium" | "low") { return `${value.charAt(0).toUpperCase()}${value.slice(1)} confidence`; }

async function requestSavedConfirmation(jobId: string) {
  const response = await fetch(`/api/meal-analysis-jobs/${jobId}/food-confirmation`, { cache: "no-store" });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("refresh_failed");
  const saved = payload && typeof payload === "object" ? (payload as { confirmation?: unknown }).confirmation : null;
  if (!saved) return null;
  const parsed = safeFoodConfirmationSchema.safeParse(saved);
  if (!parsed.success) throw new Error("refresh_failed");
  return parsed.data;
}
