"""MIDI quantization and cleanup.

Snaps note onsets to the nearest beat subdivision, normalizes velocity curves,
and corrects note durations for cleaner sheet music output.
Uses pretty_midi for MIDI manipulation.
"""

import logging
import time
from dataclasses import dataclass
from pathlib import Path

import pretty_midi

logger = logging.getLogger(__name__)


class QuantizationError(Exception):
    """Base exception for quantization errors."""


@dataclass(frozen=True)
class QuantizationConfig:
    """Configuration for MIDI quantization.

    Attributes:
        subdivision: Beat subdivision for snapping (4=quarter, 8=eighth,
            16=sixteenth, 32=thirty-second). Default: 16.
        strength: Quantization strength from 0.0 (no snap) to 1.0 (full snap).
            Intermediate values blend between original and quantized position.
            Default: 1.0.
        velocity_min: Minimum velocity after normalization (0-127). Default: 30.
        velocity_max: Maximum velocity after normalization (0-127). Default: 110.
        normalize_velocity: Whether to normalize velocity curves. Default: True.
        remove_overlaps: Whether to trim overlapping notes on the same pitch.
            Default: True.
        min_gap_threshold: Minimum gap (in seconds) between consecutive notes
            on the same pitch. Gaps smaller than this are filled by extending
            the preceding note. Default: 0.05 (50ms).
        min_note_duration: Minimum note duration in seconds. Notes shorter than
            this after quantization are extended to this length. Default: 0.03.
        tempo: Tempo in BPM used for calculating grid positions.
            If None, uses the MIDI file's tempo. Default: None.
    """

    subdivision: int = 16
    strength: float = 1.0
    velocity_min: int = 30
    velocity_max: int = 110
    normalize_velocity: bool = True
    remove_overlaps: bool = True
    min_gap_threshold: float = 0.05
    min_note_duration: float = 0.03
    tempo: float | None = None


DEFAULT_CONFIG = QuantizationConfig()


@dataclass(frozen=True)
class QuantizationResult:
    """Result of MIDI quantization.

    Attributes:
        output_path: Path to the quantized MIDI file.
        note_count: Total number of notes after quantization.
        notes_removed: Number of notes removed (too short, etc.).
        overlaps_fixed: Number of overlapping note pairs fixed.
        gaps_filled: Number of small gaps filled.
        processing_time_seconds: Wall-clock time for quantization.
        config: Configuration used.
    """

    output_path: Path
    note_count: int
    notes_removed: int
    overlaps_fixed: int
    gaps_filled: int
    processing_time_seconds: float
    config: QuantizationConfig


def _get_tempo(midi: pretty_midi.PrettyMIDI, config: QuantizationConfig) -> float:
    """Get the effective tempo for quantization."""
    if config.tempo is not None:
        return config.tempo
    tempos = midi.get_tempo_changes()[1]
    if len(tempos) > 0:
        return float(tempos[0])
    return 120.0


def _snap_to_grid(time_value: float, grid_size: float, strength: float) -> float:
    """Snap a time value to the nearest fixed-tempo grid position.

    Args:
        time_value: Original time in seconds.
        grid_size: Grid spacing in seconds.
        strength: 0.0 = no change, 1.0 = full snap.
    """
    nearest_grid = round(time_value / grid_size) * grid_size
    return time_value + (nearest_grid - time_value) * strength


