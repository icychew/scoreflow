"""OMR validation using a locally-deployed Roboflow model.

After a score is rendered to PNG, this module runs the user's trained Roboflow
OMR model locally (via the `inference` SDK) to count detected note heads.
The result is compared against the MIDI note count from the transcription step
to produce a 0.0–1.0 confidence score per stem.

Configuration (environment variables):
    ROBOFLOW_API_KEY  — Roboflow API key (required; disables OMR if absent)
    ROBOFLOW_MODEL_ID — Model identifier, e.g. "my-workspace/music-omr/1"
    ROBOFLOW_CONFIDENCE — Detection confidence threshold (default: 0.4)

The model is downloaded on first call and cached locally by the inference package.
Subsequent calls run fully offline.
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# Class names your Roboflow model uses for note heads.
# Update this set to match the exact labels in your model's annotation scheme.
NOTE_HEAD_LABELS: frozenset[str] = frozenset({
    "notehead",
    "note_head",
    "note-head",
    "filled-notehead",
    "open-notehead",
    "quarter-note",
    "half-note",
    "whole-note",
})


def validate_score(png_path: Path, expected_note_count: int) -> float:
    """Run Roboflow local inference on a score PNG and return a confidence score.

    The confidence is computed as an overlap ratio between the number of note
    heads detected by the OMR model and the note count from the MIDI transcription:

        confidence = min(detected, expected) / max(detected, expected)

    This gives 1.0 when counts match exactly, and decreases as they diverge.

    Args:
        png_path: Path to the rendered score PNG (typically page 1).
        expected_note_count: Note count from the quantized MIDI (transcription proxy).

    Returns:
        Confidence score in [0.0, 1.0], or -1.0 if OMR is not configured or fails.
        -1.0 is a sentinel meaning "not run" — the frontend hides the badge.
    """
    api_key = os.environ.get("ROBOFLOW_API_KEY", "").strip()
    model_id = os.environ.get("ROBOFLOW_MODEL_ID", "").strip()
    confidence_threshold = float(os.environ.get("ROBOFLOW_CONFIDENCE", "0.4"))

    if not api_key or not model_id:
        logger.info(
            "OMR validation skipped — ROBOFLOW_API_KEY / ROBOFLOW_MODEL_ID not configured"
        )
        return -1.0

    if not png_path.exists():
        logger.warning("OMR validation skipped — PNG not found: %s", png_path)
        return -1.0

    try:
        from inference import get_model  # type: ignore[import-untyped]
    except ImportError:
        logger.warning(
            "OMR validation skipped — `inference` package not installed. "
            "Run: pip install inference>=0.9.0"
        )
        return -1.0

    try:
        logger.info("Running OMR inference on '%s' (model=%s)", png_path.name, model_id)
        model = get_model(model_id=model_id, api_key=api_key)
        results = model.infer(str(png_path), confidence=confidence_threshold)

        # results is a list of InferenceResponse — one entry per image submitted
        predictions = results[0].predictions if results else []
        detected = sum(
            1 for p in predictions
            if getattr(p, "class_name", "").lower() in NOTE_HEAD_LABELS
        )

        logger.info(
            "OMR: png='%s', detected_note_heads=%d, expected_notes=%d",
            png_path.name, detected, expected_note_count,
        )

        if expected_note_count == 0 and detected == 0:
            return 1.0
        if expected_note_count == 0 or detected == 0:
            return 0.0

        score = min(detected, expected_note_count) / max(detected, expected_note_count)
        logger.info("OMR confidence for '%s': %.3f", png_path.name, score)
        return round(score, 3)

    except Exception as exc:
        logger.warning("OMR inference failed for '%s': %s", png_path.name, exc)
        return -1.0
