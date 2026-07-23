export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type RowShape<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };

export type ProfileRow = {
  id: string; email: string; full_name: string | null; phone: string | null; avatar_path: string | null;
  role: "client" | "coach" | "admin"; account_status: "invited" | "onboarding" | "active" | "expired" | "suspended" | "archived";
  onboarding_step: number; onboarding_completed_at: string | null; last_login_at: string | null; created_at: string; updated_at: string;
};

export type ProgrammeRow = {
  id: string; client_id: string; programme_name: string; primary_goal: string | null; starts_at: string; expires_at: string;
  status: "scheduled" | "active" | "expired" | "paused" | "cancelled"; assigned_coach_id: string | null; created_by: string | null; created_at: string; updated_at: string;
};

export type InvitationRow = {
  id: string; email: string; full_name: string | null; phone: string | null; intended_role: "client" | "coach" | "admin";
  programme_name: string | null; primary_goal: string | null; programme_starts_at: string | null; programme_expires_at: string | null;
  assigned_coach_id: string | null; status: "pending" | "accepted" | "expired" | "cancelled"; invited_by: string | null;
  sent_at: string | null; accepted_at: string | null; expires_at: string; created_at: string; updated_at: string;
};

export type MealEntryRow = {
  id: string; client_id: string; programme_id: string | null; meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  title: string; image_path: string | null; notes: string | null; calories_kcal: number; protein_g: number; carbohydrates_g: number;
  fat_g: number; fibre_g: number; overall_confidence: number; status: "confirmed" | "needs_review" | "reviewed";
  analysis_version: string; ai_provider: string | null; created_at: string; updated_at: string;
};

export type MealUploadRow = {
  id: string; client_id: string; storage_path: string; upload_status: "pending_upload" | "uploaded" | "upload_failed";
  mime_type: "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif"; file_size_bytes: number;
  idempotency_key: string; created_at: string; updated_at: string;
};

export type MealAnalysisJobRow = {
  id: string; client_id: string; meal_upload_id: string; status: "queued" | "processing" | "completed" | "failed";
  attempt_count: number; last_error_code: string | null; last_error_message: string | null; failure_retryable: boolean;
  created_at: string; started_at: string | null; completed_at: string | null; updated_at: string;
};

export type MealRecognitionResultRow = {
  id: string; analysis_job_id: string; client_id: string; meal_upload_id: string; model_version: string;
  foods: Json; image_quality: "good" | "usable" | "poor"; needs_user_confirmation: boolean;
  created_at: string; updated_at: string;
};

export type MealFoodConfirmationRow = {
  id: string; analysis_job_id: string; recognition_result_id: string; meal_upload_id: string; client_id: string;
  status: "confirmed"; foods: Json; confirmed_at: string; created_at: string; updated_at: string;
};

export type MealPortionConfirmationRow = {
  id: string; analysis_job_id: string; food_confirmation_id: string; meal_upload_id: string; client_id: string;
  status: "confirmed"; portions: Json; confirmed_at: string; created_at: string; updated_at: string;
};

export type MealNutritionResultRow = {
  id: string; analysis_job_id: string; portion_confirmation_id: string; food_confirmation_id: string; meal_upload_id: string; client_id: string;
  status: "completed" | "partial" | "failed"; engine_version: string; catalogue_version: string; items: Json; totals: Json | null;
  is_complete: boolean; total_confirmed_food_count: number; resolved_item_count: number; unresolved_item_count: number;
  calculated_at: string; created_at: string; updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: RowShape<ProfileRow>;
      client_profiles: RowShape<{ user_id: string; date_of_birth: string | null; gender: string | null; height_cm: number | null; current_weight_kg: number | null; location: string | null; dietary_pattern: string | null; preferred_cuisines: string[]; allergies: string[]; foods_avoided: string[]; primary_goal: string | null; activity_level: string | null; workout_frequency: string | null; typical_meal_schedule: string | null; relevant_health_context: string | null; preferred_units: string; created_at: string; updated_at: string }>;
      programmes: RowShape<ProgrammeRow>;
      nutrition_targets: RowShape<{ id: string; client_id: string; programme_id: string | null; calories_kcal: number | null; protein_g: number | null; carbohydrates_g: number | null; fat_g: number | null; fibre_g: number | null; effective_from: string; effective_until: string | null; set_by: string | null; created_at: string; updated_at: string }>;
      invitations: RowShape<InvitationRow>;
      coach_assignments: RowShape<{ id: string; coach_id: string; client_id: string; starts_at: string; ends_at: string | null; is_active: boolean; assigned_by: string | null; created_at: string }>;
      consent_records: RowShape<{ id: string; user_id: string; consent_type: string; document_version: string; accepted_at: string; revoked_at: string | null; created_at: string }>;
      audit_logs: RowShape<{ id: string; actor_user_id: string | null; action: string; target_type: string; target_id: string | null; metadata: Json; created_at: string }>;
      meal_entries: RowShape<MealEntryRow>;
      meal_uploads: RowShape<MealUploadRow>;
      meal_analysis_jobs: RowShape<MealAnalysisJobRow>;
      meal_recognition_results: RowShape<MealRecognitionResultRow>;
      meal_food_confirmations: RowShape<MealFoodConfirmationRow>;
      meal_portion_confirmations: RowShape<MealPortionConfirmationRow>;
      meal_nutrition_results: RowShape<MealNutritionResultRow>;
      meal_items: RowShape<{ id: string; meal_id: string; detected_name: string; canonical_name: string | null; serving_label: string; grams: number | null; calories_kcal: number; protein_g: number; carbohydrates_g: number; fat_g: number; fibre_g: number; confidence: number; nutrition_source: string }>;
      coach_feedback: RowShape<{ id: string; client_id: string; coach_id: string; meal_id: string | null; body: string; is_client_visible: boolean; created_at: string; updated_at: string }>;
      onboarding_drafts: RowShape<{ user_id: string; step: number; payload: Json; updated_at: string }>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
