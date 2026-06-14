import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { convex, api, CONVEX_SECRET } from "@/lib/convex";

const MAX_TITLE_LEN = 120;

/**
 * PATCH /api/jobs/[id]  { title: string }
 *
 * Renames a transcription (auth-gated to its owner). The path param `id` is
 * the job_id from the pipeline backend, used as our public identifier.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawTitle =
    typeof body === "object" && body !== null && "title" in body
      ? String((body as { title: unknown }).title)
      : "";
  const title = rawTitle.trim().slice(0, MAX_TITLE_LEN);
  if (!title) {
    return NextResponse.json(
      { error: "Title is required (1-120 chars)." },
      { status: 400 },
    );
  }

  // Verify ownership before update — this is also a guard against IDOR.
  let existing;
  try {
    existing = await convex.query(api.transcriptions.getByJobId, {
      secret: CONVEX_SECRET,
      jobId: id,
    });
  } catch (fetchErr) {
    console.error("[PATCH /api/jobs/:id] lookup failed:", fetchErr);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  if (!existing || existing.user_id !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await convex.mutation(api.transcriptions.updateTitleById, {
      secret: CONVEX_SECRET,
      id: existing.id,
      title,
    });
  } catch (updateErr) {
    console.error("[PATCH /api/jobs/:id] update failed:", updateErr);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true, title });
}
