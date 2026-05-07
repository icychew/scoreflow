import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/apiAuth";
import { db } from "@/lib/db";

const PUBLIC_BASE =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  "https://scoreflow-gamma.vercel.app";

const PIPELINE_API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * GET /api/v1/jobs
 *
 * Returns a paginated list of the caller's transcriptions. Requires a valid
 * Business-tier API key in the Authorization header.
 *
 * Query params:
 *   limit  (default 25, max 100)
 *   offset (default 0)
 *   status filter: queued | processing | done | failed
 */
export async function GET(req: Request) {
  const result = await authenticateApiRequest(req);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 25));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const status = url.searchParams.get("status");

  let query = db
    .from("transcriptions")
    .select("id, job_id, filename, title, status, created_at", { count: "exact" })
    .eq("user_id", result.auth.userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (status) query = query.eq("status", status);

  const { data, count, error } = await query;
  if (error) {
    console.error("[GET /api/v1/jobs] failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({
    jobs: (data ?? []).map((j) => ({
      id: j.id,
      job_id: j.job_id,
      filename: j.filename,
      title: j.title,
      status: j.status,
      created_at: j.created_at,
      url: j.job_id
        ? `${PUBLIC_BASE}/api/v1/jobs/${j.job_id}`
        : null,
    })),
    pagination: { limit, offset, total: count ?? 0 },
  });
}

/**
 * POST /api/v1/jobs
 *
 * Submit a new transcription. The body is multipart/form-data with a `file`
 * field (the audio) and optional `quality` ("standard" | "high") and
 * `refine` ("true" | "false") fields. We forward to the pipeline backend.
 */
export async function POST(req: Request) {
  const result = await authenticateApiRequest(req);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { error: "Body must be multipart/form-data with a `file` field." },
      { status: 400 },
    );
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "`file` field is required." }, { status: 400 });
  }

  // Forward to pipeline backend
  const upstreamForm = new FormData();
  upstreamForm.append("file", file);
  upstreamForm.append("quality", String(formData.get("quality") ?? "standard"));
  upstreamForm.append("refine", String(formData.get("refine") ?? "false"));

  const upstream = await fetch(`${PIPELINE_API}/api/jobs`, {
    method: "POST",
    body: upstreamForm,
    headers: { "ngrok-skip-browser-warning": "true" },
  }).catch((err) => {
    console.error("[POST /api/v1/jobs] upstream:", err);
    return null;
  });

  if (!upstream || !upstream.ok) {
    return NextResponse.json(
      { error: "Pipeline backend rejected the upload." },
      { status: 502 },
    );
  }
  const payload = await upstream.json();
  const jobId = payload.job_id as string;

  // Record in DB so it shows up in dashboard + GET /api/v1/jobs
  await db.from("transcriptions").insert({
    user_id: result.auth.userId,
    job_id: jobId,
    filename: file.name,
    status: "processing",
  });

  return NextResponse.json(
    {
      job_id: jobId,
      status: "processing",
      url: `${PUBLIC_BASE}/api/v1/jobs/${jobId}`,
    },
    { status: 201 },
  );
}
