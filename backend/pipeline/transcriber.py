"""Audio-to-MIDI transcription using Basic Pitch (Spotify).

Converts isolated audio stems into MIDI with note onset, offset, pitch, and velocity.
Handles polyphonic content (multiple simultaneous notes).
"""

import logging
import time
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".wav", ".mp3", ".flac", ".ogg"}


class TranscriptionError(Exception):
    """Base exception for transcription errors."""


class InvalidAudioError(TranscriptionError):
    """Raised when the input audio file is invalid or unreadable."""


@dataclass(frozen=True)
class TranscriptionConfig:
    """Configuration for audio-to-MIDI transcription.

    Attributes:
        onset_threshold: Minimum probability for a note onset to be detected.
            Lower values detect more notes but may introduce false positives.
            Range: 0.0 to 1.0, default: 0.5.
        frame_threshold: Minimum probability for a frame to be considered active.
            Controls confidence required for sustaining a note.
            Range: 0.0 to 1.0, default: 0.3.
        minimum_note_length: Minimum note duration in milliseconds.
            Notes shorter than this are filtered out.
            Default: 58ms (~11 frames at Basic Pitch's frame rate).
        minimum_frequency: Minimum frequency (Hz) for note detection.
            Notes below this are ignored. Default: None (use model default).
        maximum_frequency: Maximum frequency (Hz) for note detection.
            Notes above this are ignored. Default: None (use model default).
        midi_tempo: Tempo (BPM) for the output MIDI file. Default: 120.
    """

    onset_threshold: float = 0.5
    frame_threshold: float = 0.3
    minimum_note_length: float = 58.0
    minimum_frequency: float | None = None
    maximum_frequency: float | None = None
    midi_tempo: float = 120.0


# Sensible presets for common instrument types
PIANO_CONFIG = TranscriptionConfig(
    onset_threshold=0.5,
    frame_threshold=0.3,
    minimum_note_length=58.0,
    minimum_frequency=27.5,   # A0
    maximum_frequency=4186.0,  # C8
)

VOCAL_CONFIG = TranscriptionConfig(
    onset_threshold=0.4,
    frame_threshold=0.25,
    minimum_note_length=100.0,
    minimum_frequency=80.0,    # ~E2
    maximum_frequency=1100.0,  # ~C6
)

BASS_CONFIG = TranscriptionConfig(
    onset_threshold=0.5,
    frame_threshold=0.3,
    minimum_note_length=80.0,
    minimum_frequency=30.0,   # ~B0
    maximum_frequency=400.0,  # ~G4
)

GUITAR_CONFIG = TranscriptionConfig(
    onset_threshold=0.55,      # raised from 0.4 — reduces false notes from strummed chords
    frame_threshold=0.3,
    minimum_note_length=100.0, # strums are transients; filter very short events
    minimum_frequency=82.0,   # E2 — open low E string
    maximum_frequency=1319.0, # E6 — highest fret on standard guitar
)

OTHER_CONFIG = TranscriptionConfig(
    onset_threshold=0.55,     # higher threshold reduces false-positive notes from mixed content
    frame_threshold=0.35,
    minimum_note_length=80.0,
    minimum_frequency=100.0,
    maximum_frequency=2000.0,
)

DEFAULT_CONFIG = TranscriptionConfig()


def _load_calibrated_configs() -> None:
    """Override hand-tuned presets with calibrated values if the JSON exists.

    Looks for ``backend/training/calibrated_configs.json`` relative to this
    file's location. Silently skips if the file is absent or malformed — the
    hand-tuned presets above are always the fallback.
    """
    global PIANO_CONFIG, VOCAL_CONFIG, BASS_CONFIG, GUITAR_CONFIG, OTHER_CONFIG

    calibrated_path = Path(__file__).parent.parent / "training" / "calibrated_configs.json"
    if not calibrated_path.exists():
        return

    try:
        import json
        raw = json.loads(calibrated_path.read_text())
    except Exception as exc:
        logger.warning("Could not load calibrated_configs.json: %s", exc)
        return

    name_to_ref = {
        "piano":  "PIANO_CONFIG",
        "vocals": "VOCAL_CONFIG",
        "bass":   "BASS_CONFIG",
        "guitar": "GUITAR_CONFIG",
        "other":  "OTHER_CONFIG",
    }
    name_to_var: dict[str, object] = {
        "piano": PIANO_CONFIG, "vocals": VOCAL_CONFIG, "bass": BASS_CONFIG,
        "guitar": GUITAR_CONFIG, "other": OTHER_CONFIG,
    }

    for instrument, cfg in raw.items():
        if instrument not in name_to_var:
            continue
        try:
            updated = TranscriptionConfig(
                onset_threshold=float(cfg.get("onset_threshold", name_to_var[instrument].onset_threshold)),  # type: ignore[union-attr]
                frame_threshold=float(cfg.get("frame_threshold", name_to_var[instrument].frame_threshold)),  # type: ignore[union-attr]
                minimum_note_length=float(cfg.get("minimum_note_length", name_to_var[instrument].minimum_note_length)),  # type: ignore[union-attr]
                minimum_frequency=cfg.get("minimum_frequency"),
                maximum_frequency=cfg.get("maximum_frequency"),
            )
            if instrument == "piano":
                PIANO_CONFIG = updated
            elif instrument == "vocals":
                VOCAL_CONFIG = updated
            elif instrument == "bass":
                BASS_CONFIG = updated
            elif instrument == "guitar":
                GUITAR_CONFIG = updated
            elif instrument == "other":
                OTHER_CONFIG = updated
            logger.info(
                "Loaded calibrated config for '%s': onset=%.2f frame=%.2f",
                instrument,
                updated.onset_threshold,
                updated.frame_threshold,
            )
        except Exception as exc:
            logger.warning("Skipping calibrated config for '%s': %s", instrument, exc)


