"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { NGROK_HEADERS } from "@/lib/api";

/**
 * DAW-style multi-track player for the per-stem WAVs Demucs produces.
 *
 * Loads each stem's WAV via fetch + AudioContext.decodeAudioData, plays
 * them in sample-accurate sync by calling start(0) on all
 * AudioBufferSourceNodes within the same audioContext frame. Per-stem
 * Mute / Solo / Volume sliders adjust GainNodes routed through a master
 * gain. The shared current time is exposed via {@link MixTimeContext} so
 * the inline OSMD viewers can advance their cursors against the same
 * timeline.
 *
 * Why Web Audio API instead of multiple <audio> elements:
 *   - <audio> can drift between tracks (each has its own clock)
 *   - Web Audio gives sample-accurate sync via shared audioContext clock
 *   - GainNode mute/solo is instant (no fades, no popping if done right)
 *
 * Scope decisions:
 *   - Drum stems excluded — pipeline skips drum transcription, but Demucs
 *     does produce drums.wav; we include them anyway since playback works
 *     even without a score.
 *   - Sources are re-created on every Play. AudioBufferSourceNodes are
 *     single-use per Web Audio API spec.
 *   - Pause works by remembering the elapsed offset; Resume creates new
 *     sources starting at that offset.
 */

// ── Time-source context for cursor sync ──────────────────────────────────────

/**
 * A ref to a function that returns the current playback time in seconds.
 * Subscribers (MusicXmlViewer's "Mix" mode) read from this on every rAF
 * tick. Null when no UnifiedPlayer is mounted.
 */
export interface MixTimeSource {
  getTime: () => number;
  isPlaying: () => boolean;
}

export const MixTimeContext = createContext<MixTimeSource | null>(null);

/** Hook for cursor-sync subscribers. Returns null if not under a UnifiedPlayer. */
export function useMixTimeSource(): MixTimeSource | null {
  return useContext(MixTimeContext);
}

// ── Public component ────────────────────────────────────────────────────────

const STEM_ICONS: Record<string, string> = {
  vocals: "🎤",
  bass: "🎸",
  other: "🎹",
  guitar: "🎸",
  piano: "🎹",
  drums: "🥁",
};

interface StemState {
  muted: boolean;
  solo: boolean;
  volume: number; // 0..1
}

interface UnifiedPlayerProps {
  jobId: string;
  /** Stem names to load and mix — typically from job.scores keys. */
  stems: string[];
  /** Optional wrapper around the player so children can subscribe to MixTime. */
  children?: ReactNode;
}

type Phase = "loading" | "ready" | "error";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function stemAudioUrl(jobId: string, stem: string): string {
  return `${apiUrl}/api/jobs/${jobId}/stems/${stem}/audio`;
}