def _snap_to_beat_grid(
    time_value: float,
    beat_times: list[float],
    subdivisions_per_beat: int,
    strength: float,
) -> float:
    """Snap to the nearest beat-aware grid cell.

    Beat-aware quantization respects local tempo changes (rubato): each beat
    interval is divided into `subdivisions_per_beat` equal cells, so a note
    that falls inside a slowed-down bar is still quantized correctly relative
    to that bar's local pulse.

    Args:
        time_value: Original time in seconds.
        beat_times: Sorted list of beat positions in seconds (from
            `librosa.beat.beat_track(units="time")`).
        subdivisions_per_beat: How many cells per beat. 4 = 16ths, 2 = 8ths.
        strength: 0.0 = no change, 1.0 = full snap.

    Returns:
        Quantized time value.

    Falls back to nearest beat extrapolation when `time_value` lies outside
    the detected beat range — common for pickup notes before beat[0] or
    long releases after beat[-1].
    """
    if not beat_times or subdivisions_per_beat <= 0:
        return time_value

    n = len(beat_times)
    # Edge cases: before the first beat or after the last.
    if time_value <= beat_times[0]:
        # Extrapolate the first beat-interval backward
        if n >= 2:
            beat_dur = beat_times[1] - beat_times[0]
        else:
            beat_dur = 0.5  # 120 BPM fallback
        cell = beat_dur / subdivisions_per_beat
        nearest = beat_times[0] + round((time_value - beat_times[0]) / cell) * cell
        return time_value + (nearest - time_value) * strength

    if time_value >= beat_times[-1]:
        if n >= 2:
            beat_dur = beat_times[-1] - beat_times[-2]
        else:
            beat_dur = 0.5
        cell = beat_dur / subdivisions_per_beat
        nearest = beat_times[-1] + round((time_value - beat_times[-1]) / cell) * cell
        return time_value + (nearest - time_value) * strength

    # Binary search for the bracketing beat interval
    lo, hi = 0, n - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if beat_times[mid] <= time_value:
            lo = mid
        else:
            hi = mid

    # time_value is in [beat_times[lo], beat_times[hi])
    beat_dur = beat_times[hi] - beat_times[lo]
    if beat_dur <= 0:
        return time_value
    cell = beat_dur / subdivisions_per_beat
    rel = time_value - beat_times[lo]
    nearest_cell = round(rel / cell)
    nearest = beat_times[lo] + nearest_cell * cell
    return time_value + (nearest - time_value) * strength


def _quantize_onsets(
    notes: list[pretty_midi.Note],
    grid_size: float,
    strength: float,
    min_note_duration: float,
    beat_times: list[float] | None = None,
    subdivisions_per_beat: int = 4,
) -> list[pretty_midi.Note]:
    """Snap note onsets to the grid and adjust durations accordingly.

    When `beat_times` is provided, uses beat-aware snapping (respects local
    tempo changes / rubato). Otherwise falls back to global fixed-tempo grid.
    """
    quantized = []
    use_beat_aware = beat_times is not None and len(beat_times) >= 2

    for note in notes:
        original_duration = note.end - note.start
        if use_beat_aware:
            new_start = _snap_to_beat_grid(
                note.start, beat_times, subdivisions_per_beat, strength,
            )
            new_end = _snap_to_beat_grid(
                note.end, beat_times, subdivisions_per_beat, strength,
            )
        else:
            new_start = _snap_to_grid(note.start, grid_size, strength)
            new_end = _snap_to_grid(note.end, grid_size, strength)

        new_start = max(0.0, new_start)

        # Ensure minimum duration
        if new_end - new_start < min_note_duration:
            new_end = new_start + max(min_note_duration, original_duration)

        quantized.append(pretty_midi.Note(
            velocity=note.velocity,
            pitch=note.pitch,
            start=new_start,
            end=new_end,
        ))
    return quantized


def _normalize_velocities(
    notes: list[pretty_midi.Note],
    vel_min: int,
    vel_max: int,
) -> list[pretty_midi.Note]:
    """Normalize note velocities to a target range."""
    if not notes:
        return notes

    velocities = [n.velocity for n in notes]
    src_min = min(velocities)
    src_max = max(velocities)

    if src_min == src_max:
        # All same velocity — set to midpoint of target range
        target_vel = (vel_min + vel_max) // 2
        return [
            pretty_midi.Note(
                velocity=target_vel,
                pitch=n.pitch,
                start=n.start,
                end=n.end,
            )
            for n in notes
        ]

    normalized = []
    for note in notes:
        ratio = (note.velocity - src_min) / (src_max - src_min)
        new_vel = int(vel_min + ratio * (vel_max - vel_min))
        new_vel = max(1, min(127, new_vel))
        normalized.append(pretty_midi.Note(
            velocity=new_vel,
            pitch=note.pitch,
            start=note.start,
            end=note.end,
        ))
    return normalized


