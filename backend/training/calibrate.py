"""Per-instrument Basic Pitch threshold calibration via grid search.

Iterates over (onset_threshold, frame_threshold, min_freq, max_freq) for each
instrument, runs Basic Pitch inference on a sample of audio/MIDI pairs, scores
using note-F1 (with 50 ms onset tolerance), and writes the best config to
``backend/training/calibrated_configs.json``.

Usage::

    # Calibrate guitar using GuitarSet (must be downloaded first)
    python -m training.calibrate --instrument guitar

    # Calibrate piano using MAPS
    python -m training.calibrate --instrument piano

    # Calibrate all instruments and write calibrated_configs.json
    python -m training.calibrate --all

Calibrated configs are automatically loaded by pipeline/transcriber.py at
startup if the file is present. Falls back to hand-tuned defaults otherwise.

Dependencies: basic_pitch (already installed), mir_eval (pip install mir-eval)
"""

import argparse
import itertools
import json
import logging
import tempfile
from pathlib import Path
from typing import NamedTuple

import numpy as np

logger = logging.getLogger(__name__)

# Output file (committed once and loaded by transcriber.py)
CALIBRATED_CONFIG_PATH = Path(__file__).parent / "calibrated_configs.json"

# Grid values to search
ONSET_THRESHOLDS = [0.3, 0.4, 0.5, 0.6]
FRAME_THRESHOLDS = [0.2, 0.3, 0.4, 0.5]

# Instrument-specific frequency search bounds (min_freq, max_freq)
FREQ_BOUNDS: dict[str, list[tuple[float, float]]] = {
    "guitar":  [(82.0, 1319.0), (75.0, 1400.0)],
    "piano":   [(27.5, 4186.0), (40.0, 3000.0)],
    "bass":    [(30.0,  400.0), (40.0,  500.0)],
    "vocals":  [(80.0, 1100.0), (100.0, 1000.0)],
    "other":   [(100.0, 2000.0), (80.0, 2500.0)],
}

ONSET_TOLERANCE = 0.05  # 50 ms
MAX_PAIRS_PER_INSTRUMENT = 20  # cap to keep calibration fast


# ── Data structures ────────────────────────────────────────────────────────────

class CalibPoint(NamedTuple):
    onset_threshold: float
    frame_threshold: float
    min_frequency: float
    max_frequency: float
    note_f1: float


# ── Scoring ────────────────────────────────────────────────────────────────────

def _midi_to_note_intervals(midi_path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Load a MIDI file and return (intervals, pitches) arrays for mir_eval."""
    import pretty_midi
    pm = pretty_midi.PrettyMIDI(str(midi_path))
    intervals, pitches = [], []
    for inst in pm.instruments:
        if inst.is_drum:
            continue
        for note in inst.notes:
            intervals.append([note.start, note.end])
            pitches.append(note.pitch)
    if not intervals:
        return np.zeros((0, 2)), np.zeros(0)
    return np.array(intervals), np.array(pitches, dtype=float)


def _score_pair(wav_path: Path, ref_midi: Path, onset_thr: float, frame_thr: float,
                min_freq: float, max_freq: float) -> float:
    """Run Basic Pitch on wav_path and compute note F1 against ref_midi."""
    try:
        import mir_eval
        from basic_pitch.inference import predict
    except ImportError as exc:
        raise ImportError(f"Required dependency missing: {exc}. Install with: pip install mir-eval") from exc

    with tempfile.NamedTemporaryFile(suffix=".mid", delete=False) as tf:
        tmp_midi = Path(tf.name)

    try:
        _, midi_data, _ = predict(
            str(wav_path),
            onset_threshold=onset_thr,
            frame_threshold=frame_thr,
            minimum_frequency=min_freq,
            maximum_frequency=max_freq,
        )
        midi_data.write(str(tmp_midi))
        est_intervals, est_pitches = _midi_to_note_intervals(tmp_midi)
        ref_intervals, ref_pitches = _midi_to_note_intervals(ref_midi)

        if len(ref_pitches) == 0:
            return 0.0
        if len(est_pitches) == 0:
            return 0.0

        precision, recall, f1, _ = mir_eval.transcription.precision_recall_f1_overlap(
            ref_intervals, ref_pitches, est_intervals, est_pitches,
            onset_tolerance=ONSET_TOLERANCE,
        )
        return float(f1)
    except Exception as exc:
        logger.debug("Scoring failed for %s: %s", wav_path.name, exc)
        return 0.0
    finally:
        tmp_midi.unlink(missing_ok=True)


# ── Grid search ────────────────────────────────────────────────────────────────

def calibrate_instrument(
    instrument: str,
    pairs: list[tuple[Path, Path]],
) -> dict:
    """Grid-search Basic Pitch thresholds for one instrument.

    Args:
        instrument: Instrument name (guitar, piano, bass, vocals, other).
        pairs: List of (wav_path, ref_midi_path) pairs.

    Returns:
        Best config dict with keys: onset_threshold, frame_threshold,
        minimum_frequency, maximum_frequency, note_f1.
    """
    if not pairs:
        logger.warning("No pairs for instrument '%s' — skipping calibration", instrument)
        return {}

    # Sample a cap to keep runtime manageable
    sample = pairs[:MAX_PAIRS_PER_INSTRUMENT]
    freq_list = FREQ_BOUNDS.get(instrument, [(None, None)])

    grid = list(itertools.product(ONSET_THRESHOLDS, FRAME_THRESHOLDS, freq_list))
    total = len(grid)
    logger.info("Calibrating '%s': %d combos × %d pairs = %d evaluations",
                instrument, total, len(sample), total * len(sample))

    best: CalibPoint | None = None

    for idx, (onset_thr, frame_thr, (min_freq, max_freq)) in enumerate(grid, 1):
        f1_scores = [
            _score_pair(wav, mid, onset_thr, frame_thr, min_freq, max_freq)
            for wav, mid in sample
        ]
        mean_f1 = float(np.mean(f1_scores))
        logger.info(
            "  [%d/%d] onset=%.2f frame=%.2f min_freq=%.0f max_freq=%.0f → F1=%.4f",
            idx, total, onset_thr, frame_thr, min_freq, max_freq, mean_f1,
        )
        point = CalibPoint(onset_thr, frame_thr, min_freq, max_freq, mean_f1)
        if best is None or mean_f1 > best.note_f1:
            best = point

    if best is None:
        return {}

    logger.info(
        "Best config for '%s': onset=%.2f frame=%.2f min_freq=%.0f max_freq=%.0f F1=%.4f",
        instrument, best.onset_threshold, best.frame_threshold,
        best.min_frequency, best.max_frequency, best.note_f1,
    )
    return {
        "onset_threshold": best.onset_threshold,
        "frame_threshold": best.frame_threshold,
        "minimum_frequency": best.min_frequency,
        "maximum_frequency": best.max_frequency,
        "note_f1": round(best.note_f1, 4),
    }


def run_all(dataset_root: Path | None = None) -> dict[str, dict]:
    """Calibrate all instruments and return results dict."""
    from training.datasets import guitarset_pairs, maps_pairs, DATASETS_ROOT

    root = dataset_root or DATASETS_ROOT

    instrument_pairs: dict[str, list[tuple[Path, Path]]] = {
        "guitar": guitarset_pairs(root),
        "piano": maps_pairs(root),
    }

    results: dict[str, dict] = {}
    for instrument, pairs in instrument_pairs.items():
        if not pairs:
            logger.warning("No data for '%s' — skipped", instrument)
            continue
        cfg = calibrate_instrument(instrument, pairs)
        if cfg:
            results[instrument] = cfg

    return results


def save_configs(configs: dict[str, dict], path: Path = CALIBRATED_CONFIG_PATH) -> None:
    """Write calibrated configs to JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(configs, indent=2))
    logger.info("Calibrated configs written to: %s", path)