# Apply calibrated overrides at module import time (no-op if file absent)
_load_calibrated_configs()


@dataclass(frozen=True)
class TranscriptionResult:
    """Result of an audio-to-MIDI transcription.

    Attributes:
        midi_path: Path to the output MIDI file.
        note_count: Number of notes detected.
        duration_seconds: Duration of the input audio in seconds.
        processing_time_seconds: Wall-clock time for transcription.
        config: Configuration used for transcription.
    """

    midi_path: Path
    note_count: int
    duration_seconds: float
    processing_time_seconds: float
    config: TranscriptionConfig


def _validate_input(input_path: Path) -> None:
    """Validate the input audio file."""
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    if input_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise InvalidAudioError(
            f"Unsupported audio format '{input_path.suffix}'. "
            f"Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )


def _count_midi_notes(midi_data) -> int:
    """Count the total number of notes across all instruments in a MIDI object."""
    count = 0
    for instrument in midi_data.instruments:
        count += len(instrument.notes)
    return count


def _count_midi_notes_from_path(midi_path: Path) -> int:
    """Count notes in a MIDI file by path (used when we don't have the in-memory object)."""
    try:
        import pretty_midi
        midi_data = pretty_midi.PrettyMIDI(str(midi_path))
        return _count_midi_notes(midi_data)
    except Exception:
        return 0


def _transcribe_piano_hq(
    input_path: Path,
    output_path: Path,
    config: TranscriptionConfig,
) -> TranscriptionResult:
    """High-quality piano transcription using piano_transcription_inference (Kong et al.)."""
    try:
        from piano_transcription_inference import PianoTranscription, sample_rate as PT_SR
    except ImportError as exc:
        raise TranscriptionError(
            "piano-transcription-inference is not installed. "
            "Run: pip install piano-transcription-inference>=0.0.21"
        ) from exc

    try:
        import librosa
    except ImportError as exc:
        raise TranscriptionError("librosa is required for HQ piano transcription") from exc

    start_time = time.monotonic()
    audio_duration = _get_audio_duration(input_path)

    logger.info("HQ piano transcription: loading audio at %d Hz mono", PT_SR)
    try:
        audio, _ = librosa.load(str(input_path), sr=PT_SR, mono=True)
    except Exception as exc:
        raise InvalidAudioError(
            f"Failed to load audio for HQ piano transcription: {exc}"
        ) from exc

    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info("HQ piano transcription: running inference on %s", device)
        transcriptor = PianoTranscription(device=device, checkpoint_path=None)
        transcriptor.transcribe(audio, str(output_path))
    except Exception as exc:
        raise TranscriptionError(f"HQ piano transcription failed: {exc}") from exc

    note_count = _count_midi_notes_from_path(output_path)
    processing_time = time.monotonic() - start_time

    logger.info(
        "HQ piano transcription complete: notes=%d, processing_time=%.1fs",
        note_count,
        processing_time,
    )

    return TranscriptionResult(
        midi_path=output_path,
        note_count=note_count,
        duration_seconds=audio_duration,
        processing_time_seconds=processing_time,
        config=config,
    )


def _get_audio_duration(input_path: Path) -> float:
    """Get the duration of an audio file in seconds using soundfile."""
    import soundfile as sf

    try:
        info = sf.info(str(input_path))
        return info.duration
    except Exception:
        return 0.0


def transcribe(
    input_path: Path,
    output_path: Path,
    config: TranscriptionConfig | None = None,
    quality: str = "standard",
    stem_name: str = "",
) -> TranscriptionResult:
    """Transcribe an audio stem to MIDI.

    Uses Basic Pitch for standard mode. In high quality mode, the piano stem
    is transcribed with piano_transcription_inference (Kong et al.) for
    significantly better accuracy on solo piano audio.

    Args:
        input_path: Path to the input audio file (WAV, MP3, FLAC, OGG).
        output_path: Path to write the output MIDI file (.mid).
        config: Transcription configuration. Uses DEFAULT_CONFIG if None.
        quality: 'standard' uses Basic Pitch; 'high' uses HQ model for piano.
        stem_name: Name of the stem being transcribed (e.g. 'piano', 'vocals').

    Returns:
        TranscriptionResult with path to MIDI file and metadata.

    Raises:
        FileNotFoundError: If the input file does not exist.
        InvalidAudioError: If the audio format is not supported.
        TranscriptionError: For other transcription errors.
    """
    if quality == "high" and stem_name == "piano":
        return _transcribe_piano_hq(input_path, output_path, config or DEFAULT_CONFIG)

    from basic_pitch.inference import predict

    _validate_input(input_path)

    if config is None:
        config = DEFAULT_CONFIG

    logger.info(
        "Starting transcription: file='%s', onset_threshold=%.2f, "
        "frame_threshold=%.2f, min_note_length=%.0fms",
        input_path.name,
        config.onset_threshold,
        config.frame_threshold,
        config.minimum_note_length,
    )

    start_time = time.monotonic()
    audio_duration = _get_audio_duration(input_path)

    # Run Basic Pitch inference
    try:
        model_output, midi_data, note_events = predict(
            str(input_path),
            onset_threshold=config.onset_threshold,
            frame_threshold=config.frame_threshold,
            minimum_note_length=config.minimum_note_length,
            minimum_frequency=config.minimum_frequency,
            maximum_frequency=config.maximum_frequency,
            midi_tempo=config.midi_tempo,
        )
    except Exception as exc:
        raise TranscriptionError(
            f"Basic Pitch transcription failed for '{input_path.name}': {exc}"
        ) from exc

    # Save MIDI output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        midi_data.write(str(output_path))
    except Exception as exc:
        raise TranscriptionError(
            f"Failed to write MIDI file to '{output_path}': {exc}"
        ) from exc

    note_count = _count_midi_notes(midi_data)
    processing_time = time.monotonic() - start_time

    logger.info(
        "Transcription complete: notes=%d, duration=%.1fs, "
        "processing_time=%.1fs, output='%s'",
        note_count,
        audio_duration,
        processing_time,
        output_path,
    )

    return TranscriptionResult(
        midi_path=output_path,
        note_count=note_count,
        duration_seconds=audio_duration,
        processing_time_seconds=processing_time,
        config=config,
    )


def transcribe_stems(
    stems: dict[str, Path],
    output_dir: Path,
    config_map: dict[str, TranscriptionConfig] | None = None,
    quality: str = "standard",
) -> dict[str, TranscriptionResult]:
    """Transcribe multiple stems to MIDI files.

    Args:
        stems: Dictionary mapping stem name to audio file path.
        output_dir: Directory to write output MIDI files.
        config_map: Optional mapping of stem name to transcription config.
            Falls back to instrument presets or DEFAULT_CONFIG.

    Returns:
        Dictionary mapping stem name to TranscriptionResult.
    """
    if config_map is None:
        config_map = {}

    # Default instrument presets
    presets: dict[str, TranscriptionConfig] = {
        "vocals": VOCAL_CONFIG,
        "piano": PIANO_CONFIG,
        "bass": BASS_CONFIG,
        "guitar": GUITAR_CONFIG,
        "other": OTHER_CONFIG,
    }

    results: dict[str, TranscriptionResult] = {}
    output_dir.mkdir(parents=True, exist_ok=True)

    for stem_name, stem_path in stems.items():
        # Skip drums — Basic Pitch is not suited for percussion
        if stem_name == "drums":
            logger.info("Skipping drums stem (not suited for pitch-based transcription)")
            continue

        config = config_map.get(stem_name, presets.get(stem_name, DEFAULT_CONFIG))
        midi_output = output_dir / f"{stem_name}.mid"

        logger.info("Transcribing stem: %s", stem_name)
        results[stem_name] = transcribe(stem_path, midi_output, config=config, quality=quality, stem_name=stem_name)

    return results
