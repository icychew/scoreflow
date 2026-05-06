import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ScoreFlow — Audio to Sheet Music",
  description: "Upload an audio file and get sheet music (MusicXML) and MIDI in minutes using AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-slate-950 text-slate-100 antialiased`}>
        <header className="border-b border-slate-800 px-6 py-4">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <span className="text-2xl">🎼</span>
            <a href="/" className="text-lg font-bold text-violet-400 hover:text-violet-300">
              ScoreFlow
            </a>
            <span className="text-sm text-slate-500">Audio → Sheet Music</span>
            <div className="ml-auto">
              <a href="/viewer" className="text-sm font-medium text-slate-400 hover:text-violet-300 transition-colors">
                🎵 Viewer
              </a>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
        <footer className="mt-16 border-t border-slate-800 py-6 text-center text-xs text-slate-600">
          Powered by Demucs · Basic Pitch · music21
        </footer>
      </body>
    </html>
  );
}
