"use client";

import { useEffect, useRef, useState } from "react";
import { downloadUrl, NGROK_HEADERS } from "@/lib/api";

interface MusicXmlViewerProps {
  jobId: string;
  stem: string;
  /** Whether the backend generated a MIDI file for this stem */
  hasMidi: boolean;
}

type LoadPhase = "loading" | "ready" | "error";

export default function MusicXmlViewer({ jobId, stem, hasMidi }: MusicXmlViewerProps) {
  const osmdContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const osmdRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const synthRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partRef = useRef<any>(null);
  // Cached Tone module reference — avoids async in cleanup (which can't await)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toneModuleRef = useRef<any>(null);
  // Raw MIDI bytes — re-parsed on every Play press
  const midiBufferRef = useRef<ArrayBuffer | null>(null);
  // Timeout id for auto-resetting isPlaying; stored so it can be cancelled
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // Reactive flag set when MIDI buffer is ready — refs don't trigger re-render
  const [midiReady, setMidiReady] = useState(false);

  // Load MusicXML (and optionally MIDI) on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // 1. Fetch MusicXML text from the backend
        const xmlRes = await fetch(downloadUrl(jobId, stem, "musicxml"), {
          headers: NGROK_HEADERS,
        });
        if (!xmlRes.ok) throw new Error(`MusicXML fetch failed: HTTP ${xmlRes.status}`);
        const xmlText = await xmlRes.text();

        if (cancelled) return;

        // 2. Render with OSMD (lazy-loaded to avoid SSR)
        const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
        if (cancelled || !osmdContainerRef.current) return;

        const osmd = new OpenSheetMusicDisplay(osmdContainerRef.current, {
          autoResize: true,
          backend: "svg",
          drawTitle: true,
          drawSubtitle: false,
          drawComposer: false,
          drawLyricist: false,
          drawCredits: false,
          drawPartNames: true,
          followCursor: false,
        });
        osmdRef.current = osmd;

        await osmd.load(xmlText);
        if (cancelled) return;
        osmd.render();

        // 3. Optionally pre-fetch MIDI for Tone.js playback
        if (hasMidi) {
          const midiRes = await fetch(downloadUrl(jobId, stem, "mid"), {
            headers: NGROK_HEADERS,
          });
          if (midiRes.ok && !cancelled) {
            midiBufferRef.current = await midiRes.arrayBuffer();
            setMidiReady(true); // reactive: triggers re-render to show playback controls
          }
        }

        if (!cancelled) setPhase("ready");
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setLoadError(msg);
          setPhase("error");
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      // Cancel any pending auto-reset timer
      if (playTimerRef.current !== null) {
        clearTimeout(playTimerRef.current);
        playTimerRef.current = null;
      }
      // Stop Transport synchronously using cached module (async import not safe in cleanup)
      if (toneModuleRef.current) {
        try { toneModuleRef.current.getTransport().stop(); } catch { /* ignore */ }
        try { toneModuleRef.current.getTransport().cancel(); } catch { /* ignore */ }
      }
      // Dispose all Web Audio nodes to prevent leaks
      try { synthRef.current?.dispose(); } catch { /* ignore */ }
      synthRef.current = null;
      try { partRef.current?.dispose(); } catch { /* ignore */ }
      partRef.current = null;
      // Clear OSMD to remove its resize listeners and SVG
      try { osmdRef.current?.clear?.(); } catch { /* ignore */ }
      osmdRef.current = null;
    };
    // jobId and stem are stable once the component mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, stem, hasMidi]);

  function clearPlayTimer() {
    if (playTimerRef.current !== null) {
      clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
  }

  const handlePlay = async () => {
    if (!midiBufferRef.current) return;
    clearPlayTimer();
    setPlayError(null);
    try {
      const [Tone, { Midi }] = await Promise.all([
        import("tone"),
        import("@tonejs/midi"),
      ]);
      toneModuleRef.current = Tone; // cache for synchronous cleanup on unmount

      // Unlock AudioContext (required by browsers before first audio)
      await Tone.start();

      // Stop any prior playback on the shared Transport before re-scheduling
      Tone.getTransport().stop();
      Tone.getTransport().cancel();
      try { partRef.current?.dispose(); } catch { /* ignore */ }
      try { synthRef.current?.dispose(); } catch { /* ignore */ }

      const midi = new Midi(midiBufferRef.current);

      // Build a PolySynth that can handle chords
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" as const },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.8 },
      }).toDestination();
      synthRef.current = synth;

      // Collect all notes across all tracks
      const allNotes = midi.tracks.flatMap((track) =>
        track.notes.map((note) => ({
          time: note.time,
          note: note.name,
          duration: note.duration,
          velocity: note.velocity,
        })),
      );

      if (allNotes.length === 0) {
        setPlayError("No notes found in MIDI file.");
        return;
      }

      const part = new Tone.Part(
        (time: number, value: { note: string; duration: number; velocity: number } | number) => {
          if (typeof value === "number") return;
          synth.triggerAttackRelease(value.note, value.duration, time, value.velocity);
        },
        allNotes.map((n) => [n.time, n]),
      );
      partRef.current = part;
      part.start(0);

      // Set BPM from MIDI header if available
      const bpm = midi.header.tempos[0]?.bpm;
      if (bpm) Tone.getTransport().bpm.value = bpm;

      Tone.getTransport().start("+0.1");
      setIsPlaying(true);

      // Auto-reset playing state when playback ends; store id for cancellation
      const totalDuration = allNotes.reduce(
        (max, n) => Math.max(max, n.time + n.duration),
        0,
      );
      playTimerRef.current = setTimeout(() => {
        playTimerRef.current = null;
        setIsPlaying(false);
      }, (totalDuration + 1) * 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPlayError(msg);
      setIsPlaying(false);
    }
  };

  const handlePause = async () => {
    clearPlayTimer();
    try {
      const Tone = await import("tone");
      Tone.getTransport().pause();
    } catch { /* ignore */ }
    setIsPlaying(false);
  };

  const handleStop = async () => {
    clearPlayTimer();
    try {
      const Tone = await import("tone");
      Tone.getTransport().stop();
      Tone.getTransport().cancel();
    } catch { /* ignore */ }
    try { synthRef.current?.dispose(); } catch { /* ignore */ }
    synthRef.current = null;
    try { partRef.current?.dispose(); } catch { /* ignore */ }
    partRef.current = null;
    setIsPlaying(false);
  };

  return (
    <div className="mt-2 rounded-xl border border-slate-700 overflow-hidden">
      {/* Loading skeleton */}
      {phase === "loading" && (
        <div className="flex items-center gap-3 p-6 bg-slate-900/50">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          <span className="text-sm text-slate-400">Loading score…</span>
        </div>
      )}

      {/* Load error state */}
      {phase === "error" && (
        <div className="p-4 bg-red-950/30 border-t border-red-800 text-sm text-red-400">
          ⚠ Failed to load score: {loadError}
        </div>
      )}

      {/* OSMD renders its SVG into this div — must be white-bg for correct rendering */}
      <div
        ref={osmdContainerRef}
        className="w-full overflow-y-auto p-4 bg-white"
        style={{
          maxHeight: "480px",
          display: phase === "ready" ? "block" : "none",
        }}
      />

      {/* Playback controls — only shown when MIDI loaded successfully */}
      {phase === "ready" && hasMidi && midiReady && (
        <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
          <span className="text-xs font-medium text-slate-500 mr-1">Playback:</span>
          {isPlaying ? (
            <button
              type="button"
              onClick={handlePause}
              className="flex items-center gap-1.5 rounded-md bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-50"
            >
              <span aria-hidden="true">⏸</span> Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePlay}
              className="flex items-center gap-1.5 rounded-md bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-50"
            >
              <span aria-hidden="true">▶</span> Play
            </button>
          )}
          <button
            type="button"
            onClick={handleStop}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-50"
          >
            <span aria-hidden="true">■</span> Stop
          </button>
          {playError && (
            <span className="ml-2 text-xs text-red-500">{playError}</span>
          )}
          <span className="ml-auto text-xs text-slate-400 italic">
            Note: only one stem plays at a time
          </span>
        </div>
      )}

      {/* Score rendered but no MIDI available */}
      {phase === "ready" && (!hasMidi || !midiReady) && (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
          Score rendered — no MIDI file available for audio playback.
        </div>
      )}
    </div>
  );
}
