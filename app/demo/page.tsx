import { redirect } from "next/navigation";
import { DashboardApp } from "@/app/components/DashboardApp";

export const dynamic = "force-dynamic";

export default function DemoPage() {
  if (process.env.NODE_ENV === "production") redirect("/sign-in");
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);
  return <DashboardApp displayName="Demo Client" programmeName="Whole-food wellness preview" programmeExpiresAt={expires.toISOString()} demoMode />;
}
