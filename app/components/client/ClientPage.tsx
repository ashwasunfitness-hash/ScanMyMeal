import type { LucideIcon } from "lucide-react";
import Link from "next/link";

export function ClientPageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="client-page-header"><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></header>;
}

export function ClientEmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: { href: string; label: string } }) {
  return <section className="client-empty-state"><span className="client-empty-icon"><Icon aria-hidden="true" /></span><p className="section-kicker">Your private space</p><h2>{title}</h2><p>{description}</p>{action && <Link className="client-primary-link" href={action.href}>{action.label}</Link>}</section>;
}
