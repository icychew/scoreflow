"use client";

import { useEffect, useRef, useState } from "react";

interface AbcViewerProps {
  /** Full ABC notation string to render and play */
  abcText: string;
  /** Optional error callback */
  onError?: (msg: string) => void;
}

export default function AbcViewer({ abcText, onError }: AbcViewerProps) {
  const renderDivRef = useRef<HTMLDivElement>(null);
  const progressDivRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controllerRef = useRef<any>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [synthReady, setSynthReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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

        if (cancelled || !renderDivRef.current) return;

        // Render notation SVG
        const visualObj = abcjs.renderAbc(renderDivRef.current, abcText, {
          responsive: "resize",
          add_classes: true,
          paddingbottom: 0,
          paddingtop: 0,
        });

        if (!visualObj || !visualObj[0]) {
          setLoadError("Could not parse ABC notation.");
          return;
        }

        if (!abcjs.synth.supportsAudio()) {
          // Score renders but no audio; still show the score
          setSynthReady(false);
          return;
        }

        // Build SynthController (manages timing + sequencing)
        const controller = new abcjs.synth.SynthController();
        controller.load(progressDivRef.current!, null, {
          displayLoop: false,
          displayRestart: false,
          displayPlay: false,
          displayProgress: false,
          displayWarp: false,
        });
        await controller.setTune(visualObj[0], false, {
          onEnded: () => setIsPlaying(false),
        });

        if (cancelled) return;

        controllerRef.current = controller;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abcText]);

  const handlePlay = () => {
    controllerRef.current?.play();
    setIsPlaying(true);
  };

  const handlePause = () => {
    controllerRef.current?.pause();
    setIsPlaying(false);
  };

  const handleStop = () => {
    controllerRef.current?.pause();
    controllerRef.current?.restart();
    setIsPlaying(false);
  };

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
