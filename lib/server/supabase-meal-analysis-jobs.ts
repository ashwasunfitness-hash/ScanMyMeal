import type { createAdminClient } from "@/lib/supabase/admin";
import type { MealAnalysisJobRow } from "@/lib/supabase/database.types";
import type { MealAnalysisJobRepository } from "@/lib/server/meal-analysis-job";

const JOB_FIELDS = "id,client_id,meal_upload_id,status,attempt_count,last_error_code,last_error_message,failure_retryable,created_at,started_at,completed_at,updated_at";

export function createMealAnalysisJobRepository(admin: ReturnType<typeof createAdminClient>): MealAnalysisJobRepository {
  return {
    async findUpload(uploadId) {
      const { data, error } = await admin.from("meal_uploads").select("id,client_id,upload_status").eq("id", uploadId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async findByUpload(uploadId) {
      const { data, error } = await admin.from("meal_analysis_jobs").select(JOB_FIELDS).eq("meal_upload_id", uploadId).maybeSingle();
      if (error) throw error;
      return data as MealAnalysisJobRow | null;
    },
    async findById(jobId) {
      const { data, error } = await admin.from("meal_analysis_jobs").select(JOB_FIELDS).eq("id", jobId).maybeSingle();
      if (error) throw error;
      return data as MealAnalysisJobRow | null;
    },
    async create(record) {
      const { error } = await admin.from("meal_analysis_jobs").insert(record);
      return !error;
    },
    async updateIfStatus(jobId, clientId, currentStatus, values) {
      const { data, error } = await admin.from("meal_analysis_jobs").update(values).eq("id", jobId).eq("client_id", clientId).eq("status", currentStatus).select(JOB_FIELDS).maybeSingle();
      if (error) throw error;
      return data as MealAnalysisJobRow | null;
    },
  };
}
