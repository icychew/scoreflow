"""Pipeline orchestrator.

Runs all processing steps end-to-end:
1. Source separation (Demucs)
2. Audio-to-MIDI transcription (Basic Pitch)
3. MIDI quantization
4. Score generation (music21)

Usage:
    python pipeline.py input.mp3 --output-dir ./results
"""

import argparse
import json
import logging
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from pipeline.separator import separate, SeparationError
from pipeline.transcriber import transcribe, TranscriptionError, TranscriptionConfig, VOCAL_CONFIG, PIANO_CONFIG, BASS_CONFIG, GUITAR_CONFIG, OTHER_CONFIG
from pipeline.quantizer import quantize, QuantizationError, QuantizationConfig
from pipeline.score_generator import generate_score, ScoreGenerationError, EmptyMIDIError, ScoreConfig

logger = logging.getLogger(__name__)

# Stems that should skip pitch-based transcription
SKIP_TRANSCRIPTION_STEMS = {"drums"}

# Minimum note count after transcription — stems below this are too noisy to score
MIN_NOTES_THRESHOLD = 10

# Transcription presets by stem name
TRANSCRIPTION_PRESETS: dict[str, TranscriptionConfig] = {
    "vocals": VOCAL_CONFIG,
    "piano": PIANO_CONFIG,
    "bass": BASS_CONFIG,
    "guitar": GUITAR_CONFIG,
    "other": OTHER_CONFIG,
}

# Per-stem quantization configs: melodic/polyphonic stems get lighter snapping
QUANTIZATION_CONFIGS: dict[str, QuantizationConfig] = {
    "vocals": QuantizationConfig(subdivision=8, strength=0.7),
    "guitar": QuantizationConfig(subdivision=8, strength=0.7),
    "other":  QuantizationConfig(subdivision=8, strength=0.7),
    "bass":   QuantizationConfig(subdivision=8, strength=0.9),
    "piano":  QuantizationConfig(subdivision=16, strength=0.8),
}


def _detect_tempo(input_path: Path) -> float:
    """Detect song BPM using librosa beat tracking. Returns 120.0 on failure."""
    try:
        import librosa
        y, sr = librosa.load(str(input_path), sr=None, mono=True, duration=60.0)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo) if hasattr(tempo, '__float__') else float(tempo[0])
        logger.info("Detected tempo: %.1f BPM", bpm)
        return bpm if 40.0 <= bpm <= 240.0 else 120.0
    except Exception as exc:
        logger.warning("Tempo detection failed (%s), defaulting to 120 BPM", exc)
        return 120.0


@dataclass
class StageStatus:
    """Status of a single pipeline stage for one stem.

    Note: Intentionally mutable (no frozen=True) — these are built
    incrementally during pipeline execution.
    """

    stage: str
    success: bool
    error: str | None = None
    output_path: str | None = None


@dataclass
class StemReport:
    """Processing report for a single stem.

    Note: Intentionally mutable — stages are appended during processing.
    """

    stem_name: str
    stages: list[StageStatus] = field(default_factory=list)

    @property
    def fully_successful(self) -> bool:
        return all(s.success for s in self.stages)


@dataclass
class PipelineResult:
    """Result of the full pipeline run.

    Note: Intentionally mutable — populated incrementally as stages complete.
    """

    input_file: str
    output_dir: str
    total_time_seconds: float
    stems: dict[str, Path] = field(default_factory=dict)
    midi: dict[str, Path] = field(default_factory=dict)
    quantized_midi: dict[str, Path] = field(default_factory=dict)
    scores: dict[str, Path] = field(default_factory=dict)
    reports: list[StemReport] = field(default_factory=list)

    @property
    def summary(self) -> str:
        lines = [
            f"ScoreFlow Pipeline Summary",
            f"{'=' * 40}",
            f"Input: {self.input_file}",
            f"Output: {self.output_dir}",
            f"Total time: {self.total_time_seconds:.1f}s",
            f"",
            f"Stems separated: {len(self.stems)}",
            f"MIDI transcribed: {len(self.midi)}",
            f"MIDI quantized: {len(self.quantized_midi)}",
            f"Scores generated: {len(self.scores)}",
            f"",
        ]

        for report in self.reports:
            status = "OK" if report.fully_successful else "PARTIAL"
            lines.append(f"  {report.stem_name}: {status}")
            for stage in report.stages:
                marker = "+" if stage.success else "x"
                detail = f" -> {stage.output_path}" if stage.output_path else ""
                error_detail = f" [{stage.error}]" if stage.error else ""
                lines.append(f"    [{marker}] {stage.stage}{detail}{error_detail}")

        return "\n".join(lines)


