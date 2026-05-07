"use client";

import { useEffect, useRef, useState } from "react";
import { downloadUrl, NGROK_HEADERS } from "@/lib/api";

interface MusicXmlViewerProps {
  jobId: string;
  stem: string;
  /** Whether the backend generated a MIDI file for this stem */
  hasMidi: boolean;
  /** Share token, propagated to /score links so shared viewers can open the PDF view */
  shareToken?: string;
}

type LoadPhase = "loading" | "ready" | "error";

const MIN_BPM = 40;
const MAX_BPM = 220;
const DEFAULT_BPM = 120;
const MIN_TRANSPOSE = -12;
const MAX_TRANSPOSE = 12;

/** Convert MIDI note number (0-127) to note name. Avoids needing a Tone.js call per note. */
function midiToNoteName(midi: number): string {
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const clamped = Math.max(0, Math.min(127, midi));
  const octave = Math.floor(clamped / 12) - 1;
  return `${NAMES[clamped % 12]}${octave}`;
}

export default function MusicXmlViewer({ jobId, stem, hasMidi, shareToken }: MusicXmlViewerProps) {
  const scoreUrl = shareToken
    ? `/score/${jobId}/${stem}?print=1&token=${encodeURIComponent(shareToken)}`
    : `/score/${jobId}/${stem}?print=1`;
  const osmdContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const osmdRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const synthRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toneModuleRef = useRef<any>(null);
  const midiBufferRef = useRef<ArrayBuffer | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest transpose value, read at scheduling time (NOT in deps to avoid re-mount)
  const transposeRef = useRef(0);

  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [midiReady, setMidiReady] = useState(false);
  const [tempoBpm, setTempoBpm] = useState<number>(DEFAULT_BPM);
  const [transpose, setTranspose] = useState(0);
  // Has the user manually moved the tempo slider? (If not, use the MIDI's native BPM.)
  const [tempoTouched, setTempoTouched] = useState(false);

  useEffect(() => {
    transposeRef.current = transpose;
  }, [transpose]);

  // Live tempo control — applies even during playback
  useEffect(() => {
    if (!toneModuleRef.current) return;
    try {
      toneModuleRef.current.getTransport().bpm.value = tempoBpm;
    } catch { /* ignore */ }
  }, [tempoBpm]);

  // Load MusicXML (and optionally MIDI) on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const xmlRes = await fetch(downloadUrl(jobId, stem, "musicxml"), {
          headers: NGROK_HEADERS,
        });
        if (!xmlRes.ok) throw new Error(`MusicXML fetch failed: HTTP ${xmlRes.status}`);
        const xmlText = await xmlRes.text();

        if (cancelled) return;

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

        if (hasMidi) {
          const midiRes = await fetch(downloadUrl(jobId, stem, "mid"), {
            headers: NGROK_HEADERS,
          });
          if (midiRes.ok && !cancelled) {
            midiBufferRef.current = await midiRes.arrayBuffer();
            // Read BPM from MIDI header to seed the slider
            try {
              const { Midi } = await import("@tonejs/midi");
              const midi = new Midi(midiBufferRef.current);
              const headerBpm = midi.header.tempos[0]?.bpm;
              if (headerBpm && !cancelled) {
                setTempoBpm(Math.round(headerBpm));
              }
            } catch { /* fall back to DEFAULT_BPM */ }
            setMidiReady(true);
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
      if (playTimerRef.current !== null) {
        clearTimeout(playTimerRef.current);
        playTimerRef.current = null;
      }
      if (toneModuleRef.current) {
        try { toneModuleRef.current.getTransport().stop(); } catch { /* ignore */ }
        try { toneModuleRef.current.getTransport().cancel(); } catch { /* ignore */ }
      }
      try { synthRef.current?.dispose(); } catch { /* ignore */ }
      synthRef.current = null;
      try { partRef.current?.dispose(); } catch { /* ignore */ }
      partRef.current = null;
      try { osmdRef.current?.clear?.(); } catch { /* ignore */ }
      osmdRef.current = null;
    };
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
      toneModuleRef.current = Tone;

      await Tone.start();

      Tone.getTransport().stop();
      Tone.getTransport().cancel();
      try { partRef.current?.dispose(); } catch { /* ignore */ }
      try { synthRef.current?.dispose(); } catch { /* ignore */ }

      const midi = new Midi(midiBufferRef.current);

      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" as const },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.8 },
      }).toDestination();
      synthRef.current = synth;

      // Snapshot transpose at scheduling time. Live tempo changes work via Transport.bpm
      // but transpose changes require a re-schedule, so we'll just stop+restart on transpose.
      const transposeAtSchedule = transposeRef.current;

      // Use note.midi (MIDI number) so transpose is a simple integer add.
      const allNotes = midi.tracks.flatMap((track) =>
        track.notes.map((note) => ({
          time: note.time,
          midi: note.midi,
          duration: note.duration,
          velocity: note.velocity,
        })),
      );

      if (allNotes.length === 0) {
        setPlayError("No notes found in MIDI file.");
        return;
      }

      const part = new Tone.Part(
        (time: number, value: { midi: number; duration: number; velocity: number } | number) => {
          if (typeof value === "number") return;
          const noteName = midiToNoteName(value.midi + transposeAtSchedule);
          synth.triggerAttackRelease(noteName, value.duration, time, value.velocity);
        },
        allNotes.map((n) => [n.time, n]),
      );
      partRef.current = part;
      part.start(0);

      Tone.getTransport().bpm.value = tempoBpm;

      Tone.getTransport().start("+0.1");
      setIsPlaying(true);

      // Auto-reset playing state when playback ends — scaled by tempo
      const headerBpm = midi.header.tempos[0]?.bpm ?? DEFAULT_BPM;
      const tempoRatio = headerBpm / tempoBpm; // <1 means we're playing faster
      const totalDuration = allNotes.reduce(
        (max, n) => Math.max(max, n.time + n.duration),
        0,
      );
      playTimerRef.current = setTimeout(() => {
        playTimerRef.current = null;
        setIsPlaying(false);
      }, (totalDuration * tempoRatio + 1) * 1000);
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

  // Stop playback if transpose changes mid-song; user must press Play again
  useEffect(() => {
    if (isPlaying) {
      handleStop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transpose]);

  const transposeLabel = transpose === 0
    ? "0"
    : transpose > 0
      ? `+${transpose}`
      : String(transpose);

  return (
    <div className="mt-2 rounded-xl border border-slate-700 overflow-hidden">
      {phase === "loading" && (
        <div className="flex items-center gap-3 p-6 bg-slate-900/50">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          <span className="text-sm text-slate-400">Loading score…</span>
        </div>
      )}

      {phase === "error" && (
        <div className="p-4 bg-red-950/30 border-t border-red-800 text-sm text-red-400">
          ⚠ Failed to load score: {loadError}
        </div>
      )}

      <div
        ref={osmdContainerRef}
        className="w-full overflow-y-auto p-4 bg-white"
        style={{
          maxHeight: "480px",
          display: phase === "ready" ? "block" : "none",
        }}
      />

      {/* Action bar — always shown when score loads. Includes PDF/print +
          (when MIDI is available) playback controls. */}
      {phase === "ready" && (
        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:flex-wrap sm:gap-4">
          {/* PDF / open full-screen — always available */}
          <a
            href={scoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-50"
          >
            📄 Save as PDF
          </a>

          {hasMidi && midiReady && (
          <>
          {/* Transport */}
          <div className="flex items-center gap-2">
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
          </div>

          {/* Tempo */}
          <label className="flex items-center gap-2 min-w-[200px] flex-1">
            <span className="text-xs font-medium text-slate-500">Tempo</span>
            <input
              type="range"
              min={MIN_BPM}
              max={MAX_BPM}
              step={1}
              value={tempoBpm}
              onChange={(e) => {
                setTempoBpm(Number(e.target.value));
                setTempoTouched(true);
              }}
              className="flex-1 accent-violet-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-50"
              aria-label="Tempo (BPM)"
            />
            <span className="text-xs font-mono text-slate-700 w-16 text-right tabular-nums">
              {tempoBpm} {tempoTouched ? "BPM" : "BPM*"}
            </span>
          </label>

          {/* Transpose */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Key</span>
            <button
              type="button"
              onClick={() => setTranspose((t) => Math.max(MIN_TRANSPOSE, t - 1))}
              disabled={transpose <= MIN_TRANSPOSE}
              aria-label="Transpose down one semitone"
              className="rounded-md border border-slate-300 bg-white w-7 h-7 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              −
            </button>
            <span className="text-xs font-mono text-slate-700 w-7 text-center tabular-nums">
              {transposeLabel}
            </span>
            <button
              type="button"
              onClick={() => setTranspose((t) => Math.min(MAX_TRANSPOSE, t + 1))}
              disabled={transpose >= MAX_TRANSPOSE}
              aria-label="Transpose up one semitone"
              className="rounded-md border border-slate-300 bg-white w-7 h-7 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              +
            </button>
            {transpose !== 0 && (
              <button
                type="button"
                onClick={() => setTranspose(0)}
                className="text-xs text-slate-400 hover:text-slate-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"
              >
                reset
              </button>
            )}
          </div>

          {playError && (
            <span className="text-xs text-red-600 basis-full">⚠ {playError}</span>
          )}
          </>
          )}
        </div>
      )}
    </div>
  );
}
