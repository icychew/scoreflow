import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const DEFAULT_EXPIRY_DAYS = 30;

/** Generate a 32-char URL-safe share token. */
function generateToken(): string {
  // 24 random bytes → 32 base64url chars (no padding)
  return randomBytes(24).toString("base64url");
}

/**
 * POST /api/share  { jobId: string }
 *
 * Creates a public share link for a transcription owned by the caller.
 * Returns a token that resolves to /share/[token].
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const jobId =
    typeof body === "object" && body !== null && "jobId" in body
      ? String((body as { jobId: unknown }).jobId)
      : "";
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  // Verify ownership
  const { data: trans, error: fetchErr } = await db
    .from("transcriptions")
    .select("id, status")
    .eq("job_id", jobId)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (fetchErr) {
    console.error("[POST /api/share] lookup failed:", fetchErr);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  if (!trans) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (trans.status !== "done") {
    return NextResponse.json(
      { error: "Only completed transcriptions can be shared." },
      { status: 400 },
    );
  }

  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error: insertErr } = await db.from("transcription_shares").insert({
    token,
    job_id: jobId,
    transcription_id: trans.id,
    created_by: session.user.id,
    expires_at: expiresAt,
  });
  if (insertErr) {
    console.error("[POST /api/share] insert failed:", insertErr);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ token, expiresAt });
}
