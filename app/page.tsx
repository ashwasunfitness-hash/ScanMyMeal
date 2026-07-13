import { ArrowRight, Check, Leaf, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "./components/Logo";

export default function Home() {
  return (
    <main className="marketing-shell">
      <nav className="marketing-nav">
        <Logo />
        <a className="text-link" href="/sign-in">Client sign in</a>
      </nav>

      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={15} /> Exclusive to Dr. Ashu&apos;s coaching clients</div>
          <h1>Your plate,<br /><em>understood.</em></h1>
          <p className="hero-lead">A calm, personal nutrition companion for Indian meals—built around whole, plant-based foods and your coaching goals.</p>
          <div className="hero-actions">
            <a className="button button-primary" href="/sign-in">Enter your programme <ArrowRight size={18} /></a>
            <a className="button button-quiet" href="#how-it-works">See how it works</a>
          </div>
          <div className="trust-line"><ShieldCheck size={16} /> Private meal records <span /> <Leaf size={16} /> Plant-based guidance</div>
        </div>

        <div className="hero-visual" aria-label="Example meal nutrition analysis">
          <div className="plate-orbit orbit-one" />
          <div className="plate-orbit orbit-two" />
          <div className="plate-card">
            <div className="meal-art" aria-hidden="true">
              <div className="thali-bowl dal" /><div className="thali-bowl rice" /><div className="thali-bowl sabzi" />
              <div className="roti one" /><div className="roti two" /><div className="leaf-garnish" />
            </div>
            <div className="scan-label"><span className="status-dot" /> Analysis ready</div>
            <h2>Dal, rice &amp; vegetable palya</h2>
            <div className="macro-row">
              <div><strong>530</strong><span>kcal</span></div><div><strong>21g</strong><span>protein</span></div><div><strong>15g</strong><span>fibre</span></div>
            </div>
            <div className="coach-nudge"><Check size={16} /> A fibre-rich plate with a strong mix of lentils and vegetables.</div>
          </div>
        </div>
      </section>

      <section className="promise-band" id="how-it-works">
        <div><span>01</span><h3>Scan</h3><p>Photograph your meal from above.</p></div>
        <div><span>02</span><h3>Understand</h3><p>Confirm foods, portions and preparation.</p></div>
        <div><span>03</span><h3>Improve</h3><p>Get one practical, plant-based next step.</p></div>
      </section>

      <section className="philosophy-section">
        <div className="philosophy-mark"><Leaf size={34} /></div>
        <div><p className="section-kicker">Powered by Dr. Ashu and ABC of D®</p><h2>Coaching that sees the whole picture.</h2></div>
        <p>Calories are only one part of a meal. Scan My Meal also considers protein, fibre, vegetable diversity, whole-food quality and how your plate aligns with your personal programme.</p>
      </section>

      <footer className="marketing-footer"><Logo compact /><span>Scan. Understand. Improve.</span><a href="/privacy">Privacy &amp; nutrition disclaimer</a></footer>
    </main>
  );
}
