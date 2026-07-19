import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { authorizeMealUpload, executeMealUpload, MAX_MEAL_UPLOAD_BYTES, MEAL_IMAGE_BUCKET, validateImageBytes } from "@/lib/server/meal-upload";

export const dynamic = "force-dynamic";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let accessContext: Awaited<ReturnType<typeof getAccessContext>>;
  try { accessContext = await getAccessContext(); }
  catch { return responseError("database_failure", "Your access could not be verified right now. Please retry.", 503, true); }
  const access = authorizeMealUpload(accessContext);
  if (!access.allowed) return accessError(access.code, access.status);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return responseError("invalid_upload", "The image could not be read by this browser. Choose it again.", 400, false); }

  const image = form.get("image");
  const idempotencyKey = String(form.get("uploadKey") ?? "");
  if (!UUID_PATTERN.test(idempotencyKey)) return responseError("invalid_upload", "Please select the image again before uploading.", 400, false);
  if (!(image instanceof File)) return responseError("invalid_upload", "Choose a meal photo before uploading.", 400, false);
  if (image.size < 1 || image.size > MAX_MEAL_UPLOAD_BYTES) return responseError("invalid_upload", "Choose an image between 1 byte and 12 MB.", 413, false);

  let bytes: ArrayBuffer;
  try { bytes = await image.arrayBuffer(); }
  catch { return responseError("invalid_upload", "The selected image could not be read. Choose it again.", 400, false); }
  const validatedImage = validateImageBytes(bytes, image.type);
  if (!validatedImage) return responseError("invalid_upload", "Choose a valid JPEG, PNG, HEIC or WebP image.", 415, false);

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try { supabase = await createClient(); }
  catch { return responseError("database_failure", "The upload could not be prepared safely. Your photo is still selected, so you can retry.", 503, true); }
  const { data: consent, error: consentError } = await supabase.from("consent_records").select("id").eq("user_id", access.userId).eq("consent_type", "meal-photo-processing").is("revoked_at", null).maybeSingle();
  if (consentError) return responseError("database_failure", "The upload could not be prepared safely. Your photo is still selected, so you can retry.", 503, true);
  if (!consent) return responseError("consent_required", "Complete meal-photo consent before uploading.", 403, false);

  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); }
  catch { return responseError("database_failure", "The upload could not be prepared safely. Your photo is still selected, so you can retry.", 503, true); }
  const result = await executeMealUpload({ clientId: access.userId, idempotencyKey, image: validatedImage }, {
    async findByIdempotency(clientId, key) {
      const { data, error } = await admin.from("meal_uploads").select("id,client_id,storage_path,upload_status,mime_type,file_size_bytes,idempotency_key,updated_at").eq("client_id", clientId).eq("idempotency_key", key).maybeSingle();
      if (error) throw error;
      return data;
    },
    async create(record) { return !(await admin.from("meal_uploads").insert(record)).error; },
    async setStatus(id, status) { return !(await admin.from("meal_uploads").update({ upload_status: status }).eq("id", id).eq("client_id", access.userId)).error; },
    async upload(path, uploadImage) { return !(await supabase.storage.from(MEAL_IMAGE_BUCKET).upload(path, uploadImage.bytes, { contentType: uploadImage.mimeType, upsert: false, cacheControl: "3600" })).error; },
    async remove(path) { await supabase.storage.from(MEAL_IMAGE_BUCKET).remove([path]); },
    randomId: () => crypto.randomUUID(),
    now: () => new Date(),
  });

  if (result.ok) return NextResponse.json({ uploadId: result.uploadId, status: "uploaded", duplicate: result.duplicate }, { status: result.duplicate ? 200 : 201 });
  const messages = {
    upload_in_progress: "This photo is already being uploaded. Wait a moment, then retry.",
    storage_failure: "The private image upload was interrupted. Your photo is still selected, so you can retry.",
    database_failure: "The upload could not be finalized safely. Your photo is still selected, so you can retry.",
  };
  return responseError(result.code, messages[result.code], result.status, result.retryable);
}

function accessError(code: "authentication_required" | "client_access_required" | "client_access_expired", status: 401 | 403) {
  const message = code === "authentication_required" ? "Sign in again before uploading." : code === "client_access_expired" ? "Your active programme access is required to upload a meal photo." : "Client access is required to upload a meal photo.";
  return responseError(code, message, status, false);
}

function responseError(code: string, error: string, status: number, retryable: boolean) {
  return NextResponse.json({ error, code, retryable }, { status });
}
