import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { authorizeMealUpload } from "@/lib/server/meal-upload";
import { transitionMealAnalysisJob } from "@/lib/server/meal-analysis-job";
import { createMealAnalysisJobRepository } from "@/lib/server/supabase-meal-analysis-jobs";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return errorResponse("job_not_found", 404);
  try {
    const access = authorizeMealUpload(await getAccessContext());
    if (!access.allowed) return errorResponse(access.code, access.status);
    const result = await transitionMealAnalysisJob(createMealAnalysisJobRepository(createAdminClient()), { jobId: id, clientId: access.userId, to: "queued" });
    if (!result.ok) {
      const status = result.code === "job_not_found" ? 404 : result.code === "transition_conflict" ? 409 : 422;
      return errorResponse(result.code, status);
    }
    return NextResponse.json(result.job, { headers: { "Cache-Control": "no-store" } });
  } catch { return errorResponse("database_failure", 503); }
}

function errorResponse(code: string, status: number) {
  const error = code === "failure_not_retryable" ? "This analysis cannot be retried."
    : code === "invalid_transition" ? "This analysis is not in a retryable state."
      : status === 404 ? "Analysis job not found."
        : status >= 500 ? "The retry could not be started right now. Please try again." : "The analysis retry was not accepted.";
  return NextResponse.json({ code, error, retryable: status >= 500 }, { status, headers: { "Cache-Control": "no-store" } });
}
