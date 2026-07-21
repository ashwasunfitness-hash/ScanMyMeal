import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { processMealRecognition } from "@/lib/server/process-meal-recognition";
import { authorizeMealUpload } from "@/lib/server/meal-upload";
import { recognizeMealImage } from "@/lib/server/meal-recognition-provider";
import { createMealAnalysisJobRepository } from "@/lib/server/supabase-meal-analysis-jobs";
import { createMealRecognitionRepository } from "@/lib/server/supabase-meal-recognition";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SafeMealAnalysisJob } from "@/lib/server/meal-analysis-job";

export const dynamic = "force-dynamic";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return errorResponse("job_not_found", 404, false);
  try {
    const access = authorizeMealUpload(await getAccessContext());
    if (!access.allowed) return errorResponse(access.code, access.status, false);
    const admin = createAdminClient();
    const recognition = createMealRecognitionRepository(admin);
    const result = await processMealRecognition(access, id, {
      jobs: createMealAnalysisJobRepository(admin),
      ...recognition,
      recognizeImage: recognizeMealImage,
      randomId: () => crypto.randomUUID(),
      now: () => new Date(),
    });
    if (!result.ok) return errorResponse(result.code, result.status, result.retryable, result.job);
    return NextResponse.json(result.response, { status: result.duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch { return errorResponse("database_failure", 503, true); }
}

function errorResponse(code: string, status: number, retryable: boolean, job?: SafeMealAnalysisJob) {
  const error = code === "unsupported_image" ? "This image could not be used for food recognition. Choose another photo."
    : code === "invalid_model_response" ? "Food recognition could not produce a safe result."
      : code === "already_processing" ? "Food recognition is already in progress."
        : code === "job_not_queued" ? "This analysis is not waiting for recognition."
          : status === 401 ? "Sign in again before starting recognition."
            : status === 403 ? "Active client access is required to start recognition."
              : status === 404 ? "Analysis job not found."
                : "Food recognition is temporarily unavailable.";
  return NextResponse.json({ ...(job ?? {}), recognition: null, code, error, retryable }, { status, headers: { "Cache-Control": "no-store" } });
}
