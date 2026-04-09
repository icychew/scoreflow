"""Benchmark evaluation script for the ScoreFlow pipeline.

Runs the pipeline against a set of test audio samples and produces
an accuracy report. Compares generated MIDI against ground truth MIDI
files (if available) to calculate note detection accuracy.

Usage:
    python -m tests.benchmark.run_benchmark --samples-dir ./test_samples --output-dir ./benchmark_results

Expected samples directory structure:
    test_samples/
        01_piano_solo/
            input.wav           # Input audio file
            ground_truth.mid    # (Optional) Reference MIDI for accuracy comparison
            metadata.json       # Sample metadata (description, expected key, etc.)
        02_vocal_melody/
            input.wav
            ...
"""

import argparse
import json
import logging
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class NoteEvent:
    """A single note event for comparison."""

    pitch: int
    start: float
    end: float

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass
class AccuracyMetrics:
    """Accuracy metrics for a single sample."""

    sample_name: str
    description: str = ""
    total_reference_notes: int = 0
    total_detected_notes: int = 0
    true_positives: int = 0
    false_positives: int = 0
    false_negatives: int = 0
    key_detected: str = ""
    key_expected: str = ""
    key_correct: bool = False
    time_signature_detected: str = ""
    time_signature_expected: str = ""
    time_signature_correct: bool = False
    processing_time_seconds: float = 0.0
    error: str | None = None

    @property
    def precision(self) -> float:
        if self.true_positives + self.false_positives == 0:
            return 0.0
        return self.true_positives / (self.true_positives + self.false_positives)

    @property
    def recall(self) -> float:
        if self.true_positives + self.false_negatives == 0:
            return 0.0
        return self.true_positives / (self.true_positives + self.false_negatives)

    @property
    def f1_score(self) -> float:
        p, r = self.precision, self.recall
        if p + r == 0:
            return 0.0
        return 2 * p * r / (p + r)

    @property
    def note_accuracy_pct(self) -> float:
        return self.recall * 100


def _load_midi_notes(midi_path: Path) -> list[NoteEvent]:
    """Load notes from a MIDI file as NoteEvent list."""
    import pretty_midi

    midi = pretty_midi.PrettyMIDI(str(midi_path))
    notes = []
    for instrument in midi.instruments:
        if instrument.is_drum:
            continue
        for note in instrument.notes:
            notes.append(NoteEvent(pitch=note.pitch, start=note.start, end=note.end))
    return sorted(notes, key=lambda n: (n.start, n.pitch))


def _compare_notes(
    reference: list[NoteEvent],
    detected: list[NoteEvent],
    pitch_tolerance: int = 0,
    onset_tolerance: float = 0.05,
) -> tuple[int, int, int]:
    """Compare reference and detected notes.

    Returns:
        Tuple of (true_positives, false_positives, false_negatives).
    """
    matched_ref = set()
    matched_det = set()

    for i, det in enumerate(detected):
        for j, ref in enumerate(reference):
            if j in matched_ref:
                continue
            pitch_match = abs(det.pitch - ref.pitch) <= pitch_tolerance
            onset_match = abs(det.start - ref.start) <= onset_tolerance
            if pitch_match and onset_match:
                matched_ref.add(j)
                matched_det.add(i)
                break

    true_positives = len(matched_ref)
    false_positives = len(detected) - len(matched_det)
    false_negatives = len(reference) - len(matched_ref)

    return true_positives, false_positives, false_negatives


def evaluate_sample(
    sample_dir: Path,
    output_dir: Path,
) -> AccuracyMetrics:
    """Evaluate a single test sample through the pipeline.

    Args:
        sample_dir: Directory containing input.wav and optionally ground_truth.mid.
        output_dir: Directory for pipeline output.

    Returns:
        AccuracyMetrics for this sample.
    """
    from pipeline.pipeline import run_pipeline

    sample_name = sample_dir.name

    # Load metadata
    metadata_path = sample_dir / "metadata.json"
    metadata = {}
    if metadata_path.exists():
        metadata = json.loads(metadata_path.read_text())

    metrics = AccuracyMetrics(
        sample_name=sample_name,
        description=metadata.get("description", ""),
        key_expected=metadata.get("expected_key", ""),
        time_signature_expected=metadata.get("expected_time_signature", ""),
    )

    # Find input audio
    input_file = None
    for ext in [".wav", ".mp3", ".flac"]:
        candidate = sample_dir / f"input{ext}"
        if candidate.exists():
            input_file = candidate
            break

    if input_file is None:
        metrics.error = "No input audio file found"
        return metrics

    # Run pipeline
    sample_output = output_dir / sample_name
    start_time = time.monotonic()

    try:
        result = run_pipeline(input_file, sample_output)
        metrics.processing_time_seconds = time.monotonic() - start_time
    except Exception as exc:
        metrics.error = str(exc)
        metrics.processing_time_seconds = time.monotonic() - start_time
        return metrics

    # TODO: Extract key and time signature from generated MusicXML scores
    # when music21 is available. Currently the pipeline result doesn't
    # expose these directly — requires parsing the MusicXML output.

    # Compare against ground truth if available
    ground_truth_path = sample_dir / "ground_truth.mid"
    if ground_truth_path.exists() and result.quantized_midi:
        try:
            ref_notes = _load_midi_notes(ground_truth_path)
            metrics.total_reference_notes = len(ref_notes)

            # Compare each quantized stem's MIDI against ground truth
            all_detected = []
            for stem_name, midi_path in result.quantized_midi.items():
                detected = _load_midi_notes(midi_path)
                all_detected.extend(detected)

            metrics.total_detected_notes = len(all_detected)

            tp, fp, fn = _compare_notes(ref_notes, all_detected)
            metrics.true_positives = tp
            metrics.false_positives = fp
            metrics.false_negatives = fn
        except Exception as exc:
            logger.error("Failed to compare MIDI for '%s': %s", sample_name, exc)

    return metrics


