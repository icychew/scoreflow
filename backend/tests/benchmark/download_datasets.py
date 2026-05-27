"""Populate the benchmark `test_samples/` directory with audio + ground-truth MIDI.

Two modes:

  ``--synthesize`` (default, offline, deterministic)
      Generates simple test cases by building MIDI programmatically and
      rendering them to audio with `pretty_midi.synthesize()`. Reliable
      smoke-test that runs anywhere with no downloads. Synthesized audio is
      not as realistic as a real recording, but the ground truth is exact
      and the pipeline's ability to recover the source MIDI is a fair test
      of upper-bound accuracy.

  ``--download``
      Tries to fetch small public-domain subsets of real datasets (GuitarSet,
      MUSDB18 previews). Falls back to printing manual-download instructions
      if the URL is unreachable or licensing has changed.

Usage:
    python -m backend.tests.benchmark.download_datasets [--synthesize | --download]
    python -m backend.tests.benchmark.download_datasets --output-dir backend/tests/benchmark/test_samples

The output layout matches what ``run_benchmark.py`` expects:
    test_samples/
        01_piano_solo/
            input.wav
            ground_truth.mid
            metadata.json
        ...
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

logger = logging.getLogger(__name__)


# ── Synthetic sample generators ────────────────────────────────────────────────

@dataclass(frozen=True)
class SyntheticSample:
    """A programmatic test sample.

    builder: function taking a `pretty_midi.PrettyMIDI` and adding instruments+notes.
    Used by `--synthesize` mode to produce deterministic ground-truth.
    """

    dir_name: str
    description: str
    instrument: str
    expected_key: str
    expected_time_signature: str
    # eslint-disable-next-line
    builder: Callable[[object], None]


def _build_c_major_scale(midi) -> None:
    """C major scale ascending then descending, quarter notes at 120 BPM."""
    from pretty_midi import Instrument, Note

    piano = Instrument(program=0)  # Acoustic Grand Piano
    # C4=60, D4, E4, F4, G4, A4, B4, C5=72, then descending
    scale = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60]
    for i, pitch in enumerate(scale):
        start = i * 0.5  # quarter note at 120 BPM = 0.5s
        piano.notes.append(Note(velocity=80, pitch=pitch, start=start, end=start + 0.45))
    midi.instruments.append(piano)


def _build_simple_chord_progression(midi) -> None:
    """I-IV-V-I in C major, half-note chords."""
    from pretty_midi import Instrument, Note

    piano = Instrument(program=0)
    # I (C-E-G), IV (F-A-C), V (G-B-D), I (C-E-G)
    chords = [
        ([60, 64, 67], 0.0),
        ([65, 69, 72], 1.0),
        ([67, 71, 74], 2.0),
        ([60, 64, 67], 3.0),
    ]
    for pitches, start in chords:
        for p in pitches:
            piano.notes.append(Note(velocity=70, pitch=p, start=start, end=start + 0.9))
    midi.instruments.append(piano)


def _build_bass_line(midi) -> None:
    """Walking bass line in A minor."""
    from pretty_midi import Instrument, Note

    bass = Instrument(program=33)  # Electric Bass (finger)
    # A2=45, walking pattern
    line = [(45, 0.0), (47, 0.5), (48, 1.0), (50, 1.5),
            (52, 2.0), (50, 2.5), (48, 3.0), (47, 3.5)]
    for pitch, start in line:
        bass.notes.append(Note(velocity=85, pitch=pitch, start=start, end=start + 0.45))
    midi.instruments.append(bass)


def _build_vocal_melody(midi) -> None:
    """Twinkle Twinkle melody in C major — simple monophonic vocal-range line."""
    from pretty_midi import Instrument, Note

    # Twinkle Twinkle Little Star: C C G G A A G (rest) F F E E D D C
    voice = Instrument(program=52)  # Choir Aahs (approx. vocal timbre)
    pattern = [
        (60, 0.0, 0.5), (60, 0.5, 1.0),
        (67, 1.0, 1.5), (67, 1.5, 2.0),
        (69, 2.0, 2.5), (69, 2.5, 3.0),
        (67, 3.0, 4.0),
        (65, 4.0, 4.5), (65, 4.5, 5.0),
        (64, 5.0, 5.5), (64, 5.5, 6.0),
        (62, 6.0, 6.5), (62, 6.5, 7.0),
        (60, 7.0, 8.0),
    ]
    for pitch, start, end in pattern:
        voice.notes.append(Note(velocity=75, pitch=pitch, start=start, end=end))
    midi.instruments.append(voice)


def _build_guitar_arpeggio(midi) -> None:
    """G-D-Em-C arpeggio pattern, eighth notes."""
    from pretty_midi import Instrument, Note

    gtr = Instrument(program=25)  # Acoustic Guitar (steel)
    chords = [
        [55, 59, 62, 67],   # G major
        [50, 54, 57, 62],   # D major
        [52, 55, 59, 64],   # E minor
        [48, 52, 55, 60],   # C major
    ]
    t = 0.0
    for chord in chords:
        for p in chord:
            gtr.notes.append(Note(velocity=72, pitch=p, start=t, end=t + 0.4))
            t += 0.25
    midi.instruments.append(gtr)


SYNTHETIC_SAMPLES: list[SyntheticSample] = [
    SyntheticSample(
        dir_name="01_synth_piano_cmajor_scale",
        description="Synthetic: C major scale, two octaves, quarter notes at 120 BPM",
        instrument="piano",
        expected_key="C major",
        expected_time_signature="4/4",
        builder=_build_c_major_scale,
    ),
    SyntheticSample(
        dir_name="02_synth_piano_chord_progression",
        description="Synthetic: I-IV-V-I chord progression in C major, half notes",
        instrument="piano",
        expected_key="C major",
        expected_time_signature="4/4",
        builder=_build_simple_chord_progression,
    ),
    SyntheticSample(
        dir_name="03_synth_bass_walking",
        description="Synthetic: walking bass line in A minor, eighth notes",
        instrument="bass",
        expected_key="A minor",
        expected_time_signature="4/4",
        builder=_build_bass_line,
    ),
    SyntheticSample(
        dir_name="04_synth_vocal_twinkle",
        description="Synthetic: 'Twinkle Twinkle' vocal melody in C major",
        instrument="vocals",
        expected_key="C major",
        expected_time_signature="4/4",
        builder=_build_vocal_melody,
    ),
    SyntheticSample(
        dir_name="05_synth_guitar_arpeggio",
        description="Synthetic: G-D-Em-C arpeggio pattern, eighth notes",
        instrument="guitar",
        expected_key="G major",
        expected_time_signature="4/4",
        builder=_build_guitar_arpeggio,
    ),
]


def generate_synthetic_samples(output_dir: Path) -> int:
    """Write all synthetic samples to disk. Returns count successfully written."""
    try:
        import pretty_midi
        from scipy.io import wavfile
        import numpy as np
    except ImportError as exc:
        logger.error(
            "pretty_midi + scipy required for synthetic mode. Install with: "
            "pip install pretty_midi scipy numpy. Error: %s", exc,
        )
        return 0

    count = 0
    for sample in SYNTHETIC_SAMPLES:
        sample_dir = output_dir / sample.dir_name
        sample_dir.mkdir(parents=True, exist_ok=True)

        # Build the MIDI
        midi = pretty_midi.PrettyMIDI()
        sample.builder(midi)

        midi_path = sample_dir / "ground_truth.mid"
        midi.write(str(midi_path))

        # Synthesize to audio. pretty_midi.synthesize() uses sine waves —
        # not as realistic as fluidsynth but works without external SoundFonts.
        try:
            audio = midi.synthesize(fs=22050)
        except Exception as exc:
            logger.warning(
                "Synth failed for %s (%s); writing MIDI without audio", sample.dir_name, exc,
            )
            continue

        # Normalize to int16
        if len(audio) == 0:
            logger.warning("Empty audio for %s; skipping wav write", sample.dir_name)
            continue
        peak = float(np.abs(audio).max())
        if peak > 0:
            audio = audio / peak * 0.9
        audio_i16 = (audio * 32767).astype(np.int16)
        audio_path = sample_dir / "input.wav"
        wavfile.write(str(audio_path), 22050, audio_i16)

        metadata = {
            "description": sample.description,
            "expected_key": sample.expected_key,
            "expected_time_signature": sample.expected_time_signature,
            "instrument": sample.instrument,
            "source": "synthetic (programmatically generated)",
            "duration_seconds": float(len(audio) / 22050.0),
            "synthetic": True,
        }
        (sample_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))

        logger.info("Generated %s: %d notes, %.1fs",
                    sample.dir_name, len(midi.instruments[0].notes),
                    len(audio) / 22050.0)
        count += 1

    return count


# ── Real-dataset download (best-effort, no GPU required) ──────────────────────

@dataclass(frozen=True)
class DatasetDownload:
    """A public dataset chunk we can attempt to fetch."""

    dir_name: str
    description: str
    instrument: str
    audio_url: str
    midi_url: str | None
    manual_instructions: str


DOWNLOADS: list[DatasetDownload] = [
    DatasetDownload(
        dir_name="11_guitarset_sample",
        description="GuitarSet (Zenodo 3371780) — fingerstyle guitar excerpt",
        instrument="guitar",
        audio_url="https://zenodo.org/record/3371780/files/audio_mono-mic.zip",
        midi_url="https://zenodo.org/record/3371780/files/annotation.zip",
        manual_instructions=(
            "GuitarSet annotations are .jams files (not MIDI). Convert with "
            "the jams_to_midi util at https://github.com/marl/GuitarSet, "
            "or download a pre-converted MIDI mirror."
        ),
    ),
    DatasetDownload(
        dir_name="12_maestro_piano_sample",
        description="MAESTRO v3 (Magenta) — small classical piano excerpt",
        instrument="piano",
        audio_url="https://storage.googleapis.com/magentadata/datasets/maestro/v3.0.0/maestro-v3.0.0-midi.zip",
        midi_url=None,
        manual_instructions=(
            "MAESTRO ships matching MIDI + audio. The MIDI-only zip is ~50MB "
            "(URL above); the full audio is ~120GB so we recommend pairing "
            "one MIDI with a synthesized WAV for testing."
        ),
    ),
]


def attempt_download(url: str, dest: Path, timeout: int = 30) -> bool:
    """Best-effort URL fetch. Returns True on success."""
    try:
        logger.info("Downloading %s -> %s", url, dest.name)
        req = urllib.request.Request(url, headers={"User-Agent": "notara-benchmark/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            dest.parent.mkdir(parents=True, exist_ok=True)
            with open(dest, "wb") as f:
                while True:
                    chunk = response.read(64 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
        return True
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        logger.warning("Download failed for %s: %s", url, exc)
        return False


def attempt_real_downloads(output_dir: Path) -> int:
    """Best-effort download of real-dataset chunks. Prints manual instructions
    for whatever fails.
    """
    successes = 0
    for ds in DOWNLOADS:
        sample_dir = output_dir / ds.dir_name
        sample_dir.mkdir(parents=True, exist_ok=True)

        downloads_dir = sample_dir / "_raw"
        downloads_dir.mkdir(exist_ok=True)

        audio_ok = attempt_download(ds.audio_url, downloads_dir / Path(ds.audio_url).name)
        midi_ok = (
            attempt_download(ds.midi_url, downloads_dir / Path(ds.midi_url).name)
            if ds.midi_url else True
        )

        if not (audio_ok and midi_ok):
            instructions_path = sample_dir / "MANUAL_DOWNLOAD.md"
            instructions_path.write_text(
                f"# {ds.dir_name}\n\n"
                f"{ds.description}\n\n"
                f"Automatic download failed. To populate this sample:\n\n"
                f"1. Download audio: <{ds.audio_url}>\n"
                + (f"2. Download MIDI: <{ds.midi_url}>\n" if ds.midi_url else "")
                + f"\n## Notes\n\n{ds.manual_instructions}\n\n"
                f"Place the extracted files as:\n"
                f"  {sample_dir}/input.wav\n"
                f"  {sample_dir}/ground_truth.mid\n"
            )
            logger.warning("Wrote MANUAL_DOWNLOAD.md for %s", ds.dir_name)
            continue

        # Write metadata; extracting and renaming is dataset-specific and
        # left to the user (jams_to_midi for GuitarSet, etc.).
        metadata = {
            "description": ds.description,
            "instrument": ds.instrument,
            "source": ds.audio_url,
            "synthetic": False,
        }
        (sample_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))
        successes += 1

    return successes


# ── CLI ────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Populate benchmark test samples (synthetic by default).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).parent / "test_samples",
        help="Where to write samples (default: alongside this script)",
    )
    parser.add_argument(
        "--synthesize",
        action="store_true",
        default=True,
        help="Generate synthetic samples (offline). Default mode.",
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="Best-effort fetch of real public datasets in addition to synthetic.",
    )
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    args.output_dir.mkdir(parents=True, exist_ok=True)

    synth_count = generate_synthetic_samples(args.output_dir)
    logger.info("Synthetic samples written: %d", synth_count)

    if args.download:
        dl_count = attempt_real_downloads(args.output_dir)
        logger.info("Real-dataset downloads succeeded: %d", dl_count)

    if synth_count == 0:
        logger.error("No samples generated. Check dependencies (pretty_midi, scipy).")
        sys.exit(1)

    logger.info("Done. Run benchmark with:")
    logger.info(
        "  python -m backend.tests.benchmark.run_benchmark --samples-dir %s",
        args.output_dir,
    )


if __name__ == "__main__":
    main()
