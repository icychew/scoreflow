"use client";

import dynamic from "next/dynamic";

const MusicXmlViewer = dynamic(() => import("@/components/MusicXmlViewer"), {
  ssr: false,
  loading: () => (
    <div className="mt-2 h-12 animate-pulse rounded-lg bg-slate-800" />
  ),
});

interface SharedScoreListProps {
  jobId: string;
  scores: Record<string, string[]>;
}

export default function SharedScoreList({ jobId, scores }: SharedScoreListProps) {
  const stems = Object.keys(scores);

  return (
    <div className="space-y-6">
      {stems.map((stem) => (
        <div
          key={stem}
          className="rounded-xl border border-[#27272a] bg-[#0c0c0e] p-4 sm:p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold capitalize text-white">
              {stem}
            </span>
            <span className="text-xs text-[#71717a]">
              {scores[stem].includes("mid") ? "♪ With audio" : "Score only"}
            </span>
          </div>
          <MusicXmlViewer
            jobId={jobId}
            stem={stem}
            hasMidi={scores[stem].includes("mid")}
          />
        </div>
      ))}
    </div>
  );
}
