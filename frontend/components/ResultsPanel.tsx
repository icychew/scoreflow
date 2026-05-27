"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { downloadUrl, type Difficulty } from "@/lib/api";
import ShareModal from "@/components/ShareModal";

const MusicXmlViewer = dynamic(() => import("@/components/MusicXmlViewer"), {
  ssr: false,
  loading: () => (
    <div className="mt-2 h-12 animate-pulse rounded-lg bg-slate-800" />
  ),
});

type OmrBadgeProps = { score: number };

function OmrBadge({ score }: OmrBadgeProps) {
  if (score < 0) return null;
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

const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard"];
const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

interface ResultsPanelProps {
  jobId: string;
  scores: Record<string, string[]>;
  omrScores: Record<string, number>;
  refinementScores: Record<string, number>;
  totalTime: number;
  /** stem → list of difficulty variants the pipeline produced */
  scoreDifficulties?: Record<string, Difficulty[]>;
}

export default function ResultsPanel({
  jobId,
  scores,
  omrScores,
  refinementScores,
  totalTime,
  scoreDifficulties,
}: ResultsPanelProps) {
  const stems = Object.keys(scores);
  const [openViewers, setOpenViewers] = useState<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);
  // Per-stem selected difficulty. Default "hard" for stems where only "hard" exists.
  const [selectedDifficulty, setSelectedDifficulty] = useState<Record<string, Difficulty>>({});

  function toggleViewer(stem: string) {
    setOpenViewers((prev) => {
      const next = new Set(prev);
      if (next.has(stem)) next.delete(stem);
      else next.add(stem);
      return next;
    });
  }

  function setDifficulty(stem: string, diff: Difficulty) {
    setSelectedDifficulty((prev) => ({ ...prev, [stem]: diff }));
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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Downloads
        </h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="rounded-md border border-violet-500/40 bg-violet-500/5 px-3 py-1 text-xs font-medium text-violet-300 hover:bg-violet-500/10 hover:border-violet-500/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            ↗ Share
          </button>
          <span className="text-xs text-slate-500">
            Completed in {totalTime.toFixed(1)}s
          </span>
        </div>
      </div>
      <ShareModal jobId={jobId} open={shareOpen} onClose={() => setShareOpen(false)} />

      <div className="space-y-3">
        {stems.map((stem) => {
          const availableDifficulties: Difficulty[] = (
            scoreDifficulties?.[stem] ?? ["hard"]
          ).filter((d): d is Difficulty => DIFFICULTY_ORDER.includes(d as Difficulty));
          // Show pill bar only when there's more than one variant
          const showPills = availableDifficulties.length > 1;
          const currentDiff: Difficulty = selectedDifficulty[stem] ?? "hard";
          // If currentDiff isn't available (e.g. only hard exists), fall back
          const effectiveDiff: Difficulty = availableDifficulties.includes(currentDiff)
            ? currentDiff
            : "hard";

          return (
            <div key={stem} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-900/50 px-4 py-3">
              <span className="text-lg">{STEM_ICONS[stem] ?? "🎵"}</span>
              <span className="min-w-[5rem] flex-1 font-medium capitalize text-slate-200">{stem}</span>
              <OmrBadge score={omrScores[stem] ?? -1} />
              <ChromaBadge score={refinementScores[stem] ?? -1} />

              {/* Difficulty pill bar — appears for any stem with >1 variant */}
              {showPills && (
                <div className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 p-0.5">
                  {DIFFICULTY_ORDER.filter((d) => availableDifficulties.includes(d)).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDifficulty(stem, d)}
                      aria-pressed={effectiveDiff === d}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900 ${
                        effectiveDiff === d
                          ? "bg-violet-600 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {DIFFICULTY_LABEL[d]}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {scores[stem].map((fmt) => {
                  const meta = FORMAT_LABELS[fmt];
                  if (!meta) return null;
                  // MIDI doesn't vary by difficulty; everything else does
                  const linkDiff: Difficulty = fmt === "mid" ? "hard" : effectiveDiff;
                  const suffix = linkDiff === "hard" ? "" : `-${linkDiff}`;
                  return (
                    <a
                      key={fmt}
                      href={downloadUrl(jobId, stem, fmt, linkDiff)}
                      download={`${stem}${suffix}${meta.ext}`}
                      className="rounded-md bg-violet-700 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    >
                      ↓ {meta.label}
                    </a>
                  );
                })}
                {scores[stem].includes("musicxml") && (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleViewer(stem)}
                      className="rounded-md bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    >
                      {openViewers.has(stem) ? "✕ Close" : "♪ View & Play ▶"}
                    </button>
                    <a
                      href={
                        effectiveDiff === "hard"
                          ? `/score/${jobId}/${stem}`
                          : `/score/${jobId}/${stem}?difficulty=${effectiveDiff}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    >
                      📄 PDF
                    </a>
                  </>
                )}
              </div>
              {openViewers.has(stem) && (
                <div className="basis-full mt-1">
                  <MusicXmlViewer
                    jobId={jobId}
                    stem={stem}
                    hasMidi={scores[stem].includes("mid")}
                    difficulty={effectiveDiff}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
