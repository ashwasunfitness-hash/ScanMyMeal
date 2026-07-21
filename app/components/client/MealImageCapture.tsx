"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Camera, Check, CheckCircle2, Clock3, ImagePlus, LoaderCircle, LockKeyhole, RefreshCw, Trash2, XCircle } from "lucide-react";
import { initialMealImageState, initialMealUploadState, MEAL_IMAGE_ACCEPT, mealImageReducer, mealUploadReducer, validateMealImage } from "@/lib/client/meal-image";
import { ANALYSIS_POLL_INTERVAL_MS, ANALYSIS_POLL_TIMEOUT_MS, parseMealAnalysisJob, recognitionTriggerKey, shouldPollAnalysis, shouldTriggerRecognition, type MealAnalysisJobStatusResponse } from "@/lib/client/meal-analysis-job";

const RESTORED_JOB_KEY = "scan-my-meal:active-analysis-job";

export function MealImageCapture() {
  const [state, dispatch] = useReducer(mealImageReducer<File>, initialMealImageState);
  const [upload, uploadDispatch] = useReducer(mealUploadReducer, initialMealUploadState);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [uploadKey, setUploadKey] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<MealAnalysisJobStatusResponse | null>(null);
  const [analysisNotice, setAnalysisNotice] = useState<string | null>(null);
  const [retryingAnalysis, setRetryingAnalysis] = useState(false);
  const pollingStartedAt = useRef<number | null>(null);
  const recognitionRequests = useRef(new Set<string>());
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    const jobId = readRestoredJobId();
    if (!jobId) return;
    let cancelled = false;
    void fetch(`/api/meal-analysis-jobs/${jobId}`, { cache: "no-store" }).then(async (response) => {
      const restored = response.ok ? parseMealAnalysisJob(await response.json()) : null;
      if (cancelled) return;
      if (restored) {
        pollingStartedAt.current = Date.now();
        setAnalysis(restored);
      } else clearRestoredJobId();
    }).catch(() => { /* The normal scan flow remains available. */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (analysis?.jobId) storeRestoredJobId(analysis.jobId);
  }, [analysis?.jobId]);

  useEffect(() => {
    if (!analysis || !shouldTriggerRecognition(analysis, recognitionRequests.current)) return;
    const triggerKey = recognitionTriggerKey(analysis);
    recognitionRequests.current.add(triggerKey);
    let cancelled = false;
    void fetch(`/api/meal-analysis-jobs/${analysis.jobId}/recognize`, { method: "POST" }).then(async (response) => {
      const payload: unknown = await response.json();
      const next = parseMealAnalysisJob(payload);
      if (!cancelled && next) {
        setAnalysis(next);
        setAnalysisNotice(response.ok ? null : "Food recognition could not finish. Review the status below.");
      } else if (!cancelled && !response.ok) setAnalysisNotice("Food recognition could not be started right now. Status checks will continue safely.");
    }).catch(() => {
      if (!cancelled) setAnalysisNotice("Food recognition could not be started right now. Status checks will continue safely.");
    });
    return () => { cancelled = true; };
  }, [analysis]);

  useEffect(() => {
    if (!analysis || !shouldPollAnalysis(analysis.status, elapsedPollingTime(pollingStartedAt.current))) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      const elapsed = elapsedPollingTime(pollingStartedAt.current);
      if (elapsed >= ANALYSIS_POLL_TIMEOUT_MS) {
        if (!cancelled) setAnalysisNotice("Analysis is taking a little longer than usual. You can leave this page and check again later.");
        return;
      }
      try {
        const response = await fetch(`/api/meal-analysis-jobs/${analysis!.jobId}`, { cache: "no-store" });
        const payload: unknown = await response.json();
        const next = response.ok ? parseMealAnalysisJob(payload) : null;
        if (!cancelled && next) {
          setAnalysis(next);
          setAnalysisNotice(null);
          if (shouldPollAnalysis(next.status, elapsedPollingTime(pollingStartedAt.current))) timer = setTimeout(poll, ANALYSIS_POLL_INTERVAL_MS);
          return;
        }
        if (!cancelled) setAnalysisNotice("We could not refresh the status right now. We’ll try again shortly.");
      } catch {
        if (!cancelled) setAnalysisNotice("We could not refresh the status right now. We’ll try again shortly.");
      }
      if (!cancelled) timer = setTimeout(poll, ANALYSIS_POLL_INTERVAL_MS);
    }

    timer = setTimeout(poll, ANALYSIS_POLL_INTERVAL_MS);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [analysis]);

  function selectFile(file: File | undefined, input: HTMLInputElement) {
    if (file) {
      dispatch({ type: "select", file });
      if (!validateMealImage(file)) {
        setPreviewUrl(URL.createObjectURL(file));
        setPreviewError(false);
        setUploadKey(globalThis.crypto?.randomUUID?.() ?? null);
        setAnalysis(null);
        setAnalysisNotice(null);
        pollingStartedAt.current = null;
        recognitionRequests.current.clear();
        clearRestoredJobId();
        uploadDispatch({ type: "reset" });
      }
    }
    input.value = "";
  }

  function removeFile() {
    setPreviewUrl(null);
    setPreviewError(false);
    setUploadKey(null);
    setAnalysis(null);
    setAnalysisNotice(null);
    pollingStartedAt.current = null;
    recognitionRequests.current.clear();
    clearRestoredJobId();
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
    if (result.ok) {
      setAnalysis(result.analysisJob);
      setAnalysisNotice(null);
      pollingStartedAt.current = Date.now();
      uploadDispatch({ type: "success", uploadId: result.uploadId });
    }
    else uploadDispatch({ type: "failure", retryable: result.retryable, message: result.message });
  }

  async function retryAnalysis() {
    if (!analysis?.retryable || retryingAnalysis) return;
    setRetryingAnalysis(true);
    setAnalysisNotice(null);
    try {
      const response = await fetch(`/api/meal-analysis-jobs/${analysis.jobId}/retry`, { method: "POST" });
      const payload: unknown = await response.json();
      const next = response.ok ? parseMealAnalysisJob(payload) : null;
      if (next) {
        setAnalysis(next);
        pollingStartedAt.current = Date.now();
      } else setAnalysisNotice("The retry could not be started right now. Please try again.");
    } catch { setAnalysisNotice("The retry could not be started right now. Please check your connection."); }
    finally { setRetryingAnalysis(false); }
  }

  function replaceAfterNoFood() {
    removeFile();
    galleryInput.current?.click();
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
        {upload.phase === "success" && analysis && <AnalysisLifecycle job={analysis} notice={analysisNotice} retrying={retryingAnalysis} onRetry={retryAnalysis} onReplace={replaceAfterNoFood} />}
        {(upload.phase === "retryable_failure" || upload.phase === "non_retryable_failure") && <div className={`meal-upload-failure ${upload.phase}`} role="alert"><p>{upload.message}</p>{upload.phase === "retryable_failure" && <button type="button" onClick={beginUpload}>Retry upload</button>}</div>}
        {upload.phase !== "success" && <div className="meal-replace-actions" aria-label="Change selected image">
          <button type="button" disabled={upload.phase === "uploading"} onClick={() => cameraInput.current?.click()}><RefreshCw aria-hidden="true" />Retake photo</button>
          <button type="button" disabled={upload.phase === "uploading"} onClick={() => galleryInput.current?.click()}><ImagePlus aria-hidden="true" />Choose another</button>
          <button type="button" disabled={upload.phase === "uploading"} className="meal-remove-button" onClick={removeFile}><Trash2 aria-hidden="true" />Cancel and remove</button>
        </div>}
      </div>
    </div>}

    {!state.file && analysis && <div className="meal-restored-analysis"><AnalysisLifecycle job={analysis} notice={analysisNotice} retrying={retryingAnalysis} onRetry={retryAnalysis} onReplace={replaceAfterNoFood} /></div>}

    {state.error && <div className="meal-capture-error" role="alert">{state.error}</div>}
    <div className="meal-privacy-note"><LockKeyhole aria-hidden="true" /><p><strong>Your meal photo is stored privately.</strong><span>It is visible only to you and authorized coaching staff.</span></p></div>
  </section>;
}

