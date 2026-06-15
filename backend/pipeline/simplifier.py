"""Difficulty-based simplification of music21 scores.

Produces "easy" and "medium" variants of a fully-generated score so a
music teacher can hand the same transcription to students at different
grade levels.

Rules summary:

  Easy (Grade 1-3):
    - Quarter-note floor (drop notes < 0.5 beats)
    - Single-line: chord -> highest pitch
    - Snap accidentals to detected key signature
    - Octave-fold to a 1-octave window centred on the median pitch

  Medium (Grade 4-6):
    - Eighth-note floor (drop notes < 0.25 beats)
    - Chord -> keep top 2 pitches
    - Preserve accidentals
    - 1.5-octave (~18 semitone) window

  Hard:
    - Original transcription (not produced here; the existing file is reused)

All operations return a NEW Score object — the input is never mutated.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal

logger = logging.getLogger(__name__)

Difficulty = Literal["easy", "medium"]


@dataclass(frozen=True)
class SimplifyConfig:
    """Difficulty-specific knobs.

    duration_floor: minimum quarterLength of any kept note (in quarter notes).
                    Notes shorter than half this are dropped; everything else
                    is rounded up to a multiple of `duration_floor`.
    chord_top_n:    keep this many highest pitches from each chord.
    snap_accidentals: if True, every non-scale pitch is moved to the nearest
                    scale tone in the detected key.
    octave_window:  total semitone range allowed; pitches outside the window
                    centred on the median are octave-folded inward.
    """

    duration_floor: float
    chord_top_n: int
    snap_accidentals: bool
    octave_window: int


CONFIGS: dict[Difficulty, SimplifyConfig] = {
    "easy": SimplifyConfig(
        duration_floor=1.0,
        chord_top_n=1,
        snap_accidentals=True,
        octave_window=12,
    ),
    "medium": SimplifyConfig(
        duration_floor=0.5,
        chord_top_n=2,
        snap_accidentals=False,
        octave_window=18,
    ),
}


def _parse_key(key_signature: str):
    """Parse a key string like 'C major' or 'a minor' into a music21 Key."""
    from music21 import key as m21_key

    parts = key_signature.strip().split()
    tonic = parts[0] if parts else "C"
    mode = (parts[1] if len(parts) > 1 else "major").lower()
    try:
        return m21_key.Key(tonic, mode)
    except Exception:
        logger.warning("Could not parse key '%s'; defaulting to C major", key_signature)
        return m21_key.Key("C", "major")


def _scale_midis(key_obj) -> list[int]:
    """Return MIDI pitch classes (0-11) that belong to the given key."""
    pitch_classes: set[int] = set()
    for p in key_obj.pitches:
        pitch_classes.add(p.midi % 12)
    # music21's Key.pitches returns only one octave; we just want the pcs
    return sorted(pitch_classes)


def _snap_pitch_to_scale(midi: int, scale_pcs: list[int]) -> int:
    """Move `midi` to the nearest MIDI value whose pitch-class is in `scale_pcs`.

    Ties prefer the lower pitch (matches typical voice-leading intuition).
    """
    if midi % 12 in scale_pcs:
        return midi
    best = midi
    best_dist = 99
    for offset in range(-6, 7):
        candidate = midi + offset
        if candidate % 12 in scale_pcs:
            dist = abs(offset)
            # Prefer lower on tie (offset < 0 wins on equal abs)
            if dist < best_dist or (dist == best_dist and offset < 0):
                best = candidate
                best_dist = dist
    return best


def _octave_fold(midi: int, centre: int, window: int) -> int:
    """Move `midi` into [centre - window/2, centre + window/2] via octave shifts."""
    half = window // 2
    while midi > centre + half:
        midi -= 12
    while midi < centre - half:
        midi += 12
    return midi


def _collect_part_elements(part):
    """Yield (offset, element) pairs of all Notes / Chords / Rests in a Part."""
    from music21 import note as m21_note, chord as m21_chord

    for el in part.flatten().notesAndRests:
        if isinstance(el, (m21_note.Note, m21_chord.Chord, m21_note.Rest)):
            yield el.offset, el


def _median_midi(part) -> int:
    """Median MIDI value of all pitches in `part`; defaults to 60 (middle C)."""
    midis: list[int] = []
    for _, el in _collect_part_elements(part):
        if hasattr(el, "pitches"):
            for p in el.pitches:
                midis.append(p.midi)
        elif hasattr(el, "pitch"):
            midis.append(el.pitch.midi)
    if not midis:
        return 60
    midis.sort()
    return midis[len(midis) // 2]


def _round_up_to_grid(value: float, grid: float) -> float:
    """Round `value` UP to the next multiple of `grid` (min one grid step)."""
    if value <= 0:
        return grid
    steps = int(value / grid)
    if abs(value - steps * grid) < 1e-6:
        return steps * grid
    return (steps + 1) * grid


def _simplify_part(part, cfg: SimplifyConfig, key_obj):
    """Build a new Part from `part` applying the difficulty rules."""
    from music21 import (
        stream,
        note as m21_note,
        chord as m21_chord,
        clef as m21_clef,
        instrument as m21_instrument,
        meter as m21_meter,
    )

    new_part = stream.Part()
    if part.partName:
        new_part.partName = part.partName

    # Carry over the part's clef and instrument if present
    for cl in part.recurse().getElementsByClass(m21_clef.Clef):
        new_part.insert(0, cl.__class__())
        break
    for inst in part.recurse().getElementsByClass(m21_instrument.Instrument):
        try:
            new_part.insert(0, inst.__class__())
        except Exception:
            pass
        break

    centre = _median_midi(part)
    scale_pcs = _scale_midis(key_obj) if cfg.snap_accidentals else []

    half_floor = cfg.duration_floor / 2.0
    grid = cfg.duration_floor

    # Walk the part and emit transformed elements onto a quantized grid.
    # We keep a "cursor" offset that advances by `grid`; each input element
    # is rounded UP to the grid and snapped to the next free slot.
    current_offset = 0.0
    last_offset_in_part = 0.0

    for _, el in _collect_part_elements(part):
        try:
            if isinstance(el, m21_note.Rest):
                if el.quarterLength < half_floor:
                    continue  # too short — skip
                new_el = m21_note.Rest()
                new_el.quarterLength = _round_up_to_grid(el.quarterLength, grid)

            elif isinstance(el, m21_chord.Chord):
                if el.quarterLength < half_floor:
                    continue
                # Sort pitches descending, keep top N
                sorted_pitches = sorted(el.pitches, key=lambda p: p.midi, reverse=True)
                top = sorted_pitches[: cfg.chord_top_n]
                # Apply scale snap + octave fold
                transformed_midis: list[int] = []
                for p in top:
                    m = p.midi
                    if cfg.snap_accidentals:
                        m = _snap_pitch_to_scale(m, scale_pcs)
                    m = _octave_fold(m, centre, cfg.octave_window)
                    transformed_midis.append(m)
                # De-dupe (octave-fold can collapse two pitches onto one)
                transformed_midis = sorted(set(transformed_midis), reverse=True)
                if len(transformed_midis) == 1:
                    new_el = m21_note.Note(midi=transformed_midis[0])
                else:
                    new_el = m21_chord.Chord([m21_note.Note(midi=m) for m in transformed_midis])
                new_el.quarterLength = _round_up_to_grid(el.quarterLength, grid)

            elif isinstance(el, m21_note.Note):
                if el.quarterLength < half_floor:
                    continue
                m = el.pitch.midi
                if cfg.snap_accidentals:
                    m = _snap_pitch_to_scale(m, scale_pcs)
                m = _octave_fold(m, centre, cfg.octave_window)
                new_el = m21_note.Note(midi=m)
                new_el.quarterLength = _round_up_to_grid(el.quarterLength, grid)
            else:
                continue

            # Snap offset to grid; never go backwards
            grid_offset = round(el.offset / grid) * grid
            if grid_offset < current_offset:
                grid_offset = current_offset
            new_part.insert(grid_offset, new_el)
            current_offset = grid_offset + new_el.quarterLength
            last_offset_in_part = current_offset

        except Exception as exc:  # noqa: BLE001
            logger.warning("Skipping element at offset %s: %s", el.offset, exc)
            continue

    # Carry the source time signature into the new part BEFORE re-barring.
    # Without it, makeMeasures() defaults to 4/4 and mis-bars 3/4, 6/8, 5/4,
    # etc. in the simplified (easy/medium) variants.
    try:
        src_ts = part.recurse().getElementsByClass(m21_meter.TimeSignature)
        if src_ts:
            new_part.insert(0, m21_meter.TimeSignature(src_ts[0].ratioString))
    except Exception as exc:
        logger.warning("Could not carry source time signature: %s", exc)

    # Re-bar into measures so MusicXML output is clean
    try:
        new_part.makeMeasures(inPlace=True)
    except Exception as exc:
        logger.warning("makeMeasures failed: %s", exc)

    _ = last_offset_in_part  # silence unused-warning; useful for debugging
    return new_part


def simplify_score(score, difficulty: Difficulty, key_signature: str):
    """Produce a new Score simplified for the given difficulty.

    Args:
        score: a music21.stream.Score (typically loaded from the original
            MusicXML the pipeline already produced).
        difficulty: "easy" or "medium". For "hard" the caller should just
            reuse the original score.
        key_signature: detected key from generate_score, e.g. "C major".

    Returns:
        A new music21.stream.Score. Original input is not modified.

    Raises:
        ValueError: if `difficulty` is unknown.
    """
    from music21 import stream, metadata as m21_metadata

    if difficulty not in CONFIGS:
        raise ValueError(
            f"Unknown difficulty {difficulty!r}; expected 'easy' or 'medium'"
        )

    cfg = CONFIGS[difficulty]
    key_obj = _parse_key(key_signature)

    new_score = stream.Score()

    # Carry metadata (title becomes "<original> — Easy" etc.)
    src_title = None
    if score.metadata is not None and score.metadata.title:
        src_title = score.metadata.title
    new_score.metadata = m21_metadata.Metadata()
    new_score.metadata.title = (
        f"{src_title} — {difficulty.title()}" if src_title else difficulty.title()
    )

    parts = list(score.parts) if score.parts else [score]
    for part in parts:
        try:
            new_part = _simplify_part(part, cfg, key_obj)
            new_score.append(new_part)
        except Exception as exc:
            logger.warning(
                "Failed to simplify part %r at %s difficulty: %s",
                getattr(part, "partName", "?"), difficulty, exc,
            )

    return new_score
