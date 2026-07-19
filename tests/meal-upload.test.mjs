import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { authorizeMealUpload, buildMealImagePath, executeMealUpload, validateImageBytes } from "../lib/server/meal-upload.ts";
import { initialMealUploadState, mealUploadReducer } from "../lib/client/meal-image.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const UPLOAD_ID = "22222222-2222-4222-8222-222222222222";
const FILE_ID = "33333333-3333-4333-8333-333333333333";
const KEY = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-07-19T12:00:00.000Z");
const migrationSql = readFileSync(new URL("../supabase/migrations/202607190001_meal_uploads.sql", import.meta.url), "utf8");

const activeContext = {
  userId: USER_ID,
  email: "client@example.test",
  profile: { role: "client", account_status: "active" },
  programme: { status: "active", starts_at: "2026-07-01T00:00:00.000Z", expires_at: "2026-08-01T00:00:00.000Z" },
};

const image = { bytes: Uint8Array.from([0xff, 0xd8, 0xff]).buffer, mimeType: "image/jpeg", extension: "jpg" };

test("authorized active client upload is allowed", () => {
  assert.deepEqual(authorizeMealUpload(activeContext, NOW), { allowed: true, userId: USER_ID });
});

test("unauthorized user upload is rejected", () => {
  assert.deepEqual(authorizeMealUpload(null, NOW), { allowed: false, status: 401, code: "authentication_required" });
});

test("expired client upload is rejected", () => {
  const expired = { ...activeContext, programme: { ...activeContext.programme, expires_at: "2026-07-18T00:00:00.000Z" } };
  assert.deepEqual(authorizeMealUpload(expired, NOW), { allowed: false, status: 403, code: "client_access_expired" });
});

test("storage path is user scoped and uses server identifiers", () => {
  assert.equal(buildMealImagePath({ userId: USER_ID, mealId: UPLOAD_ID, fileId: FILE_ID, extension: "jpg", now: NOW }), `${USER_ID}/2026/07/${UPLOAD_ID}/${FILE_ID}.jpg`);
});

test("original filename is never reused in the storage path", () => {
  const path = buildMealImagePath({ userId: USER_ID, mealId: UPLOAD_ID, fileId: FILE_ID, extension: "png", now: NOW });
  assert.equal(path.includes("my private meal.png"), false);
  assert.equal(path.endsWith(`${FILE_ID}.png`), true);
});

test("file bytes must match the declared image format", () => {
  const valid = validateImageBytes(Uint8Array.from([0xff, 0xd8, 0xff]).buffer, "image/jpeg");
  const disguised = validateImageBytes(new TextEncoder().encode("not an image").buffer, "image/jpeg");
  assert.equal(valid?.extension, "jpg");
  assert.equal(disguised, null);
});

test("duplicate uploaded submission does not upload twice", async () => {
  let uploadCalls = 0;
  const dependencies = mockDependencies({
    existing: { id: UPLOAD_ID, client_id: USER_ID, storage_path: `${USER_ID}/2026/07/${UPLOAD_ID}/${FILE_ID}.jpg`, upload_status: "uploaded", mime_type: "image/jpeg", file_size_bytes: 3, idempotency_key: KEY, updated_at: NOW.toISOString() },
    upload: async () => { uploadCalls += 1; return true; },
  });
  const result = await executeMealUpload({ clientId: USER_ID, idempotencyKey: KEY, image }, dependencies);
  assert.deepEqual(result, { ok: true, uploadId: UPLOAD_ID, duplicate: true });
  assert.equal(uploadCalls, 0);
});

test("storage failure is recorded and the same upload can retry", async () => {
  let attempt = 0;
  const dependencies = statefulDependencies({ upload: async () => { attempt += 1; return attempt > 1; } });
  const first = await executeMealUpload({ clientId: USER_ID, idempotencyKey: KEY, image }, dependencies);
  const second = await executeMealUpload({ clientId: USER_ID, idempotencyKey: KEY, image }, dependencies);
  assert.deepEqual(first, { ok: false, status: 503, code: "storage_failure", retryable: true });
  assert.equal(second.ok, true);
  assert.equal(dependencies.record.upload_status, "uploaded");
});

test("database failure prevents object storage upload", async () => {
  let uploadCalls = 0;
  const dependencies = mockDependencies({ create: async () => false, upload: async () => { uploadCalls += 1; return true; } });
  const result = await executeMealUpload({ clientId: USER_ID, idempotencyKey: KEY, image }, dependencies);
  assert.deepEqual(result, { ok: false, status: 503, code: "database_failure", retryable: true });
  assert.equal(uploadCalls, 0);
});

test("successful upload state announces completion", () => {
  const uploading = mealUploadReducer(initialMealUploadState, { type: "start" });
  const progressed = mealUploadReducer(uploading, { type: "progress", progress: 62 });
  const successful = mealUploadReducer(progressed, { type: "success", uploadId: UPLOAD_ID });
  assert.equal(progressed.progress, 62);
  assert.deepEqual(successful, { phase: "success", progress: 100, message: "Your meal photo was uploaded privately.", uploadId: UPLOAD_ID });
});

test("upload migration keeps writes server-only and does not recreate the bucket", () => {
  assert.match(migrationSql, /alter table public\.meal_uploads enable row level security/i);
  assert.match(migrationSql, /create policy meal_uploads_select_authorised/i);
  assert.match(migrationSql, /revoke all on public\.meal_uploads from anon, authenticated/i);
  assert.doesNotMatch(migrationSql, /insert into storage\.buckets/i);
});

function mockDependencies(overrides = {}) {
  return {
    findByIdempotency: async () => overrides.existing ?? null,
    create: async () => true,
    setStatus: async () => true,
    upload: async () => true,
    remove: async () => {},
    randomId: (() => { const ids = [UPLOAD_ID, FILE_ID]; return () => ids.shift() ?? FILE_ID; })(),
    now: () => NOW,
    ...overrides,
  };
}

function statefulDependencies(overrides = {}) {
  const dependencies = mockDependencies(overrides);
  dependencies.record = null;
  dependencies.findByIdempotency = async () => dependencies.record;
  dependencies.create = async (record) => { dependencies.record = { ...record, updated_at: NOW.toISOString() }; return true; };
  dependencies.setStatus = async (_id, status) => { dependencies.record = { ...dependencies.record, upload_status: status, updated_at: NOW.toISOString() }; return true; };
  return dependencies;
}
