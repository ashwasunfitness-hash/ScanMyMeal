import { mealRecognitionSchema, type MealRecognition } from "#/lib/meal-recognition-contract";
import { transitionMealAnalysisJob, toSafeMealAnalysisJob, type MealAnalysisJobRepository, type SafeMealAnalysisJob } from "#/lib/server/meal-analysis-job";
import { MAX_MEAL_UPLOAD_BYTES, validateImageBytes, type UploadAccessResult } from "#/lib/server/meal-upload";
import { MealRecognitionProviderError, type RecognizeMealImageResult } from "#/lib/server/meal-recognition-provider";
import type { MealAnalysisJobRow, MealRecognitionResultRow, MealUploadRow } from "@/lib/supabase/database.types";

type RecognitionUpload = Pick<MealUploadRow, "id" | "client_id" | "storage_path" | "upload_status" | "mime_type" | "file_size_bytes">;
export type RecognitionResultRecord = Omit<MealRecognitionResultRow, "foods"> & { foods: MealRecognition["foods"] };

export type MealRecognitionDependencies = {
  jobs: MealAnalysisJobRepository;
  findUpload(uploadId: string): Promise<RecognitionUpload | null>;
  findResult(jobId: string): Promise<RecognitionResultRecord | null>;
  saveResult(record: RecognitionResultRecord): Promise<RecognitionResultRecord | null>;
  downloadImage(path: string): Promise<ArrayBuffer | null>;
  recognizeImage(input: { bytes: ArrayBuffer; mimeType: string }): Promise<RecognizeMealImageResult>;
  randomId(): string;
  now(): Date;
};

export type SafeRecognitionResponse = SafeMealAnalysisJob & { recognition: MealRecognition | null };
export type ProcessRecognitionResult =
  | { ok: true; response: SafeRecognitionResponse; duplicate: boolean }
  | { ok: false; status: 401 | 403 | 404 | 409 | 415 | 422 | 503 | 504; code: RecognitionFailureCode | "authentication_required" | "client_access_required" | "client_access_expired" | "job_not_found" | "job_not_queued" | "already_processing"; retryable: boolean; job?: SafeMealAnalysisJob };
export type RecognitionFailureCode = "image_not_available" | "unsupported_image" | "recognition_timeout" | "provider_unavailable" | "invalid_model_response" | "no_food_detected" | "database_failure";

export async function processMealRecognition(access: UploadAccessResult, jobId: string, dependencies: MealRecognitionDependencies): Promise<ProcessRecognitionResult> {
  if (!access.allowed) return { ok: false, status: access.status, code: access.code, retryable: false };

  let job: MealAnalysisJobRow | null;
  try { job = await dependencies.jobs.findById(jobId); }
  catch { return failure("database_failure"); }
  if (!job || job.client_id !== access.userId) return { ok: false, status: 404, code: "job_not_found", retryable: false };

  if (job.status === "completed") return completedResult(job, dependencies, true);
  if (job.status === "processing") {
    const existing = await safeFindResult(job.id, dependencies);
    if (existing) return finishPersistedResult(job, existing, dependencies, true);
    return { ok: false, status: 409, code: "already_processing", retryable: false, job: toSafeMealAnalysisJob(job) };
  }
  if (job.status !== "queued") return { ok: false, status: 409, code: "job_not_queued", retryable: false, job: toSafeMealAnalysisJob(job) };

  let upload: RecognitionUpload | null;
  try { upload = await dependencies.findUpload(job.meal_upload_id); }
  catch { return failure("database_failure"); }
  if (!upload || upload.client_id !== access.userId || upload.id !== job.meal_upload_id) return { ok: false, status: 404, code: "image_not_available", retryable: false };
  if (upload.upload_status !== "uploaded") return { ok: false, status: 409, code: "image_not_available", retryable: false };

  let claim;
  try { claim = await transitionMealAnalysisJob(dependencies.jobs, { jobId, clientId: access.userId, to: "processing", now: dependencies.now() }); }
  catch { return failure("database_failure"); }
  if (!claim.ok) return { ok: false, status: 409, code: "already_processing", retryable: false };

  try {
    let bytes: ArrayBuffer | null;
    try { bytes = await dependencies.downloadImage(upload.storage_path); }
    catch { throw new RecognitionProcessError("image_not_available", true); }
    if (!bytes) throw new RecognitionProcessError("image_not_available", true);
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_MEAL_UPLOAD_BYTES || bytes.byteLength !== upload.file_size_bytes) throw new RecognitionProcessError("unsupported_image", false);
    const validated = validateImageBytes(bytes, upload.mime_type);
    if (!validated) throw new RecognitionProcessError("unsupported_image", false);

    const providerResult = await dependencies.recognizeImage({ bytes: validated.bytes, mimeType: validated.mimeType });
    const recognition = mealRecognitionSchema.parse(providerResult.recognition);
    const timestamp = dependencies.now().toISOString();
    const record: RecognitionResultRecord = {
      id: dependencies.randomId(), analysis_job_id: job.id, client_id: access.userId, meal_upload_id: upload.id,
      model_version: providerResult.modelVersion, foods: recognition.foods, image_quality: recognition.imageQuality,
      needs_user_confirmation: true, created_at: timestamp, updated_at: timestamp,
    };
    let saved: RecognitionResultRecord | null;
    try { saved = await dependencies.saveResult(record); }
    catch { throw new RecognitionProcessError("database_failure", true); }
    if (!saved) throw new RecognitionProcessError("database_failure", true);
    return finishPersistedResult(job, saved, dependencies, false);
  } catch (error) {
    const classified = classifyFailure(error);
    try {
      const failed = await transitionMealAnalysisJob(dependencies.jobs, {
        jobId, clientId: access.userId, to: "failed", now: dependencies.now(),
        failure: { code: classified.code, message: clientFailureMessage(classified.code), retryable: classified.retryable },
      });
      return { ...failure(classified.code, failed.ok ? failed.job : undefined, classified.retryable), status: classified.status };
    } catch { return failure("database_failure"); }
  }
}

