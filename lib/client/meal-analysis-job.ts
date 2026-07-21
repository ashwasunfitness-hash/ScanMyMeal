import { mealRecognitionSchema, type MealRecognition } from "#/lib/meal-recognition-contract";

export const ANALYSIS_POLL_INTERVAL_MS = 4_000;
export const ANALYSIS_POLL_TIMEOUT_MS = 2 * 60_000;

export type MealAnalysisJobStatus = "queued" | "processing" | "completed" | "failed";
export type MealAnalysisJobStatusResponse = {
  jobId: string;
  uploadId: string;
  status: MealAnalysisJobStatus;
  attemptCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  retryable: boolean;
  recognition: MealRecognition | null;
};

export function shouldPollAnalysis(status: MealAnalysisJobStatus, elapsedMs: number) {
  return (status === "queued" || status === "processing") && elapsedMs < ANALYSIS_POLL_TIMEOUT_MS;
}

export function recognitionTriggerKey(job: Pick<MealAnalysisJobStatusResponse, "jobId" | "attemptCount">) { return `${job.jobId}:${job.attemptCount}`; }

export function shouldTriggerRecognition(job: Pick<MealAnalysisJobStatusResponse, "status" | "jobId" | "attemptCount">, triggered: ReadonlySet<string>) {
  return job.status === "queued" && !triggered.has(recognitionTriggerKey(job));
}

export function parseMealAnalysisJob(value: unknown): MealAnalysisJobStatusResponse | null {
  if (!value || typeof value !== "object") return null;
  const job = value as Record<string, unknown>;
  if (typeof job.jobId !== "string" || typeof job.uploadId !== "string") return null;
  if (!['queued', 'processing', 'completed', 'failed'].includes(String(job.status))) return null;
  if (!Number.isInteger(job.attemptCount) || Number(job.attemptCount) < 1) return null;
  if (typeof job.createdAt !== "string" || !(job.startedAt === null || typeof job.startedAt === "string") || !(job.completedAt === null || typeof job.completedAt === "string") || typeof job.retryable !== "boolean") return null;
  const recognition = job.recognition === undefined || job.recognition === null ? null : mealRecognitionSchema.safeParse(job.recognition);
  if (recognition !== null && !recognition.success) return null;
  return {
    jobId: job.jobId,
    uploadId: job.uploadId,
    status: job.status as MealAnalysisJobStatus,
    attemptCount: job.attemptCount as number,
    createdAt: job.createdAt,
    startedAt: job.startedAt as string | null,
    completedAt: job.completedAt as string | null,
    retryable: job.retryable,
    recognition: recognition?.data ?? null,
  };
}
