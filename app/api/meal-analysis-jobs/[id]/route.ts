import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { authorizeMealUpload } from "@/lib/server/meal-upload";
import { getOwnedMealAnalysisJob } from "@/lib/server/meal-analysis-job";
import { createMealAnalysisJobRepository } from "@/lib/server/supabase-meal-analysis-jobs";
import { createMealRecognitionRepository } from "@/lib/server/supabase-meal-recognition";
import { toSafeRecognition } from "@/lib/server/process-meal-recognition";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return errorResponse("job_not_found", 404);
  try {
    const admin = createAdminClient();
    const result = await getOwnedMealAnalysisJob(authorizeMealUpload(await getAccessContext()), id, createMealAnalysisJobRepository(admin));
    if (!result.ok) return errorResponse(result.code, result.status);
    const stored = result.job.status === "completed" ? await createMealRecognitionRepository(admin).findResult(id) : null;
    if (result.job.status === "completed" && !stored) return errorResponse("database_failure", 503);
    return NextResponse.json({ ...result.job, recognition: stored ? toSafeRecognition(stored) : null }, { headers: { "Cache-Control": "no-store" } });
  } catch { return errorResponse("database_failure", 503); }
}

function errorResponse(code: string, status: number) {
  const error = status === 401 ? "Sign in again to view analysis status."
    : status === 403 ? "Active client access is required to view analysis status."
      : status === 404 ? "Analysis job not found."
        : "Analysis status is temporarily unavailable. Please retry.";
  return NextResponse.json({ code, error, retryable: status >= 500 }, { status, headers: { "Cache-Control": "no-store" } });
}
