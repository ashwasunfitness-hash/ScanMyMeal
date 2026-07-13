import { Leaf, LockKeyhole, ShieldCheck } from "lucide-react";
import { Logo } from "./Logo";

export function AuthShell({ children, eyebrow = "Private client access" }: { children: React.ReactNode; eyebrow?: string }) {
  return <main className="auth-page">
    <nav><Logo /></nav>
    <div className="auth-layout">
      <section className="auth-story"><p className="section-kicker">{eyebrow}</p><h1>Scan. Understand.<br /><em>Improve.</em></h1><p>Your calm, personal nutrition companion from Dr. Ashu and ABC of D®.</p><div><span><ShieldCheck /> Invitation-only access</span><span><LockKeyhole /> Private meal records</span><span><Leaf /> Whole-food plant-based guidance</span></div></section>
      {children}
    </div>
    <footer>Powered by Dr. Ashu and ABC of D® · Nutrition values are estimates</footer>
  </main>;
}