export default function UnifiedPlayer({ jobId, stems, children }: UnifiedPlayerProps) {
  // ── Web Audio refs ─────────────────────────────────────────────────────────
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const buffersRef = useRef<Record<string, AudioBuffer>>({});
  const sourcesRef = useRef<Record<string, AudioBufferSourceNode>>({});
  const gainsRef = useRef<Record<string, GainNode>>({});
  // Bookkeeping for elapsed time across play/pause
  const playStartedAtRef = useRef<number>(0); // audioContext.currentTime when start() called
  const pauseOffsetRef = useRef<number>(0); // total elapsed seconds at last pause
  const isPlayingRef = useRef<boolean>(false);
  const rafIdRef = useRef<number | null>(null);

  // ── React state ────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [globalVolume, setGlobalVolume] = useState<number>(1);
  const [stemStates, setStemStates] = useState<Record<string, StemState>>({});

  // ── Stable mix-time source ─────────────────────────────────────────────────
  // We hand out a stable object whose methods read the latest refs, so
  // subscribers don't need to re-subscribe when state changes.
  const mixTimeSourceRef = useRef<MixTimeSource>({
    getTime: () => {
      const ctx = audioContextRef.current;
      if (!ctx || !isPlayingRef.current) return pauseOffsetRef.current;
      return ctx.currentTime - playStartedAtRef.current + pauseOffsetRef.current;
    },
    isPlaying: () => isPlayingRef.current,
  });

  // ── Load all stems on mount ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Lazy-create the AudioContext on user-gesture is normally required,
        // but creating it without resuming is allowed and gives us
        // decodeAudioData immediately. We resume on first Play.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Ctx: typeof AudioContext = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!Ctx) throw new Error("Web Audio API not supported in this browser");
        const ctx = new Ctx();
        audioContextRef.current = ctx;

        const master = ctx.createGain();
        master.gain.value = 1;
        master.connect(ctx.destination);
        masterGainRef.current = master;

        // Fetch + decode each stem in parallel
        const results = await Promise.all(
          stems.map(async (stem) => {
            const res = await fetch(stemAudioUrl(jobId, stem), {
              headers: NGROK_HEADERS,
            });
            if (!res.ok) throw new Error(`Failed to fetch ${stem}: HTTP ${res.status}`);
            const arr = await res.arrayBuffer();
            const buf = await ctx.decodeAudioData(arr);
            return [stem, buf] as const;
          }),
        );

        if (cancelled) return;

        for (const [stem, buf] of results) {
          buffersRef.current[stem] = buf;
          // One persistent GainNode per stem — connected through master
          const g = ctx.createGain();
          g.gain.value = 1;
          g.connect(master);
          gainsRef.current[stem] = g;
        }

        const longest = results.reduce((m, [, b]) => Math.max(m, b.duration), 0);
        setDuration(longest);

        // Initial per-stem state: unmuted, unsolo'd, full volume
        const initial: Record<string, StemState> = {};
        for (const stem of stems) {
          initial[stem] = { muted: false, solo: false, volume: 1 };
        }
        setStemStates(initial);

        setPhase("ready");
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setLoadError(msg);
        setPhase("error");
      }
    }

    load();

    return () => {
      cancelled = true;
      // Tear down — stop sources, close context
      try {
        for (const node of Object.values(sourcesRef.current)) {
          try { node.stop(); } catch { /* already stopped */ }
        }
      } catch { /* ignore */ }
      sourcesRef.current = {};
      try { audioContextRef.current?.close(); } catch { /* ignore */ }
      audioContextRef.current = null;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // ── Apply gain whenever mute / solo / volume / global change ───────────────
  useEffect(() => {
    const anySolo = Object.values(stemStates).some((s) => s.solo);
    for (const [stem, state] of Object.entries(stemStates)) {
      const g = gainsRef.current[stem];
      if (!g) continue;
      const audible = anySolo ? state.solo : !state.muted;
      g.gain.value = audible ? state.volume : 0;
    }
    if (masterGainRef.current) masterGainRef.current.gain.value = globalVolume;
  }, [stemStates, globalVolume]);

  // ── Time tick when playing ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return;
    const tick = () => {
      const ctx = audioContextRef.current;
      if (!ctx) return;
      const elapsed = ctx.currentTime - playStartedAtRef.current + pauseOffsetRef.current;
      setCurrentTime(Math.min(elapsed, duration));
      if (elapsed >= duration) {
        handleStop();
        return;
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, duration]);

  // ── Playback control ───────────────────────────────────────────────────────

  function createSourcesAt(offset: number): void {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    // Tear down any old sources (single-use per Web Audio spec)
    for (const old of Object.values(sourcesRef.current)) {
      try { old.stop(); } catch { /* ignore */ }
      try { old.disconnect(); } catch { /* ignore */ }
    }
    sourcesRef.current = {};

    for (const [stem, buf] of Object.entries(buffersRef.current)) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gainsRef.current[stem]);
      // start(when, offset) — `when=0` means immediately; offset is into the buffer
      src.start(0, offset);
      sourcesRef.current[stem] = src;
    }
    playStartedAtRef.current = ctx.currentTime;
  }

  const handlePlay = useCallback(async () => {
    const ctx = audioContextRef.current;
    if (!ctx || phase !== "ready") return;
    try {
      if (ctx.state === "suspended") await ctx.resume();
      createSourcesAt(pauseOffsetRef.current);
      isPlayingRef.current = true;
      setIsPlaying(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(msg);
    }
  }, [phase]);

  const handlePause = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    pauseOffsetRef.current =
      ctx.currentTime - playStartedAtRef.current + pauseOffsetRef.current;
    for (const src of Object.values(sourcesRef.current)) {
      try { src.stop(); } catch { /* ignore */ }
    }
    sourcesRef.current = {};
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  const handleStop = useCallback(() => {
    for (const src of Object.values(sourcesRef.current)) {
      try { src.stop(); } catch { /* ignore */ }
    }
    sourcesRef.current = {};
    pauseOffsetRef.current = 0;
    isPlayingRef.current = false;
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const handleSeek = useCallback(
    (newTimeSeconds: number) => {
      const clamped = Math.max(0, Math.min(newTimeSeconds, duration));
      const wasPlaying = isPlayingRef.current;
      // Stop existing sources
      for (const src of Object.values(sourcesRef.current)) {
        try { src.stop(); } catch { /* ignore */ }
      }
      sourcesRef.current = {};
      pauseOffsetRef.current = clamped;
      setCurrentTime(clamped);
      // If we were playing, immediately restart from new offset
      if (wasPlaying) {
        createSourcesAt(clamped);
        isPlayingRef.current = true;
      } else {
        isPlayingRef.current = false;
      }
    },
    [duration],
  );

  // ── UI helpers ─────────────────────────────────────────────────────────────

  function toggleMute(stem: string) {
    setStemStates((prev) => ({
      ...prev,
      [stem]: { ...prev[stem], muted: !prev[stem].muted },
    }));
  }

  function toggleSolo(stem: string) {
    setStemStates((prev) => ({
      ...prev,
      [stem]: { ...prev[stem], solo: !prev[stem].solo },
    }));
  }

  function setStemVolume(stem: string, v: number) {
    setStemStates((prev) => ({
      ...prev,
      [stem]: { ...prev[stem], volume: v },
    }));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <MixTimeContext.Provider value={mixTimeSourceRef.current}>
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-300">
            🎚 Mix player
          </h3>
          <span className="text-xs text-slate-500">
            Plays the AI-separated stems in sync. Mute or solo each one.
          </span>
        </div>

        {phase === "loading" && (
          <div className="flex items-center gap-3 py-4 text-slate-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
            <span className="text-sm">Loading stems…</span>
          </div>
        )}

        {phase === "error" && (
          <div className="rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-400">
            ⚠ {loadError}
          </div>
        )}

        {phase === "ready" && (
          <>
            {/* Transport row */}
            <div className="flex items-center gap-3 mb-4">
              {isPlaying ? (
                <button
                  type="button"
                  onClick={handlePause}
                  className="flex items-center gap-1.5 rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                >
                  <span aria-hidden="true">⏸</span> Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePlay}
                  className="flex items-center gap-1.5 rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                >
                  <span aria-hidden="true">▶</span> Play
                </button>
              )}
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              >
                <span aria-hidden="true">■</span> Stop
              </button>

              {/* Seek slider */}
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={currentTime}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="flex-1 min-w-[100px] accent-violet-500 cursor-pointer"
                aria-label="Seek"
              />

              <span className="text-xs font-mono text-slate-400 tabular-nums whitespace-nowrap">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              {/* Global volume */}
              <label className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Vol</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={globalVolume}
                  onChange={(e) => setGlobalVolume(Number(e.target.value))}
                  className="w-20 accent-violet-500 cursor-pointer"
                  aria-label="Master volume"
                />
              </label>
            </div>

            {/* Per-stem mixer rows */}
            <div className="flex flex-col gap-2">
              {stems.map((stem) => {
                const state = stemStates[stem];
                if (!state) return null;
                const anySolo = Object.values(stemStates).some((s) => s.solo);
                const audible = anySolo ? state.solo : !state.muted;
                return (
                  <div
                    key={stem}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 transition-colors ${
                      audible ? "bg-slate-800/40" : "bg-slate-900/40 opacity-50"
                    }`}
                  >
                    <span className="text-base w-6 text-center">
                      {STEM_ICONS[stem] ?? "🎵"}
                    </span>
                    <span className="text-sm font-medium text-slate-200 capitalize w-16">
                      {stem}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleMute(stem)}
                      aria-pressed={state.muted}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                        state.muted
                          ? "bg-red-700 text-white"
                          : "border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                      title="Mute this stem"
                    >
                      {state.muted ? "🔇 Muted" : "Mute"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSolo(stem)}
                      aria-pressed={state.solo}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                        state.solo
                          ? "bg-amber-600 text-white"
                          : "border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                      title="Play only this stem"
                    >
                      {state.solo ? "★ Solo" : "Solo"}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={state.volume}
                      onChange={(e) => setStemVolume(stem, Number(e.target.value))}
                      className="flex-1 max-w-[140px] accent-violet-500 cursor-pointer"
                      aria-label={`${stem} volume`}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Subscribers (e.g. MusicXmlViewers) live inside the provider */}
      {children}
    </MixTimeContext.Provider>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