function AnalysisLifecycle({ job, notice, retrying, onRetry, onReplace }: { job: MealAnalysisJobStatusResponse; notice: string | null; retrying: boolean; onRetry: () => void; onReplace: () => void }) {
  const content = {
    queued: { title: "Your meal is waiting for analysis.", detail: "The secure analysis job has been queued.", icon: Clock3 },
    processing: { title: "Your meal is being analysed.", detail: "Keep this page open or return later to check the status.", icon: LoaderCircle },
    completed: { title: "Analysis is ready.", detail: "Nutrition results are not shown in this step.", icon: CheckCircle2 },
    failed: { title: "Analysis could not be completed.", detail: job.retryable ? "You can safely retry this analysis." : "This analysis cannot be retried from the app.", icon: XCircle },
  }[job.status];
  const Icon = content.icon;
  return <><div className={`meal-analysis-status status-${job.status}`} role="status" aria-live="polite" aria-atomic="true">
    <Icon className={job.status === "processing" ? "status-spinner" : ""} aria-hidden="true" />
    <div><strong>{content.title}</strong><span>{content.detail}</span>{notice && <small>{notice}</small>}
      {job.status === "failed" && job.retryable && <button type="button" disabled={retrying} onClick={onRetry}><RefreshCw aria-hidden="true" />{retrying ? "Starting retry…" : "Retry analysis"}</button>}
    </div>
  </div>{job.status === "completed" && job.recognition && <RecognitionResults recognition={job.recognition} onReplace={onReplace} />}</>;
}

