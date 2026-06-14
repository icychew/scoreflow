import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/apiAuth";
import { convex, api, CONVEX_SECRET } from "@/lib/convex";

const PIPELINE_API = process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:8000";

/**
 * GET /api/v1/jobs/[id]/download/[stem]/[fmt]
 *
 * Streams the requested artifact from the pipeline backend. Auth-gated to
 * the key owner. The pipeline backend has no auth, so we proxy through
 * after verifying ownership in our DB.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; stem: string; fmt: string }> },
) {
  const result = await authenticateApiRequest(req);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { id, stem, fmt } = await params;

  // Verify ownership
  const trans = await convex.query(api.transcriptions.getByJobId, {
    secret: CONVEX_SECRET,
    jobId: id,
  });
  if (!trans || trans.user_id !== result.auth.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Whitelist format to prevent path traversal weirdness
  if (!/^[a-z0-9_-]+$/i.test(stem) || !/^[a-z0-9]+$/i.test(fmt)) {
    return NextResponse.json({ error: "Invalid path parameter" }, { status: 400 });
  }

  // Pass through optional ?difficulty= to the pipeline backend
  const callerUrl = new URL(req.url);
  const difficulty = callerUrl.searchParams.get("difficulty");
  const allowed = new Set(["easy", "medium", "hard"]);
  const upstreamQs =
    difficulty && allowed.has(difficulty) && difficulty !== "hard"
      ? `?difficulty=${difficulty}`
      : "";

  const upstream = await fetch(
    `${PIPELINE_API}/api/jobs/${id}/download/${stem}/${fmt}${upstreamQs}`,
    { headers: { "ngrok-skip-browser-warning": "true" } },
  ).catch(() => null);

  if (!upstream || !upstream.ok) {
    return NextResponse.json(
      { error: "Could not fetch artifact from pipeline" },
      { status: upstream?.status ?? 502 },
    );
  }

  // Stream straight through with sensible headers
  const headers = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const cd = upstream.headers.get("content-disposition");
  if (cd) headers.set("content-disposition", cd);
  return new NextResponse(upstream.body, { status: 200, headers });
}
