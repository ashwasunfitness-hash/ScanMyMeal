"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, CircleUserRound, Home, Leaf, ListChecks, MessageCircle, ScanLine, TrendingUp } from "lucide-react";
import { Logo } from "@/app/components/Logo";

const navigation = [
  { href: "/client/dashboard", label: "Home", icon: Home },
  { href: "/client/meals", label: "Meals", icon: ListChecks },
  { href: "/client/scan", label: "Scan", icon: ScanLine },
  { href: "/client/progress", label: "Progress", icon: TrendingUp },
  { href: "/client/feedback", label: "Feedback", icon: MessageCircle },
  { href: "/client/profile", label: "Profile", icon: CircleUserRound },
] as const;

const mobileNavigation = navigation.filter((item) => item.label !== "Feedback");

export function ClientShell({ children, displayName, programmeName, programmeExpiresAt }: { children: ReactNode; displayName: string; programmeName: string; programmeExpiresAt: string | null }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || (href !== "/client/dashboard" && pathname.startsWith(`${href}/`));
  return <div className="client-app-shell">
    <aside className="client-sidebar">
      <div className="client-sidebar-brand"><Logo /></div>
      <nav className="client-desktop-nav" aria-label="Client navigation">
        {navigation.map(({ href, label, icon: Icon }) => <Link href={href} className={isActive(href) ? "is-active" : ""} aria-current={isActive(href) ? "page" : undefined} key={href}><Icon aria-hidden="true" /><span>{label}</span></Link>)}
      </nav>
      <div className="client-programme-card"><span className="client-programme-icon"><Leaf aria-hidden="true" /></span><div><small>Active programme</small><strong>{programmeName}</strong><span>{programmeExpiresAt ? `Access until ${formatDate(programmeExpiresAt)}` : "Programme access active"}</span></div></div>
      <Link className={`client-account-link ${isActive("/client/profile") ? "is-active" : ""}`} href="/client/profile" aria-current={isActive("/client/profile") ? "page" : undefined}><span className="client-avatar">{initials(displayName)}</span><span><strong>{displayName}</strong><small>Client account</small></span></Link>
    </aside>
    <main className="client-main" id="main-content">{children}</main>
    <nav className="client-bottom-nav" aria-label="Mobile navigation">
      {mobileNavigation.map(({ href, label, icon: Icon }) => label === "Scan"
        ? <Link href={href} className={`client-scan-action ${isActive(href) ? "is-active" : ""}`} aria-current={isActive(href) ? "page" : undefined} aria-label="Scan meal" key={href}><span><Camera aria-hidden="true" /></span><small>Scan</small></Link>
        : <Link href={href} className={isActive(href) ? "is-active" : ""} aria-current={isActive(href) ? "page" : undefined} key={href}><Icon aria-hidden="true" /><span>{label}</span></Link>)}
    </nav>
  </div>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SM"; }
