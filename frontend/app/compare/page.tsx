import type { Metadata } from "next";
import Link from "next/link";
import { COMPETITORS } from "@/lib/competitors";

export const metadata: Metadata = {
  title: "Compare AI Music Transcription Tools",
  description:
    "How SongScore compares to Klangio, Songscription, and Melody Scanner for converting audio to sheet music. Honest feature-by-feature tables, updated regularly.",
  alternates: { canonical: "/compare" },
};

export default function CompareIndexPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 sm:py-16">
      <div className="text-center mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
          Compare AI music transcription tools
        </h1>
        <p className="text-base sm:text-lg text-[#a1a1aa] max-w-2xl mx-auto">
          Honest, feature-by-feature comparisons of SongScore against the other
          audio-to-sheet-music apps. Where a competitor is stronger, we say so —
          and we link our roadmap for the gaps.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {COMPETITORS.map((c) => (
          <Link
            key={c.slug}
            href={`/compare/${c.slug}`}
            className="group rounded-xl border border-[#27272a] bg-[#111113] p-6 hover:border-violet-500/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <h2 className="text-lg font-semibold text-white group-hover:text-violet-300 transition-colors">
              SongScore vs {c.name}
            </h2>
            <p className="mt-2 text-sm text-[#71717a] leading-relaxed">
              {c.strengths}
            </p>
            <span className="mt-4 inline-block text-sm text-violet-400">
              See the comparison →
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-14 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-900/20 to-indigo-900/10 p-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-3">
          The short version
        </h2>
        <p className="text-[#a1a1aa] max-w-2xl mx-auto mb-6">
          Single-instrument tools transcribe one part well. SongScore transcribes
          the <strong className="text-white">whole song</strong> — AI stem
          separation gives every instrument its own score, with Easy/Medium/Hard
          difficulty variants and published accuracy benchmarks.
        </p>
        <Link
          href="/app"
          className="inline-block rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-8 py-3.5 text-base font-semibold text-white hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
        >
          Try SongScore free →
        </Link>
      </div>
    </div>
  );
}
