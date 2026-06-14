import { convex, api, CONVEX_SECRET } from "@/lib/convex";
import { pollJob } from "@/lib/api";
import Link from "next/link";
import type { Metadata } from "next";
import SharedScoreList from "@/components/SharedScoreList";

interface PageProps {
  params: Promise<{ token: string }>;
}

export const metadata: Metadata = {
  title: "Shared score — SongScore",
};

interface ShareRow {
  token: string;
  job_id: string;
  transcription_id: string;
  expires_at: string | null;
  view_count: number;
  created_by: string | null;
}

interface TranscriptionRow {
  id: string;
  job_id: string;
  filename: string | null;
  title: string | null;
  status: string;
  created_at: string | null;
}

export default async function SharePage({ params }: PageProps) {
  const { token } = await params;

  const shareRow = (await convex
    .query(api.shares.getByToken, { secret: CONVEX_SECRET, token })
    .catch(() => null)) as ShareRow | null;

  if (!shareRow) return <NotFoundPanel reason="This share link is invalid." />;

  if (shareRow.expires_at && new Date(shareRow.expires_at) < new Date()) {
    return <NotFoundPanel reason="This share link has expired." />;
  }

  // Increment view count (best-effort, don't block render on failure)
  convex
    .mutation(api.shares.incrementViewCount, { secret: CONVEX_SECRET, token })
    .catch((err) => console.error("[share] view_count bump:", err));

  // Resolve the transcription metadata + the live job state from the pipeline
  const [transcription, jobState] = await Promise.all([
    convex
      .query(api.transcriptions.getById, {
        secret: CONVEX_SECRET,
        id: shareRow.transcription_id,
      })
      .catch(() => null) as Promise<TranscriptionRow | null>,
    pollJob(shareRow.job_id).catch((err) => {
      console.error("[share] pollJob failed:", err);
      return null;
    }),
  ]);

  if (!jobState || jobState.status !== "done") {
    return (
      <NotFoundPanel
        reason="The shared transcription is no longer available."
        details="The pipeline backend can't find this job. It may have been deleted."
      />
    );
  }

  const displayTitle =
    transcription?.title || transcription?.filename || "Shared score";
  const stems = Object.keys(jobState.scores);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-300 mb-4">
          <span aria-hidden="true">♪</span>
          Shared via SongScore
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          {displayTitle}
        </h1>
        <p className="text-sm text-[#71717a]">
          {stems.length} stem{stems.length === 1 ? "" : "s"} ·{" "}
          {transcription?.created_at
            ? new Date(transcription.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "—"}
        </p>
      </div>

      {/* Per-stem viewer */}
      <SharedScoreList
        jobId={shareRow.job_id}
        scores={jobState.scores}
        token={token}
      />

      {/* Convert your own CTA */}
      <div className="mt-12 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-900/20 to-indigo-900/10 p-6 sm:p-8 text-center">
        <h2 className="text-xl font-bold text-white mb-2">
          Want to make your own?
        </h2>
        <p className="text-sm text-[#a1a1aa] mb-5">
          SongScore turns audio recordings into sheet music in seconds.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/app"
            className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
          >
            Try SongScore free →
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-[#27272a] bg-[#111113] px-6 py-2.5 text-sm font-medium text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
          >
            Learn more
          </Link>
        </div>
      </div>
    </div>
  );
}

function NotFoundPanel({ reason, details }: { reason: string; details?: string }) {
  return (
    <div className="mx-auto max-w-md py-20 px-6 text-center">
      <div className="mb-4 text-4xl">🔗</div>
      <h1 className="text-xl font-semibold text-white mb-2">Link unavailable</h1>
      <p className="text-sm text-[#a1a1aa] mb-2">{reason}</p>
      {details && <p className="text-xs text-[#52525b] mb-6">{details}</p>}
      <Link
        href="/"
        className="inline-block rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
      >
        Go to SongScore →
      </Link>
    </div>
  );
}
