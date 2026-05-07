"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import ProgressCard from "@/components/ProgressCard";
import ResultsPanel from "@/components/ResultsPanel";
import { pollJob, type JobState } from "@/lib/api";

const POLL_INTERVAL_MS = 2500;
const MAX_CONSECUTIVE_FAILURES = 3;

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<JobState | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const failuresRef = useRef(0);
  const lastErrorToastRef = useRef(0);

  useEffect(() => {
    if (!id) return;

    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    failuresRef.current = 0;
    setPollFailed(false);

    const poll = async () => {
      try {
        const data = await pollJob(id);
        if (!active) return;
        failuresRef.current = 0;
        setJob(data);
        setPollFailed(false);
        if (data.status === "done" || data.status === "failed") return;
        timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (!active) return;
        failuresRef.current += 1;

        // Throttle the error toast to once per ~10s so we don't spam
        const now = Date.now();
        if (now - lastErrorToastRef.current > 10_000) {
          lastErrorToastRef.current = now;
          toast.error("Network error", {
            description:
              err instanceof Error ? err.message : "Could not reach the server.",
          });
        }

        if (failuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
          setPollFailed(true);
          return; // stop polling — user must click Retry
        }
        timeoutId = setTimeout(poll, POLL_INTERVAL_MS * 2);
      }
    };

    poll();
    return () => {
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [id, retryToken]);

  const handleRetry = () => {
    setPollFailed(false);
    setRetryToken((n) => n + 1);
  };

  // Initial load failure — no job data yet
  if (pollFailed && !job) {
    return (
      <div className="mx-auto max-w-md text-center py-20 px-6">
        <div className="mb-4 text-4xl">⚠️</div>
        <h1 className="text-xl font-semibold text-white mb-2">
          Could not reach the server
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          We tried {MAX_CONSECUTIVE_FAILURES} times to load this job and gave up.
          The backend might be sleeping.
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
        >
          ↻ Retry
        </button>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex justify-center py-20">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  const isDone = job.status === "done";
  const isFailed = job.status === "failed";

  return (
    <div className="flex flex-col gap-6 mx-auto max-w-4xl px-4 sm:px-6 py-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            {isDone ? "Pipeline complete" : isFailed ? "Pipeline failed" : "Processing…"}
          </h1>
          {!isDone && !isFailed && (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">Job {id}</p>
      </div>

      {isFailed && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-4 text-sm text-red-400">
          {job.error || "The pipeline encountered an unexpected error."}
        </div>
      )}

      {/* Polling-paused banner with retry — shown when we have stale data */}
      {pollFailed && job && (
        <div className="rounded-lg border border-yellow-800 bg-yellow-950/30 p-4 flex flex-wrap items-center gap-3 justify-between">
          <p className="text-sm text-yellow-400">
            Lost connection to the server. Showing the last known status.
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-md bg-yellow-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-yellow-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
          >
            ↻ Retry
          </button>
        </div>
      )}

      {/* Progress */}
      {job.stages.length > 0 && <ProgressCard stages={job.stages} />}

      {/* Results — full while done, skeleton while processing */}
      {isDone ? (
        <ResultsPanel
          jobId={id}
          scores={job.scores}
          omrScores={job.omr_scores ?? {}}
          refinementScores={job.refinement_scores ?? {}}
          totalTime={job.total_time_seconds}
        />
      ) : !isFailed ? (
        <ResultsSkeleton />
      ) : null}

      {isDone && (
        <div className="text-center">
          <a
            href="/app"
            className="inline-block rounded-lg border border-slate-700 px-5 py-2 text-sm text-slate-300 hover:border-violet-500 hover:text-violet-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
          >
            ← Process another file
          </a>
        </div>
      )}
    </div>
  );
}

/** Placeholder cards shown beneath the progress bar while the pipeline runs. */
function ResultsSkeleton() {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-6 opacity-60">
      <div className="mb-5 flex items-center justify-between">
        <div className="h-3 w-24 rounded bg-slate-700 animate-pulse" />
        <div className="h-3 w-16 rounded bg-slate-700 animate-pulse" />
      </div>
      <div className="space-y-3">
        {["vocals", "bass", "other"].map((stem) => (
          <div
            key={stem}
            className="flex items-center gap-3 rounded-lg bg-slate-900/50 px-4 py-3"
          >
            <div className="h-5 w-5 rounded-full bg-slate-700 animate-pulse" />
            <div className="h-3 w-20 rounded bg-slate-700 animate-pulse" />
            <div className="ml-auto flex gap-2">
              <div className="h-7 w-20 rounded-md bg-slate-700 animate-pulse" />
              <div className="h-7 w-16 rounded-md bg-slate-700 animate-pulse" />
              <div className="h-7 w-16 rounded-md bg-slate-700 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">
        Your downloads will appear here when processing completes.
      </p>
    </div>
  );
}
