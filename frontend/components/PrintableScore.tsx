"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { downloadUrl, NGROK_HEADERS } from "@/lib/api";

interface PrintableScoreProps {
  jobId: string;
  stem: string;
  /** Display title — typically the transcription's filename or user-set title */
  title: string;
  /** If true, opens the browser print dialog as soon as the score is rendered */
  autoPrint: boolean;
}

type Phase = "loading" | "ready" | "error";

/**
 * Full-screen score viewer optimised for printing / Save-as-PDF.
 *
 * - White background everywhere (matches printed sheet music)
 * - Floating toolbar with Print and Close (hidden via @media print)
 * - Auto-prints on load if `autoPrint` is true (waits one frame so OSMD has
 *   finished rendering before opening the dialog)
 */
export default function PrintableScore({
  jobId,
  stem,
  title,
  autoPrint,
}: PrintableScoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const osmdRef = useRef<any>(null);

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const xmlRes = await fetch(downloadUrl(jobId, stem, "musicxml"), {
          headers: NGROK_HEADERS,
        });
        if (!xmlRes.ok) throw new Error(`HTTP ${xmlRes.status}`);
        const xmlText = await xmlRes.text();
        if (cancelled) return;

        const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
        if (cancelled || !containerRef.current) return;

        const osmd = new OpenSheetMusicDisplay(containerRef.current, {
          autoResize: true,
          backend: "svg",
          drawTitle: true,
          drawSubtitle: false,
          drawComposer: false,
          drawCredits: false,
          drawPartNames: true,
          followCursor: false,
        });
        osmdRef.current = osmd;

        await osmd.load(xmlText);
        if (cancelled) return;
        osmd.render();

        if (cancelled) return;
        setPhase("ready");

        if (autoPrint) {
          // Two RAFs to give the SVG a tick to settle before printing
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!cancelled) window.print();
            });
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load score");
          setPhase("error");
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      try { osmdRef.current?.clear?.(); } catch { /* ignore */ }
      osmdRef.current = null;
    };
  }, [jobId, stem, autoPrint]);

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Floating toolbar — hidden when printing */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 backdrop-blur px-4 sm:px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="text-sm text-slate-500 hover:text-slate-900 transition-colors flex-shrink-0"
            aria-label="Back to dashboard"
          >
            ← Back
          </Link>
          <span className="text-sm font-semibold text-slate-900 truncate">
            {title}
          </span>
          <span className="text-xs text-slate-500 capitalize flex-shrink-0">
            · {stem}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={downloadUrl(jobId, stem, "musicxml")}
            download={`${stem}.musicxml`}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            ↓ MusicXML
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={phase !== "ready"}
            className="rounded-md bg-violet-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1"
          >
            📄 Save as PDF
          </button>
        </div>
      </div>

      {/* Score area */}
      <div className="px-4 sm:px-8 py-6 sm:py-10">
        {phase === "loading" && (
          <div className="flex items-center justify-center gap-3 py-20 text-slate-500">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            Rendering score…
          </div>
        )}
        {phase === "error" && (
          <div className="mx-auto max-w-md text-center py-20">
            <p className="text-2xl mb-2">⚠</p>
            <h1 className="text-lg font-semibold text-slate-900 mb-2">
              Could not load score
            </h1>
            <p className="text-sm text-slate-500 mb-6">{error}</p>
            <Link
              href="/dashboard"
              className="inline-block rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 transition-colors"
            >
              Back to dashboard
            </Link>
          </div>
        )}
        <div
          ref={containerRef}
          className="mx-auto max-w-[1200px]"
          style={{ display: phase === "ready" ? "block" : "none" }}
        />
      </div>

      {/* Hint shown only while interacting with the page (hidden during print) */}
      {phase === "ready" && (
        <p className="no-print text-center text-xs text-slate-400 pb-8 px-4">
          Tip: choose &quot;Save as PDF&quot; as the destination in the print
          dialog to get a PDF file.
        </p>
      )}
    </div>
  );
}
