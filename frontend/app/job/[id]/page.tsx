"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProgressCard from "@/components/ProgressCard";
import ResultsPanel from "@/components/ResultsPanel";
import { pollJob, type JobState } from "@/lib/api";

const POLL_INTERVAL_MS = 2500;

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<JobState | null>(null);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    if (!id) return;

    let active = true;

    const poll = async () => {
      try {
        const data = await pollJob(id);
        if (!active) return;
        setJob(data);
        setFetchError("");
        if (data.status === "done" || data.status === "failed") return; // stop polling
        setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (!active) return;
        setFetchError("Could not reach the server. Retrying…");
        setTimeout(poll, POLL_INTERVAL_MS * 2);
      }
    };

    poll();
    return () => { active = false; };
  }, [id]);

  if (fetchError && !job) {
    return <p className="text-center text-slate-400">{fetchError}</p>;
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
    <div className="flex flex-col gap-6">
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

      {fetchError && (
        <p className="text-sm text-yellow-400">{fetchError}</p>
      )}

      {/* Progress */}
      {job.stages.length > 0 && <ProgressCard stages={job.stages} />}

      {/* Results */}
      {isDone && (
        <ResultsPanel
          jobId={id}
          scores={job.scores}
          omrScores={job.omr_scores ?? {}}
          refinementScores={job.refinement_scores ?? {}}
          totalTime={job.total_time_seconds}
        />
      )}

      {isDone && (
        <div className="text-center">
          <a
            href="/"
            className="inline-block rounded-lg border border-slate-700 px-5 py-2 text-sm text-slate-300 hover:border-violet-500 hover:text-violet-300 transition-colors"
          >
            ← Process another file
          </a>
        </div>
      )}
    </div>
  );
}
