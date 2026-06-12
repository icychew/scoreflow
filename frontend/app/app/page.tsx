"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import UploadZone from "@/components/UploadZone";
import { uploadAudio, transcribeYouTube, type Quality } from "@/lib/api";

export default function AppPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [quality, setQuality] = useState<Quality>("standard");
  // Refine defaults to true (Pristine mode) — matches the backend default
  const [refine, setRefine] = useState(true);
  const [youtubeUrl, setYoutubeUrl] = useState("");

  const handleYouTube = async () => {
    const url = youtubeUrl.trim();
    if (!url) return;
    setLoading(true);
    const t = toast.loading("Fetching audio from YouTube…", { description: url });
    try {
      const { job_id, title } = await transcribeYouTube(url, quality, refine);
      await fetch("/api/transcriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job_id, filename: title || url }),
      });
      toast.success("Audio fetched", {
        id: t,
        description: "Pipeline started — taking you to the progress page.",
      });
      router.push(`/job/${job_id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "YouTube transcription failed";
      toast.error("Could not transcribe that link", { id: t, description: msg });
      setLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    setLoading(true);
    const uploadingToast = toast.loading("Uploading audio…", {
      description: file.name,
    });
    try {
      const { job_id } = await uploadAudio(file, quality, refine);

      // Record transcription in DB (usage tracking + dashboard history)
      await fetch("/api/transcriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job_id, filename: file.name }),
      });

      toast.success("Upload complete", {
        id: uploadingToast,
        description: "Pipeline started — taking you to the progress page.",
      });
      router.push(`/job/${job_id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      toast.error("Upload failed", { id: uploadingToast, description: msg });
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-12">
      {/* Hero */}
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Turn any recording into{" "}
          <span className="text-violet-400">sheet music</span>
        </h1>
        <p className="mt-4 text-lg text-[#a1a1aa]">
          Upload an MP3, WAV, or FLAC. SongScore's AI separates the stems, transcribes
          each instrument, and delivers a clean PDF score — ready in seconds.
        </p>
      </div>
      {/* Quality toggle */}
      <div className="flex items-center justify-center gap-2">
        <span className="text-sm text-slate-400">Quality:</span>
        <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-1 gap-1">
          {(["standard", "high"] as Quality[]).map((q) => (
            <button
              key={q}
              type="button"
              disabled={loading}
              onClick={() => setQuality(q)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors
                ${quality === q
                  ? "bg-violet-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
                }
                ${loading ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              {q === "standard" ? "Standard" : "High Quality ✦"}
            </button>
          ))}
        </div>
        {quality === "high" && (
          <span className="text-xs text-violet-400">
            BS-RoFormer vocals · piano_transcription for piano
          </span>
        )}
      </div>
      {/* Pristine / Fast toggle — Lever 3 in accuracy plan */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-1 gap-1">
          {[
            { value: true,  label: "Pristine ✦", desc: "Best accuracy. Re-transcribes weak bars via chroma analysis. ~30% slower." },
            { value: false, label: "Fast",        desc: "Skips refinement. Faster turnaround at the cost of some accuracy." },
          ].map(({ value, label }) => (
            <button
              key={String(value)}
              type="button"
              disabled={loading}
              onClick={() => setRefine(value)}
              aria-pressed={refine === value}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors
                ${refine === value
                  ? "bg-violet-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
                }
                ${loading ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">
          {refine
            ? "Pristine: chroma refinement enabled (recommended)"
            : "Fast: skips refinement — quicker but less accurate"}
        </span>
      </div>
      {/* Upload */}
      <UploadZone onUpload={handleUpload} loading={loading} />

      {/* YouTube link input */}
      <div className="mx-auto w-full max-w-xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-px flex-1 bg-slate-800" />
          <span className="text-xs uppercase tracking-widest text-slate-600">
            or paste a YouTube link
          </span>
          <div className="h-px flex-1 bg-slate-800" />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleYouTube();
          }}
          className="flex gap-2"
        >
          <input
            type="url"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            disabled={loading}
            placeholder="https://www.youtube.com/watch?v=…"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !youtubeUrl.trim()}
            className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
          >
            Transcribe →
          </button>
        </form>
        <p className="mt-2 text-center text-xs text-slate-600">
          Up to 10 minutes. Only transcribe content you have the rights to use.
        </p>
      </div>
      {/* How it works */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { step: "1", label: "Upload", desc: "Drop an audio file up to 50 MB" },
          { step: "2", label: "Separate", desc: "Demucs splits vocals, bass & more" },
          { step: "3", label: "Transcribe", desc: "Basic Pitch converts audio to MIDI" },
          { step: "4", label: "Score", desc: "music21 generates MusicXML sheet music" },
        ].map(({ step, label, desc }) => (
          <div key={step} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-violet-900/50 text-sm font-bold text-violet-400">
              {step}
            </div>
            <p className="font-semibold text-slate-200">{label}</p>
            <p className="mt-1 text-sm text-slate-500">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
