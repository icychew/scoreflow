"""Source separation using Demucs (Meta).

Splits a mixed audio file into isolated instrument stems:
vocals, drums, bass, other (default 4-stem htdemucs model).
Optionally supports 6-stem separation (guitar, piano) with htdemucs_6s.
"""

import logging
import time
from dataclasses import dataclass
from pathlib import Path

import torch
import torchaudio

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".flac"}

VALID_MODELS = {
    "htdemucs": ["vocals", "drums", "bass", "other"],
    "htdemucs_ft": ["vocals", "drums", "bass", "other"],
    "htdemucs_6s": ["vocals", "drums", "bass", "other", "guitar", "piano"],
}


class SeparationError(Exception):
    """Base exception for source separation errors."""


class UnsupportedFormatError(SeparationError):
    """Raised when the input audio format is not supported."""


class CorruptedAudioError(SeparationError):
    """Raised when the input audio file is corrupted or unreadable."""


@dataclass(frozen=True)
class SeparationResult:
    """Result of a source separation run."""

    stems: dict[str, Path]
    model_name: str
    sample_rate: int
    duration_seconds: float
    processing_time_seconds: float


def _get_device() -> torch.device:
    """Select the best available device (CUDA > CPU)."""
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def _validate_input(input_path: Path) -> None:
    """Validate the input audio file exists and has a supported format."""
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    if input_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise UnsupportedFormatError(
            f"Unsupported audio format '{input_path.suffix}'. "
            f"Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )


def _load_audio(input_path: Path) -> tuple[torch.Tensor, int]:
    """Load audio file and return waveform tensor and sample rate."""
    try:
        waveform, sample_rate = torchaudio.load(str(input_path))
    except Exception as first_exc:
        # torchaudio 2.11+ defaults to torchcodec which requires specific FFmpeg DLLs.
        # Fall back to soundfile (supports WAV/FLAC natively, no codec required).
        try:
            import numpy as np
            import soundfile as sf
            data, sample_rate = sf.read(str(input_path), always_2d=True)
            # soundfile returns (samples, channels); torch expects (channels, samples)
            waveform = torch.from_numpy(data.T.copy()).float()
        except Exception as sf_exc:
            raise CorruptedAudioError(
                f"Failed to load audio file '{input_path}': {first_exc}"
            ) from first_exc

    # Convert mono to stereo if needed (Demucs expects stereo)
    if waveform.shape[0] == 1:
        waveform = waveform.repeat(2, 1)
    elif waveform.shape[0] > 2:
        waveform = waveform[:2]

    return waveform, sample_rate


def _load_model(model_name: str, device: torch.device):
    """Load and return the Demucs model."""
    from demucs.pretrained import get_model

    if model_name not in VALID_MODELS:
        raise ValueError(
            f"Unknown model '{model_name}'. Valid models: {', '.join(VALID_MODELS)}"
        )

    logger.info("Loading Demucs model '%s' on %s", model_name, device)
    model = get_model(model_name)
    model.to(device)
    model.eval()
    return model


def separate(
    input_path: Path,
    output_dir: Path,
    model_name: str = "htdemucs",
) -> SeparationResult:
    """Separate audio into instrument stems using Demucs.

    Args:
        input_path: Path to the input audio file (MP3/WAV/FLAC).
        output_dir: Directory to write separated stem WAV files.
        model_name: Demucs model name (default: htdemucs).

    Returns:
        SeparationResult with paths to output stems and metadata.

    Raises:
        FileNotFoundError: If the input file does not exist.
        UnsupportedFormatError: If the audio format is not supported.
        CorruptedAudioError: If the audio file cannot be loaded.
        SeparationError: For other processing errors.
    """
    from demucs.apply import apply_model

    _validate_input(input_path)

    device = _get_device()
    logger.info(
        "Starting separation: file='%s', model='%s', device='%s'",
        input_path.name,
        model_name,
        device,
    )

    start_time = time.monotonic()

    # Load audio
    waveform, sample_rate = _load_audio(input_path)
    audio_duration = waveform.shape[1] / sample_rate
    logger.info(
        "Loaded audio: duration=%.1fs, sample_rate=%d, channels=%d",
        audio_duration,
        sample_rate,
        waveform.shape[0],
    )

    # Load model
    model = _load_model(model_name, device)

    # Resample to model's expected sample rate if needed
    if sample_rate != model.samplerate:
        logger.info(
            "Resampling from %d Hz to %d Hz", sample_rate, model.samplerate
        )
        resampler = torchaudio.transforms.Resample(sample_rate, model.samplerate)
        waveform = resampler(waveform)
        sample_rate = model.samplerate

    # Run separation
    # Shape: (batch=1, channels, samples)
    waveform_batch = waveform.unsqueeze(0).to(device)

    try:
        with torch.no_grad():
            estimates = apply_model(model, waveform_batch, device=device)
    except torch.cuda.OutOfMemoryError:
        raise SeparationError(
            "Out of GPU memory during separation. "
            "Try using CPU or a shorter audio file."
        )
    except Exception as exc:
        raise SeparationError(f"Separation failed: {exc}") from exc

    # Save stems
    output_dir.mkdir(parents=True, exist_ok=True)
    stem_names = VALID_MODELS[model_name]
    stems: dict[str, Path] = {}

    for i, stem_name in enumerate(stem_names):
        stem_path = output_dir / f"{stem_name}.wav"
        # estimates shape: (batch, stems, channels, samples)
        stem_audio = estimates[0, i].cpu()
        try:
            torchaudio.save(str(stem_path), stem_audio, sample_rate)
        except Exception:
            # torchaudio 2.11+ uses torchcodec for save; fall back to soundfile.
            import soundfile as sf
            import numpy as np
            # stem_audio shape: (channels, samples) -> soundfile expects (samples, channels)
            sf.write(str(stem_path), stem_audio.numpy().T, sample_rate, subtype="PCM_16")
        stems[stem_name] = stem_path
        logger.info("Saved stem: %s -> %s", stem_name, stem_path)

    processing_time = time.monotonic() - start_time
    logger.info(
        "Separation complete: duration=%.1fs, processing_time=%.1fs, ratio=%.1fx",
        audio_duration,
        processing_time,
        processing_time / audio_duration if audio_duration > 0 else 0,
    )

    return SeparationResult(
        stems=stems,
        model_name=model_name,
        sample_rate=sample_rate,
        duration_seconds=audio_duration,
        processing_time_seconds=processing_time,
    )
