"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { DEMO_SONGS, type DemoSong } from "@/lib/demoSongs";

// Dynamically imported so abcjs (DOM/Web Audio) never runs on the server
const AbcViewer = dynamic(() => import("@/components/AbcViewer"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse rounded-lg bg-slate-800 min-h-[160px]" />
  ),
});

const DEBOUNCE_MS = 400;

export default function ViewerPage() {
  const [selectedDemo, setSelectedDemo] = useState<DemoSong>(DEMO_SONGS[0]);
  const [editorText, setEditorText] = useState<string>(DEMO_SONGS[0].abc);
  // Changing abcText triggers AbcViewer re-render; incremented key forces full remount
  const [abcText, setAbcText] = useState<string>(DEMO_SONGS[0].abc);
  const [viewerKey, setViewerKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply debounced textarea edits to the live score
  const handleEditorChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setEditorText(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setAbcText(value);
      }, DEBOUNCE_MS);
    },
    [],
  );

  // Load a demo song: update both textarea and live score, remount viewer
  const handleDemoSelect = useCallback((song: DemoSong) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSelectedDemo(song);
    setEditorText(song.abc);
    setAbcText(song.abc);
    setViewerKey((k) => k + 1); // force AbcViewer remount to dispose old synth
  }, []);

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">
          🎵 Sheet Music Viewer
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Select a demo piece, edit the ABC notation, and play it back in the browser.
        </p>
      </div>

      {/* Demo library — horizontal scroll tabs */}
      <div className="flex flex-wrap gap-2">
        <span className="self-center text-xs font-semibold uppercase tracking-widest text-slate-500">
          Demo library:
        </span>
        {DEMO_SONGS.map((song) => (
          <button
            key={song.id}
            type="button"
            onClick={() => handleDemoSelect(song)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors
              ${selectedDemo.id === song.id
                ? "bg-violet-600 text-white"
                : "border border-slate-600 text-slate-400 hover:border-violet-500 hover:text-violet-300"
              }`}
          >
            {song.title}
          </button>
        ))}
      </div>

      {/* Two-column layout: editor left, score right */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* ABC editor */}
        <div className="flex flex-col gap-3">
          <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            ABC Notation
          </label>
          <textarea
            value={editorText}
            onChange={handleEditorChange}
            spellCheck={false}
            rows={16}
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-4 py-3
                       font-mono text-sm text-slate-200 placeholder-slate-600
                       focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            placeholder="Paste ABC notation here…"
          />
          <p className="text-xs text-slate-600">
            Edits update the score after a short pause.{" "}
            <a
              href="https://abcnotation.com/wiki/abc:standard:v2.1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-500 hover:text-violet-400 underline"
            >
              ABC notation reference ↗
            </a>
          </p>
        </div>

        {/* Live score + playback */}
        <div className="flex flex-col gap-3">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Live Score
            <span className="ml-2 text-slate-600 font-normal normal-case tracking-normal">
              — {selectedDemo.title}
              {selectedDemo.composer && ` · ${selectedDemo.composer}`}
            </span>
          </div>
          <AbcViewer key={viewerKey} abcText={abcText} />
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">
        <strong className="text-slate-300">Tip:</strong> This viewer uses{" "}
        <a
          href="https://paulrosen.github.io/abcjs/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-400 hover:text-violet-300 underline"
        >
          abcjs
        </a>{" "}
        for ABC notation. To view a generated MusicXML score from the pipeline, complete a
        conversion job and use the{" "}
        <span className="font-medium text-slate-300">♪ View &amp; Play ▶</span> button on
        the results page.
      </div>
    </div>
  );
}
