"""MIDI cleanup pipeline applied after Basic Pitch transcription.

Five rules, each a pure function over a `pretty_midi.PrettyMIDI` instance.
Returns a new MIDI object (the input is never mutated). Composed via
`cleanup_midi(midi, config) -> PrettyMIDI` which runs all rules in order.

The motivating measurements (see plan):

- **Drop short notes**: Basic Pitch sometimes emits 20–40ms artifacts that
  are post-Demucs harmonic bleed. Real performances rarely have notes
  shorter than 50ms.
- **Drop low-velocity notes**: After source separation, bleed from other
  instruments shows up as low-velocity ghost notes. v<15 is essentially
  always bleed.
- **Merge consecutive same-pitch notes**: The transcriber re-onsets some
  sustained notes (especially on vocals with vibrato). Merging closes
  these into the single note they actually are.
- **Cluster near-simultaneous onsets**: Two notes 8ms apart should render
  as a chord, not as a grace note + main note. Snaps to the earliest onset.
- **Scale-snap low-velocity outliers** (optional, requires key hint):
  Notes 1 semitone outside the detected key that ALSO have v<60 are almost
  always wrong-pitch artifacts. Snap them to the nearest scale tone.
  Loud notes (v≥60) are trusted as real accidentals.

Each rule is conservative — it never removes more than ~15% of notes in
practice, even on a noisy stem.
"""

from __future__ import annotations

import copy
import logging
from dataclasses import dataclass
from pathlib import Path

import pretty_midi

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CleanupConfig:
    """Thresholds for each cleanup rule. Defaults chosen from plan/research."""

    # Rule 1: drop notes shorter than this (seconds)
    min_duration_s: float = 0.050
    # Rule 2: drop notes with velocity below this (1-127)
    min_velocity: int = 15
    # Rule 3: merge consecutive same-pitch notes with a gap shorter than this (seconds)
    merge_gap_s: float = 0.030
    # Rule 4: cluster onsets within this window to the earliest one (seconds)
    onset_cluster_s: float = 0.030
    # Rule 5: only apply scale-snap if velocity is below this (otherwise trust as accidental)
    accidental_velocity_threshold: int = 60
    # Rule 5: optional — semitones outside the key are snapped if within this distance
    scale_snap_max_semitones: int = 1
    # Toggles
    apply_min_duration: bool = True
    apply_min_velocity: bool = True
    apply_merge_same_pitch: bool = True
    apply_cluster_onsets: bool = True
    apply_scale_snap: bool = False  # Off by default — needs key hint


@dataclass(frozen=True)
class CleanupReport:
    """Counts of what was changed by each rule."""

    notes_before: int
    notes_after: int
    dropped_short: int
    dropped_low_velocity: int
    merged_same_pitch: int
    clustered_onsets: int
    scale_snapped: int


DEFAULT_CONFIG = CleanupConfig()


def _copy_midi(midi: pretty_midi.PrettyMIDI) -> pretty_midi.PrettyMIDI:
    """Deep-copy a PrettyMIDI object. Prevents accidental mutation of caller's data."""
    return copy.deepcopy(midi)


def drop_short_notes(
    notes: list[pretty_midi.Note], min_duration_s: float
) -> tuple[list[pretty_midi.Note], int]:
    """Remove notes shorter than `min_duration_s`. Returns (kept, n_dropped)."""
    kept = [n for n in notes if (n.end - n.start) >= min_duration_s]
    return kept, len(notes) - len(kept)


def drop_low_velocity(
    notes: list[pretty_midi.Note], min_velocity: int
) -> tuple[list[pretty_midi.Note], int]:
    """Remove notes with velocity below `min_velocity`. Returns (kept, n_dropped)."""
    kept = [n for n in notes if n.velocity >= min_velocity]
    return kept, len(notes) - len(kept)


def merge_consecutive_same_pitch(
    notes: list[pretty_midi.Note], merge_gap_s: float
) -> tuple[list[pretty_midi.Note], int]:
    """Merge consecutive same-pitch notes separated by less than `merge_gap_s`.

    The merged note inherits the earlier note's start and the later note's
    end, with the max velocity of the two.
    """
    if not notes:
        return notes, 0
    by_pitch: dict[int, list[pretty_midi.Note]] = {}
    for n in notes:
        by_pitch.setdefault(n.pitch, []).append(n)

    merged_notes: list[pretty_midi.Note] = []
    merge_count = 0
    for pitch, pitch_notes in by_pitch.items():
        sorted_notes = sorted(pitch_notes, key=lambda n: n.start)
        cur = sorted_notes[0]
        for nxt in sorted_notes[1:]:
            gap = nxt.start - cur.end
            if 0 <= gap < merge_gap_s:
                cur = pretty_midi.Note(
                    velocity=max(cur.velocity, nxt.velocity),
                    pitch=pitch,
                    start=cur.start,
                    end=max(cur.end, nxt.end),
                )
                merge_count += 1
            else:
                merged_notes.append(cur)
                cur = nxt
        merged_notes.append(cur)
    return merged_notes, merge_count


def cluster_simultaneous_onsets(
    notes: list[pretty_midi.Note], onset_cluster_s: float
) -> tuple[list[pretty_midi.Note], int]:
    """Snap near-simultaneous onsets to the earliest in each cluster.

    Two notes within `onset_cluster_s` of each other are forced to share
    the same start time. This stops the score generator from rendering a
    grace-note + main-note pair when the user actually played a chord.
    """
    if not notes:
        return notes, 0
    sorted_notes = sorted(notes, key=lambda n: n.start)
    result: list[pretty_midi.Note] = []
    clustered = 0
    cluster_anchor: float | None = None

    for n in sorted_notes:
        if cluster_anchor is None or (n.start - cluster_anchor) > onset_cluster_s:
            cluster_anchor = n.start
            result.append(n)
        else:
            # Snap to anchor
            if n.start != cluster_anchor:
                clustered += 1
            duration = n.end - n.start
            result.append(pretty_midi.Note(
                velocity=n.velocity,
                pitch=n.pitch,
                start=cluster_anchor,
                end=cluster_anchor + max(duration, 0.0),
            ))
    return result, clustered


