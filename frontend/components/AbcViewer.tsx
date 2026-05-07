"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface AbcViewerProps {
  /** Full ABC notation string to render and play */
  abcText: string;
  /** Optional error callback */
  onError?: (msg: string) => void;
}

const MIN_TEMPO_PCT = 25;   // 25% of original
const MAX_TEMPO_PCT = 200;  // 200% of original
const MIN_TRANSPOSE = -12;
const MAX_TRANSPOSE = 12;

export default function AbcViewer({ abcText, onError }: AbcViewerProps) {
  const renderDivRef = useRef<HTMLDivElement>(null);
  const progressDivRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controllerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const abcjsRef = useRef<any>(null);
  // Stable transpose value used during init; transpose changes trigger re-init
  const transposeRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [synthReady, setSynthReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tempoPct, setTempoPct] = useState(100);
  const [transpose, setTranspose] = useState(0);

  // Keep transpose ref synced for the next init pass
  useEffect(() => {
    transposeRef.current = transpose;
  }, [transpose]);

  useEffect(() => {
    if (!renderDivRef.current || !abcText.trim()) return;

    let cancelled = false;
    setSynthReady(false);
    setIsPlaying(false);
    setLoadError(null);

    // Stop any previous playback before re-initialising
    try { controllerRef.current?.pause(); } catch { /* ignore */ }
    controllerRef.current = null;

    async function init() {
      try {
        const abcjs = (await import("abcjs")).default;
        abcjsRef.current = abcjs;

        if (cancelled || !renderDivRef.current) return;

        // Render notation SVG with current transpose
        const visualObj = abcjs.renderAbc(renderDivRef.current, abcText, {
          responsive: "resize",
          add_classes: true,
          paddingbottom: 0,
          paddingtop: 0,
          visualTranspose: transposeRef.current,
        });

        if (!visualObj || !visualObj[0]) {
          setLoadError("Could not parse ABC notation.");
          return;
        }

        if (!abcjs.synth.supportsAudio()) {
          setSynthReady(false);
          return;
        }

        const controller = new abcjs.synth.SynthController();
        controller.load(progressDivRef.current!, null, {
          displayLoop: false,
          displayRestart: false,
          displayPlay: false,
          displayProgress: false,
          displayWarp: false,
        });
        await controller.setTune(visualObj[0], false, {
          midiTranspose: transposeRef.current,
          onEnded: () => setIsPlaying(false),
        });

        if (cancelled) return;

        controllerRef.current = controller;
        // Apply current tempo to fresh controller
        try { controller.setWarp(tempoPct); } catch { /* ignore */ }
        setSynthReady(true);
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setLoadError(msg);
          onError?.(msg);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      try { controllerRef.current?.pause(); } catch { /* ignore */ }
      controllerRef.current = null;
    };
    // Re-init when abcText OR transpose changes (transpose affects both render + audio)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abcText, transpose]);

  // Apply tempo changes without re-rendering the score
  useEffect(() => {
    if (!controllerRef.current) return;
    try {
      controllerRef.current.setWarp(tempoPct);
    } catch { /* ignore */ }
  }, [tempoPct]);

  const handlePlay = useCallback(() => {
    controllerRef.current?.play();
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    controllerRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const handleStop = useCallback(() => {
    controllerRef.current?.pause();
    controllerRef.current?.restart();
    setIsPlaying(false);
  }, []);

  const transposeLabel = transpose === 0
    ? "0"
    : transpose > 0
      ? `+${transpose}`
      : String(transpose);

  return (
    <div className="flex flex-col gap-3">
      {/* Score — white background matches printed sheet music */}
      <div
        ref={renderDivRef}
        className="bg-white rounded-lg px-4 pt-4 pb-2 min-h-[120px] overflow-x-auto"
        style={{ color: "black" }}
      />

      {/* Hidden div that abcjs SynthController uses internally */}
      <div ref={progressDivRef} className="hidden" />

      {/* Playback controls */}
      {synthReady && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap sm:gap-4">
          {/* Transport */}
          <div className="flex items-center gap-2">
            {isPlaying ? (
              <button
                type="button"
                onClick={handlePause}
                className="flex items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <span className="text-base leading-none">⏸</span>
                Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePlay}
                className="flex items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <span className="text-base leading-none">▶</span>
                Play
              </button>
            )}
            <button
              type="button"
              onClick={handleStop}
              className="flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <span className="text-base leading-none">■</span>
              Stop
            </button>
          </div>

          {/* Tempo */}
          <label className="flex items-center gap-2 min-w-[180px]">
            <span className="text-xs uppercase tracking-widest text-slate-500 w-12">Tempo</span>
            <input
              type="range"
              min={MIN_TEMPO_PCT}
              max={MAX_TEMPO_PCT}
              step={5}
              value={tempoPct}
              onChange={(e) => setTempoPct(Number(e.target.value))}
              className="flex-1 accent-violet-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              aria-label="Tempo (percent of original)"
            />
            <span className="text-xs font-mono text-slate-300 w-12 text-right tabular-nums">
              {tempoPct}%
            </span>
          </label>

          {/* Transpose */}
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-slate-500">Key</span>
            <button
              type="button"
              onClick={() => setTranspose((t) => Math.max(MIN_TRANSPOSE, t - 1))}
              disabled={transpose <= MIN_TRANSPOSE}
              aria-label="Transpose down one semitone"
              className="rounded-md border border-slate-600 bg-slate-800 w-8 h-8 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              −
            </button>
            <span className="text-xs font-mono text-slate-200 w-8 text-center tabular-nums">
              {transposeLabel}
            </span>
            <button
              type="button"
              onClick={() => setTranspose((t) => Math.min(MAX_TRANSPOSE, t + 1))}
              disabled={transpose >= MAX_TRANSPOSE}
              aria-label="Transpose up one semitone"
              className="rounded-md border border-slate-600 bg-slate-800 w-8 h-8 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              +
            </button>
            {transpose !== 0 && (
              <button
                type="button"
                onClick={() => setTranspose(0)}
                className="text-xs text-slate-500 hover:text-slate-300 underline ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 rounded"
              >
                reset
              </button>
            )}
          </div>
        </div>
      )}

      {!synthReady && !loadError && (
        <p className="text-xs text-slate-500">Loading audio engine…</p>
      )}

      {loadError && (
        <p className="text-sm text-red-400">
          ⚠ {loadError}
        </p>
      )}
    </div>
  );
}
