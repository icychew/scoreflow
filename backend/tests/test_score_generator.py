"""Tests for the music21 score generation module."""

import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock, PropertyMock
from dataclasses import FrozenInstanceError

from pipeline.score_generator import (
    ScoreConfig,
    ScoreResult,
    ScoreGenerationError,
    EmptyMIDIError,
    _detect_clef,
    _detect_key_signature,
    _detect_time_signature,
    _count_notes,
    _count_measures,
    generate_score,
    generate_scores,
    DEFAULT_CONFIG,
)


class TestScoreConfig:
    """Tests for ScoreConfig dataclass."""

    def test_default_values(self):
        c = ScoreConfig()
        assert c.title is None
        assert c.composer is None
        assert c.detect_key is True
        assert c.detect_time_signature is True
        assert c.default_time_signature == "4/4"
        assert c.auto_clef is True
        assert c.remove_empty_measures is True

    def test_frozen(self):
        c = ScoreConfig()
        with pytest.raises(FrozenInstanceError):
            c.title = "Test"

    def test_custom_values(self):
        c = ScoreConfig(title="My Score", composer="Bach", default_time_signature="3/4")
        assert c.title == "My Score"
        assert c.composer == "Bach"
        assert c.default_time_signature == "3/4"


class TestDetectClef:
    """Tests for clef detection based on pitch range."""

    def test_high_pitches_return_treble(self):
        part = MagicMock()
        note1 = MagicMock()
        note1.pitch = MagicMock()
        note1.pitch.midi = 72  # C5
        note1.pitches = None
        type(note1).pitch = PropertyMock(return_value=MagicMock(midi=72))
        del note1.pitches

        recurse_mock = MagicMock()
        recurse_mock.notes = [note1]
        part.recurse.return_value = recurse_mock

        assert _detect_clef(part) == "treble"

    def test_low_pitches_return_bass(self):
        part = MagicMock()
        note1 = MagicMock()
        type(note1).pitch = PropertyMock(return_value=MagicMock(midi=40))  # E2
        # Remove pitches attribute so hasattr returns False
        if hasattr(note1, "pitches"):
            del note1.pitches

        recurse_mock = MagicMock()
        recurse_mock.notes = [note1]
        part.recurse.return_value = recurse_mock

        assert _detect_clef(part) == "bass"

    def test_empty_part_returns_treble(self):
        part = MagicMock()
        recurse_mock = MagicMock()
        recurse_mock.notes = []
        part.recurse.return_value = recurse_mock

        assert _detect_clef(part) == "treble"


class TestDetectKeySignature:
    """Tests for key signature detection."""

    def test_successful_detection(self):
        score = MagicMock()
        score.analyze.return_value = "G major"
        assert _detect_key_signature(score) == "G major"

    def test_detection_failure_defaults_to_c_major(self):
        score = MagicMock()
        score.analyze.side_effect = Exception("analysis failed")
        assert _detect_key_signature(score) == "C major"


class TestDetectTimeSignature:
    """Tests for time signature detection."""

    def test_extracts_existing_time_signature(self):
        score = MagicMock()
        ts = MagicMock()
        ts.ratioString = "3/4"

        recurse_mock = MagicMock()
        recurse_mock.getElementsByClass.return_value = [ts]
        score.recurse.return_value = recurse_mock

        assert _detect_time_signature(score, "4/4") == "3/4"

    def test_returns_default_when_none_found(self):
        score = MagicMock()
        recurse_mock = MagicMock()
        recurse_mock.getElementsByClass.return_value = []
        score.recurse.return_value = recurse_mock

        assert _detect_time_signature(score, "4/4") == "4/4"


class TestCountNotes:
    """Tests for note counting."""

    def test_counts_single_notes(self):
        score = MagicMock()
        note1 = MagicMock(spec=["pitch"])  # Single note
        note2 = MagicMock(spec=["pitch"])
        recurse_mock = MagicMock()
        recurse_mock.notes = [note1, note2]
        score.recurse.return_value = recurse_mock

        assert _count_notes(score) == 2

    def test_counts_chord_members(self):
        score = MagicMock()
        chord = MagicMock()
        chord.pitches = [MagicMock(), MagicMock(), MagicMock()]  # 3-note chord
        recurse_mock = MagicMock()
        recurse_mock.notes = [chord]
        score.recurse.return_value = recurse_mock

        assert _count_notes(score) == 3

    def test_empty_score(self):
        score = MagicMock()
        recurse_mock = MagicMock()
        recurse_mock.notes = []
        score.recurse.return_value = recurse_mock

        assert _count_notes(score) == 0


