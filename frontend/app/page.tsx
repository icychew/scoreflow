import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notara — Convert Audio to Sheet Music with AI",
  description:
    "Upload any audio file and get a clean PDF sheet music score in seconds. Notara uses AI to separate stems and transcribe each instrument. Free to try — no signup needed.",
};

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative px-6 pt-20 pb-24 text-center overflow-hidden">
        {/* Background glow */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 flex items-center justify-center"
        >
          <div className="w-[600px] h-[400px] rounded-full bg-violet-700/20 blur-3xl" />
        </div>

        <div className="mx-auto max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-300 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Free to try — no signup needed
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-white leading-[1.1]">
            Upload audio.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
              Get sheet music.
            </span>
          </h1>

          <p className="mt-6 text-xl text-[#a1a1aa] max-w-2xl mx-auto leading-relaxed">
            Notara separates your recording into stems and transcribes each instrument
            to a clean PDF score — powered by AI, ready in seconds.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/app"
              className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-8 py-3.5 text-base font-semibold text-white hover:opacity-90 transition-opacity shadow-lg shadow-violet-900/30"
            >
              Try it free →
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg border border-[#27272a] bg-[#111113] px-8 py-3.5 text-base font-semibold text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-20 border-t border-[#27272a]">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold text-white mb-4">
            How it works
          </h2>
          <p className="text-center text-[#71717a] mb-14">Three steps. No music theory required.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Upload your audio",
                description:
                  "Drop in any MP3, WAV, or FLAC file — a recording, a song, a rehearsal. Up to 3 minutes free.",
              },
              {
                step: "02",
                title: "AI separates the stems",
                description:
                  "Notara splits your audio into vocals, bass, and other instruments using Demucs — studio-grade source separation.",
              },
              {
                step: "03",
                title: "Download your PDF score",
                description:
                  "Each stem is transcribed to notation and exported as a clean PDF score, ready to print or share.",
              },
            ].map(({ step, title, description }) => (
              <div
                key={step}
                className="flex flex-col gap-4 p-6 rounded-xl border border-[#27272a] bg-[#111113]"
              >
                <div className="text-xs font-mono text-violet-400 tracking-widest">{step}</div>
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                <p className="text-sm text-[#71717a] leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 border-t border-[#27272a]">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold text-white mb-4">
            Built for every musician
          </h2>
          <p className="text-center text-[#71717a] mb-14">From hobbyists to professional studios.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: "🎙️",
                title: "AI stem separation",
                description: "Demucs separates vocals, bass, and other instruments with studio-grade precision.",
              },
              {
                icon: "📄",
                title: "Clean PDF scores",
                description: "Every stem becomes a readable, printable sheet music PDF — perfect for rehearsal.",
              },
              {
                icon: "🎹",
                title: "MIDI & MusicXML",
                description: "Pro and Business users also get MIDI and MusicXML for import into any DAW or notation software.",
              },
              {
                icon: "⚡",
                title: "Fast processing",
                description: "Most tracks complete in under 60 seconds. Priority queue for Pro and Business users.",
              },
              {
                icon: "🆓",
                title: "Free to start",
                description: "3 transcriptions every month, no credit card required. Upgrade when you need more.",
              },
              {
                icon: "🔒",
                title: "Your files, private",
                description: "Audio files are processed and discarded. Results are available only to you.",
              },
            ].map(({ icon, title, description }) => (
              <div
                key={title}
                className="p-5 rounded-xl border border-[#27272a] bg-[#111113] flex flex-col gap-3"
              >
                <div className="text-2xl">{icon}</div>
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <p className="text-sm text-[#71717a] leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="px-6 py-20 border-t border-[#27272a]">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Start free. Upgrade when you&#39;re ready.
          </h2>
          <p className="text-[#71717a] mb-10">
            Free tier gives you 3 transcriptions per month, no card needed. Pro
            unlocks 50/month, MIDI, MusicXML, and your transcription history.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/app"
              className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-8 py-3.5 text-base font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Try free now →
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg border border-[#27272a] bg-[#111113] px-8 py-3.5 text-base font-semibold text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all"
            >
              View all plans
            </Link>
          </div>
        </div>
      </section>

      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "Notara",
            "description": "Convert audio files to sheet music PDF using AI stem separation and transcription.",
            "url": "https://notara.app",
            "applicationCategory": "MusicApplication",
            "operatingSystem": "Web",
            "offers": [
              { "@type": "Offer", "name": "Free", "price": "0", "priceCurrency": "USD" },
              { "@type": "Offer", "name": "Pro", "price": "12", "priceCurrency": "USD" },
              { "@type": "Offer", "name": "Business", "price": "49", "priceCurrency": "USD" },
            ],
          }),
        }}
      />
    </div>
  );
}