function RecognitionResults({ recognition, onReplace }: { recognition: NonNullable<MealAnalysisJobStatusResponse["recognition"]>; onReplace: () => void }) {
  return <section className="meal-recognition-results" aria-labelledby="foods-detected-title">
    <h3 id="foods-detected-title">Foods detected</h3>
    <p>Please review these items. You’ll be able to confirm or correct them in the next step.</p>
    {recognition.foods.length > 0 ? <ul>{recognition.foods.map((food) => <li key={food.id}>
      <div><strong>{food.name}</strong>{food.label && <span>{food.label}</span>}</div>
      <dl><div><dt>Confidence</dt><dd>{confidenceText(food.confidence)}</dd></div>{food.category && <div><dt>Category</dt><dd>{food.category}</dd></div>}</dl>
      {food.evidence && <p>{food.evidence}</p>}
    </li>)}</ul> : <div className="meal-no-food"><strong>No recognizable food was found.</strong><span>Try a clearer photo with the full meal visible.</span><button type="button" onClick={onReplace}><ImagePlus aria-hidden="true" />Choose another photo</button></div>}
  </section>;
}

function confidenceText(value: "high" | "medium" | "low") { return `${value.charAt(0).toUpperCase()}${value.slice(1)} confidence`; }

type UploadResponse = { ok: true; uploadId: string; analysisJob: MealAnalysisJobStatusResponse } | { ok: false; retryable: boolean; message: string };

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
      let payload: { uploadId?: string; analysisJob?: unknown; error?: string; retryable?: boolean } = {};
      try { payload = JSON.parse(request.responseText) as typeof payload; } catch { /* Use the safe fallback below. */ }
      const analysisJob = parseMealAnalysisJob(payload.analysisJob);
      if (request.status >= 200 && request.status < 300 && payload.uploadId && analysisJob) resolve({ ok: true, uploadId: payload.uploadId, analysisJob });
      else resolve({ ok: false, retryable: payload.retryable === true, message: payload.error ?? "The secure upload could not be completed. Choose the photo again or try later." });
    };
    request.send(form);
  });
}

function elapsedPollingTime(startedAt: number | null) { return startedAt === null ? 0 : Date.now() - startedAt; }

function readRestoredJobId() { try { return sessionStorage.getItem(RESTORED_JOB_KEY); } catch { return null; } }
function storeRestoredJobId(jobId: string) { try { sessionStorage.setItem(RESTORED_JOB_KEY, jobId); } catch { /* Status polling still works for this visit. */ } }
function clearRestoredJobId() { try { sessionStorage.removeItem(RESTORED_JOB_KEY); } catch { /* Nothing else to clear. */ } }

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
