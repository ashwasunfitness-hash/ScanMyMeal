import { Activity, Bot, Database, Leaf, LogOut, MailPlus, Settings, UserRoundCog, Users } from "lucide-react";
import { Logo } from "./Logo";

export function AdminShell({ children, active = "overview" }: { children: React.ReactNode; active?: string }) {
  const links = [
    ["overview", "/admin", "Overview", <Activity key="activity" />],
    ["clients", "/admin/clients", "Clients", <Users key="users" />],
    ["invitations", "/admin/invitations", "Invitations", <MailPlus key="invite" />],
    ["coaches", "/admin/coaches", "Coaches", <UserRoundCog key="coach" />],
    ["reviews", "/admin/meal-reviews", "Meal reviews", <Bot key="bot" />],
    ["food", "/admin/food-library", "Food library", <Leaf key="leaf" />],
    ["audit", "/admin/audit-logs", "Audit logs", <Database key="data" />],
    ["settings", "/admin/settings", "Settings", <Settings key="settings" />],
  ];
  return <div className="admin-shell"><aside className="admin-sidebar"><Logo /><p>Administration</p><nav>{links.map(([id, href, label, icon]) => <a key={String(id)} href={String(href)} className={active === id ? "active" : ""}>{icon}{label}</a>)}</nav><form action="/api/auth/sign-out" method="post"><button><LogOut /> Sign out</button></form></aside><main className="admin-main">{children}</main></div>;
}
