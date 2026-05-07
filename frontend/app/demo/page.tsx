"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { DEMO_SONGS, type DemoSong } from "@/lib/demoSongs";

// Lazy — abcjs needs the DOM
const AbcViewer = dynamic(() => import("@/components/AbcViewer"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse rounded-lg bg-slate-800 min-h-[280px]" />
  ),
});

export default function DemoPage() {
  const [selected, setSelected] = useState<DemoSong>(DEMO_SONGS[0]);
  const [viewerKey, setViewerKey] = useState(0);

  const pickSong = (song: DemoSong) => {
    setSelected(song);
    setViewerKey((k) => k + 1);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-16">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-xs sm:text-sm text-violet-300 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          Live demo · No upload required
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
          See what Notara delivers
        </h1>
        <p className="text-base sm:text-lg text-[#a1a1aa] max-w-2xl mx-auto">
          Every transcription you upload comes back like this — clean, readable
          notation you can view and hear in your browser.
        </p>
      </div>

      {/* Song picker */}
      <div className="flex flex-wrap gap-2 justify-center mb-6">
        {DEMO_SONGS.map((song) => (
          <button
            key={song.id}
            type="button"
            onClick={() => pickSong(song)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] ${
              selected.id === song.id
                ? "bg-violet-600 text-white"
                : "border border-slate-600 text-slate-300 hover:border-violet-500 hover:text-violet-300"
            }`}
          >
            {song.title}
          </button>
        ))}
      </div>

      {/* Score viewer */}
      <div className="rounded-2xl border border-[#27272a] bg-[#0c0c0e] p-4 sm:p-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
          {selected.title}
          {selected.composer && (
            <span className="ml-2 text-slate-600 font-normal normal-case tracking-normal">
              · {selected.composer}
            </span>
          )}
        </div>
        <AbcViewer key={viewerKey} abcText={selected.abc} />
      </div>

      {/* Convert your own CTA */}
      <div className="mt-12 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-900/20 to-indigo-900/10 p-6 sm:p-10 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
          Now try it with <span className="text-violet-300">your own audio</span>
        </h2>
        <p className="text-[#a1a1aa] mb-6 max-w-xl mx-auto">
          Upload an MP3, WAV, or FLAC — Notara separates the stems, transcribes
          each instrument, and gives you a clean PDF + MusicXML in seconds.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/app"
            className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-8 py-3.5 text-base font-semibold text-white hover:opacity-90 transition-opacity shadow-lg shadow-violet-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
          >
            Upload your audio →
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-[#27272a] bg-[#111113] px-8 py-3.5 text-base font-semibold text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
          >
            See pricing
          </Link>
        </div>
        <p className="text-xs text-[#71717a] mt-4">
          Free tier: 3 transcriptions / month · No card required
        </p>
      </div>

      {/* What you get section */}
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            icon: "📄",
            title: "PDF score",
            desc: "Print-ready sheet music for every instrument in your track.",
          },
          {
            icon: "🎹",
            title: "MIDI + MusicXML",
            desc: "Drop into your DAW or notation software (Pro / Business).",
          },
          {
            icon: "🎚️",
            title: "Per-stem files",
            desc: "Vocals, bass, and other instruments — separated and transcribed.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="p-5 rounded-xl border border-[#27272a] bg-[#111113] flex flex-col gap-2"
          >
            <div className="text-2xl">{f.icon}</div>
            <h3 className="text-sm font-semibold text-white">{f.title}</h3>
            <p className="text-sm text-[#71717a] leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
