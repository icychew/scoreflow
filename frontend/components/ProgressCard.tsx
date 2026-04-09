import type { StageInfo } from "@/lib/api";

const STAGE_LABELS: Record<string, { label: string; description: string }> = {
  separation: {
    label: "Source Separation",
    description: "Splitting audio into vocals, bass, and other stems using Demucs",
  },
  transcription: {
    label: "Transcription",
    description: "Converting each stem to MIDI notes using Basic Pitch",
  },
  quantization: {
    label: "Quantization",
    description: "Aligning notes to a musical grid",
  },
  score_generation: {
    label: "Score Generation",
    description: "Generating MusicXML sheet music via music21",
  },
};

const statusColors: Record<string, string> = {
  pending: "text-slate-500",
  running: "text-violet-400",
  done: "text-emerald-400",
  failed: "text-red-400",
  skipped: "text-slate-500",
};

const StatusIcon = ({ status }: { status: string }) => {
  if (status === "running") {
    return (
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
    );
  }
  if (status === "done") {
    return <span className="text-emerald-400">✓</span>;
  }
  if (status === "failed") {
    return <span className="text-red-400">✗</span>;
  }
  if (status === "skipped") {
    return <span className="text-slate-500">—</span>;
  }
  return <span className="h-4 w-4 rounded-full border border-slate-600 inline-block" />;
};

export default function ProgressCard({ stages }: { stages: StageInfo[] }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-6">
      <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-slate-400">
        Pipeline Progress
      </h2>
      <ol className="space-y-5">
        {stages.map((stage, i) => {
          const meta = STAGE_LABELS[stage.name] ?? { label: stage.name, description: "" };
          return (
            <li key={stage.name} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-600 bg-slate-900 text-sm">
                  {stage.status === "pending" ? (
                    <span className="text-xs text-slate-500">{i + 1}</span>
                  ) : (
                    <StatusIcon status={stage.status} />
                  )}
                </div>
                {i < stages.length - 1 && (
                  <div className={`mt-1 w-px flex-1 ${stage.status === "done" ? "bg-emerald-700" : "bg-slate-700"}`} />
                )}
              </div>
              <div className="pb-5">
                <p className={`font-medium ${statusColors[stage.status] ?? "text-slate-300"}`}>
                  {meta.label}
                </p>
                <p className="text-sm text-slate-500">{meta.description}</p>
                {stage.message && (
                  <p className="mt-1 text-xs text-slate-400">{stage.message}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
