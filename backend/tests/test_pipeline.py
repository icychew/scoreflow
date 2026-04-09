"""Tests for the end-to-end pipeline orchestrator."""

import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

from pipeline.pipeline import (
    run_pipeline,
    PipelineResult,
    StemReport,
    StageStatus,
    SKIP_TRANSCRIPTION_STEMS,
)
from pipeline.separator import SeparationError, SeparationResult
from pipeline.transcriber import TranscriptionError, TranscriptionResult, TranscriptionConfig
from pipeline.quantizer import QuantizationError, QuantizationResult, QuantizationConfig
from pipeline.score_generator import ScoreGenerationError, EmptyMIDIError, ScoreResult, ScoreConfig


class TestStageStatus:
    """Tests for StageStatus dataclass."""

    def test_successful_stage(self):
        s = StageStatus(stage="separation", success=True, output_path="/out/vocals.wav")
        assert s.success is True
        assert s.error is None

    def test_failed_stage(self):
        s = StageStatus(stage="transcription", success=False, error="model crash")
        assert s.success is False
        assert s.error == "model crash"


class TestStemReport:
    """Tests for StemReport."""

    def test_fully_successful(self):
        r = StemReport(stem_name="vocals", stages=[
            StageStatus("separation", True),
            StageStatus("transcription", True),
            StageStatus("quantization", True),
            StageStatus("score_generation", True),
        ])
        assert r.fully_successful is True

    def test_partial_failure(self):
        r = StemReport(stem_name="vocals", stages=[
            StageStatus("separation", True),
            StageStatus("transcription", False, error="fail"),
        ])
        assert r.fully_successful is False


class TestPipelineResult:
    """Tests for PipelineResult."""

    def test_summary_includes_key_info(self):
        result = PipelineResult(
            input_file="test.mp3",
            output_dir="./results",
            total_time_seconds=10.5,
            stems={"vocals": Path("stems/vocals.wav")},
            midi={"vocals": Path("midi/vocals.mid")},
            quantized_midi={"vocals": Path("quantized/vocals.mid")},
            scores={"vocals": Path("scores/vocals.musicxml")},
            reports=[StemReport("vocals", [
                StageStatus("separation", True),
                StageStatus("transcription", True),
                StageStatus("quantization", True),
                StageStatus("score_generation", True),
            ])],
        )
        summary = result.summary
        assert "test.mp3" in summary
        assert "10.5s" in summary
        assert "vocals" in summary
        assert "OK" in summary


