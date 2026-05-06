"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { downloadUrl } from "@/lib/api";

const MusicXmlViewer = dynamic(() => import("@/components/MusicXmlViewer"), {
  ssr: false,
  loading: () => (
    <div className="mt-2 h-12 animate-pulse rounded-lg bg-slate-800" />
  ),
});

type OmrBadgeProps = { score: number };

function OmrBadge({ score }: OmrBadgeProps) {
  if (score < 0) return null; // -1.0 means OMR not run — hide badge
  if (score >= 0.85)
    return (
      <span className="rounded-full bg-emerald-900/60 px-2 py-0.5 text-xs font-medium text-emerald-400">
        ✓ High confidence
      </span>
    );
  if (score >= 0.6)
    return (
      <span className="rounded-full bg-amber-900/60 px-2 py-0.5 text-xs font-medium text-amber-400">
        ~ Good
      </span>
    );
  return (
    <span className="rounded-full bg-red-900/60 px-2 py-0.5 text-xs font-medium text-red-400">
      ⚠ Low confidence
    </span>
  );
}

type ChromaBadgeProps = { score: number };

function ChromaBadge({ score }: ChromaBadgeProps) {
  // score === -1 means refinement not run — hide badge entirely
  if (score < 0) return null;
  const pct = Math.round(score * 100);
  if (score >= 0.75)
    return (
      <span className="rounded-full bg-cyan-900/60 px-2 py-0.5 text-xs font-medium text-cyan-400">
        ♪ {pct}% match
      </span>
    );
  if (score >= 0.5)
    return (
      <span className="rounded-full bg-amber-900/60 px-2 py-0.5 text-xs font-medium text-amber-400">
        ♪ {pct}% match
      </span>
    );
  return (
    <span className="rounded-full bg-red-900/60 px-2 py-0.5 text-xs font-medium text-red-400">
      ♪ {pct}% match
    </span>
  );
}

const FORMAT_LABELS: Record<string, { label: string; ext: string }> = {
  pdf:      { label: "PDF Score", ext: ".pdf" },
  mid:      { label: "MIDI", ext: ".mid" },
  musicxml: { label: "MusicXML", ext: ".musicxml" },
};

const STEM_ICONS: Record<string, string> = {
  vocals: "🎤",
  bass: "🎸",
  other: "🎹",
  guitar: "🎸",
  piano: "🎹",
  drums: "🥁",
};

interface ResultsPanelProps {
  jobId: string;
  scores: Record<string, string[]>;
  omrScores: Record<string, number>;
  refinementScores: Record<string, number>;
  totalTime: number;
}

export default function ResultsPanel({ jobId, scores, omrScores, refinementScores, totalTime }: ResultsPanelProps) {
  const stems = Object.keys(scores);
  const [openViewers, setOpenViewers] = useState<Set<string>>(new Set());

  function toggleViewer(stem: string) {
    setOpenViewers((prev) => {
      const next = new Set(prev);
      if (next.has(stem)) next.delete(stem);
      else next.add(stem);
      return next;
    });
  }

  if (stems.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-6 text-slate-400">
        No scores generated.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Downloads
        </h2>
        <span className="text-xs text-slate-500">
          Completed in {totalTime.toFixed(1)}s
        </span>
      </div>

      <div className="space-y-3">
        {stems.map((stem) => (
          <div key={stem} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-900/50 px-4 py-3">
            <span className="text-lg">{STEM_ICONS[stem] ?? "🎵"}</span>
            <span className="min-w-[5rem] flex-1 font-medium capitalize text-slate-200">{stem}</span>
            <OmrBadge score={omrScores[stem] ?? -1} />
            <ChromaBadge score={refinementScores[stem] ?? -1} />
            <div className="flex flex-wrap gap-2">
              {scores[stem].map((fmt) => {
                const meta = FORMAT_LABELS[fmt];
                if (!meta) return null;
                return (
                  <a
                    key={fmt}
                    href={downloadUrl(jobId, stem, fmt)}
                    download={`${stem}${meta.ext}`}
                    className="rounded-md bg-violet-700 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-600 transition-colors"
                  >
                    ↓ {meta.label}
                  </a>
                );
              })}
              {scores[stem].includes("musicxml") && (
                <button
                  type="button"
                  onClick={() => toggleViewer(stem)}
                  className="rounded-md bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-600 transition-colors"
                >
                  {openViewers.has(stem) ? "✕ Close" : "♪ View & Play ▶"}
                </button>
              )}
            </div>
            {openViewers.has(stem) && (
              <div className="basis-full mt-1">
                <MusicXmlViewer
                  jobId={jobId}
                  stem={stem}
                  hasMidi={scores[stem].includes("mid")}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
