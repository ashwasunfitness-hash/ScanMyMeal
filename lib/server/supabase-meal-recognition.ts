import { mealRecognitionSchema } from "#/lib/meal-recognition-contract";
import type { RecognitionResultRecord } from "@/lib/server/process-meal-recognition";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Json, MealRecognitionResultRow } from "@/lib/supabase/database.types";

const RESULT_FIELDS = "id,analysis_job_id,client_id,meal_upload_id,model_version,foods,image_quality,needs_user_confirmation,created_at,updated_at";

export function createMealRecognitionRepository(admin: ReturnType<typeof createAdminClient>) {
  return {
    async findUpload(uploadId: string) {
      const { data, error } = await admin.from("meal_uploads").select("id,client_id,storage_path,upload_status,mime_type,file_size_bytes").eq("id", uploadId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async findResult(jobId: string): Promise<RecognitionResultRecord | null> {
      const { data, error } = await admin.from("meal_recognition_results").select(RESULT_FIELDS).eq("analysis_job_id", jobId).maybeSingle();
      if (error) throw error;
      return data ? parseRecord(data as MealRecognitionResultRow) : null;
    },
    async saveResult(record: RecognitionResultRecord): Promise<RecognitionResultRecord | null> {
      const databaseRecord = { ...record, foods: record.foods as unknown as Json };
      const { error } = await admin.from("meal_recognition_results").insert(databaseRecord);
      if (!error) return record;
      const existing = await this.findResult(record.analysis_job_id);
      return existing?.client_id === record.client_id && existing.meal_upload_id === record.meal_upload_id ? existing : null;
    },
    async downloadImage(path: string) {
      const { data, error } = await admin.storage.from("meal-images").download(path);
      if (error || !data) return null;
      return data.arrayBuffer();
    },
  };
}

function parseRecord(row: MealRecognitionResultRow): RecognitionResultRecord {
  const recognition = mealRecognitionSchema.parse({ foods: row.foods, imageQuality: row.image_quality, needsUserConfirmation: row.needs_user_confirmation });
  return { ...row, foods: recognition.foods };
}
