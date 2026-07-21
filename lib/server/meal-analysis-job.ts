import type { UploadAccessResult } from "@/lib/server/meal-upload";
import type { MealAnalysisJobRow, MealUploadRow } from "@/lib/supabase/database.types";

export type SafeMealAnalysisJob = {
  jobId: string;
  uploadId: string;
  status: MealAnalysisJobRow["status"];
  attemptCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  retryable: boolean;
};

type JobRecord = MealAnalysisJobRow;
type UploadRecord = Pick<MealUploadRow, "id" | "client_id" | "upload_status">;

export type MealAnalysisJobRepository = {
  findUpload(uploadId: string): Promise<UploadRecord | null>;
  findByUpload(uploadId: string): Promise<JobRecord | null>;
  findById(jobId: string): Promise<JobRecord | null>;
  create(record: JobRecord): Promise<boolean>;
  updateIfStatus(jobId: string, clientId: string, currentStatus: JobRecord["status"], values: Partial<JobRecord>): Promise<JobRecord | null>;
};

export type CreateJobResult =
  | { ok: true; job: SafeMealAnalysisJob; duplicate: boolean }
  | { ok: false; status: 401 | 403 | 404 | 409 | 503; code: "authentication_required" | "client_access_required" | "client_access_expired" | "upload_not_found" | "upload_not_ready" | "database_failure" };

export async function createMealAnalysisJob(access: UploadAccessResult, uploadId: string, repository: MealAnalysisJobRepository, now = new Date(), randomId = () => crypto.randomUUID()): Promise<CreateJobResult> {
  if (!access.allowed) return { ok: false, status: access.status, code: access.code };

  let upload: UploadRecord | null;
  try { upload = await repository.findUpload(uploadId); }
  catch { return databaseFailure(); }
  if (!upload || upload.client_id !== access.userId) return { ok: false, status: 404, code: "upload_not_found" };
  if (upload.upload_status !== "uploaded") return { ok: false, status: 409, code: "upload_not_ready" };

  try {
    const existing = await repository.findByUpload(uploadId);
    if (existing) return existing.client_id === access.userId
      ? { ok: true, job: toSafeMealAnalysisJob(existing), duplicate: true }
      : { ok: false, status: 404, code: "upload_not_found" };

    const timestamp = now.toISOString();
    const record: JobRecord = {
      id: randomId(), client_id: access.userId, meal_upload_id: uploadId, status: "queued", attempt_count: 1,
      last_error_code: null, last_error_message: null, failure_retryable: false,
      created_at: timestamp, started_at: null, completed_at: null, updated_at: timestamp,
    };
    if (await repository.create(record)) return { ok: true, job: toSafeMealAnalysisJob(record), duplicate: false };

    // A concurrent retry may have won the unique meal_upload_id race.
    const concurrent = await repository.findByUpload(uploadId);
    if (concurrent?.client_id === access.userId) return { ok: true, job: toSafeMealAnalysisJob(concurrent), duplicate: true };
    return databaseFailure();
  } catch { return databaseFailure(); }
}

export async function getOwnedMealAnalysisJob(access: UploadAccessResult, jobId: string, repository: MealAnalysisJobRepository) {
  if (!access.allowed) return { ok: false as const, status: access.status, code: access.code };
  try {
    const job = await repository.findById(jobId);
    if (!job || job.client_id !== access.userId) return { ok: false as const, status: 404 as const, code: "job_not_found" as const };
    return { ok: true as const, job: toSafeMealAnalysisJob(job) };
  } catch { return { ok: false as const, status: 503 as const, code: "database_failure" as const }; }
}

export type TransitionTarget = "processing" | "completed" | "failed" | "queued";
export type FailureDetails = { code: string; message: string; retryable: boolean };

export async function transitionMealAnalysisJob(repository: MealAnalysisJobRepository, input: { jobId: string; clientId: string; to: TransitionTarget; failure?: FailureDetails; now?: Date }) {
  const now = input.now ?? new Date();
  const job = await repository.findById(input.jobId);
  if (!job || job.client_id !== input.clientId) return { ok: false as const, code: "job_not_found" as const };
  const allowed = (job.status === "queued" && input.to === "processing")
    || (job.status === "processing" && (input.to === "completed" || input.to === "failed"))
    || (job.status === "failed" && input.to === "queued");
  if (!allowed) return { ok: false as const, code: "invalid_transition" as const };
  if (input.to === "queued" && !job.failure_retryable) return { ok: false as const, code: "failure_not_retryable" as const };
  if (input.to === "failed" && (!input.failure?.code || !input.failure.message)) return { ok: false as const, code: "failure_details_required" as const };

  const timestamp = now.toISOString();
  const values: Partial<JobRecord> = input.to === "processing"
    ? { status: "processing", started_at: timestamp, completed_at: null }
    : input.to === "completed"
      ? { status: "completed", completed_at: timestamp, last_error_code: null, last_error_message: null, failure_retryable: false }
      : input.to === "failed"
        ? { status: "failed", completed_at: timestamp, last_error_code: input.failure!.code, last_error_message: input.failure!.message, failure_retryable: input.failure!.retryable }
        : { status: "queued", attempt_count: job.attempt_count + 1, started_at: null, completed_at: null, last_error_code: null, last_error_message: null, failure_retryable: false };
  const updated = await repository.updateIfStatus(job.id, input.clientId, job.status, values);
  if (!updated) return { ok: false as const, code: "transition_conflict" as const };
  return { ok: true as const, job: toSafeMealAnalysisJob(updated) };
}

export function toSafeMealAnalysisJob(job: JobRecord): SafeMealAnalysisJob {
  return {
    jobId: job.id,
    uploadId: job.meal_upload_id,
    status: job.status,
    attemptCount: job.attempt_count,
    createdAt: job.created_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    retryable: job.status === "failed" && job.failure_retryable,
  };
}

function databaseFailure(): CreateJobResult { return { ok: false, status: 503, code: "database_failure" }; }
