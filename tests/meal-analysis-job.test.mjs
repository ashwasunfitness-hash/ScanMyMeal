import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ANALYSIS_POLL_TIMEOUT_MS, shouldPollAnalysis } from "../lib/client/meal-analysis-job.ts";
import { createMealAnalysisJob, getOwnedMealAnalysisJob, toSafeMealAnalysisJob, transitionMealAnalysisJob } from "../lib/server/meal-analysis-job.ts";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const UPLOAD_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-07-21T09:00:00.000Z");
const migrationSql = readFileSync(new URL("../supabase/migrations/202607210001_meal_analysis_jobs.sql", import.meta.url), "utf8");

const activeAccess = { allowed: true, userId: CLIENT_ID };

test("successful uploaded meal creates one queued analysis job", async () => {
  const repository = createRepository();
  const result = await createMealAnalysisJob(activeAccess, UPLOAD_ID, repository, NOW, () => JOB_ID);
  assert.equal(result.ok, true);
  assert.equal(result.job.status, "queued");
  assert.equal(result.job.attemptCount, 1);
  assert.equal(repository.createCalls, 1);
});

test("duplicate analysis creation returns the existing job", async () => {
  const repository = createRepository();
  const first = await createMealAnalysisJob(activeAccess, UPLOAD_ID, repository, NOW, () => JOB_ID);
  const second = await createMealAnalysisJob(activeAccess, UPLOAD_ID, repository, NOW, () => "55555555-5555-4555-8555-555555555555");
  assert.equal(first.ok, true);
  assert.deepEqual(second, { ...first, duplicate: true });
  assert.equal(repository.createCalls, 1);
});

test("unauthenticated analysis creation is rejected", async () => {
  const result = await createMealAnalysisJob({ allowed: false, status: 401, code: "authentication_required" }, UPLOAD_ID, createRepository(), NOW, () => JOB_ID);
  assert.deepEqual(result, { ok: false, status: 401, code: "authentication_required" });
});

test("upload and job ownership are enforced", async () => {
  const wrongUpload = createRepository({ upload: { id: UPLOAD_ID, client_id: OTHER_CLIENT_ID, upload_status: "uploaded" } });
  assert.deepEqual(await createMealAnalysisJob(activeAccess, UPLOAD_ID, wrongUpload, NOW, () => JOB_ID), { ok: false, status: 404, code: "upload_not_found" });

  const repository = createRepository({ job: jobRecord({ client_id: OTHER_CLIENT_ID }) });
  const result = await getOwnedMealAnalysisJob(activeAccess, JOB_ID, repository);
  assert.deepEqual(result, { ok: false, status: 404, code: "job_not_found" });
});

test("only queued to processing and processing to completed or failed are allowed", async () => {
  const completedRepository = createRepository({ job: jobRecord() });
  const processing = await transitionMealAnalysisJob(completedRepository, { jobId: JOB_ID, clientId: CLIENT_ID, to: "processing", now: NOW });
  assert.equal(processing.ok && processing.job.status, "processing");
  const completed = await transitionMealAnalysisJob(completedRepository, { jobId: JOB_ID, clientId: CLIENT_ID, to: "completed", now: NOW });
  assert.equal(completed.ok && completed.job.status, "completed");

  const failedRepository = createRepository({ job: jobRecord({ status: "processing", started_at: NOW.toISOString() }) });
  const failed = await transitionMealAnalysisJob(failedRepository, { jobId: JOB_ID, clientId: CLIENT_ID, to: "failed", failure: { code: "provider_timeout", message: "Timed out", retryable: true }, now: NOW });
  assert.equal(failed.ok && failed.job.status, "failed");
  assert.equal(failed.ok && failed.job.retryable, true);
});

test("invalid status transitions are rejected", async () => {
  const repository = createRepository({ job: jobRecord() });
  assert.deepEqual(await transitionMealAnalysisJob(repository, { jobId: JOB_ID, clientId: CLIENT_ID, to: "completed", now: NOW }), { ok: false, code: "invalid_transition" });
});

