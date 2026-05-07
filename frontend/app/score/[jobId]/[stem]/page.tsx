import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import PrintableScore from "@/components/PrintableScore";

interface PageProps {
  params: Promise<{ jobId: string; stem: string }>;
  searchParams: Promise<{ token?: string; print?: string }>;
}

export const metadata: Metadata = {
  title: "Score — Notara",
};

interface TranscriptionRow {
  id: string;
  user_id: string | null;
  filename: string | null;
  title: string | null;
}

interface ShareRow {
  job_id: string;
  expires_at: string | null;
}

export default async function ScorePage({ params, searchParams }: PageProps) {
  const { jobId, stem } = await params;
  const { token, print } = await searchParams;

  // Whitelist params before any DB lookup
  if (!/^[a-z0-9_-]+$/i.test(jobId) || !/^[a-z0-9_-]+$/i.test(stem)) {
    return <UnavailablePanel reason="Invalid score path." />;
  }

  // Auth: either NextAuth session (owner) or a valid share token
  const session = await auth();
  let authorized = false;
  let title = "Untitled";

  // Look up the transcription by job_id (regardless of who's asking)
  const { data: trans } = await db
    .from("transcriptions")
    .select("id, user_id, filename, title")
    .eq("job_id", jobId)
    .maybeSingle();

  const transcription = trans as TranscriptionRow | null;
  if (transcription) {
    title = transcription.title || transcription.filename || "Untitled";
  }

  // Path 1: signed-in owner
  if (
    session?.user?.id &&
    transcription &&
    transcription.user_id === session.user.id
  ) {
    authorized = true;
  }

  // Path 2: valid share token
  if (!authorized && token) {
    const { data: share } = await db
      .from("transcription_shares")
      .select("job_id, expires_at")
      .eq("token", token)
      .maybeSingle();
    const shareRow = share as ShareRow | null;
    if (
      shareRow &&
      shareRow.job_id === jobId &&
      (!shareRow.expires_at || new Date(shareRow.expires_at) > new Date())
    ) {
      authorized = true;
    }
  }

  if (!authorized) {
    return (
      <UnavailablePanel
        reason={
          session?.user?.id
            ? "You don't have access to this score."
            : "Sign in to view this score, or open it via the share link you were given."
        }
      />
    );
  }

  return (
    <PrintableScore
      jobId={jobId}
      stem={stem}
      title={title}
      autoPrint={print === "1"}
    />
  );
}

function UnavailablePanel({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="mb-4 text-4xl">🔒</div>
        <h1 className="text-xl font-semibold text-white mb-2">
          Score unavailable
        </h1>
        <p className="text-sm text-[#a1a1aa] mb-6">{reason}</p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
        >
          Go to Notara →
        </Link>
      </div>
    </div>
  );
}
