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
from pipeline.transcriber import transcribe, TranscriptionError, TranscriptionConfig, VOCAL_CONFIG, PIANO_CONFIG, BASS_CONFIG
from pipeline.quantizer import quantize, QuantizationError, QuantizationConfig
from pipeline.score_generator import generate_score, ScoreGenerationError, EmptyMIDIError, ScoreConfig

logger = logging.getLogger(__name__)

# Stems that should skip pitch-based transcription
SKIP_TRANSCRIPTION_STEMS = {"drums"}

# Transcription presets by stem name
TRANSCRIPTION_PRESETS: dict[str, TranscriptionConfig] = {
    "vocals": VOCAL_CONFIG,
    "piano": PIANO_CONFIG,
    "bass": BASS_CONFIG,
}


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

        # Stage 3: Quantization
        logger.info("STAGE 3: Quantizing '%s'", stem_name)

        quantized_path = quantized_dir / f"{stem_name}.mid"

        try:
            quant_result = quantize(midi_path, quantized_path, config=quantization_config)
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
            score_result = generate_score(quantized_path, score_path, config=stem_score_config)
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
