"""Tests for the Basic Pitch audio-to-MIDI transcription module."""

import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from dataclasses import FrozenInstanceError

from pipeline.transcriber import (
    TranscriptionConfig,
    TranscriptionResult,
    TranscriptionError,
    InvalidAudioError,
    _validate_input,
    _count_midi_notes,
    transcribe,
    transcribe_stems,
    DEFAULT_CONFIG,
    PIANO_CONFIG,
    VOCAL_CONFIG,
    SUPPORTED_EXTENSIONS,
)


class TestTranscriptionConfig:
    """Tests for TranscriptionConfig dataclass."""

    def test_default_values(self):
        config = TranscriptionConfig()
        assert config.onset_threshold == 0.5
        assert config.frame_threshold == 0.3
        assert config.minimum_note_length == 58.0
        assert config.minimum_frequency is None
        assert config.maximum_frequency is None
        assert config.midi_tempo == 120.0

    def test_frozen_immutability(self):
        config = TranscriptionConfig()
        with pytest.raises(FrozenInstanceError):
            config.onset_threshold = 0.9

    def test_custom_values(self):
        config = TranscriptionConfig(
            onset_threshold=0.7,
            frame_threshold=0.4,
            minimum_note_length=100.0,
            minimum_frequency=80.0,
            maximum_frequency=2000.0,
        )
        assert config.onset_threshold == 0.7
        assert config.minimum_frequency == 80.0


class TestPresets:
    """Tests for instrument presets."""

    def test_piano_preset_frequency_range(self):
        assert PIANO_CONFIG.minimum_frequency == 27.5  # A0
        assert PIANO_CONFIG.maximum_frequency == 4186.0  # C8

    def test_vocal_preset_frequency_range(self):
        assert VOCAL_CONFIG.minimum_frequency == 80.0
        assert VOCAL_CONFIG.maximum_frequency == 1100.0

    def test_vocal_preset_longer_min_note(self):
        assert VOCAL_CONFIG.minimum_note_length > DEFAULT_CONFIG.minimum_note_length


class TestValidateInput:
    """Tests for input validation."""

    def test_missing_file_raises_file_not_found(self, tmp_path: Path):
        missing = tmp_path / "nonexistent.wav"
        with pytest.raises(FileNotFoundError, match="Input file not found"):
            _validate_input(missing)

    def test_unsupported_extension_raises_error(self, tmp_path: Path):
        bad_file = tmp_path / "audio.aac"
        bad_file.touch()
        with pytest.raises(InvalidAudioError, match="Unsupported audio format"):
            _validate_input(bad_file)

    @pytest.mark.parametrize("ext", [".wav", ".mp3", ".flac", ".ogg"])
    def test_supported_extensions_pass(self, tmp_path: Path, ext: str):
        good_file = tmp_path / f"stem{ext}"
        good_file.touch()
        _validate_input(good_file)  # Should not raise


class TestCountMidiNotes:
    """Tests for MIDI note counting."""

    def test_counts_notes_across_instruments(self):
        midi = MagicMock()
        inst1 = MagicMock()
        inst1.notes = [1, 2, 3]
        inst2 = MagicMock()
        inst2.notes = [4, 5]
        midi.instruments = [inst1, inst2]
        assert _count_midi_notes(midi) == 5

    def test_empty_midi(self):
        midi = MagicMock()
        midi.instruments = []
        assert _count_midi_notes(midi) == 0


