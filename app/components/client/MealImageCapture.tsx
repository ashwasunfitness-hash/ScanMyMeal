"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Camera, Check, ImagePlus, LockKeyhole, RefreshCw, Trash2 } from "lucide-react";
import { initialMealImageState, initialMealUploadState, MEAL_IMAGE_ACCEPT, mealImageReducer, mealUploadReducer, validateMealImage } from "@/lib/client/meal-image";

export function MealImageCapture() {
  const [state, dispatch] = useReducer(mealImageReducer<File>, initialMealImageState);
  const [upload, uploadDispatch] = useReducer(mealUploadReducer, initialMealUploadState);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [uploadKey, setUploadKey] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function selectFile(file: File | undefined, input: HTMLInputElement) {
    if (file) {
      dispatch({ type: "select", file });
      if (!validateMealImage(file)) {
        setPreviewUrl(URL.createObjectURL(file));
        setPreviewError(false);
        setUploadKey(globalThis.crypto?.randomUUID?.() ?? null);
        uploadDispatch({ type: "reset" });
      }
    }
    input.value = "";
  }

  function removeFile() {
    setPreviewUrl(null);
    setPreviewError(false);
    setUploadKey(null);
    uploadDispatch({ type: "reset" });
    dispatch({ type: "remove" });
  }

  async function beginUpload() {
    if (!state.file || upload.phase === "uploading" || upload.phase === "success") return;
    dispatch({ type: "confirm" });
    if (!uploadKey || typeof XMLHttpRequest === "undefined") {
      uploadDispatch({ type: "failure", retryable: false, message: "Secure upload is not supported by this browser. Try an up-to-date browser." });
      return;
    }

    uploadDispatch({ type: "start" });
    const result = await uploadImage(state.file, uploadKey, (progress) => uploadDispatch({ type: "progress", progress }));
    if (result.ok) uploadDispatch({ type: "success", uploadId: result.uploadId });
    else uploadDispatch({ type: "failure", retryable: result.retryable, message: result.message });
  }

  return <section className="meal-capture-card" aria-labelledby="meal-capture-title">
    <input ref={cameraInput} className="visually-hidden" type="file" accept={MEAL_IMAGE_ACCEPT} capture="environment" aria-label="Take a meal photo" onChange={(event) => selectFile(event.currentTarget.files?.[0], event.currentTarget)} />
    <input ref={galleryInput} className="visually-hidden" type="file" accept={MEAL_IMAGE_ACCEPT} aria-label="Choose a meal image from gallery" onChange={(event) => selectFile(event.currentTarget.files?.[0], event.currentTarget)} />

    {!state.file ? <div className="meal-capture-start">
      <span className="meal-capture-symbol" aria-hidden="true"><Camera /></span>
      <p className="section-kicker">Add one clear photo</p>
      <h2 id="meal-capture-title">Photograph your full plate</h2>
      <p>For the clearest result, place the meal in good light and include the whole plate in the frame.</p>
      <div className="meal-capture-actions">
        <button className="meal-camera-button" type="button" onClick={() => cameraInput.current?.click()}><Camera aria-hidden="true" />Take a photo</button>
        <button className="meal-gallery-button" type="button" onClick={() => galleryInput.current?.click()}><ImagePlus aria-hidden="true" />Choose from gallery</button>
      </div>
      <p className="meal-file-guidance">JPEG, PNG, HEIC or WebP · maximum 12 MB</p>
    </div> : <div className="meal-capture-review">
      <div className="meal-preview-wrap">
        {/* A local blob URL cannot be processed by the framework image pipeline. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {previewUrl && <img src={previewUrl} alt={`Selected meal: ${state.file.name}`} onLoad={() => setPreviewError(false)} onError={() => setPreviewError(true)} />}
        {previewError && <p className="meal-preview-error" role="alert">This browser cannot preview this image. Choose a JPEG, PNG or WebP copy instead.</p>}
        <span><Check aria-hidden="true" />Image selected</span>
      </div>
      <div className="meal-review-copy">
        <p className="section-kicker">Check your photo</p>
        <h2 id="meal-capture-title">Use this meal image?</h2>
        <p>Make sure the food is visible and the photo is not blurry before continuing.</p>
        <dl className="meal-file-details"><div><dt>File</dt><dd>{state.file.name}</dd></div><div><dt>Size</dt><dd>{formatFileSize(state.file.size)}</dd></div></dl>
        <button className="meal-use-button" type="button" disabled={previewError || upload.phase === "uploading" || upload.phase === "success"} onClick={beginUpload}><Check aria-hidden="true" />{upload.phase === "uploading" ? "Uploading…" : upload.phase === "success" ? "Photo uploaded" : "Use this photo"}</button>
        {upload.phase === "uploading" && <div className="meal-upload-progress" role="status" aria-live="polite"><div><span>Uploading privately</span><strong>{upload.progress}%</strong></div><progress max="100" value={upload.progress}>{upload.progress}%</progress><small>{upload.progress >= 95 ? "Finalizing secure upload…" : "Keep this page open until the upload finishes."}</small></div>}
        {upload.phase === "success" && <div className="meal-upload-success" role="status"><Check aria-hidden="true" /><p><strong>Meal photo uploaded</strong><span>{upload.message} Analysis will happen in a later step.</span></p></div>}
        {(upload.phase === "retryable_failure" || upload.phase === "non_retryable_failure") && <div className={`meal-upload-failure ${upload.phase}`} role="alert"><p>{upload.message}</p>{upload.phase === "retryable_failure" && <button type="button" onClick={beginUpload}>Retry upload</button>}</div>}
        {upload.phase !== "success" && <div className="meal-replace-actions" aria-label="Change selected image">
          <button type="button" disabled={upload.phase === "uploading"} onClick={() => cameraInput.current?.click()}><RefreshCw aria-hidden="true" />Retake photo</button>
          <button type="button" disabled={upload.phase === "uploading"} onClick={() => galleryInput.current?.click()}><ImagePlus aria-hidden="true" />Choose another</button>
          <button type="button" disabled={upload.phase === "uploading"} className="meal-remove-button" onClick={removeFile}><Trash2 aria-hidden="true" />Cancel and remove</button>
        </div>}
      </div>
    </div>}

    {state.error && <div className="meal-capture-error" role="alert">{state.error}</div>}
    <div className="meal-privacy-note"><LockKeyhole aria-hidden="true" /><p><strong>Your meal photo is stored privately.</strong><span>It is visible only to you and authorized coaching staff. Analysis will happen in a later step.</span></p></div>
  </section>;
}

type UploadResponse = { ok: true; uploadId: string } | { ok: false; retryable: boolean; message: string };

function uploadImage(file: File, uploadKey: string, onProgress: (progress: number) => void): Promise<UploadResponse> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    const form = new FormData();
    form.set("image", file);
    form.set("uploadKey", uploadKey);
    request.open("POST", "/api/meal-uploads");
    request.timeout = 90_000;
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress((event.loaded / event.total) * 95); };
    request.onerror = () => resolve({ ok: false, retryable: true, message: "Your connection was interrupted. Check it and retry—the photo is still selected." });
    request.ontimeout = () => resolve({ ok: false, retryable: true, message: "The upload took too long. Check your connection and retry." });
    request.onload = () => {
      let payload: { uploadId?: string; error?: string; retryable?: boolean } = {};
      try { payload = JSON.parse(request.responseText) as typeof payload; } catch { /* Use the safe fallback below. */ }
      if (request.status >= 200 && request.status < 300 && payload.uploadId) resolve({ ok: true, uploadId: payload.uploadId });
      else resolve({ ok: false, retryable: payload.retryable === true, message: payload.error ?? "The secure upload could not be completed. Choose the photo again or try later." });
    };
    request.send(form);
  });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
