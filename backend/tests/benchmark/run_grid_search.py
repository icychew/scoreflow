"""Grid-search per-stem transcription thresholds against the benchmark.

Sweeps `onset_threshold` × `frame_threshold` for each instrument category in
the benchmark `test_samples/` directory, calls `transcriber.transcribe()`
directly on each sample's input audio, and compares the result against the
ground-truth MIDI using onset+pitch matching.

Writes the F1-optimal thresholds for each instrument to
``backend/training/calibrated_configs.json``. The transcriber's
``_load_calibrated_configs()`` automatically picks up the file on next import,
so no further wiring is needed — re-run the regular benchmark to see the
improvement.

Usage:
    python -m backend.tests.benchmark.run_grid_search \
        --samples-dir backend/tests/benchmark/test_samples \
        --output backend/training/calibrated_configs.json
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

# Map sample-directory `instrument` field → transcriber preset constant name.
# Synthetic samples written by download_datasets.py use these labels.
INSTRUMENT_MAP = {
    "piano": "piano",
    "vocals": "vocals",
    "bass": "bass",
    "guitar": "guitar",
    "other": "other",
    "synth": "other",
    "mixed": "other",  # full mixes default to OTHER_CONFIG
    "drums": None,  # transcription skipped
}

ONSET_GRID = [0.30, 0.40, 0.50, 0.60, 0.70]
FRAME_GRID = [0.20, 0.30, 0.40]


@dataclass(frozen=True)
class GridCell:
    onset: float
    frame: float
    f1: float
    precision: float
    recall: float


@dataclass
class InstrumentResult:
    instrument: str
    samples_evaluated: int = 0
    cells: list[GridCell] = field(default_factory=list)

    @property
    def best(self) -> GridCell | None:
        return max(self.cells, key=lambda c: c.f1, default=None)


def _load_metadata(sample_dir: Path) -> dict | None:
    meta_path = sample_dir / "metadata.json"
    if not meta_path.exists():
        return None
    try:
        return json.loads(meta_path.read_text())
    except Exception as exc:
        logger.warning("Could not parse %s: %s", meta_path, exc)
        return None


def _load_midi_notes(midi_path: Path):
    """Load notes as list of (pitch, start, end) tuples."""
    import pretty_midi
    midi = pretty_midi.PrettyMIDI(str(midi_path))
    out = []
    for inst in midi.instruments:
        if inst.is_drum:
            continue
        for n in inst.notes:
            out.append((n.pitch, n.start, n.end))
    return sorted(out, key=lambda t: (t[1], t[0]))


def _compare(reference, detected, onset_tolerance: float = 0.05) -> tuple[int, int, int]:
    """Returns (true_positives, false_positives, false_negatives)."""
    matched_ref: set[int] = set()
    matched_det: set[int] = set()
    for i, (det_pitch, det_start, _) in enumerate(detected):
        for j, (ref_pitch, ref_start, _) in enumerate(reference):
            if j in matched_ref:
                continue
            if det_pitch == ref_pitch and abs(det_start - ref_start) <= onset_tolerance:
                matched_ref.add(j)
                matched_det.add(i)
                break
    tp = len(matched_ref)
    fp = len(detected) - len(matched_det)
    fn = len(reference) - len(matched_ref)
    return tp, fp, fn


def evaluate_cell(
    audio_path: Path,
    gt_path: Path,
    onset: float,
    frame: float,
    tmp_dir: Path,
) -> tuple[int, int, int]:
    """Run transcription with the given thresholds, return tp/fp/fn vs ground truth."""
    from pipeline.transcriber import transcribe, TranscriptionConfig

    cfg = TranscriptionConfig(
        onset_threshold=onset,
        frame_threshold=frame,
    )
    midi_out = tmp_dir / f"out_o{onset:.2f}_f{frame:.2f}.mid"
    try:
        transcribe(audio_path, midi_out, config=cfg)
    except Exception as exc:
        logger.warning("Transcription failed at onset=%.2f frame=%.2f: %s", onset, frame, exc)
        return 0, 0, 0

    if not midi_out.exists():
        return 0, 0, 0

    reference = _load_midi_notes(gt_path)
    detected = _load_midi_notes(midi_out)
    return _compare(reference, detected)


def grid_search_instrument(
    instrument: str,
    sample_dirs: list[Path],
    tmp_dir: Path,
) -> InstrumentResult:
    """Sweep the onset × frame grid for one instrument category."""
    result = InstrumentResult(instrument=instrument)
    if not sample_dirs:
        return result

    # For each grid cell, accumulate tp/fp/fn across all samples
    for onset in ONSET_GRID:
        for frame in FRAME_GRID:
            total_tp = total_fp = total_fn = 0
            samples_used = 0
            cell_dir = tmp_dir / instrument / f"o{onset:.2f}_f{frame:.2f}"
            cell_dir.mkdir(parents=True, exist_ok=True)

            for sample_dir in sample_dirs:
                # Find input audio
                audio = None
                for ext in (".wav", ".mp3", ".flac"):
                    candidate = sample_dir / f"input{ext}"
                    if candidate.exists():
                        audio = candidate
                        break
                gt = sample_dir / "ground_truth.mid"
                if not audio or not gt.exists():
                    continue

                tp, fp, fn = evaluate_cell(audio, gt, onset, frame, cell_dir)
                total_tp += tp
                total_fp += fp
                total_fn += fn
                samples_used += 1

            if samples_used == 0:
                continue

            precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) else 0.0
            recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) else 0.0
            f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

            result.cells.append(GridCell(
                onset=onset, frame=frame, f1=f1, precision=precision, recall=recall,
            ))
            result.samples_evaluated = max(result.samples_evaluated, samples_used)

    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Grid-search transcription thresholds")
    parser.add_argument(
        "--samples-dir",
        type=Path,
        default=Path(__file__).parent / "test_samples",
        help="Benchmark samples directory",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).parent.parent.parent / "training" / "calibrated_configs.json",
        help="Where to write the optimal thresholds JSON",
    )
    parser.add_argument(
        "--tmp-dir",
        type=Path,
        default=Path("/tmp/notara-grid-search") if Path("/tmp").exists() else Path(".") / ".grid-search",
        help="Scratch directory for per-cell MIDI outputs",
    )
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    if not args.samples_dir.exists():
        logger.error("Samples directory not found: %s", args.samples_dir)
        sys.exit(1)

    # Group samples by instrument
    by_instrument: dict[str, list[Path]] = {}
    for sample_dir in sorted(args.samples_dir.iterdir()):
        if not sample_dir.is_dir() or sample_dir.name.startswith("."):
            continue
        meta = _load_metadata(sample_dir)
        if not meta:
            continue
        raw_instrument = str(meta.get("instrument", "")).lower()
        mapped = INSTRUMENT_MAP.get(raw_instrument)
        if not mapped:
            continue
        by_instrument.setdefault(mapped, []).append(sample_dir)

    if not by_instrument:
        logger.error(
            "No usable samples found in %s. Run download_datasets.py first.",
            args.samples_dir,
        )
        sys.exit(1)

    logger.info(
        "Grid-search categories: %s",
        ", ".join(f"{k} ({len(v)} samples)" for k, v in by_instrument.items()),
    )

    args.tmp_dir.mkdir(parents=True, exist_ok=True)

    calibrated: dict[str, dict] = {}
    start = time.monotonic()
    for instrument, dirs in by_instrument.items():
        logger.info("=" * 60)
        logger.info("Grid-searching '%s' over %d samples", instrument, len(dirs))
        result = grid_search_instrument(instrument, dirs, args.tmp_dir)
        best = result.best
        if best is None:
            logger.warning("No usable cells for '%s' — keeping hand-tuned defaults", instrument)
            continue
        logger.info(
            "  best: onset=%.2f frame=%.2f → F1=%.3f (P=%.3f R=%.3f)",
            best.onset, best.frame, best.f1, best.precision, best.recall,
        )
        calibrated[instrument] = {
            "onset_threshold": best.onset,
            "frame_threshold": best.frame,
            "f1": round(best.f1, 4),
            "precision": round(best.precision, 4),
            "recall": round(best.recall, 4),
            "samples_evaluated": result.samples_evaluated,
        }

    elapsed = time.monotonic() - start
    logger.info("Grid search complete in %.1fs", elapsed)

    if not calibrated:
        logger.error("No instruments yielded a best cell. Output not written.")
        sys.exit(1)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(calibrated, indent=2))
    logger.info("Wrote calibrated thresholds to %s", args.output)
    logger.info("transcriber.py will auto-load this on next import.")


if __name__ == "__main__":
    main()
