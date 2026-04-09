import { downloadUrl } from "@/lib/api";

const FORMAT_LABELS: Record<string, { label: string; ext: string }> = {
  musicxml: { label: "MusicXML", ext: ".musicxml" },
  mid: { label: "MIDI", ext: ".mid" },
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
  totalTime: number;
}

export default function ResultsPanel({ jobId, scores, totalTime }: ResultsPanelProps) {
  const stems = Object.keys(scores);

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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
