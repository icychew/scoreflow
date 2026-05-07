import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordTranscription } from "@/lib/usage";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const session = await auth();
  const body = await req.json() as { jobId?: string; filename?: string };
  const { jobId, filename } = body;

  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("notara_session")?.value;

  await recordTranscription({
    userId: session?.user?.id,
    sessionToken,
    jobId,
    filename: filename ?? "unknown",
  });

  return NextResponse.json({ ok: true });
}