def load_configs(path: Path = CALIBRATED_CONFIG_PATH) -> dict[str, dict]:
    """Load calibrated configs from JSON. Returns empty dict if file absent."""
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except Exception as exc:
        logger.warning("Could not load calibrated configs (%s) — using defaults", exc)
        return {}


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    parser = argparse.ArgumentParser(
        description="Calibrate Basic Pitch thresholds per instrument using public datasets",
    )
    parser.add_argument(
        "--instrument",
        choices=list(FREQ_BOUNDS),
        help="Calibrate a single instrument",
    )
    parser.add_argument(
        "--all", action="store_true",
        help="Calibrate all instruments with available data",
    )
    parser.add_argument(
        "--dataset-root", type=Path, default=None,
        help="Override default dataset root (~/.scoreflow/datasets/)",
    )
    parser.add_argument(
        "--output", type=Path, default=CALIBRATED_CONFIG_PATH,
        help=f"Output JSON path (default: {CALIBRATED_CONFIG_PATH})",
    )
    args = parser.parse_args()

    if args.all:
        configs = run_all(dataset_root=args.dataset_root)
        if configs:
            save_configs(configs, args.output)
            print(f"\nCalibrated configs saved to: {args.output}")
            for inst, cfg in configs.items():
                print(f"  {inst}: F1={cfg.get('note_f1', '?'):.4f}  "
                      f"onset={cfg['onset_threshold']}  frame={cfg['frame_threshold']}")
        else:
            print("No calibration data available. Download datasets first:\n"
                  "  python -m training.datasets --download guitarset\n"
                  "  python -m training.datasets --download maps  (manual)")
        return

    if args.instrument:
        from training.datasets import guitarset_pairs, maps_pairs, mir1k_pairs, DATASETS_ROOT
        root = args.dataset_root or DATASETS_ROOT

        pair_fns = {
            "guitar": guitarset_pairs,
            "piano": maps_pairs,
            "vocals": mir1k_pairs,
        }
        fn = pair_fns.get(args.instrument)
        pairs: list[tuple[Path, Path]] = fn(root) if fn else []

        if not pairs:
            print(f"No data found for '{args.instrument}'. Download the dataset first.")
            return

        # Load existing configs and update
        existing = load_configs(args.output)
        cfg = calibrate_instrument(args.instrument, pairs)
        if cfg:
            existing[args.instrument] = cfg
            save_configs(existing, args.output)
            print(f"\nSaved {args.instrument} config → {args.output}")
        return

    parser.print_help()


if __name__ == "__main__":
    main()
