"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Camera, Check, ImagePlus, LockKeyhole, RefreshCw, Trash2 } from "lucide-react";
import { initialMealImageState, MEAL_IMAGE_ACCEPT, mealImageReducer, validateMealImage } from "@/lib/client/meal-image";

export function MealImageCapture() {
  const [state, dispatch] = useReducer(mealImageReducer<File>, initialMealImageState);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
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
      }
    }
    input.value = "";
  }

  function removeFile() {
    setPreviewUrl(null);
    setPreviewError(false);
    dispatch({ type: "remove" });
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
        <button className="meal-use-button" type="button" disabled={previewError} onClick={() => dispatch({ type: "confirm" })}><Check aria-hidden="true" />{state.confirmed ? "Photo ready" : "Use this photo"}</button>
        {state.confirmed && <p className="meal-ready-message" role="status">Your image is ready. Analysis and uploading are not connected in this step yet.</p>}
        <div className="meal-replace-actions" aria-label="Change selected image">
          <button type="button" onClick={() => cameraInput.current?.click()}><RefreshCw aria-hidden="true" />Retake photo</button>
          <button type="button" onClick={() => galleryInput.current?.click()}><ImagePlus aria-hidden="true" />Choose another</button>
          <button type="button" className="meal-remove-button" onClick={removeFile}><Trash2 aria-hidden="true" />Remove</button>
        </div>
      </div>
    </div>}

    {state.error && <div className="meal-capture-error" role="alert">{state.error}</div>}
    <div className="meal-privacy-note"><LockKeyhole aria-hidden="true" /><p><strong>Your meal photo stays private.</strong><span>Nothing is uploaded at this stage. If you continue later, the image will be used only for meal analysis.</span></p></div>
  </section>;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
