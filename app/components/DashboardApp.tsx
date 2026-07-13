"use client";
/* eslint-disable react-hooks/refs, @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarDays, Camera, Check, ChevronDown, ChevronRight, CircleUserRound, Clock3, Edit3, Eye, History, Home, ImagePlus, Leaf, LoaderCircle, MessageCircle, Minus, Plus, ScanLine, Target, Trash2, TrendingUp, X } from "lucide-react";
import type { MealAnalysis } from "@/lib/meal-analysis";
import { calculateTotals, confidenceLabel, demoAnalysis, scaleItem } from "@/lib/meal-analysis";
import { Logo } from "./Logo";

type View = "home" | "scan" | "history" | "progress" | "feedback" | "profile";
type ScanStage = "empty" | "preview" | "analysing" | "confirm" | "saved";
type SavedMeal = { id: string; mealType: string; title: string; caloriesKcal: number; proteinG: number; carbsG?: number; fatG?: number; fibreG?: number; status: string; createdAt: number };

const targets = { calories: 1900, protein: 85, carbs: 245, fat: 58, fibre: 30 };
export function DashboardApp({ displayName, programmeName, programmeExpiresAt, demoMode = false }: { displayName: string; programmeName: string; programmeExpiresAt: string | null; demoMode?: boolean }) {
  const [view, setView] = useState<View>("home");
  const [stage, setStage] = useState<ScanStage>("empty");
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [imageKey, setImageKey] = useState<string | undefined>();
  const [mealType, setMealType] = useState("lunch");
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);
  useEffect(() => {
    if (demoMode) return;
    fetch("/api/meals").then((response) => response.ok ? response.json() : null).then((data) => {
      if (data?.meals?.length) setMeals(data.meals.map((meal: SavedMeal) => ({ ...meal, mealType: titleCase(meal.mealType) })));
    }).catch(() => undefined);
  }, [demoMode]);

  const totals = useMemo(() => meals.reduce((sum, meal) => ({ calories: sum.calories + meal.caloriesKcal, protein: sum.protein + meal.proteinG, carbs: sum.carbs + (meal.carbsG ?? 0), fat: sum.fat + (meal.fatG ?? 0), fibre: sum.fibre + (meal.fibreG ?? 0) }), { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }), [meals]);

  function navigate(next: View) { setView(next); setNotice(null); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function chooseFile(file?: File) {
    if (!file) return;
    setError(null);
    if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.type)) return setError("Please choose a JPG, PNG, WEBP or HEIC photo.");
    if (file.size > 12 * 1024 * 1024) return setError("This photo is larger than 12 MB. Please choose a smaller version.");
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImage(file); setImageUrl(URL.createObjectURL(file)); setStage("preview"); setAnalysis(null);
  }
  async function analyse() {
    if (!image || !consent) return;
    setStage("analysing"); setError(null);
    if (demoMode) {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      const preview = demoAnalysis();
      setAnalysis(preview); setMealType(preview.mealTypeSuggestion === "unknown" ? "lunch" : preview.mealTypeSuggestion); setStage("confirm");
      setNotice("Demo preview: nutrition is illustrative and nothing is uploaded or saved.");
      return;
    }
    const body = new FormData(); body.set("image", image); body.set("consent", "true");
    try {
      const response = await fetch("/api/analyse", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis could not be completed.");
      setAnalysis(data.analysis); setImageKey(data.imageKey); setMealType(data.analysis.mealTypeSuggestion === "unknown" ? "lunch" : data.analysis.mealTypeSuggestion); setStage("confirm");
      if (data.mode === "development") setNotice("Development analysis is active. Connect your approved AI provider before production use.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Analysis could not be completed."); setStage("preview"); }
  }
  function changeGrams(itemId: string, delta: number) {
    if (!analysis) return;
    const items = analysis.items.map((item) => item.id === itemId ? scaleItem(item, Math.max(10, (item.estimatedGrams ?? 100) + delta)) : item);
    setAnalysis({ ...analysis, items, totals: calculateTotals(items) });
  }
  function removeItem(itemId: string) {
    if (!analysis || analysis.items.length === 1) return;
    const items = analysis.items.filter((item) => item.id !== itemId);
    setAnalysis({ ...analysis, items, totals: calculateTotals(items) });
  }
  async function saveMeal() {
    if (!analysis) return;
    setError(null);
    if (demoMode) {
      setMeals((current) => [{ id: crypto.randomUUID(), mealType: titleCase(mealType), title: analysis.mealTitle, caloriesKcal: analysis.totals.caloriesKcal, proteinG: analysis.totals.proteinG, carbsG: analysis.totals.carbsG, fatG: analysis.totals.fatG, fibreG: analysis.totals.fibreG, status: "Demo", createdAt: Date.now() }, ...current]);
      setStage("saved");
      return;
    }
    try {
      const response = await fetch("/api/meals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mealType, analysis, imageKey, notes: "" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your meal could not be saved.");
      setMeals((current) => [{ id: data.id, mealType: titleCase(mealType), title: analysis.mealTitle, caloriesKcal: analysis.totals.caloriesKcal, proteinG: analysis.totals.proteinG, carbsG: analysis.totals.carbsG, fatG: analysis.totals.fatG, fibreG: analysis.totals.fibreG, status: "Confirmed", createdAt: Date.now() }, ...current]);
      setStage("saved");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your meal could not be saved."); }
  }
  function resetScan() { setStage("empty"); setAnalysis(null); setImage(null); setImageUrl(null); setImageKey(undefined); setError(null); }

  return <div className="app-shell">
    {demoMode && <div className="demo-mode-banner"><Eye size={15} /> Demo preview · nothing is uploaded or saved <a href="/sign-in">Exit demo</a></div>}
    <aside className="sidebar">
      <Logo />
      <nav aria-label="Main navigation">
        <SideButton icon={<Home />} label="Dashboard" active={view === "home"} onClick={() => navigate("home")} />
        <SideButton icon={<ScanLine />} label="Scan meal" active={view === "scan"} onClick={() => navigate("scan")} />
        <SideButton icon={<History />} label="Meal history" active={view === "history"} onClick={() => navigate("history")} />
        <SideButton icon={<TrendingUp />} label="Progress" active={view === "progress"} onClick={() => navigate("progress")} />
        <SideButton icon={<MessageCircle />} label="Coach feedback" active={view === "feedback"} onClick={() => navigate("feedback")} />
      </nav>
      <div className="programme-card"><div className="mini-leaf"><Leaf size={16} /></div><small>Active programme</small><strong>{programmeName}</strong><span>{programmeExpiresAt ? `Access until ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(programmeExpiresAt))}` : "Programme access active"}</span></div>
      <button className="profile-mini" onClick={() => navigate("profile")}><span>AS</span><div><strong>{displayName}</strong><small>Client account</small></div><ChevronRight size={16} /></button>
    </aside>

    <main className="app-main">
      {view === "home" && <Dashboard name={displayName} meals={meals} totals={totals} onScan={() => navigate("scan")} onNavigate={navigate} />}
      {view === "scan" && <ScanFlow stage={stage} imageUrl={imageUrl} analysis={analysis} mealType={mealType} consent={consent} error={error} notice={notice} fileRef={fileRef} onFile={chooseFile} onAnalyse={analyse} onConsent={setConsent} onMealType={setMealType} onChangeGrams={changeGrams} onRemove={removeItem} onSave={saveMeal} onReset={resetScan} onHome={() => navigate("home")} />}
      {view === "history" && <HistoryView meals={meals} />}
      {view === "progress" && <ProgressView />}
      {view === "feedback" && <FeedbackView />}
      {view === "profile" && <ProfileView name={displayName} />}
    </main>

    <nav className="bottom-nav" aria-label="Mobile navigation">
      <MobileButton icon={<Home />} label="Home" active={view === "home"} onClick={() => navigate("home")} />
      <MobileButton icon={<History />} label="History" active={view === "history"} onClick={() => navigate("history")} />
      <button className="scan-fab" aria-label="Scan your meal" onClick={() => navigate("scan")}><Camera size={24} /></button>
      <MobileButton icon={<TrendingUp />} label="Progress" active={view === "progress"} onClick={() => navigate("progress")} />
      <MobileButton icon={<CircleUserRound />} label="Profile" active={view === "profile"} onClick={() => navigate("profile")} />
    </nav>
  </div>;
}

function Dashboard({ name, meals, totals, onScan, onNavigate }: { name: string; meals: SavedMeal[]; totals: { calories: number; protein: number; carbs: number; fat: number; fibre: number }; onScan: () => void; onNavigate: (view: View) => void }) {
  const date = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return <>
    <header className="app-header"><div><p>{date}</p><h1>Good afternoon, {name.split(" ")[0]}.</h1><span>Here&apos;s how your day is taking shape.</span></div><button className="icon-button" aria-label="Notifications"><Bell size={20} /><i /></button></header>
    <section className="progress-hero">
      <div className="progress-top"><div><span>Today&apos;s nourishment</span><h2><strong>{Math.round(totals.calories).toLocaleString("en-IN")}</strong> <small>/ {targets.calories.toLocaleString("en-IN")} kcal</small></h2></div><div className="meal-count"><strong>{meals.length}</strong><span>meals logged</span></div></div>
      <ProgressLine value={totals.calories} max={targets.calories} />
      <div className="nutrient-grid">
        <Nutrient label="Protein" value={Math.round(totals.protein)} max={targets.protein} unit="g" tone="plum" />
        <Nutrient label="Carbohydrates" value={Math.round(totals.carbs)} max={targets.carbs} unit="g" tone="saffron" />
        <Nutrient label="Fat" value={Math.round(totals.fat)} max={targets.fat} unit="g" tone="olive" />
        <Nutrient label="Fibre" value={Math.round(totals.fibre)} max={targets.fibre} unit="g" tone="green" />
      </div>
      <p className="estimate-note">Your targets are coach-reviewed starting estimates and can be adjusted as your programme evolves.</p>
    </section>
    <button className="scan-cta" onClick={onScan}><span className="scan-cta-icon"><Camera size={25} /></span><span><strong>Scan your meal</strong><small>Camera or photo library</small></span><ChevronRight /></button>
    <div className="dashboard-grid">
      <section className="content-card today-card"><div className="card-heading"><div><p className="section-kicker">Today</p><h2>Your meals</h2></div><button onClick={() => onNavigate("history")}>View history <ChevronRight size={16} /></button></div>
        <div className="meal-list">{meals.length ? meals.slice(0, 3).map((meal, index) => <MealRow key={meal.id} meal={meal} index={index} />) : <p className="estimate-note">No meals logged yet. Your first scan will appear here.</p>}<button className="add-meal-row" onClick={onScan}><Plus size={17} /> Add a meal</button></div>
      </section>
      <section className="content-card insight-card"><div className="insight-header"><span><MessageCircle size={18} /></span><div><p className="section-kicker">Coach insight</p><h2>Personal guidance</h2></div></div><p>Your coaching team&apos;s next review will appear here.</p></section>
    </div>
    <section className="content-card weekly-card"><div className="card-heading"><div><p className="section-kicker">Last 7 days</p><h2>Steady, thoughtful progress</h2></div><span className="positive-pill">↑ 8% meal consistency</span></div><div className="weekly-content"><div className="bar-chart" aria-label="Seven-day logging consistency: 5 of 7 days logged">{[58, 74, 48, 86, 68, 92, 72].map((height, index) => <div key={index}><i style={{ height: `${height}%` }} /><span>{["M", "T", "W", "T", "F", "S", "S"][index]}</span></div>)}</div><div className="weekly-stats"><div><strong>1,845</strong><span>avg kcal</span></div><div><strong>79g</strong><span>avg protein</span></div><div><strong>27g</strong><span>avg fibre</span></div><div><strong>5/7</strong><span>days logged</span></div></div></div></section>
  </>;
}

function ScanFlow(props: { stage: ScanStage; imageUrl: string | null; analysis: MealAnalysis | null; mealType: string; consent: boolean; error: string | null; notice: string | null; fileRef: React.RefObject<HTMLInputElement | null>; onFile: (file?: File) => void; onAnalyse: () => void; onConsent: (value: boolean) => void; onMealType: (value: string) => void; onChangeGrams: (id: string, delta: number) => void; onRemove: (id: string) => void; onSave: () => void; onReset: () => void; onHome: () => void }) {
  const { stage, analysis } = props;
  if (stage === "saved") return <section className="saved-state"><div className="saved-check"><Check /></div><p className="section-kicker">Meal saved</p><h1>Your nutrition picture is up to date.</h1><p>Use this estimate as a helpful guide, not a measure of perfection.</p><button className="button button-primary" onClick={props.onHome}>Back to dashboard</button><button className="button button-quiet" onClick={props.onReset}>Scan another meal</button></section>;
  return <>
    <header className="page-header"><div><p className="section-kicker">Meal scanner</p><h1>{stage === "confirm" ? "Does this look right?" : "Let’s understand your meal"}</h1><span>{stage === "confirm" ? "Photo-based portions are estimates. Adjust anything that needs your input." : "Take a clear photo from above so all dishes and portions are visible."}</span></div>{stage !== "empty" && <button className="text-action" onClick={props.onReset}><X size={17} /> Start over</button>}</header>
    {props.notice && <div className="notice-banner">{props.notice}</div>}{props.error && <div className="error-banner">{props.error}</div>}
    {(stage === "empty" || stage === "preview" || stage === "analysing") && <div className="scan-layout">
      <section className={`upload-card ${stage === "analysing" ? "is-analysing" : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); props.onFile(e.dataTransfer.files[0]); }}>
        {props.imageUrl ? <img src={props.imageUrl} alt="Selected meal preview" /> : <div className="upload-empty"><div className="camera-ring"><Camera size={31} /></div><h2>Photograph your plate</h2><p>Place the entire meal in frame, with good natural light where possible.</p></div>}
        {stage === "analysing" && <div className="analysing-overlay"><LoaderCircle className="spin" size={36} /><h2>Studying your plate</h2><p>Identifying foods and estimating portions…</p><div className="analysis-steps"><span className="done">Image prepared</span><span className="active">Matching Indian foods</span><span>Checking nutrition</span></div></div>}
      </section>
      <section className="scan-controls">
        <input ref={props.fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" hidden onChange={(event) => props.onFile(event.target.files?.[0])} />
        <button className="choice-button primary-choice" onClick={() => props.fileRef.current?.click()}><Camera /><span><strong>Take a photo</strong><small>Use your phone camera</small></span><ChevronRight /></button>
        <button className="choice-button" onClick={() => props.fileRef.current?.click()}><ImagePlus /><span><strong>Choose from photos</strong><small>JPG, PNG, WEBP or HEIC · max 12 MB</small></span><ChevronRight /></button>
        <label className="consent-check"><input type="checkbox" checked={props.consent} onChange={(e) => props.onConsent(e.target.checked)} /><span><Check size={13} /></span><p>I consent to this meal photo being processed securely for nutrition analysis. <a href="/privacy">Learn more</a></p></label>
        {stage === "preview" && <button className="button button-primary full-button" disabled={!props.consent} onClick={props.onAnalyse}><ScanLine size={19} /> Analyse this meal</button>}
        <p className="security-copy"><Leaf size={15} /> Your original photo stays private and is never used for advertising.</p>
      </section>
    </div>}
    {stage === "confirm" && analysis && <section className="confirmation-layout">
      <div className="confirm-main"><div className="photo-summary">{props.imageUrl && <img src={props.imageUrl} alt="Meal being confirmed" />}<div><label>Meal type<select value={props.mealType} onChange={(e) => props.onMealType(e.target.value)}><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="snack">Snack</option></select></label><span>{confidenceLabel(analysis.overallConfidence)}</span></div></div>
        {analysis.clarificationQuestions[0] && <div className="clarification"><strong>We need your help with one detail</strong><p>{analysis.clarificationQuestions[0].question}</p><div><button>About ¾ cup</button><button>About 1½ cups</button></div></div>}
        <div className="detected-heading"><div><p className="section-kicker">Detected foods</p><h2>{analysis.items.length} items on your plate</h2></div><button><Plus size={16} /> Add missed food</button></div>
        <div className="detected-list">{analysis.items.map((item) => <article className="detected-item" key={item.id}><div className="food-thumb"><Leaf size={18} /></div><div className="food-details"><div className="food-title"><div><h3>{item.detectedName}</h3><span className={`confidence confidence-${confidenceLabel(Math.min(item.foodConfidence, item.quantityConfidence)).split(" ")[0].toLowerCase()}`}>{confidenceLabel(Math.min(item.foodConfidence, item.quantityConfidence))}</span></div><button aria-label={`Edit ${item.detectedName}`}><Edit3 size={17} /></button></div><div className="portion-row"><span>{item.estimatedServingLabel}</span><div className="stepper"><button onClick={() => props.onChangeGrams(item.id, -10)} aria-label="Reduce portion"><Minus /></button><strong>{item.estimatedGrams ?? "—"} g</strong><button onClick={() => props.onChangeGrams(item.id, 10)} aria-label="Increase portion"><Plus /></button></div></div><div className="item-macros"><span><strong>{item.nutrition.caloriesKcal}</strong> kcal</span><span>{item.nutrition.proteinG}g protein</span><span>{item.nutrition.carbsG}g carbs</span><span>{item.nutrition.fatG}g fat</span></div>{item.uncertaintyNotes[0] && <p className="uncertainty">{item.uncertaintyNotes[0]}</p>}</div><button className="remove-food" onClick={() => props.onRemove(item.id)} aria-label={`Remove ${item.detectedName}`}><Trash2 size={16} /></button></article>)}</div>
      </div>
      <aside className="confirm-summary"><p className="section-kicker">Estimated total</p><h2>{analysis.mealTitle}</h2><div className="calorie-total"><strong>{analysis.totals.caloriesKcal}</strong><span>kcal</span></div><div className="summary-macros"><div><strong>{Math.round(analysis.totals.proteinG)}g</strong><span>Protein</span></div><div><strong>{Math.round(analysis.totals.carbsG)}g</strong><span>Carbs</span></div><div><strong>{Math.round(analysis.totals.fatG)}g</strong><span>Fat</span></div><div><strong>{Math.round(analysis.totals.fibreG)}g</strong><span>Fibre</span></div></div><div className="quality-list"><span><Check /> Fibre-rich</span><span><Check /> Good vegetable diversity</span><span><Target /> Protein can be strengthened</span></div><div className="next-step"><Leaf size={18} /><div><strong>One practical next step</strong><p>Add tofu, soy chunks or another serving of dal when you want to bring protein closer to your lunch target.</p></div></div><p className="disclaimer">Nutrition values are estimated from the image, selected portions and available food-reference data. Actual values can vary with ingredients and preparation.</p><button className="button button-primary full-button" onClick={props.onSave}><Check size={18} /> Confirm &amp; save meal</button></aside>
    </section>}
  </>;
}

function HistoryView({ meals }: { meals: SavedMeal[] }) { return <><header className="page-header"><div><p className="section-kicker">Meal history</p><h1>Your nutrition journal</h1><span>Look for patterns with curiosity, not judgement.</span></div><button className="filter-button"><CalendarDays size={17} /> Recent <ChevronDown size={15} /></button></header><div className="filter-row"><button className="active">All meals</button><button>Breakfast</button><button>Lunch</button><button>Dinner</button><button>Snacks</button></div><section className="history-timeline"><div className="timeline-date"><span>Recent meals</span><small>{meals.length} logged</small></div>{meals.length ? meals.map((meal, index) => <MealRow key={meal.id} meal={meal} index={index} detailed />) : <p className="estimate-note">No meals have been saved yet.</p>}</section></>; }

function ProgressView() { return <><header className="page-header"><div><p className="section-kicker">Weekly progress</p><h1>Patterns worth noticing</h1><span>Seven days of nourishment, compared with your previous week.</span></div><button className="filter-button"><CalendarDays size={17} /> 7–13 July <ChevronDown size={15} /></button></header><section className="content-card progress-chart-card"><div className="card-heading"><div><p className="section-kicker">Calories</p><h2>Daily energy estimate</h2></div><span className="positive-pill">Near target on 5 days</span></div><div className="line-chart" aria-label="Calories ranged from 1,650 to 2,040 this week"><div className="target-line"><span>1,900 target</span></div>{[42, 58, 49, 72, 62, 79, 66].map((point, index) => <i key={index} style={{ left: `${index * 16.6}%`, bottom: `${point}%` }}><span>{["M", "T", "W", "T", "F", "S", "S"][index]}</span></i>)}</div></section><div className="metric-cards"><Metric label="Average energy" value="1,845 kcal" note="3% closer to target" /><Metric label="Average protein" value="79 g" note="6 g below target" /><Metric label="Average fibre" value="27 g" note="Strong on 4 days" /><Metric label="Logging consistency" value="5 of 7 days" note="One more than last week" /></div><section className="content-card pattern-card"><div className="insight-header"><span><Leaf /></span><div><p className="section-kicker">Automated insight</p><h2>Your strongest pattern</h2></div></div><p>Lunches with dal or beans gave you the most consistent mix of protein and fibre. Repeating that pattern twice more next week is a practical place to begin.</p><small>Automated insights are not written or reviewed by Dr. Ashu unless clearly marked.</small></section></>; }

function FeedbackView() { return <><header className="page-header"><div><p className="section-kicker">Coach feedback</p><h1>Your coaching conversation</h1><span>Personal notes from the team reviewing your nutrition journey.</span></div></header><section className="content-card insight-card"><div className="insight-header"><span><MessageCircle /></span><div><p className="section-kicker">No feedback yet</p><h2>Your private coaching notes will appear here.</h2></div></div><p>Keep logging meals so your coaching team has useful context for the next review.</p></section></>; }

function ProfileView({ name }: { name: string }) { return <><header className="page-header"><div><p className="section-kicker">Profile &amp; preferences</p><h1>Your programme, your context</h1><span>These details help your coach make guidance more relevant.</span></div></header><div className="profile-grid"><section className="content-card profile-card"><div className="large-avatar">AS</div><h2>{name}</h2><p>Whole-food wellness programme</p><span className="active-status">Active until 12 August 2026</span></section><section className="content-card settings-card"><h2>Nutrition preferences</h2><Setting label="Dietary pattern" value="Whole-food plant-based" /><Setting label="Primary goal" value="Improved meal quality" /><Setting label="Preferred cuisine" value="South Indian, home-cooked" /><Setting label="Units" value="Metric" /></section><section className="content-card settings-card"><h2>Account &amp; privacy</h2><Setting label="Meal-photo processing" value="Consented" /><Setting label="Export my records" value="Request export" /><Setting label="Image retention" value="Programme duration + 30 days" /><Setting label="Delete my account" value="Contact support" danger /></section></div></>; }

function MealRow({ meal, index, detailed = false }: { meal: SavedMeal; index: number; detailed?: boolean }) { const palettes = ["meal-thumb-one", "meal-thumb-two", "meal-thumb-three"]; return <article className={`meal-row ${detailed ? "meal-row-detailed" : ""}`}><div className={`meal-thumb ${palettes[index % palettes.length]}`}><Leaf size={20} /></div><div className="meal-info"><div><span>{meal.mealType}</span><small><Clock3 size={12} /> {new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(meal.createdAt))}</small></div><h3>{meal.title}</h3><p><strong>{meal.caloriesKcal} kcal</strong><span>{Math.round(meal.proteinG)}g protein</span><i>{meal.status}</i></p></div><button aria-label={`Open ${meal.title}`}><ChevronRight /></button></article>; }
function ProgressLine({ value, max }: { value: number; max: number }) { return <div className="progress-line"><i style={{ width: `${Math.min(100, value / max * 100)}%` }} /></div>; }
function Nutrient({ label, value, max, unit, tone }: { label: string; value: number; max: number; unit: string; tone: string }) { return <div className={`nutrient nutrient-${tone}`}><div><span>{label}</span><strong>{value}<small>{unit}</small> <em>/ {max}{unit}</em></strong></div><ProgressLine value={value} max={max} /></div>; }
function SideButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) { return <button className={active ? "active" : ""} onClick={onClick}>{icon}<span>{label}</span></button>; }
function MobileButton(props: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) { return <button className={props.active ? "active" : ""} onClick={props.onClick}>{props.icon}<span>{props.label}</span></button>; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <article className="content-card metric-card"><span>{label}</span><strong>{value}</strong><p>{note}</p></article>; }
function Setting({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <button className={danger ? "danger" : ""}><span>{label}</span><strong>{value}</strong><ChevronRight size={16} /></button>; }
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
