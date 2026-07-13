import { NextResponse } from "next/server";
import { pilotIsReady } from "@/lib/pilot-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const ready = pilotIsReady(process.env);
  return NextResponse.json(
    { status: ready ? "ready" : "setup_required", service: "scan-my-meal", checkedAt: new Date().toISOString() },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