def run_pipeline(
    input_path: Path,
    output_dir: Path,
    model_name: str = "htdemucs",
    quantization_config: QuantizationConfig | None = None,
    score_config: ScoreConfig | None = None,
) -> PipelineResult:
    """Run the full audio-to-score pipeline.

    Args:
        input_path: Path to the input audio file.
        output_dir: Base directory for all output files.
        model_name: Demucs model name for separation.
        quantization_config: Config for MIDI quantization. Uses defaults if None.
        score_config: Config for score generation. Uses defaults if None.

    Returns:
        PipelineResult with paths to all generated outputs and per-stem reports.
    """
    start_time = time.monotonic()

    stems_dir = output_dir / "stems"
    midi_dir = output_dir / "midi"
    quantized_dir = output_dir / "quantized"
    scores_dir = output_dir / "scores"

    result = PipelineResult(
        input_file=str(input_path),
        output_dir=str(output_dir),
        total_time_seconds=0.0,
    )

    # Detect song tempo before separation so all stems use the real BPM
    detected_bpm = _detect_tempo(input_path)

    # Stage 1: Source Separation
    logger.info("=" * 50)
    logger.info("STAGE 1: Source Separation (Demucs %s)", model_name)
    logger.info("=" * 50)

    try:
        sep_result = separate(input_path, stems_dir, model_name=model_name)
        result.stems = sep_result.stems
        logger.info(
            "Separation complete: %d stems in %.1fs",
            len(sep_result.stems),
            sep_result.processing_time_seconds,
        )
    except SeparationError as exc:
        logger.error("Source separation failed: %s", exc)
        result.total_time_seconds = time.monotonic() - start_time
        return result

    # Stages 2-4: Per-stem processing
    for stem_name, stem_path in result.stems.items():
        report = StemReport(stem_name=stem_name)
        report.stages.append(StageStatus(
            stage="separation",
            success=True,
            output_path=str(stem_path),
        ))

        # Stage 2: Transcription
        if stem_name in SKIP_TRANSCRIPTION_STEMS:
            logger.info("Skipping transcription for '%s' (percussion)", stem_name)
            report.stages.append(StageStatus(
                stage="transcription",
                success=False,
                error="skipped (percussion stem)",
            ))
            result.reports.append(report)
            continue

        logger.info("-" * 40)
        logger.info("STAGE 2: Transcribing '%s'", stem_name)

        midi_path = midi_dir / f"{stem_name}.mid"
        trans_config = TRANSCRIPTION_PRESETS.get(stem_name)

        try:
            trans_result = transcribe(stem_path, midi_path, config=trans_config)
            result.midi[stem_name] = trans_result.midi_path
            report.stages.append(StageStatus(
                stage="transcription",
                success=True,
                output_path=str(trans_result.midi_path),
            ))
            logger.info(
                "Transcription complete: %d notes in %.1fs",
                trans_result.note_count,
                trans_result.processing_time_seconds,
            )
        except TranscriptionError as exc:
            logger.error("Transcription failed for '%s': %s", stem_name, exc)
            report.stages.append(StageStatus(
                stage="transcription",
                success=False,
                error=str(exc),
            ))
            result.reports.append(report)
            continue

        # Quality gate: skip stems with too few notes (too noisy to produce a readable score)
        if trans_result.note_count < MIN_NOTES_THRESHOLD:
            logger.warning(
                "Skipping '%s': only %d notes detected (threshold: %d) — stem too noisy",
                stem_name, trans_result.note_count, MIN_NOTES_THRESHOLD,
            )
            report.stages.append(StageStatus(
                stage="quantization",
                success=False,
                error=f"skipped — only {trans_result.note_count} notes detected (too noisy)",
            ))
            report.stages.append(StageStatus(
                stage="score_generation",
                success=False,
                error="skipped — stem too noisy",
            ))
            result.reports.append(report)
            continue

        # Stage 3: Quantization — use per-stem config with detected BPM
        logger.info("STAGE 3: Quantizing '%s'", stem_name)

        quantized_path = quantized_dir / f"{stem_name}.mid"

        # Build quantization config: prefer per-stem preset, then caller override, then default
        stem_quant = QUANTIZATION_CONFIGS.get(stem_name)
        if quantization_config is not None:
            # Caller provided a config — honour it but inject detected tempo
            effective_quant = QuantizationConfig(
                subdivision=quantization_config.subdivision,
                strength=quantization_config.strength,
                velocity_min=quantization_config.velocity_min,
                velocity_max=quantization_config.velocity_max,
                normalize_velocity=quantization_config.normalize_velocity,
                remove_overlaps=quantization_config.remove_overlaps,
                min_gap_threshold=quantization_config.min_gap_threshold,
                min_note_duration=quantization_config.min_note_duration,
                tempo=detected_bpm,
            )
        elif stem_quant is not None:
            effective_quant = QuantizationConfig(
                subdivision=stem_quant.subdivision,
                strength=stem_quant.strength,
                tempo=detected_bpm,
            )
        else:
            effective_quant = QuantizationConfig(tempo=detected_bpm)

        try:
            quant_result = quantize(midi_path, quantized_path, config=effective_quant)
            result.quantized_midi[stem_name] = quant_result.output_path
            report.stages.append(StageStatus(
                stage="quantization",
                success=True,
                output_path=str(quant_result.output_path),
            ))
            logger.info(
                "Quantization complete: %d notes, %d overlaps fixed in %.1fs",
                quant_result.note_count,
                quant_result.overlaps_fixed,
                quant_result.processing_time_seconds,
            )
        except QuantizationError as exc:
            logger.error("Quantization failed for '%s': %s", stem_name, exc)
            report.stages.append(StageStatus(
                stage="quantization",
                success=False,
                error=str(exc),
            ))
            result.reports.append(report)
            continue

        # Stage 4: Score Generation
        logger.info("STAGE 4: Generating score for '%s'", stem_name)

        score_path = scores_dir / f"{stem_name}.musicxml"
        stem_score_config = score_config
        if stem_score_config is None:
            stem_score_config = ScoreConfig(title=f"{stem_name.capitalize()} Part")

        try:
            score_result = generate_score(quantized_path, score_path, config=stem_score_config, stem_name=stem_name)
            result.scores[stem_name] = score_result.output_path
            report.stages.append(StageStatus(
                stage="score_generation",
                success=True,
                output_path=str(score_result.output_path),
            ))
            logger.info(
                "Score generation complete: key=%s, %d measures in %.1fs",
                score_result.key_signature,
                score_result.measure_count,
                score_result.processing_time_seconds,
            )
        except EmptyMIDIError:
            logger.warning("No notes for '%s' after quantization, skipping score", stem_name)
            report.stages.append(StageStatus(
                stage="score_generation",
                success=False,
                error="no notes after quantization",
            ))
        except ScoreGenerationError as exc:
            logger.error("Score generation failed for '%s': %s", stem_name, exc)
            report.stages.append(StageStatus(
                stage="score_generation",
                success=False,
                error=str(exc),
            ))

        result.reports.append(report)

    result.total_time_seconds = time.monotonic() - start_time
    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="ScoreFlow AI Pipeline — Convert audio to sheet music",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
