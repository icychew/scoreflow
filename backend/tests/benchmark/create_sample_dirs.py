"""Helper script to create the test sample directory structure.

Creates 10 sample directories with metadata.json templates.
Audio files must be added manually.

Usage:
    python -m tests.benchmark.create_sample_dirs --output-dir ./test_samples
"""

import argparse
import json
from pathlib import Path


SAMPLES = [
    {
        "dir_name": "01_piano_solo",
        "description": "Piano solo — single piano, classical piece, moderate tempo",
        "expected_key": "",
        "expected_time_signature": "4/4",
        "instrument": "piano",
        "source": "TBD — suggest MAPS dataset or public domain recording",
        "duration_seconds": 30,
    },
    {
        "dir_name": "02_vocal_melody",
        "description": "Vocal melody — single vocal line, pop melody, no accompaniment",
        "expected_key": "",
        "expected_time_signature": "4/4",
        "instrument": "vocals",
        "source": "TBD — suggest MIR-ST500 dataset",
        "duration_seconds": 30,
    },
    {
        "dir_name": "03_piano_vocals",
        "description": "Piano + Vocals mix — piano accompaniment with vocal melody",
        "expected_key": "",
        "expected_time_signature": "4/4",
        "instrument": "mixed",
        "source": "TBD",
        "duration_seconds": 30,
    },
    {
        "dir_name": "04_full_band",
        "description": "Full band mix — drums, bass, guitar, vocals",
        "expected_key": "",
        "expected_time_signature": "4/4",
        "instrument": "mixed",
        "source": "TBD — suggest MUSDB18 dataset",
        "duration_seconds": 30,
    },
    {
        "dir_name": "05_guitar_solo",
        "description": "Guitar solo — acoustic guitar fingerpicking",
        "expected_key": "",
        "expected_time_signature": "4/4",
        "instrument": "guitar",
        "source": "TBD",
        "duration_seconds": 30,
    },
    {
        "dir_name": "06_drums_solo",
        "description": "Drums solo — drum kit pattern, various percussion",
        "expected_key": "",
        "expected_time_signature": "4/4",
        "instrument": "drums",
        "source": "TBD",
        "duration_seconds": 30,
    },
    {
        "dir_name": "07_orchestral",
        "description": "Orchestral excerpt — strings + woodwinds, classical ensemble",
        "expected_key": "",
        "expected_time_signature": "4/4",
        "instrument": "mixed",
        "source": "TBD — suggest public domain classical recordings",
        "duration_seconds": 30,
    },
    {
        "dir_name": "08_jazz_ensemble",
        "description": "Jazz ensemble — piano trio (piano, bass, drums)",
        "expected_key": "",
        "expected_time_signature": "4/4",
        "instrument": "mixed",
        "source": "TBD",
        "duration_seconds": 30,
    },
    {
        "dir_name": "09_electronic",
        "description": "Electronic/Synth — synthesizer melody with electronic beat",
        "expected_key": "",
        "expected_time_signature": "4/4",
        "instrument": "synth",
        "source": "TBD",
        "duration_seconds": 30,
    },
    {
        "dir_name": "10_acoustic_duo",
        "description": "Acoustic duo — acoustic guitar + vocals",
        "expected_key": "",
        "expected_time_signature": "4/4",
        "instrument": "mixed",
        "source": "TBD",
        "duration_seconds": 30,
    },
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Create benchmark sample directories")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("./test_samples"),
        help="Output directory (default: ./test_samples)",
    )
    args = parser.parse_args()

    for sample in SAMPLES:
        sample_dir = args.output_dir / sample["dir_name"]
        sample_dir.mkdir(parents=True, exist_ok=True)

        metadata = {k: v for k, v in sample.items() if k != "dir_name"}
        metadata_path = sample_dir / "metadata.json"
        metadata_path.write_text(json.dumps(metadata, indent=2))

        readme_path = sample_dir / "README.txt"
        readme_path.write_text(
            f"Sample: {sample['dir_name']}\n"
            f"Description: {sample['description']}\n\n"
            f"Required files:\n"
            f"  - input.wav (or input.mp3, input.flac) — the audio sample\n"
            f"  - ground_truth.mid (optional) — reference MIDI for accuracy comparison\n"
            f"  - metadata.json — sample metadata (already created)\n"
        )

        print(f"Created: {sample_dir}")

    print(f"\nAll {len(SAMPLES)} sample directories created in: {args.output_dir}")
    print("Add input audio files to each directory, then run the benchmark.")


if __name__ == "__main__":
    main()
