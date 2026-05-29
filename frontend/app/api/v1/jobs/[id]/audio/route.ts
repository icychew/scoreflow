import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/apiAuth";
import { db } from "@/lib/db";

const PIPELINE_API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * GET /api/v1/jobs/[id]/audio
 *
 * Streams the user's original uploaded audio for the job. Auth-gated to the
 * key owner and proxies through to the pipeline backend, which handles the
 * actual file streaming (with Range-request support for `<audio>` seek).
 *
 * Used by Business-tier customers who want to build their own playback UI
 * on top of the transcribed score.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await authenticateApiRequest(req);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { id } = await params;

  // Verify ownership before forwarding
  const { data: trans } = await db
    .from("transcriptions")
    .select("id")
    .eq("job_id", id)
    .eq("user_id", result.auth.userId)
    .maybeSingle();
  if (!trans) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Forward the caller's Range header so seek requests still work end-to-end
  const upstreamHeaders: Record<string, string> = {
    "ngrok-skip-browser-warning": "true",
  };
  const range = req.headers.get("range");
  if (range) upstreamHeaders["range"] = range;

  const upstream = await fetch(`${PIPELINE_API}/api/jobs/${id}/audio`, {
    headers: upstreamHeaders,
  }).catch(() => null);

  if (!upstream || !upstream.ok) {
    return NextResponse.json(
      { error: "Could not fetch audio from pipeline" },
      { status: upstream?.status ?? 502 },
    );
  }

  // Stream straight through, preserving Content-Type + Range response headers
  const headers = new Headers();
  for (const h of ["content-type", "content-length", "accept-ranges", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
