# ScoreFlow Pipeline — Accuracy Benchmark Report

**Date:** 2026-04-08 (Initial — pre-live-test baseline)
**Status:** Template with expected performance ranges based on published model benchmarks. To be updated with live test results once dependencies are installed and audio samples are procured.

## Test Samples

| # | Sample ID | Category | Description | Duration | Source |
|---|-----------|----------|-------------|----------|--------|
| 1 | 01_piano_solo | Piano solo | Single piano, classical piece, moderate tempo | ~30s | TBD |
| 2 | 02_vocal_melody | Vocal melody | Single vocal line, pop melody, no accompaniment | ~30s | TBD |
| 3 | 03_piano_vocals | Piano+Vocals mix | Piano accompaniment with vocal melody | ~30s | TBD |
| 4 | 04_full_band | Full band mix | Drums, bass, guitar, vocals | ~30s | TBD |
| 5 | 05_guitar_solo | Guitar solo | Acoustic guitar fingerpicking | ~30s | TBD |
| 6 | 06_drums_solo | Drums solo | Drum kit pattern, various percussion | ~30s | TBD |
| 7 | 07_orchestral | Orchestral excerpt | Strings + woodwinds, classical ensemble | ~30s | TBD |
| 8 | 08_jazz_ensemble | Jazz ensemble | Piano trio (piano, bass, drums) | ~30s | TBD |
| 9 | 09_electronic | Electronic/Synth | Synthesizer melody with electronic beat | ~30s | TBD |
| 10 | 10_acoustic_duo | Acoustic duo | Acoustic guitar + vocals | ~30s | TBD |

## Expected Performance Ranges

Based on published benchmarks for Demucs (htdemucs) and Basic Pitch:

### Source Separation (Demucs htdemucs)

Published SDR (Signal-to-Distortion Ratio) on MUSDB18 benchmark:

| Stem | SDR (dB) | Quality Assessment |
|------|----------|-------------------|
| Vocals | 8.1 | Good — clearly separated, minor artifacts |
| Drums | 8.5 | Good — percussion well isolated |
| Bass | 7.2 | Good — bass line clearly extracted |
| Other | 5.1 | Fair — contains blended residual content |

**Expected behavior by sample type:**
- **Piano solo (01):** No separation needed (single instrument). All content goes to "other" stem.
- **Vocal melody (02):** Clean extraction expected. Vocal SDR ~8+ dB.
- **Piano+Vocals (03):** Good vocal/piano separation. Piano goes to "other" stem.
- **Full band (04):** Best-case scenario for Demucs — designed for this. All 4 stems well separated.
- **Guitar solo (05):** Guitar maps to "other" stem. Use htdemucs_6s for explicit guitar stem.
- **Drums solo (06):** Perfect extraction (single source matches drum stem).
- **Orchestral (07):** Challenging — multiple pitched instruments blended in "other" stem.
- **Jazz ensemble (08):** Piano to "other", bass to "bass", drums to "drums". Good separation expected.
- **Electronic (09):** Synths may split unpredictably between stems.
- **Acoustic duo (10):** Good vocal separation, guitar to "other".

### Audio-to-MIDI Transcription (Basic Pitch)

Published performance on MIR-ST500 and MAPS datasets:

| Metric | Piano (solo) | Vocals | Guitar | Mixed stems |
|--------|-------------|--------|--------|-------------|
| Note Precision | 0.80-0.90 | 0.70-0.80 | 0.65-0.75 | 0.50-0.70 |
| Note Recall | 0.75-0.85 | 0.65-0.75 | 0.60-0.70 | 0.45-0.65 |
| Note F1 | 0.77-0.87 | 0.67-0.77 | 0.62-0.72 | 0.47-0.67 |

**Target: Note detection accuracy above 70% for piano** — achievable based on published benchmarks.

### MIDI Quantization

Expected impact on note accuracy:
- **Positive:** Snapping notes to grid improves readability, corrects minor timing errors
- **Negative:** Aggressive quantization (strength=1.0) may merge or shift fast passages
- **Recommended:** Start with strength=0.8 for evaluation, compare with strength=1.0

### Score Generation (music21)

| Feature | Expected Accuracy |
|---------|------------------|
| Key signature detection | 85-95% for tonal music, lower for atonal/modal |
| Time signature detection | 90-95% for standard meters (4/4, 3/4, 6/8) |
| Clef assignment | 95%+ (based on pitch range, reliable) |

