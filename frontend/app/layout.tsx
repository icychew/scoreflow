import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import Header from "@/components/Header";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://songscore.app"),
  title: {
    default: "SongScore — AI Music Transcription: Audio to Sheet Music",
    template: "%s | SongScore",
  },
  description:
    "Convert any song to sheet music with AI. SongScore transcribes MP3, WAV or FLAC into printable scores, MIDI, and MusicXML — every instrument separated, with Easy/Medium/Hard difficulty levels. Free to try, no signup needed.",
  keywords: [
    "audio to sheet music",
    "music to score",
    "mp3 to sheet music",
    "AI music transcription",
    "song to sheet music converter",
    "audio to MIDI",
    "transcribe music to notation",
    "mp3 to MusicXML",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "SongScore — AI Music Transcription: Audio to Sheet Music",
    description:
      "Turn any song into sheet music — every instrument, every level. AI stem separation + transcription with published accuracy benchmarks.",
    url: "https://songscore.app",
    siteName: "SongScore",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SongScore — AI Music Transcription: Audio to Sheet Music",
    description:
      "Turn any song into sheet music — every instrument, every level.",
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${inter.className} min-h-screen bg-[#09090b] text-white antialiased`}
      >
        <Header />
        <main>{children}</main>
        <footer className="border-t border-[#27272a] py-8 px-6 mt-20">
          <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-[10px] font-bold text-white">
                S
              </div>
              <span className="text-sm font-semibold text-white">SongScore</span>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              <a href="/pricing" className="text-xs text-[#71717a] hover:text-white transition-colors">Pricing</a>
              <a href="/app" className="text-xs text-[#71717a] hover:text-white transition-colors">Transcribe</a>
              <a href="/viewer" className="text-xs text-[#71717a] hover:text-white transition-colors">Viewer</a>
              <a href="/docs" className="text-xs text-[#71717a] hover:text-white transition-colors">API</a>
              <a href="/accuracy" className="text-xs text-[#71717a] hover:text-white transition-colors">Accuracy</a>
              <a href="/compare" className="text-xs text-[#71717a] hover:text-white transition-colors">Compare</a>
              <a href="/signin" className="text-xs text-[#71717a] hover:text-white transition-colors">Sign in</a>
            </nav>
            <p className="text-xs text-[#71717a] text-center">
              © {new Date().getFullYear()} SongScore. Powered by Demucs · Basic Pitch · music21
            </p>
          </div>
        </footer>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#18181b",
              border: "1px solid #27272a",
              color: "#fafafa",
            },
          }}
        />
      </body>
    </html>
  );
}
