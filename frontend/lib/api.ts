const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ngrok free tier shows an interstitial page for browser traffic.
// This header bypasses it for all API fetch calls.
const NGROK_HEADERS: Record<string, string> = {
  "ngrok-skip-browser-warning": "true",
};

export interface StageInfo {
  name: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  message: string;
}

export interface JobState {
  job_id: string;
  status: "queued" | "processing" | "done" | "failed";
  current_stage: string;
  stages: StageInfo[];
  scores: Record<string, string[]>; // stem → ["musicxml", "mid"]
  error: string;
  total_time_seconds: number;
}

export async function uploadAudio(file: File): Promise<{ job_id: string; status: string }> {
  const form = new FormData();
  form.append("file", file);
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

export function downloadUrl(jobId: string, stem: string, fmt: string): string {
  // Append header as query param isn't possible for downloads; use anchor tag with header workaround
  return `${API_URL}/api/jobs/${jobId}/download/${stem}/${fmt}`;
}
