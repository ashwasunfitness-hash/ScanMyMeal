import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const safeHost = /^[a-z0-9.:-]+$/i.test(forwardedHost) ? forwardedHost : "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") === "http" || safeHost.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${safeHost}`;
  const socialImage = `${origin}/og.png`;
  return {
    title: { default: "Scan My Meal — Dr. Ashu", template: "%s · Scan My Meal" },
    description: "A private, plant-based nutrition companion for Dr. Ashu and ABC of D® coaching clients.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "Scan My Meal", description: "Scan. Understand. Improve.", type: "website", images: [{ url: socialImage, width: 1731, height: 909, alt: "Scan My Meal by Dr. Ashu" }] },
    twitter: { card: "summary_large_image", title: "Scan My Meal", description: "A private nutrition companion for Dr. Ashu's coaching clients.", images: [socialImage] },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f7f3ea" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN"><body>{children}</body></html>;
}