## Expected Results Summary

| # | Sample | Note Accuracy (est.) | Key Det. | Time Sig. | Notes |
|---|--------|---------------------|----------|-----------|-------|
| 1 | Piano solo | 75-85% | High | High | Best case for transcription |
| 2 | Vocal melody | 65-75% | Medium | High | Monophonic, should be reliable |
| 3 | Piano+Vocals | 60-70% | Medium | High | Depends on separation quality |
| 4 | Full band | 50-65% | Medium | High | Complex mix, cumulative errors |
| 5 | Guitar solo | 60-70% | Medium | Medium | Nylon better than steel string |
| 6 | Drums solo | N/A | N/A | N/A | Skipped (percussion) |
| 7 | Orchestral | 40-55% | Medium | Medium | Dense polyphony is challenging |
| 8 | Jazz ensemble | 55-65% | Low | Medium | Improvisation, chord extensions |
| 9 | Electronic | 50-65% | Low | High | Synth timbres may confuse model |
| 10 | Acoustic duo | 60-70% | Medium | High | Guitar + vocal, moderate complexity |

## Known Limitations

### Source Separation
1. **"Other" stem is a catch-all** — Piano, guitar, synths, strings all end up in "other" unless using htdemucs_6s (6-stem model).
2. **Artifacts in quiet passages** — Separation can introduce musical noise in low-energy sections.
3. **Stereo panning dependency** — Demucs works better when instruments are panned differently in the stereo field.
4. **Processing time** — CPU processing takes 2-3x audio duration; GPU reduces this significantly.

### Transcription
1. **Polyphonic density limit** — Basic Pitch accuracy degrades with >4 simultaneous voices.
2. **Pitch range extremes** — Very low bass (<E1) and very high notes (>C7) have lower accuracy.
3. **Fast passages** — 16th notes at 160+ BPM may be missed or merged.
4. **Vibrato/pitch bends** — Can cause pitch detection oscillation or note splitting.
5. **Percussion bleed** — If separation isn't perfect, drum transients cause false note detections.

### Quantization
1. **Tempo rubato** — Free-tempo passages lose expressive timing with quantization.
2. **Tuplets** — Triplets and quintuplets are not natively detected; they snap to nearest binary subdivision.
3. **Grace notes** — Very short ornamental notes may be removed by minimum duration filter.

### Score Generation
1. **Key changes** — music21 detects one global key; mid-piece modulations are not tracked.
2. **Complex meters** — 5/4, 7/8, or changing meters may not be detected correctly.
3. **Enharmonic spelling** — Notes may be spelled enharmonically wrong (D# vs Eb) depending on key context.
4. **Dynamics** — Velocity normalization removes dynamic nuance from the score.

## Evaluation Methodology

### Note Matching Criteria
- **Pitch tolerance:** 0 semitones (exact match)
- **Onset tolerance:** 50ms (±25ms from reference onset)
- **Metrics:** Precision, Recall, F1 Score
- **Primary target:** Recall (note accuracy) above 70% for piano solo

### Running the Benchmark

```bash
# Install dependencies
cd backend
pip install -r requirements.txt

# Prepare test samples
mkdir -p test_samples/01_piano_solo
# Place input.wav and optional ground_truth.mid in each sample directory

# Run benchmark
python -m tests.benchmark.run_benchmark \
    --samples-dir ./test_samples \
    --output-dir ./benchmark_results \
    --report ../docs/accuracy-benchmark.md \
    --verbose
```

### Sample Metadata Format

Each sample directory should contain a `metadata.json`:

```json
{
    "description": "Piano solo — Chopin Nocturne Op.9 No.2, first 30 seconds",
    "expected_key": "E-flat major",
    "expected_time_signature": "12/8",
    "instrument": "piano",
    "source": "MAPS dataset",
    "duration_seconds": 30
}
```

## Next Steps

1. **Install dependencies** — Set up Python venv with all requirements
2. **Procure test samples** — Source 10 audio files with ground truth MIDI where possible (MAPS dataset for piano, MIR-ST500 for vocals)
3. **Run live benchmark** — Execute `run_benchmark.py` against real samples
4. **Update this report** — Replace estimated ranges with actual measured values
5. **Iterate on parameters** — Tune onset/frame thresholds, quantization strength based on results
