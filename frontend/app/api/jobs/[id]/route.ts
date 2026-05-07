import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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
  const { data: existing, error: fetchErr } = await db
    .from("transcriptions")
    .select("id, user_id")
    .eq("job_id", id)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (fetchErr) {
    console.error("[PATCH /api/jobs/:id] lookup failed:", fetchErr);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error: updateErr } = await db
    .from("transcriptions")
    .update({ title })
    .eq("id", existing.id);
  if (updateErr) {
    console.error("[PATCH /api/jobs/:id] update failed:", updateErr);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true, title });
}
