import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * POST /api/ai/lyrics — word-timestamped lyrics for a job's vocals stem (Pro).
 *
 * Flow: gate to Pro/Business → fetch the already-separated vocals stem audio
 * from the pipeline backend → send it to OpenAI Whisper with word-level
 * timestamps → return { words, text }. The frontend renders a karaoke-style
 * lyric strip that highlights the current word against the shared playback
 * clock (same time source the OSMD cursor uses).
 *
 * Why this lives in a Next route, not the Python backend: the tier gate needs
 * the Supabase session, which only the Next layer has. The OpenAI key is read
 * from OPENAI_API_KEY env (never client-side).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

interface LyricsRequest {
  jobId: string;
  stem?: string; // defaults to "vocals"
}

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

interface LyricsResult {
  text: string;
  words: WhisperWord[];
}

// A job's stem audio is immutable, so its Whisper transcription never changes.
// Cache results by (jobId, stem) so repeated requests — re-opening the panel,
// or a script in a tight loop — are served free instead of re-billing Whisper.
// Bounded with FIFO eviction so memory can't grow without limit.
const RESULT_CACHE = new Map<string, LyricsResult>();
const MAX_CACHE_ENTRIES = 200;
// Per-user cooldown between *billable* (cache-miss) calls — caps burst abuse of
// the paid Whisper endpoint. Cache hits bypass this entirely.
const LAST_BILLABLE_CALL = new Map<string, number>();
const COOLDOWN_MS = 6000;

function isLyricsRequest(b: unknown): b is LyricsRequest {
  if (typeof b !== "object" || b === null) return false;
  const jobId = (b as Record<string, unknown>).jobId;
  // UUID job IDs only — also rejects path-traversal / SSRF chars (/, ?, #, ..)
  // before jobId is interpolated into the backend stem-audio URL.
  return typeof jobId === "string" && /^[a-zA-Z0-9_-]+$/.test(jobId);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to generate lyrics." }, { status: 401 });
  }
  if (session.user.tier === "free") {
    return NextResponse.json(
      { error: "Synced lyrics are a Pro feature.", upgrade: true },
      { status: 403 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI features are not configured on this deployment." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isLyricsRequest(body)) {
    return NextResponse.json({ error: "Expected { jobId }" }, { status: 400 });
  }
  const stem = body.stem && /^[a-z0-9_-]+$/i.test(body.stem) ? body.stem : "vocals";

  // Cache hit → serve free. No cooldown, no re-bill (stem audio is immutable).
  const cacheKey = `${body.jobId}:${stem}`;
  const cached = RESULT_CACHE.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  // Per-user cooldown gate before any billable work (stem download + Whisper).
  const now = Date.now();
  const last = LAST_BILLABLE_CALL.get(session.user.id) ?? 0;
  if (now - last < COOLDOWN_MS) {
    return NextResponse.json(
      { error: "Slow down — wait a few seconds before generating lyrics again." },
      { status: 429 },
    );
  }
  LAST_BILLABLE_CALL.set(session.user.id, now);

  // 1. Fetch the separated vocals stem audio from the pipeline backend.
  const stemRes = await fetch(
    `${API_URL}/api/jobs/${body.jobId}/stems/${stem}/audio`,
    { headers: { "ngrok-skip-browser-warning": "true" } },
  ).catch(() => null);
  if (!stemRes || !stemRes.ok) {
    return NextResponse.json(
      {
        error:
          stem === "vocals"
            ? "No vocals stem found for this job — lyrics need a vocal track."
            : `No '${stem}' stem audio found for this job.`,
      },
      { status: 404 },
    );
  }
  const audioBuf = await stemRes.arrayBuffer();
  // Whisper caps at 25 MB. A 3-4 min separated vocal WAV can exceed that, so
  // bail with a clear message rather than a cryptic 413 from OpenAI.
  if (audioBuf.byteLength > 24 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Vocal track too large for lyric transcription (max ~25 MB)." },
      { status: 413 },
    );
  }

  // 2. Send to Whisper with word-level timestamps.
  const form = new FormData();
  form.append("file", new Blob([audioBuf], { type: "audio/wav" }), `${stem}.wav`);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");

  const whisperRes = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  }).catch(() => null);

  if (!whisperRes || !whisperRes.ok) {
    const detail = whisperRes ? await whisperRes.text().catch(() => "") : "network error";
    console.error("[ai/lyrics] Whisper failed:", whisperRes?.status, detail.slice(0, 300));
    return NextResponse.json(
      { error: "Lyric transcription failed — try again in a minute." },
      { status: 502 },
    );
  }

  const data = (await whisperRes.json()) as {
    text?: string;
    words?: WhisperWord[];
  };

  const words: WhisperWord[] = Array.isArray(data.words)
    ? data.words.map((w) => ({ word: w.word, start: w.start, end: w.end }))
    : [];

  if (words.length === 0) {
    return NextResponse.json(
      { error: "No lyrics detected in the vocal track (it may be instrumental)." },
      { status: 422 },
    );
  }

  const result: LyricsResult = { text: data.text ?? "", words };
  RESULT_CACHE.set(cacheKey, result);
  if (RESULT_CACHE.size > MAX_CACHE_ENTRIES) {
    const oldest = RESULT_CACHE.keys().next().value;
    if (oldest !== undefined) RESULT_CACHE.delete(oldest);
  }
  return NextResponse.json(result);
}