def generate_report(metrics_list: list[AccuracyMetrics], output_path: Path) -> str:
    """Generate a markdown benchmark report."""
    lines = [
        "# ScoreFlow Pipeline — Accuracy Benchmark Report",
        "",
        f"**Date:** {time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"**Samples tested:** {len(metrics_list)}",
        "",
        "## Summary",
        "",
        "| # | Sample | Notes (Ref) | Notes (Det) | Precision | Recall | F1 | Accuracy % | Key | Time Sig | Time (s) |",
        "|---|--------|-------------|-------------|-----------|--------|----|------------|-----|----------|----------|",
    ]

    for i, m in enumerate(metrics_list, 1):
        if m.error:
            lines.append(
                f"| {i} | {m.sample_name} | ERROR | - | - | - | - | - | - | - | {m.processing_time_seconds:.1f} |"
            )
            continue

        key_mark = "Y" if m.key_correct else ("N" if m.key_expected else "-")
        ts_mark = "Y" if m.time_signature_correct else ("N" if m.time_signature_expected else "-")

        lines.append(
            f"| {i} | {m.sample_name} | {m.total_reference_notes} | {m.total_detected_notes} | "
            f"{m.precision:.2f} | {m.recall:.2f} | {m.f1_score:.2f} | "
            f"{m.note_accuracy_pct:.1f}% | {key_mark} | {ts_mark} | "
            f"{m.processing_time_seconds:.1f} |"
        )

    # Per-sample details
    lines.extend(["", "## Per-Sample Details", ""])

    for m in metrics_list:
        lines.append(f"### {m.sample_name}")
        lines.append("")
        if m.description:
            lines.append(f"**Description:** {m.description}")
        if m.error:
            lines.append(f"**Error:** {m.error}")
            lines.append("")
            continue

        lines.extend([
            f"- **Reference notes:** {m.total_reference_notes}",
            f"- **Detected notes:** {m.total_detected_notes}",
            f"- **True positives:** {m.true_positives}",
            f"- **False positives:** {m.false_positives}",
            f"- **False negatives:** {m.false_negatives}",
            f"- **Precision:** {m.precision:.3f}",
            f"- **Recall (accuracy):** {m.recall:.3f} ({m.note_accuracy_pct:.1f}%)",
            f"- **F1 score:** {m.f1_score:.3f}",
            f"- **Key detected:** {m.key_detected or 'N/A'} (expected: {m.key_expected or 'N/A'})",
            f"- **Time signature:** {m.time_signature_detected or 'N/A'} (expected: {m.time_signature_expected or 'N/A'})",
            f"- **Processing time:** {m.processing_time_seconds:.1f}s",
            "",
        ])

    report = "\n".join(lines)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(report, encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="ScoreFlow Pipeline Benchmark")
    parser.add_argument(
        "--samples-dir",
        type=Path,
        required=True,
        help="Directory containing test sample subdirectories",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("./benchmark_results"),
        help="Output directory for results (default: ./benchmark_results)",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
        help="Path for markdown report (default: <output-dir>/accuracy-benchmark.md)",
    )
    parser.add_argument("--verbose", "-v", action="store_true")

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    if not args.samples_dir.exists():
        logger.error("Samples directory not found: %s", args.samples_dir)
        sys.exit(1)

    # Find all sample directories
    sample_dirs = sorted([
        d for d in args.samples_dir.iterdir()
        if d.is_dir() and not d.name.startswith(".")
    ])

    if not sample_dirs:
        logger.error("No sample directories found in %s", args.samples_dir)
        sys.exit(1)

    logger.info("Found %d test samples", len(sample_dirs))

    # Run evaluation
    all_metrics: list[AccuracyMetrics] = []
    for sample_dir in sample_dirs:
        logger.info("=" * 50)
        logger.info("Evaluating: %s", sample_dir.name)
        logger.info("=" * 50)

        metrics = evaluate_sample(sample_dir, args.output_dir)
        all_metrics.append(metrics)

        if metrics.error:
            logger.error("  FAILED: %s", metrics.error)
        else:
            logger.info(
                "  Result: accuracy=%.1f%%, precision=%.2f, recall=%.2f, F1=%.2f",
                metrics.note_accuracy_pct,
                metrics.precision,
                metrics.recall,
                metrics.f1_score,
            )

    # Generate report
    report_path = args.report or (args.output_dir / "accuracy-benchmark.md")
    report = generate_report(all_metrics, report_path)
    logger.info("Report written to: %s", report_path)

    # Also save raw metrics as JSON
    json_path = args.output_dir / "benchmark_metrics.json"
    json_data = []
    for m in all_metrics:
        json_data.append({
            "sample_name": m.sample_name,
            "description": m.description,
            "total_reference_notes": m.total_reference_notes,
            "total_detected_notes": m.total_detected_notes,
            "true_positives": m.true_positives,
            "false_positives": m.false_positives,
            "false_negatives": m.false_negatives,
            "precision": m.precision,
            "recall": m.recall,
            "f1_score": m.f1_score,
            "note_accuracy_pct": m.note_accuracy_pct,
            "key_detected": m.key_detected,
            "key_expected": m.key_expected,
            "key_correct": m.key_correct,
            "time_signature_detected": m.time_signature_detected,
            "time_signature_expected": m.time_signature_expected,
            "time_signature_correct": m.time_signature_correct,
            "processing_time_seconds": m.processing_time_seconds,
            "error": m.error,
        })
    json_path.write_text(json.dumps(json_data, indent=2))
    logger.info("Raw metrics written to: %s", json_path)


if __name__ == "__main__":
    main()
