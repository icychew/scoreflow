import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/apiAuth";
import { convex, api, CONVEX_SECRET } from "@/lib/convex";

const PUBLIC_BASE =
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  process.env.NEXTAUTH_URL?.trim() ||
  "https://scoreflow-gamma.vercel.app";

const PIPELINE_API = process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:8000";

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

  let data: Array<{
    id: string;
    job_id: string;
    filename: string | null;
    title: string | null;
    status: string;
    created_at: string;
  }>;
  let count: number;
  try {
    const res = await convex.query(api.transcriptions.listByUserPaged, {
      secret: CONVEX_SECRET,
      userId: result.auth.userId,
      limit,
      offset,
      status: status ?? undefined,
    });
    data = res.jobs;
    count = res.total;
  } catch (error) {
    console.error("[GET /api/v1/jobs] failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({
    jobs: data.map((j) => ({
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
  await convex.mutation(api.transcriptions.record, {
    secret: CONVEX_SECRET,
    userId: result.auth.userId,
    jobId,
    filename: file.name,
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
