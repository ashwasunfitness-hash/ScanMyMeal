import { ArrowLeft, Leaf, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Logo } from "../components/Logo";

export default function PrivacyPage() {
  return <main className="legal-shell">
    <nav><Logo /><Link href="/"><ArrowLeft /> Back</Link></nav>
    <header><p className="section-kicker">Privacy &amp; estimates</p><h1>Your meal data deserves care.</h1><p>Scan My Meal handles meal photos and nutrition records as sensitive personal information. This plain-language summary explains the product behaviour; final production policies should be reviewed by qualified legal counsel.</p></header>
    <section className="legal-grid">
      <article><ShieldCheck /><h2>Private by design</h2><p>Meal photos are stored privately. Access is checked on the server and records are scoped to the signed-in client. Coaches see assigned clients only; authorised administrators can review programme records.</p></article>
      <article><LockKeyhole /><h2>Photo processing</h2><p>We ask for consent before sending a meal photo for analysis. Photos are used to identify food and estimate portions, not for advertising. The final retention period must match the coaching programme policy.</p></article>
      <article><Leaf /><h2>Nutrition estimates</h2><p>Nutrition values are estimated from the image, confirmed portions and available food-reference data. Actual values vary with ingredients, oil, sugar, preparation and serving depth. This tool does not diagnose, prescribe or replace medical care.</p></article>
    </section>
    <section className="legal-copy">
      <h2>Your choices</h2><p>You can correct or delete your own meal entries, request an export, withdraw optional processing consent and ask for account deletion. Some records may need to be retained for security or legal reasons; the final policy should state those periods clearly.</p>
      <h2>Plant-based coaching policy</h2><p>Automated suggestions follow Dr. Ashu&apos;s whole-food plant-based programme: no meat, fish, eggs, dairy, whey, creatine, BCAA or commercial supplement recommendations. A photographed food may still be identified accurately even when it falls outside that philosophy; the app does not silently relabel what was consumed.</p>
      <h2 id="support">Support</h2><p>For access, privacy or nutrition-record questions, contact the ABC of D® coaching team through your existing programme channel.</p>
      <p className="legal-updated">Draft policy summary · updated 13 July 2026</p>
    </section>
  </main>;
}
