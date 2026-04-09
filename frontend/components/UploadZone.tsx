"use client";

import { useCallback, useState } from "react";

interface UploadZoneProps {
  onUpload: (file: File) => void;
  loading: boolean;
}

const ACCEPT = ".mp3,.wav,.flac";
const MAX_MB = 50;

export default function UploadZone({ onUpload, loading }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const validate = (file: File): string => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["mp3", "wav", "flac"].includes(ext)) return "Only MP3, WAV, or FLAC files are supported.";
    if (file.size > MAX_MB * 1024 * 1024) return `File must be under ${MAX_MB} MB.`;
    return "";
  };

  const handleFile = useCallback(
    (file: File) => {
      const err = validate(file);
      if (err) { setError(err); return; }
      setError("");
      onUpload(file);
    },
    [onUpload]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12 transition-colors
        ${dragging ? "border-violet-400 bg-violet-950/30" : "border-slate-600 hover:border-violet-500"}
        ${loading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
      onClick={() => !loading && document.getElementById("file-input")?.click()}
    >
      <input
        id="file-input"
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={onInputChange}
        disabled={loading}
      />

      {/* Icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-900/40">
        <svg className="h-8 w-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>

      {loading ? (
        <p className="text-slate-300">Uploading…</p>
      ) : (
        <>
          <p className="text-lg font-medium text-slate-200">Drop your audio file here</p>
          <p className="text-sm text-slate-400">MP3 · WAV · FLAC — up to 50 MB</p>
          <button
            type="button"
            className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
          >
            Browse files
          </button>
        </>
      )}

      {error && (
        <p className="absolute bottom-3 text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
