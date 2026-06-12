"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { downloadUrl, NGROK_HEADERS, originalAudioUrl, type Difficulty } from "@/lib/api";
import { shiftPitchSemitones, convertNoteToRest } from "@/lib/scoreEditor";
import { useMixTimeSource } from "@/components/UnifiedPlayer";

type PlaybackMode = "synth" | "original" | "mix";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface MusicXmlViewerProps {
  jobId: string;
  stem: string;
  /** Whether the backend generated a MIDI file for this stem */
  hasMidi: boolean;
  /** Share token, propagated to /score links so shared viewers can open the PDF view */
  shareToken?: string;
  /** Which difficulty variant to fetch. Defaults to "hard" (original transcription). */
  difficulty?: Difficulty;
  /**
   * If true, hides the Edit / Save / Revert controls. Used by the public
   * `/share/[token]` viewer so recipients can't modify someone else's score.
   * The backend has no auth, so this is purely a UI gate — power users with
   * the job_id could still hit the PUT endpoint directly.
   */
  readOnly?: boolean;
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

/**
 * Resolve the Tone.js namespace, handling both ESM (named exports at top
 * level) and CJS-interop (everything wrapped in `default`) shapes. In the
 * production Turbopack build Tone.js comes through as `{ default: { ... } }`,
 * which is why `Tone.start` was undefined → "t.start is not a function".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadTone(): Promise<any> {
  const mod = await import("tone");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = mod as any;
  if (typeof m.start === "function") return m;
  if (m.default && typeof m.default.start === "function") return m.default;
  throw new Error("Tone.js loaded but `start` function not found on the module.");
}

export default function MusicXmlViewer({
  jobId,
  stem,
  hasMidi,
  shareToken,
  difficulty = "hard",
  readOnly = false,
}: MusicXmlViewerProps) {
  const diffQuery = difficulty === "hard" ? "" : `&difficulty=${difficulty}`;
  const scoreUrl = shareToken
    ? `/score/${jobId}/${stem}?print=1&token=${encodeURIComponent(shareToken)}${diffQuery}`
    : `/score/${jobId}/${stem}?print=1${diffQuery}`;
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
  // Cursor sync: rAF loop that advances OSMD's cursor in time with Tone playback
  const rafIdRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  // Original-audio mode: <audio> element drives playback + cursor
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const playbackModeRef = useRef<PlaybackMode>("synth");
  // Live tempo readable from the rAF closure (which captures values at start)
  const tempoBpmRef = useRef<number>(120);
  // Editor state — kept in refs alongside React state because the document
  // keydown handler is registered once and needs to read the latest values.
  const currentXmlRef = useRef<string>("");
  const selectedNoteIndexRef = useRef<number | null>(null);
  const isEditModeRef = useRef(false);

  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [midiReady, setMidiReady] = useState(false);
  const [tempoBpm, setTempoBpm] = useState<number>(DEFAULT_BPM);
  const [transpose, setTranspose] = useState(0);
  // Has the user manually moved the tempo slider? (If not, use the MIDI's native BPM.)
  const [tempoTouched, setTempoTouched] = useState(false);
  // Editor state
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedNoteIndex, setSelectedNoteIndex] = useState<number | null>(null);
  const [selectedNoteLabel, setSelectedNoteLabel] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);
  const [isEditedOnDisk, setIsEditedOnDisk] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Playback source: "synth" = Tone.js MIDI playback, "original" = raw audio,
  // "mix" = subscribe to the parent UnifiedPlayer's time source (cursor follows
  // the multi-stem mix being played in ResultsPanel above).
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("synth");
  // Whether the backend has the original audio for this job. Falsy → Original
  // pill is disabled with an explanatory tooltip.
  const [audioAvailable, setAudioAvailable] = useState(false);
  // Pulled from React context; non-null when this viewer is nested inside a
  // UnifiedPlayer. When null, the Mix pill is hidden entirely.
  const mixTimeSource = useMixTimeSource();

  useEffect(() => {
    transposeRef.current = transpose;
  }, [transpose]);

  useEffect(() => {
    isEditModeRef.current = isEditMode;
  }, [isEditMode]);

  useEffect(() => {
    selectedNoteIndexRef.current = selectedNoteIndex;
  }, [selectedNoteIndex]);

  useEffect(() => {
    playbackModeRef.current = playbackMode;
  }, [playbackMode]);

  // In "mix" mode the cursor sync runs continuously, following the
  // UnifiedPlayer's clock without needing a local Play press. Resets to bar 1
  // when the UnifiedPlayer is stopped (time=0 and not playing).
  useEffect(() => {
    if (playbackMode !== "mix" || !mixTimeSource) return;
    isPlayingRef.current = true; // unlocks the rAF tick loop
    try { osmdRef.current?.cursor?.show(); } catch { /* ignore */ }

    let lastIsPlaying = false;
    const tick = () => {
      if (playbackModeRef.current !== "mix") return;
      try {
        const seconds = mixTimeSource.getTime();
        const playing = mixTimeSource.isPlaying();

        // When the mix-player transitions from "playing" → "stopped" AND time
        // is 0, reset the cursor so the next Play starts from the top.
        if (lastIsPlaying && !playing && seconds < 0.05) {
          try { osmdRef.current?.cursor?.reset(); } catch { /* ignore */ }
        }
        lastIsPlaying = playing;

        const bpm = tempoBpmRef.current;
        const beat = (seconds * bpm) / 60;
        const osmd = osmdRef.current;
        const iter = osmd?.cursor?.iterator;
        let safety = 0;
        while (
          iter &&
          !iter.endReached &&
          iter.currentTimeStamp &&
          iter.currentTimeStamp.RealValue * 4 < beat &&
          safety++ < 512
        ) {
          osmd.cursor.next();
        }
      } catch { /* ignore */ }
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      isPlayingRef.current = false;
    };
  }, [playbackMode, mixTimeSource]);

  // Probe whether the backend has the original audio for this job. HEAD is
  // cheap; gates the Original toggle without downloading the file.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(originalAudioUrl(jobId), {
          method: "HEAD",
          headers: NGROK_HEADERS,
        });
        if (!cancelled) setAudioAvailable(res.ok);
      } catch {
        if (!cancelled) setAudioAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  /**
   * Time-source closure for cursor sync. Returns the current playback
   * position in seconds — reads from `<audio>.currentTime` in original mode,
   * `Tone.getTransport().seconds` in synth mode. Returns 0 when nothing is
   * playing or refs aren't initialised yet.
   */
  function getCurrentSeconds(): number {
    if (playbackModeRef.current === "mix") {
      // Subscribe to the parent UnifiedPlayer's clock
      return mixTimeSource?.getTime() ?? 0;
    }
    if (playbackModeRef.current === "original") {
      const el = audioElementRef.current;
      return el ? el.currentTime : 0;
    }
    const tone = toneModuleRef.current;
    if (!tone) return 0;
    try {
      return tone.getTransport().seconds;
    } catch {
      return 0;
    }
  }

  /**
   * After OSMD renders, walk the SVG and attach `data-note-index` to each
   * `.vf-notehead` so click events can be mapped back to source `<note>`
   * elements in document order. VexFlow renders one notehead per chord
   * member in source-document order, so the index lines up 1:1 with the
   * MusicXML `<note>` element index.
   */
  function attachNoteIndexAttrs() {
    const container = osmdContainerRef.current;
    if (!container) return;
    const noteheads = container.querySelectorAll<SVGElement>(".vf-notehead");
    noteheads.forEach((el, idx) => {
      el.setAttribute("data-note-index", String(idx));
      el.style.cursor = isEditModeRef.current ? "pointer" : "";
    });
  }

  /** Visually highlight the currently-selected notehead via CSS class. */
  function refreshSelectionHighlight(index: number | null) {
    const container = osmdContainerRef.current;
    if (!container) return;
    container.querySelectorAll(".songscore-note-selected").forEach((el) => {
      el.classList.remove("songscore-note-selected");
    });
    if (index === null) return;
    const el = container.querySelector<SVGElement>(
      `.vf-notehead[data-note-index="${index}"]`,
    );
    el?.classList.add("songscore-note-selected");
  }

  /** Compute a human label like "C4" for the selected note in the current XML. */
  function computeNoteLabel(xml: string, index: number): string {
    try {
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      const note = doc.getElementsByTagName("note").item(index);
      if (!note) return "—";
      if (note.getElementsByTagName("rest").length > 0) return "rest";
      const pitch = note.getElementsByTagName("pitch")[0];
      if (!pitch) return "—";
      const step = pitch.getElementsByTagName("step")[0]?.textContent ?? "?";
      const alter = Number(pitch.getElementsByTagName("alter")[0]?.textContent ?? "0");
      const octave = pitch.getElementsByTagName("octave")[0]?.textContent ?? "?";
      const accidental = alter === 1 ? "♯" : alter === -1 ? "♭" : "";
      return `${step}${accidental}${octave}`;
    } catch {
      return "—";
    }
  }

  /** Re-load OSMD with a new MusicXML string. Re-attaches note indices. */
  const reloadFromXml = useCallback(async (xml: string) => {
    const osmd = osmdRef.current;
    if (!osmd) return;
    try {
      await osmd.load(xml);
      osmd.render();
      attachNoteIndexAttrs();
      refreshSelectionHighlight(selectedNoteIndexRef.current);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Could not re-render score", { description: msg });
    }
  }, []);

  // Live tempo control — applies even during playback. Mode-aware:
  //   synth    → Tone.Transport BPM (time-stretches the synth)
  //   original → audio.playbackRate (time-stretches AND pitch-shifts; UI
  //              advertises this trade-off when in original mode)
  useEffect(() => {
    tempoBpmRef.current = tempoBpm;
    if (playbackMode === "original") {
      const el = audioElementRef.current;
      if (el) el.playbackRate = tempoBpm / DEFAULT_BPM;
    } else if (toneModuleRef.current) {
      try {
        toneModuleRef.current.getTransport().bpm.value = tempoBpm;
      } catch { /* ignore */ }
    }
  }, [tempoBpm, playbackMode]);

  // Load MusicXML (and optionally MIDI) on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const xmlRes = await fetch(downloadUrl(jobId, stem, "musicxml", difficulty), {
          headers: NGROK_HEADERS,
        });
        if (!xmlRes.ok) throw new Error(`MusicXML fetch failed: HTTP ${xmlRes.status}`);
        const xmlText = await xmlRes.text();

        if (cancelled) return;

        // Stash the canonical XML for the editor to mutate
        currentXmlRef.current = xmlText;
        setIsDirty(false);

        // Ask the backend if this stem already has an edited version on disk.
        // Used to show the "Revert to AI" button. Edited content was already
        // baked into xmlText by the download endpoint, so this only affects UI.
        // Only relevant on the "hard" difficulty since edits live there.
        if (difficulty === "hard") {
          try {
            const editsRes = await fetch(`${API_URL}/api/jobs/${jobId}/edits`, {
              headers: NGROK_HEADERS,
            });
            if (editsRes.ok && !cancelled) {
              const data = (await editsRes.json()) as { edited: string[] };
              setIsEditedOnDisk(data.edited.includes(stem));
            }
          } catch { /* non-fatal — just won't show Revert button */ }
        } else {
          setIsEditedOnDisk(false);
        }

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

        // Editor: tag each notehead with its source-document index so click
        // events can be mapped to MusicXML `<note>` elements.
        attachNoteIndexAttrs();

        // Cursor is part of OSMD; show it parked at the start. It only
        // moves while playback is active.
        try {
          osmd.cursor.show();
          osmd.cursor.reset();
        } catch { /* OSMD cursor unavailable on this score — ignore */ }

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
      // Stop the cursor-sync loop in case Play was active when difficulty changed
      isPlayingRef.current = false;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      // Tear down the original-audio element (releases the file handle)
      if (audioElementRef.current) {
        try { audioElementRef.current.pause(); } catch { /* ignore */ }
        audioElementRef.current.src = "";
        audioElementRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, stem, hasMidi, difficulty]);

  // ── Editor: click + keyboard handlers ───────────────────────────────────

  /** Click anywhere in the score container; if it lands on a notehead, select. */
  useEffect(() => {
    const container = osmdContainerRef.current;
    if (!container) return;
    const onClick = (e: MouseEvent) => {
      if (!isEditModeRef.current) return;
      const target = e.target as Element | null;
      const notehead = target?.closest?.(".vf-notehead") as SVGElement | null;
      if (!notehead) {
        // Click on empty score area → deselect
        setSelectedNoteIndex(null);
        setSelectedNoteLabel("");
        refreshSelectionHighlight(null);
        return;
      }
      const idxStr = notehead.getAttribute("data-note-index");
      if (idxStr === null) return;
      const idx = Number(idxStr);
      setSelectedNoteIndex(idx);
      setSelectedNoteLabel(computeNoteLabel(currentXmlRef.current, idx));
      refreshSelectionHighlight(idx);
    };
    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, []);

  /** Document keydown — only acts when in edit mode with a selection. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isEditModeRef.current) return;
      const idx = selectedNoteIndexRef.current;
      if (idx === null) {
        if (e.key === "Escape") setIsEditMode(false);
        return;
      }

      // Avoid hijacking keys when the user is typing in an input/textarea
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      let delta = 0;
      let toRest = false;
      let close = false;
      switch (e.key) {
        case "ArrowUp":
          delta = e.shiftKey ? 12 : 1;
          break;
        case "ArrowDown":
          delta = e.shiftKey ? -12 : -1;
          break;
        case "Delete":
        case "Backspace":
          toRest = true;
          break;
        case "Escape":
          close = true;
          break;
        default:
          return;
      }
      e.preventDefault();

      if (close) {
        setSelectedNoteIndex(null);
        setSelectedNoteLabel("");
        refreshSelectionHighlight(null);
        return;
      }

      try {
        const newXml = toRest
          ? convertNoteToRest(currentXmlRef.current, idx)
          : shiftPitchSemitones(currentXmlRef.current, idx, delta);
        currentXmlRef.current = newXml;
        setIsDirty(true);
        setSelectedNoteLabel(computeNoteLabel(newXml, idx));
        // Re-render OSMD asynchronously; selection highlight will reapply
        void reloadFromXml(newXml);
      } catch (err) {
        toast.error("Could not edit note", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [reloadFromXml]);

  // ── Editor: save / revert ───────────────────────────────────────────────

  const handleSaveEdits = useCallback(async () => {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/jobs/${jobId}/score/${stem}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/xml",
          ...NGROK_HEADERS,
        },
        body: currentXmlRef.current,
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(errBody || `HTTP ${res.status}`);
      }
      setIsDirty(false);
      setIsEditedOnDisk(true);
      toast.success("Edits saved", {
        description: "All future downloads will use your edited version.",
      });
    } catch (err) {
      toast.error("Could not save edits", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsSaving(false);
    }
  }, [jobId, stem, isDirty, isSaving]);

  const handleRevertEdits = useCallback(async () => {
    if (!confirm(
      "Discard your edits to this stem and revert to the AI-generated " +
      "version? This cannot be undone.",
    )) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/jobs/${jobId}/score/${stem}/edited`, {
        method: "DELETE",
        headers: NGROK_HEADERS,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setIsEditedOnDisk(false);
      setIsDirty(false);
      setSelectedNoteIndex(null);
      setSelectedNoteLabel("");
      // Re-fetch the AI version and re-render
      const xmlRes = await fetch(
        downloadUrl(jobId, stem, "musicxml", difficulty),
        { headers: NGROK_HEADERS },
      );
      if (xmlRes.ok) {
        const xml = await xmlRes.text();
        currentXmlRef.current = xml;
        await reloadFromXml(xml);
      }
      toast.success("Reverted to AI version");
    } catch (err) {
      toast.error("Could not revert", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsSaving(false);
    }
  }, [jobId, stem, difficulty, reloadFromXml]);

  /** Toggle edit mode on/off. Clears selection when exiting. */
  const handleToggleEditMode = useCallback(() => {
    setIsEditMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedNoteIndex(null);
        setSelectedNoteLabel("");
        refreshSelectionHighlight(null);
      }
      // Update cursor style on noteheads
      requestAnimationFrame(() => attachNoteIndexAttrs());
      return next;
    });
  }, []);

  /** Advance OSMD's cursor on every animation frame to match Tone.Transport time. */
  function startCursorSync() {
    const osmd = osmdRef.current;
    if (!osmd) return;
    isPlayingRef.current = true;
    try { osmd.cursor.show(); osmd.cursor.reset(); } catch { /* ignore */ }

    const tick = () => {
      if (!isPlayingRef.current) return;
      try {
        // Time source comes from the active playback mode (synth → Tone,
        // original → <audio>). getCurrentSeconds returns 0 if neither is
        // ready, which leaves the cursor parked — safe.
        const seconds = getCurrentSeconds();
        const bpm = tempoBpmRef.current;
        // Quarter-note position from elapsed time
        const beat = (seconds * bpm) / 60;
        const iter = osmd.cursor.iterator;
        // Advance until the cursor's RealValue is >= current beat
        // (RealValue is in whole notes; multiply by 4 to compare in quarters)
        let safety = 0;
        while (
          iter &&
          !iter.endReached &&
          iter.currentTimeStamp &&
          iter.currentTimeStamp.RealValue * 4 < beat &&
          safety++ < 512
        ) {
          osmd.cursor.next();
        }
      } catch { /* ignore — cursor might not be available on every score */ }
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
  }

  function stopCursorSync(reset = false) {
    isPlayingRef.current = false;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (reset) {
      try { osmdRef.current?.cursor?.reset(); } catch { /* ignore */ }
    }
  }

  function clearPlayTimer() {
    if (playTimerRef.current !== null) {
      clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
  }

  /** Get or create the singleton <audio> element used in Original mode. */
  function ensureAudioElement(): HTMLAudioElement {
    if (audioElementRef.current) return audioElementRef.current;
    const el = new Audio();
    el.src = originalAudioUrl(jobId);
    el.preload = "auto";
    // When the audio finishes naturally, also reset cursor + state
    el.addEventListener("ended", () => {
      stopCursorSync(true);
      setIsPlaying(false);
    });
    audioElementRef.current = el;
    return el;
  }

  /** Play the user's original uploaded audio. Drives cursor via audio.currentTime. */
  const handlePlayOriginal = async () => {
    clearPlayTimer();
    setPlayError(null);
    try {
      // Stop any synth playback so the two time sources don't fight
      if (toneModuleRef.current) {
        try { toneModuleRef.current.getTransport().stop(); } catch { /* ignore */ }
        try { toneModuleRef.current.getTransport().cancel(); } catch { /* ignore */ }
      }

      const el = ensureAudioElement();
      el.playbackRate = tempoBpm / DEFAULT_BPM;
      await el.play();
      setIsPlaying(true);
      startCursorSync();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPlayError(msg);
      setIsPlaying(false);
    }
  };

  const handlePlay = async () => {
    if (playbackMode === "original") return handlePlayOriginal();
    if (!midiBufferRef.current) return;
    clearPlayTimer();
    setPlayError(null);
    try {
      const [Tone, { Midi }] = await Promise.all([
        loadTone(),
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
      startCursorSync();

      // Auto-reset playing state when playback ends — scaled by tempo
      const headerBpm = midi.header.tempos[0]?.bpm ?? DEFAULT_BPM;
      const tempoRatio = headerBpm / tempoBpm; // <1 means we're playing faster
      const totalDuration = allNotes.reduce(
        (max, n) => Math.max(max, n.time + n.duration),
        0,
      );
      playTimerRef.current = setTimeout(() => {
        playTimerRef.current = null;
        stopCursorSync(true);
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
    stopCursorSync(false);
    if (playbackMode === "original") {
      try { audioElementRef.current?.pause(); } catch { /* ignore */ }
    } else {
      try {
        const Tone = await loadTone();
        Tone.getTransport().pause();
      } catch { /* ignore */ }
    }
    setIsPlaying(false);
  };

  const handleStop = async () => {
    clearPlayTimer();
    stopCursorSync(true);
    if (playbackMode === "original") {
      const el = audioElementRef.current;
      if (el) {
        try { el.pause(); el.currentTime = 0; } catch { /* ignore */ }
      }
    } else {
      try {
        const Tone = await loadTone();
        Tone.getTransport().stop();
        Tone.getTransport().cancel();
      } catch { /* ignore */ }
      try { synthRef.current?.dispose(); } catch { /* ignore */ }
      synthRef.current = null;
      try { partRef.current?.dispose(); } catch { /* ignore */ }
      partRef.current = null;
    }
    setIsPlaying(false);
  };

  /** Switch between Synth and Original. Stops playback first to avoid
      two time sources advancing the cursor simultaneously. */
  const handleSetPlaybackMode = useCallback(async (mode: PlaybackMode) => {
    if (mode === playbackMode) return;
    if (isPlaying) await handleStop();
    setPlaybackMode(mode);
  }, [playbackMode, isPlaying]);

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
          (when MIDI is available) playback controls + editor controls. */}
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

          {/* Editor — only on the "hard" (canonical) difficulty + non-read-only */}
          {difficulty === "hard" && !readOnly && (
            <>
              <button
                type="button"
                onClick={handleToggleEditMode}
                aria-pressed={isEditMode}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-50 ${
                  isEditMode
                    ? "bg-violet-700 text-white hover:bg-violet-600"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {isEditMode ? "✏️ Done editing" : "✏️ Edit notes"}
              </button>
              {isEditedOnDisk && !isDirty && (
                <span className="text-xs font-medium text-violet-700">
                  ✓ Edited
                </span>
              )}
              {isDirty && (
                <span className="text-xs font-medium text-amber-700">
                  • Unsaved changes
                </span>
              )}
              {isDirty && (
                <button
                  type="button"
                  onClick={handleSaveEdits}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-50"
                >
                  {isSaving ? "Saving…" : "💾 Save edits"}
                </button>
              )}
              {(isEditedOnDisk || isDirty) && (
                <button
                  type="button"
                  onClick={handleRevertEdits}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-50"
                >
                  ↺ Revert to AI
                </button>
              )}
            </>
          )}

          {/* Selected-note status row (only in edit mode + non-read-only) */}
          {isEditMode && !readOnly && (
            <div className="basis-full -mb-1 -mt-1 flex items-center gap-2 rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs text-violet-900">
              {selectedNoteIndex === null ? (
                <span>
                  <strong>Click a note</strong> on the score to select it. Then use
                  ↑/↓ to shift pitch, Shift+↑/↓ to shift an octave, Delete to make
                  it a rest, Esc to deselect.
                </span>
              ) : (
                <span>
                  Selected: <strong>{selectedNoteLabel}</strong>
                  <span className="text-violet-700/70 ml-2">
                    ↑/↓ pitch · Shift+↑/↓ octave · Del → rest · Esc to close
                  </span>
                </span>
              )}
            </div>
          )}

          {hasMidi && midiReady && (
          <>
          {/* Source: Synth ↔ Original. Sits in front of the transport so
              users see it before pressing Play. */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Source:</span>
            <div className="flex rounded-md border border-slate-300 bg-white p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => handleSetPlaybackMode("synth")}
                aria-pressed={playbackMode === "synth"}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                  playbackMode === "synth"
                    ? "bg-violet-700 text-white"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                Synth
              </button>
              <button
                type="button"
                onClick={() => handleSetPlaybackMode("original")}
                aria-pressed={playbackMode === "original"}
                disabled={!audioAvailable}
                title={
                  audioAvailable
                    ? "Play the original recording with the cursor following along"
                    : "Original audio not available for this job (uploaded before audio serving was added)"
                }
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-40 disabled:cursor-not-allowed ${
                  playbackMode === "original"
                    ? "bg-violet-700 text-white"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                Original 🎙
              </button>
              {/* Mix pill — only visible when a UnifiedPlayer is mounted above */}
              {mixTimeSource && (
                <button
                  type="button"
                  onClick={() => handleSetPlaybackMode("mix")}
                  aria-pressed={playbackMode === "mix"}
                  title="Follow the Mix Player above (cursor syncs with the multi-stem mix)"
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                    playbackMode === "mix"
                      ? "bg-violet-700 text-white"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                >
                  Mix 🎚
                </button>
              )}
            </div>
            {playbackMode === "mix" && (
              <span className="text-xs text-slate-500 italic">
                Press ▶ on the Mix Player above
              </span>
            )}
          </div>

          {/* Transport — hidden in mix mode (the UnifiedPlayer drives it) */}
          {playbackMode !== "mix" && (
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
          )}

          {/* Tempo */}
          <label className="flex items-center gap-2 min-w-[200px] flex-1">
            <span className="text-xs font-medium text-slate-500">
              {playbackMode === "original" ? "Tempo (pitch shifts)" : "Tempo"}
            </span>
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

          {/* Transpose — disabled in original mode (can't transpose recorded audio) */}
          <div
            className="flex items-center gap-2"
            title={
              playbackMode === "original"
                ? "Transpose only works with the Synth source — recorded audio can't be transposed"
                : undefined
            }
          >
            <span className="text-xs font-medium text-slate-500">Key</span>
            <button
              type="button"
              onClick={() => setTranspose((t) => Math.max(MIN_TRANSPOSE, t - 1))}
              disabled={transpose <= MIN_TRANSPOSE || playbackMode === "original" || playbackMode === "mix"}
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
              disabled={transpose >= MAX_TRANSPOSE || playbackMode === "original" || playbackMode === "mix"}
              aria-label="Transpose up one semitone"
              className="rounded-md border border-slate-300 bg-white w-7 h-7 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              +
            </button>
            {transpose !== 0 && playbackMode !== "original" && (
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
