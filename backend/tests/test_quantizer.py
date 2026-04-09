"""Tests for the MIDI quantization module."""

import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from dataclasses import FrozenInstanceError

import pretty_midi

from pipeline.quantizer import (
    QuantizationConfig,
    QuantizationResult,
    QuantizationError,
    _snap_to_grid,
    _quantize_onsets,
    _normalize_velocities,
    _fix_overlaps,
    _fill_gaps,
    _get_tempo,
    quantize,
    DEFAULT_CONFIG,
)


def _make_note(pitch: int, start: float, end: float, velocity: int = 80) -> pretty_midi.Note:
    """Helper to create a pretty_midi Note."""
    return pretty_midi.Note(velocity=velocity, pitch=pitch, start=start, end=end)


class TestQuantizationConfig:
    """Tests for QuantizationConfig dataclass."""

    def test_default_values(self):
        c = QuantizationConfig()
        assert c.subdivision == 16
        assert c.strength == 1.0
        assert c.velocity_min == 30
        assert c.velocity_max == 110
        assert c.normalize_velocity is True
        assert c.remove_overlaps is True
        assert c.min_gap_threshold == 0.05
        assert c.min_note_duration == 0.03
        assert c.tempo is None

    def test_frozen(self):
        c = QuantizationConfig()
        with pytest.raises(FrozenInstanceError):
            c.subdivision = 8


class TestSnapToGrid:
    """Tests for grid snapping logic."""

    def test_full_strength_snaps_exactly(self):
        # 120 BPM, 16th note grid = 0.125s
        grid = 0.125
        assert _snap_to_grid(0.13, grid, 1.0) == pytest.approx(0.125)
        assert _snap_to_grid(0.24, grid, 1.0) == pytest.approx(0.25)

    def test_zero_strength_no_change(self):
        grid = 0.125
        assert _snap_to_grid(0.13, grid, 0.0) == pytest.approx(0.13)

    def test_half_strength_blends(self):
        grid = 0.125
        original = 0.13
        snapped = 0.125
        expected = original + (snapped - original) * 0.5
        assert _snap_to_grid(original, grid, 0.5) == pytest.approx(expected)

    def test_value_on_grid_unchanged(self):
        grid = 0.125
        assert _snap_to_grid(0.25, grid, 1.0) == pytest.approx(0.25)

    def test_negative_time_snaps_to_zero(self):
        # Edge case: value very close to 0
        grid = 0.125
        result = _snap_to_grid(0.01, grid, 1.0)
        assert result == pytest.approx(0.0)


class TestQuantizeOnsets:
    """Tests for onset quantization."""

    def test_snaps_notes_to_grid(self):
        notes = [_make_note(60, 0.13, 0.38)]
        grid = 0.125
        result = _quantize_onsets(notes, grid, 1.0, 0.03)
        assert result[0].start == pytest.approx(0.125)

    def test_preserves_minimum_duration(self):
        # Very short note
        notes = [_make_note(60, 0.13, 0.14)]
        grid = 0.125
        result = _quantize_onsets(notes, grid, 1.0, 0.05)
        duration = result[0].end - result[0].start
        assert duration >= 0.05

    def test_start_not_negative(self):
        notes = [_make_note(60, 0.01, 0.2)]
        grid = 0.125
        result = _quantize_onsets(notes, grid, 1.0, 0.03)
        assert result[0].start >= 0.0


class TestNormalizeVelocities:
    """Tests for velocity normalization."""

    def test_maps_to_target_range(self):
        notes = [
            _make_note(60, 0, 1, velocity=10),
            _make_note(62, 1, 2, velocity=127),
        ]
        result = _normalize_velocities(notes, 30, 110)
        velocities = [n.velocity for n in result]
        assert min(velocities) == 30
        assert max(velocities) == 110

    def test_single_velocity_maps_to_midpoint(self):
        notes = [_make_note(60, 0, 1, velocity=80), _make_note(62, 1, 2, velocity=80)]
        result = _normalize_velocities(notes, 30, 110)
        expected = (30 + 110) // 2
        assert all(n.velocity == expected for n in result)

    def test_empty_list(self):
        assert _normalize_velocities([], 30, 110) == []

    def test_velocity_clamped_to_valid_range(self):
        notes = [_make_note(60, 0, 1, velocity=0), _make_note(62, 1, 2, velocity=127)]
        result = _normalize_velocities(notes, 1, 127)
        for n in result:
            assert 1 <= n.velocity <= 127


