import type { AccessContext } from "@/lib/access-control";
import type { MealUploadRow } from "@/lib/supabase/database.types";

export const MEAL_IMAGE_BUCKET = "meal-images";
export const MAX_MEAL_UPLOAD_BYTES = 12 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STALE_PENDING_MS = 2 * 60 * 1000;

export type UploadAccessResult =
  | { allowed: true; userId: string }
  | { allowed: false; status: 401 | 403; code: "authentication_required" | "client_access_required" | "client_access_expired" };

export function authorizeMealUpload(context: AccessContext | null, now = new Date()): UploadAccessResult {
  if (!context) return { allowed: false, status: 401, code: "authentication_required" };
  if (context.profile.role !== "client") return { allowed: false, status: 403, code: "client_access_required" };
  const programmeActive = context.programme?.status === "active"
    && new Date(context.programme.starts_at) <= now
    && new Date(context.programme.expires_at) > now;
  if (context.profile.account_status !== "active" || !programmeActive) {
    return { allowed: false, status: 403, code: "client_access_expired" };
  }
  return { allowed: true, userId: context.userId };
}

export type ValidatedImage = {
  bytes: ArrayBuffer;
  mimeType: MealUploadRow["mime_type"];
  extension: "jpg" | "png" | "webp" | "heic";
};

export function validateImageBytes(bytes: ArrayBuffer, declaredMimeType: string): ValidatedImage | null {
  const data = new Uint8Array(bytes);
  const jpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const png = data.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => data[index] === byte);
  const webp = data.length >= 12 && ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 12) === "WEBP";
  const heicBrand = data.length >= 12 && ascii(data, 4, 8) === "ftyp" ? ascii(data, 8, 12) : "";
  const heic = ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(heicBrand);

  if (declaredMimeType === "image/jpeg" && jpeg) return { bytes, mimeType: "image/jpeg", extension: "jpg" };
  if (declaredMimeType === "image/png" && png) return { bytes, mimeType: "image/png", extension: "png" };
  if (declaredMimeType === "image/webp" && webp) return { bytes, mimeType: "image/webp", extension: "webp" };
  if ((declaredMimeType === "image/heic" || declaredMimeType === "image/heif") && heic) return { bytes, mimeType: declaredMimeType, extension: "heic" };
  return null;
}

export function buildMealImagePath(input: { userId: string; mealId: string; fileId: string; extension: ValidatedImage["extension"]; now?: Date }) {
  if (![input.userId, input.mealId, input.fileId].every((value) => UUID_PATTERN.test(value))) throw new Error("Invalid upload identifier");
  const now = input.now ?? new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${input.userId}/${year}/${month}/${input.mealId}/${input.fileId}.${input.extension}`;
}

export type MealUploadRecord = Pick<MealUploadRow, "id" | "client_id" | "storage_path" | "upload_status" | "mime_type" | "file_size_bytes" | "idempotency_key" | "updated_at">;

export type MealUploadDependencies = {
  findByIdempotency(clientId: string, idempotencyKey: string): Promise<MealUploadRecord | null>;
  create(record: Omit<MealUploadRecord, "updated_at">): Promise<boolean>;
  setStatus(id: string, status: MealUploadRow["upload_status"]): Promise<boolean>;
  upload(path: string, image: ValidatedImage): Promise<boolean>;
  remove(path: string): Promise<void>;
  randomId(): string;
  now(): Date;
};

export type MealUploadResult =
  | { ok: true; uploadId: string; duplicate: boolean }
  | { ok: false; status: 409 | 503; code: "upload_in_progress" | "storage_failure" | "database_failure"; retryable: true };

export async function executeMealUpload(input: { clientId: string; idempotencyKey: string; image: ValidatedImage }, dependencies: MealUploadDependencies): Promise<MealUploadResult> {
  let existing: MealUploadRecord | null;
  try { existing = await dependencies.findByIdempotency(input.clientId, input.idempotencyKey); }
  catch { return databaseFailure(); }

  if (existing?.upload_status === "uploaded") return { ok: true, uploadId: existing.id, duplicate: true };
  if (existing?.upload_status === "pending_upload" && dependencies.now().getTime() - new Date(existing.updated_at).getTime() < STALE_PENDING_MS) {
    return { ok: false, status: 409, code: "upload_in_progress", retryable: true };
  }

  const id = existing?.id ?? dependencies.randomId();
  const path = existing?.storage_path ?? buildMealImagePath({ userId: input.clientId, mealId: id, fileId: dependencies.randomId(), extension: input.image.extension, now: dependencies.now() });

  try {
    const databaseReady = existing
      ? await dependencies.setStatus(id, "pending_upload")
      : await dependencies.create({ id, client_id: input.clientId, storage_path: path, upload_status: "pending_upload", mime_type: input.image.mimeType, file_size_bytes: input.image.bytes.byteLength, idempotency_key: input.idempotencyKey });
    if (!databaseReady) return databaseFailure();
  } catch { return databaseFailure(); }

  let uploaded = false;
  try { uploaded = await dependencies.upload(path, input.image); } catch { uploaded = false; }
  if (!uploaded) {
    try { await dependencies.remove(path); } catch { /* Best effort cleanup for interrupted writes. */ }
    await safeSetFailed(dependencies, id);
    return { ok: false, status: 503, code: "storage_failure", retryable: true };
  }

  try {
    if (await dependencies.setStatus(id, "uploaded")) return { ok: true, uploadId: id, duplicate: false };
  } catch { /* Compensate below. */ }
  try { await dependencies.remove(path); } catch { /* Best effort; path remains private. */ }
  await safeSetFailed(dependencies, id);
  return databaseFailure();
}

function ascii(data: Uint8Array, start: number, end: number) { return String.fromCharCode(...data.slice(start, end)); }
function databaseFailure(): MealUploadResult { return { ok: false, status: 503, code: "database_failure", retryable: true }; }
async function safeSetFailed(dependencies: MealUploadDependencies, id: string) { try { await dependencies.setStatus(id, "upload_failed"); } catch { /* Best effort. */ } }