def _fix_overlaps(notes: list[pretty_midi.Note]) -> tuple[list[pretty_midi.Note], int]:
    """Remove overlapping notes on the same pitch by trimming the earlier note.

    Returns:
        Tuple of (fixed notes, number of overlaps fixed).
    """
    if not notes:
        return notes, 0

    # Group notes by pitch
    by_pitch: dict[int, list[pretty_midi.Note]] = {}
    for note in notes:
        by_pitch.setdefault(note.pitch, []).append(note)

    fixed: list[pretty_midi.Note] = []
    overlap_count = 0

    for pitch, pitch_notes in by_pitch.items():
        sorted_notes = sorted(pitch_notes, key=lambda n: n.start)
        for i in range(len(sorted_notes)):
            current = sorted_notes[i]
            if i + 1 < len(sorted_notes):
                next_note = sorted_notes[i + 1]
                if current.end > next_note.start:
                    # Trim current note to end at next note's start
                    current = pretty_midi.Note(
                        velocity=current.velocity,
                        pitch=current.pitch,
                        start=current.start,
                        end=next_note.start,
                    )
                    overlap_count += 1
            fixed.append(current)

    return fixed, overlap_count


def _fill_gaps(
    notes: list[pretty_midi.Note],
    threshold: float,
) -> tuple[list[pretty_midi.Note], int]:
    """Fill small gaps between consecutive notes on the same pitch.

    Returns:
        Tuple of (fixed notes, number of gaps filled).
    """
    if not notes:
        return notes, 0

    by_pitch: dict[int, list[pretty_midi.Note]] = {}
    for note in notes:
        by_pitch.setdefault(note.pitch, []).append(note)

    filled: list[pretty_midi.Note] = []
    gap_count = 0

    for pitch, pitch_notes in by_pitch.items():
        sorted_notes = sorted(pitch_notes, key=lambda n: n.start)
        for i in range(len(sorted_notes)):
            current = sorted_notes[i]
            if i + 1 < len(sorted_notes):
                next_note = sorted_notes[i + 1]
                gap = next_note.start - current.end
                if 0 < gap < threshold:
                    # Extend current note to fill the gap
                    current = pretty_midi.Note(
                        velocity=current.velocity,
                        pitch=current.pitch,
                        start=current.start,
                        end=next_note.start,
                    )
                    gap_count += 1
            filled.append(current)

    return filled, gap_count


