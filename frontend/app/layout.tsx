import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import Header from "@/components/Header";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Notara — Convert Audio to Sheet Music with AI",
  description:
    "Upload any audio file and get a clean PDF sheet music score in seconds. Notara uses AI to separate stems and transcribe each instrument. Free to try — no signup needed.",
  openGraph: {
    title: "Notara — Convert Audio to Sheet Music with AI",
    description:
      "Upload audio. Get sheet music. Powered by AI stem separation and transcription.",
    url: "https://notara.app",
    siteName: "Notara",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Notara — Convert Audio to Sheet Music with AI",
    description: "Upload audio. Get sheet music. Powered by AI.",
    images: ["/og-image.png"],
  },
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
                N
              </div>
              <span className="text-sm font-semibold text-white">Notara</span>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              <a href="/pricing" className="text-xs text-[#71717a] hover:text-white transition-colors">Pricing</a>
              <a href="/app" className="text-xs text-[#71717a] hover:text-white transition-colors">Transcribe</a>
              <a href="/viewer" className="text-xs text-[#71717a] hover:text-white transition-colors">Viewer</a>
              <a href="/docs" className="text-xs text-[#71717a] hover:text-white transition-colors">API</a>
              <a href="/signin" className="text-xs text-[#71717a] hover:text-white transition-colors">Sign in</a>
            </nav>
            <p className="text-xs text-[#71717a] text-center">
              © {new Date().getFullYear()} Notara. Powered by Demucs · Basic Pitch · music21
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
