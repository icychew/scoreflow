"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import UploadZone from "@/components/UploadZone";
import { uploadAudio, type Quality } from "@/lib/api";

export default function AppPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quality, setQuality] = useState<Quality>("standard");
  const [refine, setRefine] = useState(false);

  const handleUpload = async (file: File) => {
    setLoading(true);
    setError("");
    try {
      const { job_id } = await uploadAudio(file, quality, refine);

      // Record transcription in DB (usage tracking + dashboard history)
      await fetch("/api/transcriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job_id, filename: file.name }),
      });

      router.push(`/job/${job_id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
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
          Upload an MP3, WAV, or FLAC. Notara's AI separates the stems, transcribes
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
      {/* Refine toggle */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={refine}
          disabled={loading}
          onClick={() => setRefine((r) => !r)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
            ${refine ? "bg-violet-600" : "bg-slate-700"}
            ${loading ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
              ${refine ? "translate-x-6" : "translate-x-1"}`}
          />
        </button>
        <span className="text-sm text-slate-400">
          Refine score{" "}
          <span className="text-slate-600 text-xs">(re-transcribes bars with low chroma match — slower)</span>
        </span>
      </div>
      {/* Upload */}
      <UploadZone onUpload={handleUpload} loading={loading} />
      {error && (
        <p className="text-center text-sm text-red-400">{error}</p>
      )}
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
