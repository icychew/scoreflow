"""Tests for the Demucs source separation module."""

import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

import torch

from pipeline.separator import (
    SeparationError,
    UnsupportedFormatError,
    CorruptedAudioError,
    _validate_input,
    _get_device,
    separate,
    SUPPORTED_EXTENSIONS,
    VALID_MODELS,
)


class TestValidateInput:
    """Tests for input validation."""

    def test_missing_file_raises_file_not_found(self, tmp_path: Path):
        missing = tmp_path / "nonexistent.mp3"
        with pytest.raises(FileNotFoundError, match="Input file not found"):
            _validate_input(missing)

    def test_unsupported_extension_raises_error(self, tmp_path: Path):
        bad_file = tmp_path / "audio.ogg"
        bad_file.touch()
        with pytest.raises(UnsupportedFormatError, match="Unsupported audio format"):
            _validate_input(bad_file)

    @pytest.mark.parametrize("ext", [".mp3", ".wav", ".flac"])
    def test_supported_extensions_pass(self, tmp_path: Path, ext: str):
        good_file = tmp_path / f"audio{ext}"
        good_file.touch()
        _validate_input(good_file)  # Should not raise

    def test_case_insensitive_extension(self, tmp_path: Path):
        upper_file = tmp_path / "audio.WAV"
        upper_file.touch()
        _validate_input(upper_file)  # Should not raise


class TestGetDevice:
    """Tests for device selection."""

    @patch("pipeline.separator.torch.cuda.is_available", return_value=True)
    def test_returns_cuda_when_available(self, mock_cuda):
        device = _get_device()
        assert device.type == "cuda"

    @patch("pipeline.separator.torch.cuda.is_available", return_value=False)
    def test_returns_cpu_when_no_cuda(self, mock_cuda):
        device = _get_device()
        assert device.type == "cpu"


class TestSeparate:
    """Tests for the main separate function."""

    def test_invalid_model_name_raises_value_error(self, tmp_path: Path):
        input_file = tmp_path / "audio.wav"
        input_file.touch()
        with pytest.raises(ValueError, match="Unknown model"):
            with patch("pipeline.separator._load_audio") as mock_load:
                mock_load.return_value = (torch.randn(2, 44100), 44100)
                separate(input_file, tmp_path / "output", model_name="invalid_model")

    def test_unsupported_format_raises_error(self, tmp_path: Path):
        input_file = tmp_path / "audio.ogg"
        input_file.touch()
        with pytest.raises(UnsupportedFormatError):
            separate(input_file, tmp_path / "output")

    def test_missing_file_raises_error(self, tmp_path: Path):
        with pytest.raises(FileNotFoundError):
            separate(tmp_path / "missing.mp3", tmp_path / "output")

    @patch("pipeline.separator.apply_model")
    @patch("pipeline.separator._load_model")
    @patch("pipeline.separator._load_audio")
    @patch("pipeline.separator._get_device")
    def test_successful_separation(
        self,
        mock_device,
        mock_load_audio,
        mock_load_model,
        mock_apply,
        tmp_path: Path,
    ):
        input_file = tmp_path / "audio.wav"
        input_file.touch()
        output_dir = tmp_path / "stems"

        mock_device.return_value = torch.device("cpu")

        # Simulate 1 second of stereo audio at 44100 Hz
        mock_load_audio.return_value = (torch.randn(2, 44100), 44100)

        mock_model = MagicMock()
        mock_model.samplerate = 44100
        mock_load_model.return_value = mock_model

        # 4 stems, each stereo 44100 samples: shape (1, 4, 2, 44100)
        mock_apply.return_value = torch.randn(1, 4, 2, 44100)

        result = separate(input_file, output_dir, model_name="htdemucs")

        assert set(result.stems.keys()) == {"vocals", "drums", "bass", "other"}
        for stem_path in result.stems.values():
            assert stem_path.exists()
            assert stem_path.suffix == ".wav"
        assert result.model_name == "htdemucs"
        assert result.sample_rate == 44100
        assert result.duration_seconds == pytest.approx(1.0, abs=0.01)
        assert result.processing_time_seconds > 0

    @patch("pipeline.separator.apply_model")
    @patch("pipeline.separator._load_model")
    @patch("pipeline.separator._load_audio")
    @patch("pipeline.separator._get_device")
    def test_out_of_memory_raises_separation_error(
        self,
        mock_device,
        mock_load_audio,
        mock_load_model,
        mock_apply,
        tmp_path: Path,
    ):
        input_file = tmp_path / "audio.wav"
        input_file.touch()

        mock_device.return_value = torch.device("cpu")
        mock_load_audio.return_value = (torch.randn(2, 44100), 44100)
        mock_model = MagicMock()
        mock_model.samplerate = 44100
        mock_load_model.return_value = mock_model
        mock_apply.side_effect = torch.cuda.OutOfMemoryError("OOM")

        with pytest.raises(SeparationError, match="Out of GPU memory"):
            separate(input_file, tmp_path / "output")


class TestConstants:
    """Tests for module constants."""

    def test_supported_extensions(self):
        assert SUPPORTED_EXTENSIONS == {".mp3", ".wav", ".flac"}

    def test_valid_models_contain_htdemucs(self):
        assert "htdemucs" in VALID_MODELS
        assert VALID_MODELS["htdemucs"] == ["vocals", "drums", "bass", "other"]

    def test_valid_models_contain_6s(self):
        assert "htdemucs_6s" in VALID_MODELS
        assert "guitar" in VALID_MODELS["htdemucs_6s"]
        assert "piano" in VALID_MODELS["htdemucs_6s"]