class TestCountMeasures:
    """Tests for measure counting."""

    def test_counts_measures(self):
        score = MagicMock()
        recurse_mock = MagicMock()
        recurse_mock.getElementsByClass.return_value = [MagicMock(), MagicMock()]
        score.recurse.return_value = recurse_mock

        assert _count_measures(score) == 2


class TestGenerateScore:
    """Tests for the main generate_score function."""

    def test_missing_file_raises_error(self, tmp_path: Path):
        with pytest.raises(FileNotFoundError):
            generate_score(tmp_path / "missing.mid", tmp_path / "out.musicxml")

    @patch("pipeline.score_generator.converter")
    def test_empty_midi_raises_error(self, mock_converter, tmp_path: Path):
        input_file = tmp_path / "empty.mid"
        input_file.touch()

        mock_score = MagicMock()
        recurse_mock = MagicMock()
        recurse_mock.notes = []
        mock_score.recurse.return_value = recurse_mock
        mock_converter.parse.return_value = mock_score

        with pytest.raises(EmptyMIDIError, match="contains no notes"):
            generate_score(input_file, tmp_path / "out.musicxml")

    @patch("pipeline.score_generator.converter")
    def test_parse_failure_raises_error(self, mock_converter, tmp_path: Path):
        input_file = tmp_path / "bad.mid"
        input_file.touch()
        mock_converter.parse.side_effect = Exception("corrupt")

        with pytest.raises(ScoreGenerationError, match="Failed to parse"):
            generate_score(input_file, tmp_path / "out.musicxml")

    @patch("pipeline.score_generator._count_measures")
    @patch("pipeline.score_generator._detect_time_signature")
    @patch("pipeline.score_generator._detect_key_signature")
    @patch("pipeline.score_generator._detect_clef")
    @patch("pipeline.score_generator._count_notes")
    @patch("pipeline.score_generator.converter")
    def test_successful_generation(
        self,
        mock_converter,
        mock_count_notes,
        mock_detect_clef,
        mock_detect_key,
        mock_detect_ts,
        mock_count_measures,
        tmp_path: Path,
    ):
        input_file = tmp_path / "quantized.mid"
        input_file.touch()
        output_file = tmp_path / "score.musicxml"

        mock_score = MagicMock()
        mock_score.metadata = None
        mock_part = MagicMock()
        mock_part.partName = "Piano"
        mock_part.getElementsByClass.return_value = [MagicMock()]
        mock_part.recurse.return_value.getElementsByClass.return_value = []
        mock_score.parts = [mock_part]
        mock_converter.parse.return_value = mock_score

        mock_count_notes.return_value = 25
        mock_detect_clef.return_value = "treble"
        mock_detect_key.return_value = "G major"
        mock_detect_ts.return_value = "4/4"
        mock_count_measures.return_value = 8

        config = ScoreConfig(title="Test Score", composer="Test")
        result = generate_score(input_file, output_file, config=config)

        assert result.key_signature == "G major"
        assert result.time_signature == "4/4"
        assert result.note_count == 25
        assert result.measure_count == 8
        assert result.processing_time_seconds > 0
        assert result.config == config
        mock_score.write.assert_called_once()


class TestGenerateScores:
    """Tests for batch score generation."""

    @patch("pipeline.score_generator.generate_score")
    def test_generates_multiple_scores(self, mock_gen, tmp_path: Path):
        mock_gen.return_value = MagicMock(spec=ScoreResult)
        midi_files = {
            "vocals": tmp_path / "vocals.mid",
            "bass": tmp_path / "bass.mid",
        }
        results = generate_scores(midi_files, tmp_path / "scores")
        assert len(results) == 2
        assert "vocals" in results
        assert "bass" in results

    @patch("pipeline.score_generator.generate_score")
    def test_skips_empty_midi(self, mock_gen, tmp_path: Path):
        mock_gen.side_effect = EmptyMIDIError("no notes")
        midi_files = {"vocals": tmp_path / "vocals.mid"}
        results = generate_scores(midi_files, tmp_path / "scores")
        assert len(results) == 0

    @patch("pipeline.score_generator.generate_score")
    def test_skips_failed_generation(self, mock_gen, tmp_path: Path):
        mock_gen.side_effect = ScoreGenerationError("failed")
        midi_files = {"vocals": tmp_path / "vocals.mid"}
        results = generate_scores(midi_files, tmp_path / "scores")
        assert len(results) == 0
