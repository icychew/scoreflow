const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ngrok free tier shows an interstitial page for browser traffic.
// This header bypasses it for all API fetch calls.
export const NGROK_HEADERS: Record<string, string> = {
  "ngrok-skip-browser-warning": "true",
};

export interface StageInfo {
  name: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  message: string;
}

export type Difficulty = "easy" | "medium" | "hard";

export interface JobState {
  job_id: string;
  status: "queued" | "processing" | "done" | "failed";
  current_stage: string;
  stages: StageInfo[];
  scores: Record<string, string[]>; // stem → ["musicxml", "mid"]
  error: string;
  total_time_seconds: number;
  omr_scores?: Record<string, number>; // stem → 0.0–1.0 confidence, -1.0 = not run
  refinement_scores?: Record<string, number>; // stem → mean chroma similarity 0.0–1.0
  /** stem → list of difficulty variants the pipeline produced */
  score_difficulties?: Record<string, Difficulty[]>;
}

export type Quality = "standard" | "high";

export async function uploadAudio(
  file: File,
  quality: Quality = "standard",
  refine: boolean = false,
): Promise<{ job_id: string; status: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("quality", quality);
  form.append("refine", refine ? "true" : "false");
  const res = await fetch(`${API_URL}/api/jobs`, {
    method: "POST",
    body: form,
    headers: NGROK_HEADERS,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Upload failed");
  }
  return res.json();
}

export async function pollJob(jobId: string): Promise<JobState> {
  const res = await fetch(`${API_URL}/api/jobs/${jobId}`, {
    headers: NGROK_HEADERS,
  });
  if (!res.ok) throw new Error("Failed to fetch job status");
  return res.json();
}

export function downloadUrl(
  jobId: string,
  stem: string,
  fmt: string,
  difficulty: Difficulty = "hard",
): string {
  const base = `${API_URL}/api/jobs/${jobId}/download/${stem}/${fmt}`;
  // "hard" preserves the legacy URL — no query string appended
  return difficulty === "hard" ? base : `${base}?difficulty=${difficulty}`;
}

/**
 * URL of the user's original uploaded audio for a job. Streams from the
 * backend with Range-request support, suitable as the `src` of an `<audio>`
 * element. Used by MusicXmlViewer's "Original" playback mode.
 */
export function originalAudioUrl(jobId: string): string {
  return `${API_URL}/api/jobs/${jobId}/audio`;
}
