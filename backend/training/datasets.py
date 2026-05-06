"""Dataset downloader for per-instrument threshold calibration.

Downloads and organises public audio/MIDI datasets used by calibrate.py:

    Dataset        Instrument    Size      License
    ─────────────────────────────────────────────────
    GuitarSet      guitar        ~1.7 GB   CC-BY 4.0
    MIR-1K         vocals        ~300 MB   Free
    Slakh2100*     multi         ~100 GB   CC-BY 4.0
    MAPS*          piano         ~30 GB    Research

*MAPS and Slakh2100 require manual download — licence agreements must be
accepted on the respective websites before download. Instructions are printed
by the download functions.

All datasets are stored under ~/.scoreflow/datasets/{name}/.

Usage::

    python -m training.datasets --list
    python -m training.datasets --download guitarset
    python -m training.datasets --download mir1k
    python -m training.datasets --download all
"""

import argparse
import hashlib
import logging
import os
import tarfile
import urllib.request
import zipfile
from pathlib import Path

logger = logging.getLogger(__name__)

DATASETS_ROOT = Path.home() / ".scoreflow" / "datasets"

# ── Dataset registry ──────────────────────────────────────────────────────────

DATASET_REGISTRY: dict[str, dict] = {
    "guitarset": {
        "description": "GuitarSet — 360 solo guitar recordings with JAMS annotations",
        "instrument": "guitar",
        "url": "https://zenodo.org/record/3371780/files/audio_hex-pickup_original.zip",
        "annotation_url": "https://zenodo.org/record/3371780/files/annotation.zip",
        "sha256": None,  # skip checksum for large files
        "local_dir": "guitarset",
        "license": "CC-BY 4.0",
        "size_hint": "1.7 GB",
        "manual": False,
    },
    "mir1k": {
        "description": "MIR-1K — 1000 vocal clips with pitch labels",
        "instrument": "vocals",
        "url": "https://sites.google.com/site/unvoicedsoundseparation/mir-1k",
        "local_dir": "mir1k",
        "license": "Free for research",
        "size_hint": "~300 MB",
        "manual": True,  # no direct download URL
        "manual_instructions": (
            "MIR-1K must be downloaded manually:\n"
            "  1. Visit https://sites.google.com/site/unvoicedsoundseparation/mir-1k\n"
            "  2. Download 'MIR-1K.rar'\n"
            "  3. Extract into ~/.scoreflow/datasets/mir1k/\n"
            "  4. Ensure structure: mir1k/Wavfile/*.wav  and  mir1k/PitchLabel/*.pv"
        ),
    },
    "maps": {
        "description": "MAPS — Multi-pitch Piano Database",
        "instrument": "piano",
        "url": "https://amubox.univ-amu.fr/index.php/s/iNG0xc8RS7b0b0g",
        "local_dir": "maps",
        "license": "Free for research",
        "size_hint": "~30 GB",
        "manual": True,
        "manual_instructions": (
            "MAPS must be downloaded manually:\n"
            "  1. Visit http://www.tsi.telecom-paristech.fr/aao/en/2010/07/08/maps-database\n"
            "  2. Fill in the registration form to receive the download link.\n"
            "  3. Extract into ~/.scoreflow/datasets/maps/\n"
            "  4. Ensure structure: maps/MAPS_*/*/MIDI/*.mid  and  maps/MAPS_*/*/MUS/*.wav"
        ),
    },
    "slakh2100": {
        "description": "Slakh2100 — 2100 multi-instrument tracks rendered from MIDI",
        "instrument": "multi",
        "url": "http://www.slakh.com",
        "local_dir": "slakh2100",
        "license": "CC-BY 4.0",
        "size_hint": "~100 GB",
        "manual": True,
        "manual_instructions": (
            "Slakh2100 must be downloaded manually:\n"
            "  1. Visit http://www.slakh.com and accept the licence.\n"
            "  2. Download slakh2100_flac.tar.gz (~100 GB) via the provided link.\n"
            "  3. Extract into ~/.scoreflow/datasets/slakh2100/\n"
            "  4. Ensure structure: slakh2100/{train,validation,test}/Track*/\n"
            "     Each track has: mix.flac, stems/*.flac, MIDI/all_src.mid"
        ),
    },
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _download_file(url: str, dest: Path, desc: str = "") -> None:
    """Download a file from url to dest with a simple progress log."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        logger.info("Already downloaded: %s", dest.name)
        return

    logger.info("Downloading %s → %s ...", desc or url, dest)

    def _reporthook(count: int, block_size: int, total_size: int) -> None:
        if total_size > 0 and count % 100 == 0:
            mb_done = count * block_size / 1_048_576
            mb_total = total_size / 1_048_576
            logger.info("  %.1f / %.1f MB", mb_done, mb_total)

    urllib.request.urlretrieve(url, str(dest), reporthook=_reporthook)
    logger.info("Download complete: %s", dest)


def _extract(archive: Path, dest_dir: Path) -> None:
    """Extract a .zip or .tar.gz/.tgz archive."""
    logger.info("Extracting %s → %s ...", archive.name, dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    if archive.suffix == ".zip":
        with zipfile.ZipFile(str(archive)) as zf:
            zf.extractall(str(dest_dir))
    elif archive.suffix in {".gz", ".tgz"}:
        with tarfile.open(str(archive), "r:gz") as tf:
            tf.extractall(str(dest_dir))
    else:
        raise ValueError(f"Unsupported archive format: {archive.suffix}")
    logger.info("Extraction complete.")


def _verify_sha256(path: Path, expected: str) -> bool:
    sha = hashlib.sha256()
    with open(str(path), "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha.update(chunk)
    return sha.hexdigest() == expected


# ── Per-dataset downloaders ────────────────────────────────────────────────────

def download_guitarset(root: Path = DATASETS_ROOT) -> Path:
    """Download GuitarSet audio and annotations.

    Returns the local dataset directory path.
    """
    dest_dir = root / "guitarset"
    audio_archive = root / "guitarset_audio.zip"
    annot_archive = root / "guitarset_annotations.zip"

    entry = DATASET_REGISTRY["guitarset"]

    _download_file(entry["url"], audio_archive, "GuitarSet audio")
    _download_file(entry["annotation_url"], annot_archive, "GuitarSet annotations")

    if not (dest_dir / "audio_hex-pickup_original").exists():
        _extract(audio_archive, dest_dir)
    if not (dest_dir / "annotation").exists():
        _extract(annot_archive, dest_dir)

    logger.info("GuitarSet ready at: %s", dest_dir)
    return dest_dir


def print_manual_instructions(name: str) -> None:
    """Print manual download instructions for datasets that cannot be auto-downloaded."""
    entry = DATASET_REGISTRY.get(name)
    if entry is None:
        raise ValueError(f"Unknown dataset: {name}")
    print(f"\n{'─' * 60}")
    print(f"Dataset: {entry['description']}")
    print(f"Instrument: {entry['instrument']}")
    print(f"Size: {entry['size_hint']}")
    print(f"License: {entry['license']}")
    print()
    print(entry.get("manual_instructions", "No instructions available."))
    print(f"{'─' * 60}\n")


# ── Build audio-MIDI pairs for calibration ────────────────────────────────────

def guitarset_pairs(root: Path = DATASETS_ROOT) -> list[tuple[Path, Path]]:
    """Return (wav, midi) pairs from GuitarSet for calibration.

    GuitarSet stores audio as WAV and annotations as JAMS. Basic Pitch
    benchmarking uses the hex-pickup audio (no effects). MIDI ground truth
    can be derived from JAMS using jams2midi; pairs where both files exist
    are returned.
    """
    dataset_dir = root / "guitarset"
    audio_dir = dataset_dir / "audio_hex-pickup_original"
    midi_dir = dataset_dir / "midi"  # pre-converted MIDI (if present)

    if not audio_dir.exists():
        logger.warning("GuitarSet audio not found at %s. Run download_guitarset() first.", audio_dir)
        return []

    pairs: list[tuple[Path, Path]] = []
    for wav in sorted(audio_dir.glob("*.wav")):
        mid = (midi_dir / wav.stem).with_suffix(".mid")
        if mid.exists():
            pairs.append((wav, mid))

    logger.info("GuitarSet: found %d audio/MIDI pairs", len(pairs))
    return pairs


def maps_pairs(root: Path = DATASETS_ROOT) -> list[tuple[Path, Path]]:
    """Return (wav, midi) pairs from MAPS for piano calibration."""
    dataset_dir = root / "maps"
    if not dataset_dir.exists():
        logger.warning("MAPS not found at %s. Follow manual download instructions.", dataset_dir)
        return []

    pairs: list[tuple[Path, Path]] = []
    for mid in sorted(dataset_dir.rglob("*.mid")):
        wav = mid.with_suffix(".wav")
        if wav.exists():
            pairs.append((wav, mid))

    logger.info("MAPS: found %d audio/MIDI pairs", len(pairs))
    return pairs


def mir1k_pairs(root: Path = DATASETS_ROOT) -> list[tuple[Path, Path]]:
    """Return (wav, pitch-label) pairs from MIR-1K.

    MIR-1K pitch labels are plain-text .pv files (one pitch per frame).
    For simplicity we treat each .wav as a pair with its .pv file;
    calibrate.py converts .pv to MIDI internally when comparing.
    """
    dataset_dir = root / "mir1k"
    wav_dir = dataset_dir / "Wavfile"
    pv_dir = dataset_dir / "PitchLabel"

    if not wav_dir.exists():
        logger.warning("MIR-1K not found at %s. Follow manual download instructions.", dataset_dir)
        return []

    pairs: list[tuple[Path, Path]] = []
    for wav in sorted(wav_dir.glob("*.wav")):
        pv = (pv_dir / wav.stem).with_suffix(".pv")
        if pv.exists():
            pairs.append((wav, pv))

    logger.info("MIR-1K: found %d audio/label pairs", len(pairs))
    return pairs


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    parser = argparse.ArgumentParser(
        description="ScoreFlow dataset manager — download public datasets for threshold calibration",
    )
    parser.add_argument(
        "--list", action="store_true",
        help="List all available datasets",
    )
    parser.add_argument(
        "--download",
        choices=list(DATASET_REGISTRY) + ["all"],
        metavar="DATASET",
        help="Dataset to download (guitarset | mir1k | maps | slakh2100 | all)",
    )
    parser.add_argument(
        "--root", type=Path, default=DATASETS_ROOT,
        help=f"Dataset storage root (default: {DATASETS_ROOT})",
    )
    args = parser.parse_args()

    if args.list:
        print("\nAvailable datasets:")
        for name, entry in DATASET_REGISTRY.items():
            manual = "manual" if entry.get("manual") else "auto"
            print(f"  {name:<12} {entry['instrument']:<10} {entry['size_hint']:<10} [{manual}]  {entry['description']}")
        return

    if args.download:
        targets = list(DATASET_REGISTRY) if args.download == "all" else [args.download]
        for name in targets:
            entry = DATASET_REGISTRY[name]
            if entry.get("manual"):
                print_manual_instructions(name)
            else:
                if name == "guitarset":
                    download_guitarset(root=args.root)
                else:
                    logger.warning("No auto-downloader for '%s'", name)
        return

    parser.print_help()


if __name__ == "__main__":
    main()
