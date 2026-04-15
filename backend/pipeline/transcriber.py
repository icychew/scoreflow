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
    onset_threshold=0.4,
    frame_threshold=0.25,
    minimum_note_length=60.0,
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
) -> TranscriptionResult:
    """Transcribe an audio stem to MIDI using Basic Pitch.

    Args:
        input_path: Path to the input audio file (WAV, MP3, FLAC, OGG).
        output_path: Path to write the output MIDI file (.mid).
        config: Transcription configuration. Uses DEFAULT_CONFIG if None.

    Returns:
        TranscriptionResult with path to MIDI file and metadata.

    Raises:
        FileNotFoundError: If the input file does not exist.
        InvalidAudioError: If the audio format is not supported.
        TranscriptionError: For other transcription errors.
    """
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
        results[stem_name] = transcribe(stem_path, midi_output, config=config)

    return results
