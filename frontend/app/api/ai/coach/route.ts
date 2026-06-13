import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * POST /api/ai/coach — AI practice tips for a transcribed stem (Pro feature).
 *
 * The client sends a compact summary of the score it already has loaded
 * (no audio, no full MusicXML — keeps the prompt small and the latency low).
 * We call OpenAI server-side; the key lives in OPENAI_API_KEY env only.
 *
 * Gated to pro/business: free users receive 403 with an upgrade hint, which
 * the UI renders as an upsell toast. This is intentionally a conversion
 * surface as much as a feature.
 */

interface CoachRequest {
  stem: string;
  difficulty: "easy" | "medium" | "hard";
  noteCount: number;
  tempoBpm: number;
  keySignature?: string;
  timeSignature?: string;
  durationSeconds?: number;
}

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

function isCoachRequest(body: unknown): body is CoachRequest {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.stem === "string" &&
    (b.difficulty === "easy" || b.difficulty === "medium" || b.difficulty === "hard") &&
    typeof b.noteCount === "number" &&
    typeof b.tempoBpm === "number"
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in to use the AI practice coach." },
      { status: 401 },
    );
  }
  if (session.user.tier === "free") {
    return NextResponse.json(
      {
        error: "AI practice coach is a Pro feature.",
        upgrade: true,
      },
      { status: 403 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
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
  if (!isCoachRequest(body)) {
    return NextResponse.json(
      { error: "Expected { stem, difficulty, noteCount, tempoBpm, ... }" },
      { status: 400 },
    );
  }

  const summary = [
    `Instrument/stem: ${body.stem}`,
    `Difficulty variant: ${body.difficulty}`,
    `Notes in the part: ${body.noteCount}`,
    `Tempo: ${Math.round(body.tempoBpm)} BPM`,
    body.keySignature ? `Key: ${body.keySignature}` : null,
    body.timeSignature ? `Time signature: ${body.timeSignature}` : null,
    body.durationSeconds
      ? `Length: ~${Math.round(body.durationSeconds)} seconds`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const openaiRes = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 450,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You are a friendly, practical instrumental music teacher inside the SongScore app. " +
            "The student has an AI-transcribed part in front of them. Give 4-5 short, concrete " +
            "practice tips tailored to the instrument, tempo, key and difficulty described. " +
            "Use plain language, one tip per line prefixed with a number. Include one tip about " +
            "using SongScore's tools (slow the tempo slider, loop with the mix player, or switch " +
            "to the Easy difficulty) where genuinely helpful. No preamble, no sign-off.",
        },
        { role: "user", content: summary },
      ],
    }),
  }).catch(() => null);

  if (!openaiRes || !openaiRes.ok) {
    const detail = openaiRes ? await openaiRes.text().catch(() => "") : "network error";
    console.error("[ai/coach] OpenAI call failed:", openaiRes?.status, detail.slice(0, 300));
    return NextResponse.json(
      { error: "The coach is unavailable right now — try again in a minute." },
      { status: 502 },
    );
  }

  const data = (await openaiRes.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const tips = data.choices?.[0]?.message?.content?.trim();
  if (!tips) {
    return NextResponse.json(
      { error: "The coach returned an empty answer — try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ tips });
}