def _key_scale_pcs(key_signature: str) -> set[int]:
    """Return MIDI pitch-classes (0-11) belonging to the given key.

    Accepts strings like "C major", "A minor". Returns empty set on parse fail.
    """
    try:
        from music21 import key as m21_key
        parts = key_signature.strip().split()
        tonic = parts[0] if parts else "C"
        mode = (parts[1] if len(parts) > 1 else "major").lower()
        k = m21_key.Key(tonic, mode)
        return {p.midi % 12 for p in k.pitches}
    except Exception:
        return set()


def scale_snap_low_velocity(
    notes: list[pretty_midi.Note],
    key_signature: str,
    accidental_velocity_threshold: int,
    max_semitones: int,
) -> tuple[list[pretty_midi.Note], int]:
    """Snap out-of-key, low-velocity notes to the nearest scale tone.

    Trusts loud notes (velocity >= threshold) as real accidentals. Quiet
    out-of-key notes are usually transcription errors and get pulled to
    the nearest in-key pitch within `max_semitones`. If no scale tone is
    that close, the note is left unchanged (no aggressive moves).
    """
    pcs = _key_scale_pcs(key_signature)
    if not pcs:
        return notes, 0

    snapped_count = 0
    result: list[pretty_midi.Note] = []
    for n in notes:
        if n.velocity >= accidental_velocity_threshold or (n.pitch % 12) in pcs:
            result.append(n)
            continue
        # Search outward by ±1, ±2, ... up to max_semitones
        new_pitch = n.pitch
        for offset in range(1, max_semitones + 1):
            below = n.pitch - offset
            above = n.pitch + offset
            if 0 <= below <= 127 and (below % 12) in pcs:
                new_pitch = below
                break
            if 0 <= above <= 127 and (above % 12) in pcs:
                new_pitch = above
                break
        if new_pitch != n.pitch:
            snapped_count += 1
            result.append(pretty_midi.Note(
                velocity=n.velocity,
                pitch=new_pitch,
                start=n.start,
                end=n.end,
            ))
        else:
            result.append(n)
    return result, snapped_count


def cleanup_midi(
    midi: pretty_midi.PrettyMIDI,
    config: CleanupConfig | None = None,
    key_signature: str | None = None,
) -> tuple[pretty_midi.PrettyMIDI, CleanupReport]:
    """Apply all enabled cleanup rules. Returns (new_midi, report).

    The input `midi` is not mutated — a deep copy is returned with rules
    applied per-instrument. Drum tracks are passed through unchanged.

    `key_signature` enables Rule 5 (scale-snap). Pass strings like
    "C major" or "A minor". If omitted, Rule 5 is skipped regardless of
    config.apply_scale_snap.
    """
    if config is None:
        config = DEFAULT_CONFIG

    out = _copy_midi(midi)

    total_before = 0
    total_after = 0
    dropped_short = 0
    dropped_low_vel = 0
    merged = 0
    clustered = 0
    snapped = 0

    for instrument in out.instruments:
        if instrument.is_drum:
            total_before += len(instrument.notes)
            total_after += len(instrument.notes)
            continue

        notes = list(instrument.notes)
        total_before += len(notes)

        if config.apply_min_duration:
            notes, n = drop_short_notes(notes, config.min_duration_s)
            dropped_short += n

        if config.apply_min_velocity:
            notes, n = drop_low_velocity(notes, config.min_velocity)
            dropped_low_vel += n

        if config.apply_merge_same_pitch:
            notes, n = merge_consecutive_same_pitch(notes, config.merge_gap_s)
            merged += n

        if config.apply_cluster_onsets:
            notes, n = cluster_simultaneous_onsets(notes, config.onset_cluster_s)
            clustered += n

        if config.apply_scale_snap and key_signature:
            notes, n = scale_snap_low_velocity(
                notes,
                key_signature,
                config.accidental_velocity_threshold,
                config.scale_snap_max_semitones,
            )
            snapped += n

        notes.sort(key=lambda n: (n.start, n.pitch))
        instrument.notes = notes
        total_after += len(notes)

    report = CleanupReport(
        notes_before=total_before,
        notes_after=total_after,
        dropped_short=dropped_short,
        dropped_low_velocity=dropped_low_vel,
        merged_same_pitch=merged,
        clustered_onsets=clustered,
        scale_snapped=snapped,
    )

    logger.info(
        "Cleanup: %d -> %d notes (dropped: short=%d, low-vel=%d; "
        "merged=%d; clustered=%d; scale-snapped=%d)",
        total_before, total_after,
        dropped_short, dropped_low_vel, merged, clustered, snapped,
    )

    return out, report


def cleanup_midi_file(
    input_path: Path,
    output_path: Path,
    config: CleanupConfig | None = None,
    key_signature: str | None = None,
) -> CleanupReport:
    """Disk-level wrapper. Loads → cleans → writes."""
    midi = pretty_midi.PrettyMIDI(str(input_path))
    cleaned, report = cleanup_midi(midi, config=config, key_signature=key_signature)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cleaned.write(str(output_path))
    return report
