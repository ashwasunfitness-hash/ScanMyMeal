"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Camera, LoaderCircle, Utensils } from "lucide-react";
import { MEAL_TYPE_LABELS } from "@/lib/meal-save-contract";
import { mealHistoryPageSchema, type MealHistorySummary } from "@/lib/meal-history-contract";
import { formatGrams, formatKcal } from "@/lib/client/meal-nutrition-presentation";

export function MealHistoryList() {
  const [meals, setMeals] = useState<MealHistorySummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const requestLocked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void requestHistory(null).then((page) => {
      if (cancelled) return;
      setMeals(page.meals);
      setNextCursor(page.nextCursor);
      setState("ready");
    }).catch((error: unknown) => {
      if (!cancelled) { setState("error"); setNotice(error instanceof Error ? error.message : "Meal history is temporarily unavailable."); }
    });
    return () => { cancelled = true; };
  }, []);

  async function retry() {
    if (requestLocked.current) return;
    requestLocked.current = true;
    setState("loading");
    setNotice(null);
    try {
      const page = await requestHistory(null);
      setMeals(page.meals);
      setNextCursor(page.nextCursor);
      setState("ready");
    } catch (error) {
      setState("error");
      setNotice(error instanceof Error ? error.message : "Meal history is temporarily unavailable.");
    } finally {
      requestLocked.current = false;
    }
  }

  async function loadMore() {
    if (!nextCursor || requestLocked.current) return;
    requestLocked.current = true;
    setLoadingMore(true);
    setNotice(null);
    try {
      const page = await requestHistory(nextCursor);
      setMeals((current) => {
        const known = new Set(current.map((meal) => meal.id));
        return [...current, ...page.meals.filter((meal) => !known.has(meal.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "More meals could not be loaded.");
    } finally {
      requestLocked.current = false;
      setLoadingMore(false);
    }
  }

  if (state === "loading") return <section className="meal-history-state" aria-live="polite"><LoaderCircle className="status-spinner" aria-hidden="true" /><h2>Loading your meals</h2><p>Checking your private saved-meal history…</p></section>;
  if (state === "error") return <section className="meal-history-state is-error" role="alert"><AlertCircle aria-hidden="true" /><h2>Meal history is unavailable</h2><p>{notice}</p><button type="button" onClick={retry}>Try again</button></section>;
  if (meals.length === 0) return <section className="meal-history-state is-empty"><Utensils aria-hidden="true" /><p className="section-kicker">Your private history</p><h2>No saved meals yet</h2><p>Meals appear here only after you confirm their foods, portions and nutrition, then save them.</p><Link href="/client/scan">Scan your first meal</Link></section>;

  const groups = groupMealsByDate(meals);
  return <section className="meal-history" aria-label="Saved meal history">
    {groups.map((group) => <section className="meal-history-day" key={group.key} aria-labelledby={`history-date-${group.key}`}>
      <h2 id={`history-date-${group.key}`}>{group.label}</h2>
      <div className="meal-history-grid">{group.meals.map((meal) => <MealHistoryCard meal={meal} key={meal.id} />)}</div>
    </section>)}
    {notice && <p className="meal-history-inline-error" role="alert">{notice}</p>}
    {nextCursor && <button className="meal-history-more" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Loading more…" : "Load more meals"}</button>}
  </section>;
}

function MealHistoryCard({ meal }: { meal: MealHistorySummary }) {
  const status = meal.nutritionStatus === "completed" ? "Complete estimate" : meal.nutritionStatus === "partial" ? "Partial estimate" : "Nutrition unresolved";
  return <Link className="meal-history-card" href={`/client/meals/${meal.id}`} aria-label={`Open ${MEAL_TYPE_LABELS[meal.mealType]} from ${formatDateTime(meal.eatenAt)}`}>
    <div className="meal-history-card-top">
      <span className="meal-history-type">{MEAL_TYPE_LABELS[meal.mealType]}</span>
      <time dateTime={meal.eatenAt}>{formatTime(meal.eatenAt)}</time>
    </div>
    <div className="meal-history-card-body">
      <span className="meal-history-photo-marker" aria-hidden="true">{meal.hasImage ? <Camera /> : <Utensils />}</span>
      <div><strong>{meal.foodCount} {meal.foodCount === 1 ? "food" : "foods"}</strong><span className={`meal-history-status status-${meal.nutritionStatus}`}>{status}</span></div>
      <ArrowRight aria-hidden="true" />
    </div>
    {meal.totals ? <dl className="meal-history-totals"><div><dt>Energy</dt><dd>{formatKcal(meal.totals.energyKcal)}</dd></div><div><dt>Protein</dt><dd>{formatGrams(meal.totals.proteinG)}</dd></div></dl>
      : <p className="meal-history-no-totals">No safe nutrition total was available.</p>}
    {meal.unresolvedFoodCount > 0 && <small>{meal.unresolvedFoodCount} {meal.unresolvedFoodCount === 1 ? "food was" : "foods were"} not included in totals.</small>}
  </Link>;
}

async function requestHistory(cursor: string | null) {
  const response = await fetch(cursor ? `/api/meals?cursor=${encodeURIComponent(cursor)}` : "/api/meals", { cache: "no-store" });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error(readApiError(payload));
  const parsed = mealHistoryPageSchema.safeParse(payload);
  if (!parsed.success) throw new Error("Meal history returned an unsafe response.");
  return parsed.data;
}

function groupMealsByDate(meals: MealHistorySummary[]) {
  const groups = new Map<string, MealHistorySummary[]>();
  for (const meal of meals) {
    const key = localDateKey(meal.eatenAt);
    groups.set(key, [...(groups.get(key) ?? []), meal]);
  }
  return [...groups].map(([key, grouped]) => ({ key, label: formatDate(grouped[0].eatenAt), meals: grouped }));
}

function localDateKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(value)); }
function formatTime(value: string) { return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function readApiError(payload: unknown) { return payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string" ? (payload as { error: string }).error : "Meal history is temporarily unavailable."; }