Examples:
  python -m pipeline.pipeline input.mp3
  python -m pipeline.pipeline input.wav --output-dir ./my_results
  python -m pipeline.pipeline input.flac --model htdemucs_6s
  python -m pipeline.pipeline input.mp3 --subdivision 8 --strength 0.8
""",
    )
    parser.add_argument("input", type=Path, help="Input audio file (MP3/WAV/FLAC)")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("./results"),
        help="Output directory (default: ./results)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="htdemucs",
        choices=["htdemucs", "htdemucs_ft", "htdemucs_6s"],
        help="Demucs model (default: htdemucs)",
    )
    parser.add_argument(
        "--subdivision",
        type=int,
        default=16,
        choices=[4, 8, 16, 32],
        help="Quantization subdivision (default: 16th note)",
    )
    parser.add_argument(
        "--strength",
        type=float,
        default=1.0,
        help="Quantization strength 0.0-1.0 (default: 1.0)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging",
    )

    args = parser.parse_args()

    # Configure logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    # Validate input
    if not args.input.exists():
        logger.error("Input file not found: %s", args.input)
        sys.exit(1)

    quant_config = QuantizationConfig(
        subdivision=args.subdivision,
        strength=args.strength,
    )

    logger.info("ScoreFlow Pipeline starting...")
    logger.info("Input: %s", args.input)
    logger.info("Output: %s", args.output_dir)
    logger.info("Model: %s", args.model)

    result = run_pipeline(
        input_path=args.input,
        output_dir=args.output_dir,
        model_name=args.model,
        quantization_config=quant_config,
    )

    # Print summary
    logger.info("\n%s", result.summary)

    # Write summary to JSON
    summary_path = args.output_dir / "pipeline_summary.json"
    summary_data = {
        "input_file": result.input_file,
        "output_dir": result.output_dir,
        "total_time_seconds": result.total_time_seconds,
        "stems": {k: str(v) for k, v in result.stems.items()},
        "midi": {k: str(v) for k, v in result.midi.items()},
        "quantized_midi": {k: str(v) for k, v in result.quantized_midi.items()},
        "scores": {k: str(v) for k, v in result.scores.items()},
        "reports": [
            {
                "stem_name": r.stem_name,
                "fully_successful": r.fully_successful,
                "stages": [
                    {
                        "stage": s.stage,
                        "success": s.success,
                        "error": s.error,
                        "output_path": s.output_path,
                    }
                    for s in r.stages
                ],
            }
            for r in result.reports
        ],
    }
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary_data, indent=2))
    logger.info("Summary written to: %s", summary_path)


if __name__ == "__main__":
    main()
