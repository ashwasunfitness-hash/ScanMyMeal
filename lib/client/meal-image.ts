export const MAX_MEAL_IMAGE_BYTES = 12 * 1024 * 1024;

export const MEAL_IMAGE_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
].join(",");

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

export type MealImageFile = Pick<File, "name" | "size" | "type">;

export type MealImageState<TFile extends MealImageFile = File> = {
  file: TFile | null;
  error: string | null;
  confirmed: boolean;
};

export type MealImageAction<TFile extends MealImageFile = File> =
  | { type: "select"; file: TFile }
  | { type: "remove" }
  | { type: "confirm" };

export const initialMealImageState: MealImageState = { file: null, error: null, confirmed: false };

export type MealUploadState = {
  phase: "idle" | "uploading" | "success" | "retryable_failure" | "non_retryable_failure";
  progress: number;
  message: string | null;
  uploadId: string | null;
};

export type MealUploadAction =
  | { type: "reset" }
  | { type: "start" }
  | { type: "progress"; progress: number }
  | { type: "success"; uploadId: string }
  | { type: "failure"; message: string; retryable: boolean };

export const initialMealUploadState: MealUploadState = { phase: "idle", progress: 0, message: null, uploadId: null };

export function mealUploadReducer(state: MealUploadState, action: MealUploadAction): MealUploadState {
  if (action.type === "reset") return initialMealUploadState;
  if (action.type === "start") return { phase: "uploading", progress: 0, message: null, uploadId: null };
  if (action.type === "progress") return state.phase === "uploading" ? { ...state, progress: Math.max(0, Math.min(95, Math.round(action.progress))) } : state;
  if (action.type === "success") return { phase: "success", progress: 100, message: "Your meal photo was uploaded privately.", uploadId: action.uploadId };
  return { phase: action.retryable ? "retryable_failure" : "non_retryable_failure", progress: 0, message: action.message, uploadId: null };
}

export function validateMealImage(file: MealImageFile): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const hasAllowedType = ALLOWED_MIME_TYPES.has(file.type.toLowerCase());
  const hasAllowedFallbackExtension = file.type === "" && ALLOWED_EXTENSIONS.has(extension);

  if (!hasAllowedType && !hasAllowedFallbackExtension) {
    return "Choose a JPEG, PNG, HEIC or WebP image.";
  }

  if (file.size > MAX_MEAL_IMAGE_BYTES) {
    return "This image is larger than 12 MB. Choose a smaller photo.";
  }

  if (file.size === 0) {
    return "This image is empty. Choose a different photo.";
  }

  return null;
}

export function mealImageReducer<TFile extends MealImageFile>(state: MealImageState<TFile>, action: MealImageAction<TFile>): MealImageState<TFile> {
  if (action.type === "remove") return { file: null, error: null, confirmed: false };
  if (action.type === "confirm") return state.file ? { ...state, error: null, confirmed: true } : state;

  const error = validateMealImage(action.file);
  if (error) return { ...state, error, confirmed: false };
  return { file: action.file, error: null, confirmed: false };
}