class TestFixOverlaps:
    """Tests for overlap removal."""

    def test_trims_overlapping_same_pitch(self):
        notes = [
            _make_note(60, 0.0, 0.5),
            _make_note(60, 0.3, 0.8),
        ]
        fixed, count = _fix_overlaps(notes)
        assert count == 1
        # First note should end at second note's start
        note_60 = sorted([n for n in fixed if n.pitch == 60], key=lambda n: n.start)
        assert note_60[0].end == pytest.approx(0.3)

    def test_no_overlap_different_pitch(self):
        notes = [
            _make_note(60, 0.0, 0.5),
            _make_note(62, 0.3, 0.8),
        ]
        fixed, count = _fix_overlaps(notes)
        assert count == 0

    def test_no_overlap_sequential(self):
        notes = [
            _make_note(60, 0.0, 0.3),
            _make_note(60, 0.3, 0.6),
        ]
        fixed, count = _fix_overlaps(notes)
        assert count == 0

    def test_empty_list(self):
        fixed, count = _fix_overlaps([])
        assert fixed == []
        assert count == 0


class TestFillGaps:
    """Tests for gap filling."""

    def test_fills_small_gap(self):
        notes = [
            _make_note(60, 0.0, 0.3),
            _make_note(60, 0.32, 0.6),  # 0.02s gap
        ]
        filled, count = _fill_gaps(notes, 0.05)
        assert count == 1
        note_60 = sorted([n for n in filled if n.pitch == 60], key=lambda n: n.start)
        assert note_60[0].end == pytest.approx(0.32)

    def test_preserves_large_gap(self):
        notes = [
            _make_note(60, 0.0, 0.3),
            _make_note(60, 0.5, 0.8),  # 0.2s gap
        ]
        filled, count = _fill_gaps(notes, 0.05)
        assert count == 0

    def test_different_pitches_independent(self):
        notes = [
            _make_note(60, 0.0, 0.3),
            _make_note(62, 0.32, 0.6),
        ]
        filled, count = _fill_gaps(notes, 0.05)
        assert count == 0

    def test_empty_list(self):
        filled, count = _fill_gaps([], 0.05)
        assert filled == []
        assert count == 0


class TestGetTempo:
    """Tests for tempo extraction."""

    def test_uses_config_tempo_if_set(self):
        midi = MagicMock()
        config = QuantizationConfig(tempo=140.0)
        assert _get_tempo(midi, config) == 140.0

    def test_uses_midi_tempo(self):
        midi = MagicMock()
        midi.get_tempo_changes.return_value = ([], [100.0, 120.0])
        config = QuantizationConfig(tempo=None)
        assert _get_tempo(midi, config) == 100.0

    def test_defaults_to_120(self):
        midi = MagicMock()
        midi.get_tempo_changes.return_value = ([], [])
        config = QuantizationConfig(tempo=None)
        assert _get_tempo(midi, config) == 120.0


class TestQuantize:
    """Tests for the main quantize function."""

    def test_missing_file_raises_error(self, tmp_path: Path):
        with pytest.raises(FileNotFoundError):
            quantize(tmp_path / "missing.mid", tmp_path / "out.mid")

    @patch("pipeline.quantizer.pretty_midi.PrettyMIDI")
    def test_invalid_midi_raises_quantization_error(self, mock_pm, tmp_path: Path):
        input_file = tmp_path / "bad.mid"
        input_file.touch()
        mock_pm.side_effect = Exception("corrupt MIDI")

        with pytest.raises(QuantizationError, match="Failed to load MIDI"):
            quantize(input_file, tmp_path / "out.mid")

    @patch("pipeline.quantizer.pretty_midi.PrettyMIDI")
    def test_successful_quantization(self, mock_pm_cls, tmp_path: Path):
        input_file = tmp_path / "raw.mid"
        input_file.touch()
        output_file = tmp_path / "quantized.mid"

        mock_midi = MagicMock()
        mock_midi.get_tempo_changes.return_value = ([], [120.0])

        inst = MagicMock()
        inst.is_drum = False
        inst.program = 0
        inst.name = "Piano"
        inst.notes = [
            _make_note(60, 0.13, 0.38, velocity=50),
            _make_note(62, 0.26, 0.51, velocity=100),
        ]
        mock_midi.instruments = [inst]
        mock_pm_cls.return_value = mock_midi

        config = QuantizationConfig(subdivision=16, strength=1.0)
        result = quantize(input_file, output_file, config=config)

        assert result.note_count == 2
        assert result.processing_time_seconds > 0
        assert result.config == config
        mock_midi.write.assert_called_once()

    @patch("pipeline.quantizer.pretty_midi.PrettyMIDI")
    def test_skips_drum_tracks(self, mock_pm_cls, tmp_path: Path):
        input_file = tmp_path / "drums.mid"
        input_file.touch()

        mock_midi = MagicMock()
        mock_midi.get_tempo_changes.return_value = ([], [120.0])

        drum_inst = MagicMock()
        drum_inst.is_drum = True
        drum_inst.notes = [_make_note(36, 0.0, 0.1)]
        mock_midi.instruments = [drum_inst]
        mock_pm_cls.return_value = mock_midi

        result = quantize(input_file, tmp_path / "out.mid")
        assert result.note_count == 0
