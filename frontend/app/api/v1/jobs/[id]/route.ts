import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/apiAuth";
import { db } from "@/lib/db";
import { pollJob } from "@/lib/api";

const PUBLIC_BASE =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  "https://scoreflow-gamma.vercel.app";

/**
 * GET /api/v1/jobs/[id]
 *
 * Returns the live job state from the pipeline backend, plus our DB
 * metadata (title, filename). Auth-gated to the key owner.
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

  // Verify ownership
  const { data: trans } = await db
    .from("transcriptions")
    .select("id, job_id, filename, title, status, created_at")
    .eq("job_id", id)
    .eq("user_id", result.auth.userId)
    .maybeSingle();
  if (!trans) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const live = await pollJob(id).catch(() => null);
  if (!live) {
    return NextResponse.json(
      {
        job_id: id,
        status: trans.status,
        filename: trans.filename,
        title: trans.title,
        warning: "Pipeline backend unreachable; returning DB-only state.",
      },
      { status: 200 },
    );
  }

  // Build download URLs for each (stem, format) combination
  const downloads: Record<string, Record<string, string>> = {};
  for (const [stem, formats] of Object.entries(live.scores)) {
    downloads[stem] = {};
    for (const fmt of formats as string[]) {
      downloads[stem][fmt] = `${PUBLIC_BASE}/api/v1/jobs/${id}/download/${stem}/${fmt}`;
    }
  }

  return NextResponse.json({
    job_id: id,
    status: live.status,
    filename: trans.filename,
    title: trans.title,
    current_stage: live.current_stage,
    stages: live.stages,
    error: live.error || null,
    total_time_seconds: live.total_time_seconds,
    downloads,
    created_at: trans.created_at,
  });
}