export function toSafeRecognition(record: RecognitionResultRecord): MealRecognition {
  return mealRecognitionSchema.parse({ foods: record.foods, imageQuality: record.image_quality, needsUserConfirmation: record.needs_user_confirmation });
}

async function completedResult(job: MealAnalysisJobRow, dependencies: MealRecognitionDependencies, duplicate: boolean): Promise<ProcessRecognitionResult> {
  const existing = await safeFindResult(job.id, dependencies);
  if (!existing) return failure("database_failure", toSafeMealAnalysisJob(job));
  return { ok: true, response: { ...toSafeMealAnalysisJob(job), recognition: toSafeRecognition(existing) }, duplicate };
}

async function finishPersistedResult(job: MealAnalysisJobRow, result: RecognitionResultRecord, dependencies: MealRecognitionDependencies, duplicate: boolean): Promise<ProcessRecognitionResult> {
  try {
    const completed = await transitionMealAnalysisJob(dependencies.jobs, { jobId: job.id, clientId: job.client_id, to: "completed", now: dependencies.now() });
    if (completed.ok) return { ok: true, response: { ...completed.job, recognition: toSafeRecognition(result) }, duplicate };
    const current = await dependencies.jobs.findById(job.id);
    if (current?.status === "completed") return { ok: true, response: { ...toSafeMealAnalysisJob(current), recognition: toSafeRecognition(result) }, duplicate: true };
    return failure("database_failure");
  } catch { return failure("database_failure"); }
}

async function safeFindResult(jobId: string, dependencies: MealRecognitionDependencies) {
  try { return await dependencies.findResult(jobId); }
  catch { return null; }
}

class RecognitionProcessError extends Error {
  readonly code: RecognitionFailureCode;
  readonly retryable: boolean;
  constructor(code: RecognitionFailureCode, retryable: boolean) { super(code); this.code = code; this.retryable = retryable; }
}

function classifyFailure(error: unknown): { code: RecognitionFailureCode; retryable: boolean; status: 415 | 422 | 503 | 504 } {
  if (error instanceof RecognitionProcessError) return { code: error.code, retryable: error.retryable, status: error.code === "unsupported_image" ? 415 : 503 };
  if (error instanceof MealRecognitionProviderError) return { code: error.code, retryable: error.retryable, status: error.code === "recognition_timeout" ? 504 : error.code === "invalid_model_response" ? 422 : 503 };
  return { code: "invalid_model_response", retryable: false, status: 422 };
}

function failure(code: RecognitionFailureCode, job?: SafeMealAnalysisJob, retryable = code === "database_failure"): ProcessRecognitionResult & { ok: false } {
  return { ok: false, status: code === "recognition_timeout" ? 504 : code === "unsupported_image" ? 415 : code === "invalid_model_response" || code === "no_food_detected" ? 422 : 503, code, retryable, ...(job ? { job } : {}) };
}

function clientFailureMessage(code: RecognitionFailureCode) {
  if (code === "unsupported_image") return "This image format could not be analysed.";
  if (code === "invalid_model_response") return "Food recognition could not produce a safe result.";
  if (code === "no_food_detected") return "No recognizable meal was found in this image.";
  if (code === "image_not_available") return "The private meal image could not be retrieved.";
  return "Food recognition is temporarily unavailable.";
}
