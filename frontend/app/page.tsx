"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import UploadZone from "@/components/UploadZone";
import { uploadAudio } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleUpload = async (file: File) => {
    setLoading(true);
    setError("");
    try {
      const { job_id } = await uploadAudio(file);
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
        <h1 className="text-4xl font-bold tracking-tight text-slate-100 sm:text-5xl">
          Turn any song into{" "}
          <span className="text-violet-400">sheet music</span>
        </h1>
        <p className="mt-4 text-lg text-slate-400">
          Upload an MP3, WAV, or FLAC file. Our AI pipeline separates the stems,
          transcribes the notes, and generates MusicXML and MIDI — ready to open in MuseScore or any DAW.
        </p>
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
