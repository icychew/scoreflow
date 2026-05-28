/**
 * MusicXML mutation helpers for the inline score editor.
 *
 * All functions are pure: they take a MusicXML string + note index +
 * params and return a new string. The original is never modified.
 *
 * "Note index" = the zero-based position of a `<note>` element in
 * document order — the same order OSMD renders them on screen, so the
 * frontend can map a clicked SVG element to a source note by attaching
 * `data-note-index="N"` to each rendered `.vf-stavenote`.
 *
 * Chord notes (multiple noteheads on a single stave entry) each get
 * their own `<note>` element in the source, so they each get their own
 * index too. That matches OSMD's rendering — clicking the top notehead
 * of a chord targets a different `<note>` from the bottom notehead.
 */

// ── MIDI ↔ (step, alter, octave) ────────────────────────────────────────────

const STEP_TO_PC: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

// Prefer sharp spelling for accidental MIDI numbers. Flat spelling could
// be smarter (key-aware) but keep v1 conservative; users can still type
// accidentals by hand if they care about enharmonic spelling.
const PC_TO_SPELLING: Array<{ step: string; alter: 0 | 1 }> = [
  { step: "C", alter: 0 },
  { step: "C", alter: 1 },
  { step: "D", alter: 0 },
  { step: "D", alter: 1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "F", alter: 1 },
  { step: "G", alter: 0 },
  { step: "G", alter: 1 },
  { step: "A", alter: 0 },
  { step: "A", alter: 1 },
  { step: "B", alter: 0 },
];

/** Convert MusicXML pitch components to a MIDI number (0-127). */
function pitchToMidi(step: string, alter: number, octave: number): number {
  const pc = STEP_TO_PC[step.toUpperCase()] ?? 0;
  return (octave + 1) * 12 + pc + alter;
}

/** Convert MIDI 0-127 back to MusicXML pitch components. */
function midiToPitch(midi: number): { step: string; alter: 0 | 1; octave: number } {
  const clamped = Math.max(0, Math.min(127, midi));
  const octave = Math.floor(clamped / 12) - 1;
  const spelling = PC_TO_SPELLING[clamped % 12];
  return { step: spelling.step, alter: spelling.alter, octave };
}

// ── XML parsing helpers ─────────────────────────────────────────────────────

function parse(xml: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  // Browsers stuff <parsererror> into the result instead of throwing
  const err = doc.querySelector("parsererror");
  if (err) throw new Error(`Invalid MusicXML: ${err.textContent ?? "parse error"}`);
  return doc;
}

function serialize(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

/** Find the Nth `<note>` element in document order. */
function getNoteByIndex(doc: Document, index: number): Element | null {
  const notes = doc.getElementsByTagName("note");
  return notes.item(index);
}

/** Return the (step, alter, octave) of a `<note>`, or null if it's a rest. */
function readPitch(noteEl: Element): { step: string; alter: number; octave: number } | null {
  const pitch = noteEl.getElementsByTagName("pitch")[0];
  if (!pitch) return null;
  const step = pitch.getElementsByTagName("step")[0]?.textContent ?? "C";
  const alterText = pitch.getElementsByTagName("alter")[0]?.textContent;
  const alter = alterText ? Number(alterText) : 0;
  const octaveText = pitch.getElementsByTagName("octave")[0]?.textContent ?? "4";
  const octave = Number(octaveText);
  return { step, alter, octave };
}

/** Replace a `<note>`'s pitch fields with new (step, alter, octave). */
function writePitch(noteEl: Element, step: string, alter: 0 | 1, octave: number): void {
  let pitch = noteEl.getElementsByTagName("pitch")[0];
  const doc = noteEl.ownerDocument;
  if (!pitch) {
    // Note was a rest — convert to a pitched note by adding a <pitch> child
    // and removing the <rest/>.
    const rest = noteEl.getElementsByTagName("rest")[0];
    if (rest) rest.remove();
    pitch = doc.createElement("pitch");
    // Insert pitch as the first child of note (MusicXML schema order matters)
    noteEl.insertBefore(pitch, noteEl.firstChild);
  }
  // Wipe + rewrite children of <pitch>
  while (pitch.firstChild) pitch.removeChild(pitch.firstChild);
  const stepEl = doc.createElement("step");
  stepEl.textContent = step;
  pitch.appendChild(stepEl);
  if (alter !== 0) {
    const alterEl = doc.createElement("alter");
    alterEl.textContent = String(alter);
    pitch.appendChild(alterEl);
  }
  const octEl = doc.createElement("octave");
  octEl.textContent = String(octave);
  pitch.appendChild(octEl);
}

// ── Public operations ──────────────────────────────────────────────────────

/**
 * Shift the pitch of the note at `index` by `delta` semitones.
 * If the note is a rest, returns the input unchanged.
 * Clamps result to the MIDI 0-127 range.
 */
export function shiftPitchSemitones(
  xml: string,
  index: number,
  delta: number,
): string {
  const doc = parse(xml);
  const note = getNoteByIndex(doc, index);
  if (!note) throw new Error(`No note at index ${index}`);

  const cur = readPitch(note);
  if (cur === null) return xml; // rest — nothing to shift

  const midi = pitchToMidi(cur.step, cur.alter, cur.octave) + delta;
  const next = midiToPitch(midi);
  writePitch(note, next.step, next.alter, next.octave);

  return serialize(doc);
}

/**
 * Replace the note at `index` with a rest of the same duration.
 * If the note is already a rest, returns the input unchanged.
 */
export function convertNoteToRest(xml: string, index: number): string {
  const doc = parse(xml);
  const note = getNoteByIndex(doc, index);
  if (!note) throw new Error(`No note at index ${index}`);

  // Already a rest?
  if (note.getElementsByTagName("rest").length > 0) return xml;

  // Remove all <pitch> (chord notes have one each)
  const pitches = Array.from(note.getElementsByTagName("pitch"));
  for (const p of pitches) p.remove();
  // Remove any <accidental> that may be leftover (purely visual)
  const accidentals = Array.from(note.getElementsByTagName("accidental"));
  for (const a of accidentals) a.remove();
  // Remove <chord/> if present — rests can't be in chords
  const chord = note.getElementsByTagName("chord")[0];
  if (chord) chord.remove();

  // Add <rest/> as the first child (MusicXML schema places it before duration)
  const rest = note.ownerDocument.createElement("rest");
  note.insertBefore(rest, note.firstChild);

  return serialize(doc);
}

/**
 * Returns the count of `<note>` elements in the given MusicXML.
 * Used by the frontend to validate it has the right number of SVG note
 * elements to bind data-note-index to.
 */
export function countNotes(xml: string): number {
  try {
    const doc = parse(xml);
    return doc.getElementsByTagName("note").length;
  } catch {
    return 0;
  }
}