class TestTranscribe:
    """Tests for the main transcribe function."""

    @patch("pipeline.transcriber._get_audio_duration")
    @patch("pipeline.transcriber.predict")
    def test_successful_transcription(self, mock_predict, mock_duration, tmp_path: Path):
        input_file = tmp_path / "piano.wav"
        input_file.touch()
        output_file = tmp_path / "output" / "piano.mid"

        mock_duration.return_value = 5.0

        # Mock Basic Pitch output
        mock_midi = MagicMock()
        inst = MagicMock()
        inst.notes = [MagicMock() for _ in range(42)]
        mock_midi.instruments = [inst]
        mock_predict.return_value = (MagicMock(), mock_midi, MagicMock())

        result = transcribe(input_file, output_file)

        assert result.midi_path == output_file
        assert result.note_count == 42
        assert result.duration_seconds == 5.0
        assert result.processing_time_seconds > 0
        assert result.config == DEFAULT_CONFIG
        mock_midi.write.assert_called_once_with(str(output_file))

    @patch("pipeline.transcriber._get_audio_duration")
    @patch("pipeline.transcriber.predict")
    def test_custom_config_passed_to_predict(self, mock_predict, mock_duration, tmp_path: Path):
        input_file = tmp_path / "vocal.wav"
        input_file.touch()
        output_file = tmp_path / "vocal.mid"

        mock_duration.return_value = 3.0
        mock_midi = MagicMock()
        mock_midi.instruments = []
        mock_predict.return_value = (MagicMock(), mock_midi, MagicMock())

        config = VOCAL_CONFIG
        result = transcribe(input_file, output_file, config=config)

        mock_predict.assert_called_once_with(
            str(input_file),
            onset_threshold=config.onset_threshold,
            frame_threshold=config.frame_threshold,
            minimum_note_length=config.minimum_note_length,
            minimum_frequency=config.minimum_frequency,
            maximum_frequency=config.maximum_frequency,
            midi_tempo=config.midi_tempo,
        )
        assert result.config == VOCAL_CONFIG

    def test_missing_file_raises_error(self, tmp_path: Path):
        with pytest.raises(FileNotFoundError):
            transcribe(tmp_path / "missing.wav", tmp_path / "out.mid")

    def test_unsupported_format_raises_error(self, tmp_path: Path):
        bad = tmp_path / "audio.aac"
        bad.touch()
        with pytest.raises(InvalidAudioError):
            transcribe(bad, tmp_path / "out.mid")

    @patch("pipeline.transcriber._get_audio_duration")
    @patch("pipeline.transcriber.predict")
    def test_predict_failure_raises_transcription_error(
        self, mock_predict, mock_duration, tmp_path: Path
    ):
        input_file = tmp_path / "bad.wav"
        input_file.touch()
        mock_duration.return_value = 1.0
        mock_predict.side_effect = RuntimeError("model crash")

        with pytest.raises(TranscriptionError, match="Basic Pitch transcription failed"):
            transcribe(input_file, tmp_path / "out.mid")

    @patch("pipeline.transcriber._get_audio_duration")
    @patch("pipeline.transcriber.predict")
    def test_midi_write_failure_raises_error(
        self, mock_predict, mock_duration, tmp_path: Path
    ):
        input_file = tmp_path / "audio.wav"
        input_file.touch()
        mock_duration.return_value = 1.0

        mock_midi = MagicMock()
        mock_midi.instruments = []
        mock_midi.write.side_effect = IOError("disk full")
        mock_predict.return_value = (MagicMock(), mock_midi, MagicMock())

        with pytest.raises(TranscriptionError, match="Failed to write MIDI"):
            transcribe(input_file, tmp_path / "out.mid")


class TestTranscribeStems:
    """Tests for batch stem transcription."""

    @patch("pipeline.transcriber.transcribe")
    def test_skips_drums_stem(self, mock_transcribe, tmp_path: Path):
        stems = {
            "vocals": tmp_path / "vocals.wav",
            "drums": tmp_path / "drums.wav",
            "bass": tmp_path / "bass.wav",
        }
        for p in stems.values():
            p.touch()

        mock_transcribe.return_value = MagicMock(spec=TranscriptionResult)
        results = transcribe_stems(stems, tmp_path / "midi")

        assert "drums" not in results
        assert "vocals" in results
        assert "bass" in results

    @patch("pipeline.transcriber.transcribe")
    def test_uses_preset_configs(self, mock_transcribe, tmp_path: Path):
        stems = {"vocals": tmp_path / "vocals.wav"}
        (tmp_path / "vocals.wav").touch()

        mock_transcribe.return_value = MagicMock(spec=TranscriptionResult)
        transcribe_stems(stems, tmp_path / "midi")

        call_args = mock_transcribe.call_args
        assert call_args.kwargs["config"] == VOCAL_CONFIG

    @patch("pipeline.transcriber.transcribe")
    def test_custom_config_map_overrides_presets(self, mock_transcribe, tmp_path: Path):
        stems = {"vocals": tmp_path / "vocals.wav"}
        (tmp_path / "vocals.wav").touch()

        custom = TranscriptionConfig(onset_threshold=0.9)
        mock_transcribe.return_value = MagicMock(spec=TranscriptionResult)
        transcribe_stems(stems, tmp_path / "midi", config_map={"vocals": custom})

        call_args = mock_transcribe.call_args
        assert call_args.kwargs["config"] == custom
