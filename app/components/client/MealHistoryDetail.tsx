"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Camera, LoaderCircle, LockKeyhole } from "lucide-react";
import { MEAL_TYPE_LABELS } from "@/lib/meal-save-contract";
import { mealHistoryDetailSchema, type MealHistoryDetail as MealHistoryDetailData } from "@/lib/meal-history-contract";
import { formatNutrient, NUTRIENT_LABELS } from "@/lib/client/meal-nutrition-presentation";
import { formatPortionLabel } from "@/lib/client/meal-portion-confirmation";

export function MealHistoryDetail({ mealId }: { mealId: string }) {
  const [meal, setMeal] = useState<MealHistoryDetailData | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void requestMeal(mealId).then(async (savedMeal) => {
      if (cancelled) return;
      setMeal(savedMeal);
      setState("ready");
      if (savedMeal.hasImage) {
        try {
          const url = await requestImage(savedMeal.imageEndpoint);
          if (!cancelled) setImageUrl(url);
        } catch { /* The private meal record remains usable without its photo. */ }
      }
    }).catch((error: unknown) => {
      if (!cancelled) { setState("error"); setNotice(error instanceof Error ? error.message : "This meal is temporarily unavailable."); }
    });
    return () => { cancelled = true; };
  }, [mealId]);

  if (state === "loading") return <section className="meal-history-state" aria-live="polite"><LoaderCircle className="status-spinner" aria-hidden="true" /><h1>Loading saved meal</h1><p>Opening the immutable meal record…</p></section>;
  if (state === "error" || !meal) return <section className="meal-history-state is-error" role="alert"><AlertCircle aria-hidden="true" /><h1>Saved meal unavailable</h1><p>{notice}</p><Link href="/client/meals">Return to meal history</Link></section>;

  const partial = meal.nutritionStatus === "partial";
  const unresolved = meal.nutritionStatus === "failed";
  return <article className="meal-history-detail">
    <Link className="meal-history-back" href="/client/meals"><ArrowLeft aria-hidden="true" />Meal history</Link>
    <header className="meal-detail-header">
      <div><p className="section-kicker">Saved meal</p><h1>{MEAL_TYPE_LABELS[meal.mealType]}</h1><time dateTime={meal.eatenAt}>{formatDateTime(meal.eatenAt)}</time></div>
      <span className={`meal-detail-status status-${meal.nutritionStatus}`}>{unresolved ? "Nutrition unresolved" : partial ? "Partial estimate" : "Complete estimate"}</span>
    </header>
    <section className="meal-detail-image" aria-label="Original meal photo">
      {imageUrl
        // The URL is a short-lived private Supabase URL and cannot use the framework image pipeline.
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={imageUrl} alt={`Original ${MEAL_TYPE_LABELS[meal.mealType].toLowerCase()} meal`} />
        : <div><Camera aria-hidden="true" /><span>{meal.hasImage ? "Private photo is temporarily unavailable" : "No meal photo available"}</span></div>}
      <p><LockKeyhole aria-hidden="true" />Private meal photo</p>
    </section>
    {(partial || unresolved) && <p className="meal-detail-honesty" role="status">{partial
      ? `${meal.unresolvedFoodCount} ${meal.unresolvedFoodCount === 1 ? "food was" : "foods were"} not included, so these totals are incomplete.`
      : "No foods could be mapped safely, so this saved meal has no nutrition total."}</p>}
    {meal.totals && <section className="meal-detail-totals" aria-labelledby="history-totals-title"><h2 id="history-totals-title">Persisted nutrition estimate</h2><dl>{NUTRIENT_LABELS.map(({ key, label, unit }) => <div key={key}><dt>{label}</dt><dd>{formatNutrient(meal.totals![key], unit)}</dd></div>)}</dl><small>This is the immutable estimate saved with the meal. It has not been recalculated.</small></section>}
    <section className="meal-detail-foods" aria-labelledby="history-foods-title">
      <h2 id="history-foods-title">Confirmed foods and portions</h2>
      <div>{meal.foods.map((food) => <article className={`meal-detail-food ${food.mappingStatus}`} key={food.id}>
        <header><div><h3>{food.name}</h3><span>{formatPortionLabel(food.quantity, food.unit, food.size)}</span></div><small>{food.mappingStatus === "resolved" ? "Estimated" : "Not in totals"}</small></header>
        {food.nutrition ? <dl>{NUTRIENT_LABELS.map(({ key, label, unit }) => <div key={key}><dt>{label}</dt><dd>{formatNutrient(food.nutrition![key], unit)}</dd></div>)}</dl>
          : <p>{food.unresolvedReason === "portion_not_supported" ? "The confirmed portion did not have a safe catalogue conversion." : "The food did not have a safe catalogue match."}</p>}
      </article>)}</div>
    </section>
    <p className="meal-detail-readonly"><LockKeyhole aria-hidden="true" />Saved meals are read-only and preserve the original confirmed result.</p>
  </article>;
}

async function requestMeal(mealId: string) {
  const response = await fetch(`/api/meals/${mealId}`, { cache: "no-store" });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error(readApiError(payload));
  const parsed = mealHistoryDetailSchema.safeParse(payload);
  if (!parsed.success) throw new Error("The saved meal returned an unsafe response.");
  return parsed.data;
}
async function requestImage(endpoint: string) {
  const response = await fetch(endpoint, { cache: "no-store" });
  const payload: unknown = await response.json();
  if (!response.ok || !payload || typeof payload !== "object" || typeof (payload as { url?: unknown }).url !== "string") throw new Error("image_unavailable");
  return (payload as { url: string }).url;
}
function formatDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(new Date(value)); }
function readApiError(payload: unknown) { return payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string" ? (payload as { error: string }).error : "This saved meal is temporarily unavailable."; }
