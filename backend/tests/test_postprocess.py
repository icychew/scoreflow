"""Unit tests for pipeline.postprocess.

Tests each cleanup rule in isolation with synthetic PrettyMIDI fixtures,
plus the full `cleanup_midi` composer end-to-end.
"""

from __future__ import annotations

import pretty_midi
import pytest

from pipeline.postprocess import (
    CleanupConfig,
    cleanup_midi,
    cluster_simultaneous_onsets,
    drop_low_velocity,
    drop_short_notes,
    merge_consecutive_same_pitch,
    scale_snap_low_velocity,
)


def _note(pitch: int, start: float, end: float, velocity: int = 80) -> pretty_midi.Note:
    return pretty_midi.Note(velocity=velocity, pitch=pitch, start=start, end=end)


@pytest.mark.unit
def test_drop_short_notes_removes_below_threshold():
    notes = [_note(60, 0.0, 0.1), _note(62, 0.5, 0.51), _note(64, 1.0, 1.2)]
    kept, dropped = drop_short_notes(notes, min_duration_s=0.05)
    assert len(kept) == 2
    assert dropped == 1
    assert all(n.pitch != 62 for n in kept)


@pytest.mark.unit
def test_drop_short_notes_keeps_all_when_threshold_low():
    notes = [_note(60, 0.0, 0.1), _note(62, 0.5, 0.6)]
    kept, dropped = drop_short_notes(notes, min_duration_s=0.0)
    assert len(kept) == 2
    assert dropped == 0


@pytest.mark.unit
def test_drop_low_velocity_removes_quiet_ghost_notes():
    notes = [_note(60, 0.0, 0.5, velocity=80), _note(62, 0.5, 1.0, velocity=10)]
    kept, dropped = drop_low_velocity(notes, min_velocity=15)
    assert len(kept) == 1
    assert kept[0].velocity == 80
    assert dropped == 1


@pytest.mark.unit
def test_merge_same_pitch_collapses_re_onsets():
    """Two C4 notes 20ms apart should merge into one."""
    notes = [_note(60, 0.0, 0.5, velocity=70), _note(60, 0.52, 1.0, velocity=85)]
    merged, count = merge_consecutive_same_pitch(notes, merge_gap_s=0.030)
    assert count == 1
    assert len(merged) == 1
    assert merged[0].start == 0.0
    assert merged[0].end == 1.0
    # Max velocity wins
    assert merged[0].velocity == 85


@pytest.mark.unit
def test_merge_same_pitch_leaves_separated_notes_alone():
    """Two C4 notes 100ms apart should stay separate."""
    notes = [_note(60, 0.0, 0.5), _note(60, 0.6, 1.0)]
    merged, count = merge_consecutive_same_pitch(notes, merge_gap_s=0.030)
    assert count == 0
    assert len(merged) == 2


@pytest.mark.unit
def test_merge_same_pitch_different_pitches_untouched():
    """C4 + E4 close in time should NOT merge (different pitches)."""
    notes = [_note(60, 0.0, 0.5), _note(64, 0.51, 1.0)]
    merged, count = merge_consecutive_same_pitch(notes, merge_gap_s=0.030)
    assert count == 0
    assert len(merged) == 2


@pytest.mark.unit
def test_cluster_onsets_snaps_chord_to_earliest():
    """C-E-G played within 10ms should all share the earliest onset."""
    notes = [
        _note(60, 0.000, 0.5),
        _note(64, 0.005, 0.5),
        _note(67, 0.012, 0.5),
    ]
    clustered, count = cluster_simultaneous_onsets(notes, onset_cluster_s=0.030)
    assert count == 2  # Two notes were moved
    starts = sorted(n.start for n in clustered)
    assert starts == [0.000, 0.000, 0.000]


@pytest.mark.unit
def test_cluster_onsets_keeps_distinct_chords_separate():
    """Two chords 200ms apart should remain two clusters."""
    notes = [
        _note(60, 0.0, 0.3), _note(64, 0.005, 0.3),
        _note(60, 0.5, 0.8), _note(64, 0.505, 0.8),
    ]
    clustered, _ = cluster_simultaneous_onsets(notes, onset_cluster_s=0.030)
    starts = sorted({round(n.start, 3) for n in clustered})
    assert starts == [0.000, 0.500]


@pytest.mark.unit
def test_scale_snap_pulls_quiet_out_of_key_notes():
    """A quiet F# in C major (a tritone artifact) should snap to F."""
    notes = [_note(66, 0.0, 0.5, velocity=40)]  # F# velocity 40
    snapped, count = scale_snap_low_velocity(
        notes, "C major", accidental_velocity_threshold=60, max_semitones=1,
    )
    assert count == 1
    assert snapped[0].pitch == 65  # F


@pytest.mark.unit
def test_scale_snap_trusts_loud_accidentals():
    """A loud F# in C major (real chromatic note) should NOT be snapped."""
    notes = [_note(66, 0.0, 0.5, velocity=95)]
    snapped, count = scale_snap_low_velocity(
        notes, "C major", accidental_velocity_threshold=60, max_semitones=1,
    )
    assert count == 0
    assert snapped[0].pitch == 66


@pytest.mark.unit
def test_scale_snap_leaves_in_key_notes_alone():
    """An in-key C-major note (G) should be untouched regardless of velocity."""
    notes = [_note(67, 0.0, 0.5, velocity=30), _note(67, 1.0, 1.5, velocity=95)]
    snapped, count = scale_snap_low_velocity(
        notes, "C major", accidental_velocity_threshold=60, max_semitones=1,
    )
    assert count == 0
    assert [n.pitch for n in snapped] == [67, 67]


@pytest.mark.integration
def test_cleanup_midi_end_to_end_immutable():
    """cleanup_midi must return a new PrettyMIDI; input is unchanged."""
    midi = pretty_midi.PrettyMIDI()
    inst = pretty_midi.Instrument(program=0)
    inst.notes = [
        _note(60, 0.0, 0.020, velocity=50),  # Will be dropped (too short)
        _note(62, 0.5, 1.0, velocity=10),    # Will be dropped (low velocity)
        _note(64, 1.5, 2.0, velocity=80),    # Will survive
        _note(64, 2.015, 2.5, velocity=85),  # Merges with previous (same pitch + close)
    ]
    midi.instruments.append(inst)
    notes_in = len(midi.instruments[0].notes)

    cleaned, report = cleanup_midi(midi, CleanupConfig())

    # Input untouched
    assert len(midi.instruments[0].notes) == notes_in
    # Output: dropped 2, merged 1 → 1 remaining
    assert report.notes_before == 4
    assert report.dropped_short == 1
    assert report.dropped_low_velocity == 1
    assert report.merged_same_pitch == 1
    assert report.notes_after == 1


@pytest.mark.integration
def test_cleanup_midi_passes_drums_unchanged():
    """Drum tracks should bypass the cleanup rules entirely."""
    midi = pretty_midi.PrettyMIDI()
    drums = pretty_midi.Instrument(program=0, is_drum=True)
    # Short low-velocity drum hit that would normally get dropped
    drums.notes = [_note(36, 0.0, 0.020, velocity=10)]
    midi.instruments.append(drums)

    cleaned, report = cleanup_midi(midi, CleanupConfig())
    assert len(cleaned.instruments[0].notes) == 1