class TestRunPipeline:
    """Tests for the main run_pipeline function."""

    @patch("pipeline.pipeline.generate_score")
    @patch("pipeline.pipeline.quantize")
    @patch("pipeline.pipeline.transcribe")
    @patch("pipeline.pipeline.separate")
    def test_full_successful_pipeline(
        self, mock_sep, mock_trans, mock_quant, mock_score, tmp_path: Path
    ):
        input_file = tmp_path / "input.mp3"
        input_file.touch()
        output_dir = tmp_path / "results"

        # Mock separation
        mock_sep.return_value = SeparationResult(
            stems={
                "vocals": tmp_path / "stems" / "vocals.wav",
                "bass": tmp_path / "stems" / "bass.wav",
            },
            model_name="htdemucs",
            sample_rate=44100,
            duration_seconds=10.0,
            processing_time_seconds=5.0,
        )

        # Mock transcription
        mock_trans.return_value = TranscriptionResult(
            midi_path=tmp_path / "midi" / "test.mid",
            note_count=50,
            duration_seconds=10.0,
            processing_time_seconds=2.0,
            config=TranscriptionConfig(),
        )

        # Mock quantization
        mock_quant.return_value = QuantizationResult(
            output_path=tmp_path / "quantized" / "test.mid",
            note_count=48,
            notes_removed=2,
            overlaps_fixed=3,
            gaps_filled=1,
            processing_time_seconds=0.5,
            config=QuantizationConfig(),
        )

        # Mock score generation
        mock_score.return_value = ScoreResult(
            output_path=tmp_path / "scores" / "test.musicxml",
            key_signature="C major",
            time_signature="4/4",
            clef="treble",
            measure_count=8,
            note_count=48,
            processing_time_seconds=1.0,
            config=ScoreConfig(),
        )

        result = run_pipeline(input_file, output_dir)

        assert len(result.stems) == 2
        assert len(result.midi) == 2
        assert len(result.quantized_midi) == 2
        assert len(result.scores) == 2
        assert result.total_time_seconds > 0

    @patch("pipeline.pipeline.separate")
    def test_separation_failure_returns_early(self, mock_sep, tmp_path: Path):
        input_file = tmp_path / "input.mp3"
        input_file.touch()

        mock_sep.side_effect = SeparationError("model not found")

        result = run_pipeline(input_file, tmp_path / "results")

        assert len(result.stems) == 0
        assert len(result.midi) == 0
        assert len(result.scores) == 0

    @patch("pipeline.pipeline.transcribe")
    @patch("pipeline.pipeline.separate")
    def test_transcription_failure_continues_other_stems(
        self, mock_sep, mock_trans, tmp_path: Path
    ):
        input_file = tmp_path / "input.mp3"
        input_file.touch()

        mock_sep.return_value = SeparationResult(
            stems={
                "vocals": tmp_path / "vocals.wav",
                "bass": tmp_path / "bass.wav",
            },
            model_name="htdemucs",
            sample_rate=44100,
            duration_seconds=10.0,
            processing_time_seconds=5.0,
        )

        # First call fails, second succeeds
        mock_trans.side_effect = [
            TranscriptionError("failed for vocals"),
            TranscriptionResult(
                midi_path=tmp_path / "bass.mid",
                note_count=30,
                duration_seconds=10.0,
                processing_time_seconds=2.0,
                config=TranscriptionConfig(),
            ),
        ]

        with patch("pipeline.pipeline.quantize") as mock_quant, \
             patch("pipeline.pipeline.generate_score") as mock_score:
            mock_quant.return_value = QuantizationResult(
                output_path=tmp_path / "bass_q.mid",
                note_count=28,
                notes_removed=2,
                overlaps_fixed=0,
                gaps_filled=0,
                processing_time_seconds=0.1,
                config=QuantizationConfig(),
            )
            mock_score.return_value = ScoreResult(
                output_path=tmp_path / "bass.musicxml",
                key_signature="C major",
                time_signature="4/4",
                clef="bass",
                measure_count=4,
                note_count=28,
                processing_time_seconds=0.5,
                config=ScoreConfig(),
            )

            result = run_pipeline(input_file, tmp_path / "results")

        # Vocals failed at transcription, bass succeeded fully
        assert len(result.midi) == 1
        assert "bass" in result.midi

    @patch("pipeline.pipeline.separate")
    def test_drums_stem_skips_transcription(self, mock_sep, tmp_path: Path):
        input_file = tmp_path / "input.mp3"
        input_file.touch()

        mock_sep.return_value = SeparationResult(
            stems={"drums": tmp_path / "drums.wav"},
            model_name="htdemucs",
            sample_rate=44100,
            duration_seconds=10.0,
            processing_time_seconds=5.0,
        )

        result = run_pipeline(input_file, tmp_path / "results")

        assert "drums" not in result.midi
        assert "drums" not in result.scores
        assert len(result.reports) == 1
        drum_report = result.reports[0]
        assert drum_report.stem_name == "drums"
        assert any("skipped" in (s.error or "") for s in drum_report.stages)

    @patch("pipeline.pipeline.generate_score")
    @patch("pipeline.pipeline.quantize")
    @patch("pipeline.pipeline.transcribe")
    @patch("pipeline.pipeline.separate")
    def test_empty_midi_after_quantization(
        self, mock_sep, mock_trans, mock_quant, mock_score, tmp_path: Path
    ):
        input_file = tmp_path / "input.mp3"
        input_file.touch()

        mock_sep.return_value = SeparationResult(
            stems={"vocals": tmp_path / "vocals.wav"},
            model_name="htdemucs",
            sample_rate=44100,
            duration_seconds=5.0,
            processing_time_seconds=2.0,
        )
        mock_trans.return_value = TranscriptionResult(
            midi_path=tmp_path / "vocals.mid",
            note_count=5,
            duration_seconds=5.0,
            processing_time_seconds=1.0,
            config=TranscriptionConfig(),
        )
        mock_quant.return_value = QuantizationResult(
            output_path=tmp_path / "vocals_q.mid",
            note_count=0,
            notes_removed=5,
            overlaps_fixed=0,
            gaps_filled=0,
            processing_time_seconds=0.1,
            config=QuantizationConfig(),
        )
        mock_score.side_effect = EmptyMIDIError("no notes")

        result = run_pipeline(input_file, tmp_path / "results")

        assert len(result.scores) == 0
        assert len(result.reports) == 1
        assert not result.reports[0].fully_successful


class TestConstants:
    """Tests for module constants."""

    def test_drums_in_skip_list(self):
        assert "drums" in SKIP_TRANSCRIPTION_STEMS

    def test_vocals_not_in_skip_list(self):
        assert "vocals" not in SKIP_TRANSCRIPTION_STEMS