test("retryable failure resets timestamps and increments attempt count once", async () => {
  const repository = createRepository({ job: jobRecord({ status: "failed", attempt_count: 2, started_at: NOW.toISOString(), completed_at: NOW.toISOString(), last_error_code: "timeout", last_error_message: "Timed out", failure_retryable: true }) });
  const result = await transitionMealAnalysisJob(repository, { jobId: JOB_ID, clientId: CLIENT_ID, to: "queued", now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.job.attemptCount, 3);
  assert.equal(result.job.startedAt, null);
  assert.equal(result.job.completedAt, null);
  const duplicate = await transitionMealAnalysisJob(repository, { jobId: JOB_ID, clientId: CLIENT_ID, to: "queued", now: NOW });
  assert.deepEqual(duplicate, { ok: false, code: "invalid_transition" });
  assert.equal(repository.job.attempt_count, 3);
});

test("non-retryable failure and completed job cannot retry", async () => {
  const failed = createRepository({ job: jobRecord({ status: "failed", completed_at: NOW.toISOString(), last_error_code: "invalid_image", last_error_message: "Invalid image", failure_retryable: false }) });
  assert.deepEqual(await transitionMealAnalysisJob(failed, { jobId: JOB_ID, clientId: CLIENT_ID, to: "queued", now: NOW }), { ok: false, code: "failure_not_retryable" });
  const completed = createRepository({ job: jobRecord({ status: "completed", completed_at: NOW.toISOString() }) });
  assert.deepEqual(await transitionMealAnalysisJob(completed, { jobId: JOB_ID, clientId: CLIENT_ID, to: "queued", now: NOW }), { ok: false, code: "invalid_transition" });
});

test("polling stops for completed and failed states and at timeout", () => {
  assert.equal(shouldPollAnalysis("queued", 0), true);
  assert.equal(shouldPollAnalysis("processing", 4_000), true);
  assert.equal(shouldPollAnalysis("completed", 0), false);
  assert.equal(shouldPollAnalysis("failed", 0), false);
  assert.equal(shouldPollAnalysis("queued", ANALYSIS_POLL_TIMEOUT_MS), false);
});

test("client status contains safe fields only", () => {
  assert.deepEqual(Object.keys(toSafeMealAnalysisJob(jobRecord({ status: "failed", last_error_code: "secret_provider_code", last_error_message: "internal details", failure_retryable: true }))).sort(), [
    "attemptCount", "completedAt", "createdAt", "jobId", "retryable", "startedAt", "status", "uploadId",
  ]);
});

test("migration enforces ownership, uniqueness, RLS, and server-only writes", () => {
  assert.match(migrationSql, /foreign key \(meal_upload_id, client_id\)[\s\S]*references public\.meal_uploads\(id, client_id\)/i);
  assert.match(migrationSql, /unique \(meal_upload_id\)/i);
  assert.match(migrationSql, /alter table public\.meal_analysis_jobs enable row level security/i);
  assert.match(migrationSql, /revoke all on public\.meal_analysis_jobs from anon, authenticated/i);
  assert.match(migrationSql, /grant select on public\.meal_analysis_jobs to authenticated/i);
  assert.doesNotMatch(migrationSql, /grant (insert|update|delete|all).*meal_analysis_jobs to authenticated/i);
});

function jobRecord(overrides = {}) {
  return {
    id: JOB_ID, client_id: CLIENT_ID, meal_upload_id: UPLOAD_ID, status: "queued", attempt_count: 1,
    last_error_code: null, last_error_message: null, failure_retryable: false,
    created_at: NOW.toISOString(), started_at: null, completed_at: null, updated_at: NOW.toISOString(), ...overrides,
  };
}

function createRepository({ upload = { id: UPLOAD_ID, client_id: CLIENT_ID, upload_status: "uploaded" }, job = null } = {}) {
  return {
    upload, job, createCalls: 0,
    async findUpload(uploadId) { return this.upload?.id === uploadId ? this.upload : null; },
    async findByUpload(uploadId) { return this.job?.meal_upload_id === uploadId ? this.job : null; },
    async findById(jobId) { return this.job?.id === jobId ? this.job : null; },
    async create(record) { this.createCalls += 1; if (this.job) return false; this.job = record; return true; },
    async updateIfStatus(jobId, clientId, currentStatus, values) {
      if (!this.job || this.job.id !== jobId || this.job.client_id !== clientId || this.job.status !== currentStatus) return null;
      this.job = { ...this.job, ...values, updated_at: NOW.toISOString() };
      return this.job;
    },
  };
}