def quantize(
    input_path: Path,
    output_path: Path,
    config: QuantizationConfig | None = None,
    beat_times: list[float] | None = None,
) -> QuantizationResult:
    """Quantize a MIDI file.

    Args:
        input_path: Path to the raw MIDI file.
        output_path: Path to write the quantized MIDI file.
        config: Quantization configuration. Uses DEFAULT_CONFIG if None.
        beat_times: Sorted list of beat positions in seconds (e.g. from
            `librosa.beat.beat_track(units="time")`). When provided, the
            quantizer uses beat-aware snapping which respects rubato and
            local tempo changes. When omitted, falls back to fixed-tempo
            grid snapping using `config.tempo` or the MIDI's own tempo.

    Returns:
        QuantizationResult with output path and statistics.

    Raises:
        FileNotFoundError: If the input file does not exist.
        QuantizationError: For MIDI parsing or processing errors.
    """
    if not input_path.exists():
        raise FileNotFoundError(f"Input MIDI file not found: {input_path}")

    if config is None:
        config = DEFAULT_CONFIG

    use_beat_aware = beat_times is not None and len(beat_times) >= 2
    logger.info(
        "Starting quantization: file='%s', subdivision=%d, strength=%.2f, "
        "beat_aware=%s",
        input_path.name,
        config.subdivision,
        config.strength,
        use_beat_aware,
    )

    start_time = time.monotonic()

    # Load MIDI
    try:
        midi = pretty_midi.PrettyMIDI(str(input_path))
    except Exception as exc:
        raise QuantizationError(
            f"Failed to load MIDI file '{input_path}': {exc}"
        ) from exc

    tempo = _get_tempo(midi, config)
    # Grid size in seconds: one beat = 60/tempo seconds,
    # divided by (subdivision / 4) to get the subdivision duration
    beats_per_subdivision = 4.0 / config.subdivision
    grid_size = (60.0 / tempo) * beats_per_subdivision
    # For beat-aware snapping: how many cells per beat (4 = 16ths, 2 = 8ths)
    subdivisions_per_beat = max(1, config.subdivision // 4)

    if use_beat_aware:
        logger.info(
            "Beat-aware quantization: %d beat positions, %d subdivisions/beat",
            len(beat_times), subdivisions_per_beat,
        )
    else:
        logger.info(
            "Fixed-grid quantization: %.1f BPM, %.4fs (%dth note)",
            tempo, grid_size, config.subdivision,
        )

    total_notes = 0
    total_removed = 0
    total_overlaps = 0
    total_gaps = 0

    for instrument in midi.instruments:
        if instrument.is_drum:
            logger.info("Skipping drum track (program=%d)", instrument.program)
            continue

        original_count = len(instrument.notes)

        # Step 1: Quantize onsets (beat-aware when beat_times provided)
        notes = _quantize_onsets(
            instrument.notes,
            grid_size,
            config.strength,
            config.min_note_duration,
            beat_times=beat_times,
            subdivisions_per_beat=subdivisions_per_beat,
        )

        # Step 2: Normalize velocities
        if config.normalize_velocity:
            notes = _normalize_velocities(notes, config.velocity_min, config.velocity_max)

        # Step 3: Fix overlaps
        if config.remove_overlaps:
            notes, overlaps = _fix_overlaps(notes)
            total_overlaps += overlaps

        # Step 4: Fill small gaps
        notes, gaps = _fill_gaps(notes, config.min_gap_threshold)
        total_gaps += gaps

        # Step 5: Remove notes that are still too short
        valid_notes = [n for n in notes if (n.end - n.start) >= config.min_note_duration]
        removed = len(notes) - len(valid_notes)
        total_removed += removed

        # Sort by start time for clean output
        valid_notes.sort(key=lambda n: (n.start, n.pitch))
        instrument.notes = valid_notes
        total_notes += len(valid_notes)

        logger.info(
            "Instrument %d (%s): %d -> %d notes, %d overlaps fixed, "
            "%d gaps filled, %d removed",
            instrument.program,
            instrument.name or "unnamed",
            original_count,
            len(valid_notes),
            overlaps if config.remove_overlaps else 0,
            gaps,
            removed,
        )

    # Save quantized MIDI
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        midi.write(str(output_path))
    except Exception as exc:
        raise QuantizationError(
            f"Failed to write quantized MIDI to '{output_path}': {exc}"
        ) from exc

    processing_time = time.monotonic() - start_time
    logger.info(
        "Quantization complete: %d notes, %d overlaps fixed, "
        "%d gaps filled, %d removed, %.2fs",
        total_notes,
        total_overlaps,
        total_gaps,
        total_removed,
        processing_time,
    )

    return QuantizationResult(
        output_path=output_path,
        note_count=total_notes,
        notes_removed=total_removed,
        overlaps_fixed=total_overlaps,
        gaps_filled=total_gaps,
        processing_time_seconds=processing_time,
        config=config,
    )
