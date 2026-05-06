"""Score Refinement Loop.

After a score is generated, this module synthesizes the quantized MIDI back to audio
and compares it bar-by-bar against the original separated stem using chromagram cosine
similarity. Bars where the two audio signals disagree (low chroma similarity) are
re-transcribed with relaxed Basic Pitch thresholds, and the score is regenerated.

No new dependencies required — uses pretty_midi, librosa, soundfile, and numpy, which
are all already installed.

Main entry point::

    from pipeline.refiner import refine
    result = refine(stem_path, midi_path, musicxml_path, output_dir, tempo_bpm=120.0)
"""

import logging
import time
import tempfile
from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np
import pretty_midi
import soundfile as sf

logger = logging.getLogger(__name__)


# ── Data classes ───────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class RefinementResult:
    """Result of a refinement pass on a single stem's score.

    Attributes:
        refined_midi_path: Path to the updated MIDI (may be same as input if no
            bars needed refinement).
        refined_musicxml_path: Path to the regenerated MusicXML.
        bars_checked: Total bars in the score.
        bars_refined: Bars where re-transcription was applied.
        mean_chroma_similarity: Average chroma cosine similarity 0.0–1.0 across all
            bars (higher = better match between original stem and generated score).
        processing_time_seconds: Wall-clock time for the full refinement pass.
    """
    refined_midi_path: Path
    refined_musicxml_path: Path
    bars_checked: int
    bars_refined: int
    mean_chroma_similarity: float
    processing_time_seconds: float


# ── Synthesis ──────────────────────────────────────────────────────────────────

def synthesize_midi(midi_path: Path, wav_path: Path, fs: int = 22050) -> None:
    """Synthesize a MIDI file to WAV using pretty_midi's built-in additive synthesis.

    Uses sine-wave additive synthesis — no FluidSynth installation required.
    Quality is sufficient for chromagram-based comparison.

    Args:
        midi_path: Path to the input MIDI file.
        wav_path: Destination WAV file path.
        fs: Sample rate (default 22050, matching librosa's default).
    """
    pm = pretty_midi.PrettyMIDI(str(midi_path))
    audio = pm.synthesize(fs=fs)
    wav_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(wav_path), audio, fs)
    logger.debug("Synthesized MIDI → %s (%.1f KB)", wav_path.name, wav_path.stat().st_size / 1024)


# ── Chroma comparison ──────────────────────────────────────────────────────────

def compute_bar_chroma_similarities(
    stem_wav: Path,
    synth_wav: Path,
    tempo_bpm: float,
    beats_per_bar: int = 4,
    sr: int = 22050,
    hop_length: int = 512,
) -> list[float]:
    """Compute per-bar chroma cosine similarity between the original stem and synthesized score.

    Args:
        stem_wav: Original separated stem audio.
        synth_wav: Synthesized MIDI audio (from synthesize_midi).
        tempo_bpm: Song tempo used to divide audio into bars.
        beats_per_bar: Time signature numerator (default 4).
        sr: Sample rate.
        hop_length: STFT hop length for chromagram.

    Returns:
        List of cosine similarities (0.0–1.0) per bar, length = ceil(duration / bar_length).
    """
    y_stem, _ = librosa.load(str(stem_wav), sr=sr, mono=True)
    y_synth, _ = librosa.load(str(synth_wav), sr=sr, mono=True)

    # Pad the shorter signal so both have the same length
    max_len = max(len(y_stem), len(y_synth))
    y_stem = np.pad(y_stem, (0, max_len - len(y_stem)))
    y_synth = np.pad(y_synth, (0, max_len - len(y_synth)))

    chroma_stem = librosa.feature.chroma_stft(y=y_stem, sr=sr, hop_length=hop_length)
    chroma_synth = librosa.feature.chroma_stft(y=y_synth, sr=sr, hop_length=hop_length)
    times = librosa.times_like(chroma_stem, sr=sr, hop_length=hop_length)

    seconds_per_bar = beats_per_bar * (60.0 / tempo_bpm)
    duration = max_len / sr
    n_bars = max(1, int(np.ceil(duration / seconds_per_bar)))

    similarities: list[float] = []
    for i in range(n_bars):
        t_start = i * seconds_per_bar
        t_end = (i + 1) * seconds_per_bar
        mask = (times >= t_start) & (times < t_end)
        if mask.sum() == 0:
            similarities.append(1.0)  # empty bar — treat as matching
            continue
        c1 = chroma_stem[:, mask].mean(axis=1)
        c2 = chroma_synth[:, mask].mean(axis=1)
        n1, n2 = np.linalg.norm(c1), np.linalg.norm(c2)
        if n1 == 0 or n2 == 0:
            similarities.append(0.0)
        else:
            similarities.append(float(np.dot(c1, c2) / (n1 * n2)))

    return similarities


# ── Per-bar re-transcription ───────────────────────────────────────────────────

def _extract_audio_segment(wav_path: Path, t_start: float, t_end: float, sr: int = 22050) -> np.ndarray:
    """Load a time slice from a WAV file."""
    y, _ = librosa.load(str(wav_path), sr=sr, mono=True, offset=t_start, duration=t_end - t_start)
    return y


def _notes_in_bar(pm: pretty_midi.PrettyMIDI, t_start: float, t_end: float) -> list:
    """Return all notes (across all instruments) whose onset is within [t_start, t_end)."""
    notes = []
    for inst in pm.instruments:
        if inst.is_drum:
            continue
        for note in inst.notes:
            if t_start <= note.start < t_end:
                notes.append(note)
    return notes


def retranscribe_bars(
    stem_path: Path,
    weak_bar_indices: list[int],
    seconds_per_bar: float,
    existing_midi: pretty_midi.PrettyMIDI,
    stem_name: str = "",
    sr: int = 22050,
) -> pretty_midi.PrettyMIDI:
    """Re-transcribe weak bars from the original stem audio with relaxed thresholds.

    For each weak bar:
    1. Extract the audio segment from the original stem.
    2. Re-run Basic Pitch with lower onset/frame thresholds.
    3. Replace the notes in that bar of the existing MIDI with the new detections.

    Args:
        stem_path: Original separated stem WAV.
        weak_bar_indices: Bar indices (0-based) to re-transcribe.
        seconds_per_bar: Duration of one bar in seconds.
        existing_midi: Current pretty_midi object to update in-place (copy made).
        stem_name: Stem name for selecting frequency bounds.
        sr: Sample rate.

    Returns:
        Updated pretty_midi.PrettyMIDI with refined notes in weak bars.
    """
    from basic_pitch.inference import predict
    from pipeline.transcriber import PIANO_CONFIG, VOCAL_CONFIG, BASS_CONFIG, GUITAR_CONFIG

    # Frequency bounds per instrument (relaxed defaults for re-transcription)
    freq_bounds: dict[str, tuple[float | None, float | None]] = {
        "piano":  (27.5,  4186.0),
        "vocals": (80.0,  1100.0),
        "bass":   (30.0,  400.0),
        "guitar": (82.0,  1319.0),
        "other":  (100.0, 2000.0),
    }
    min_freq, max_freq = freq_bounds.get(stem_name, (None, None))

    # Make a copy of the MIDI to avoid mutating the original
    with tempfile.NamedTemporaryFile(suffix=".mid", delete=False) as tf:
        tmp_path = Path(tf.name)
    existing_midi.write(str(tmp_path))
    pm_new = pretty_midi.PrettyMIDI(str(tmp_path))
    tmp_path.unlink(missing_ok=True)

    for bar_idx in weak_bar_indices:
        t_start = bar_idx * seconds_per_bar
        t_end = (bar_idx + 1) * seconds_per_bar

        # Write bar segment to a temp WAV
        y_seg = _extract_audio_segment(stem_path, t_start, t_end, sr=sr)
        if len(y_seg) < sr * 0.1:
            continue  # too short to transcribe

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
            seg_path = Path(tf.name)
        sf.write(str(seg_path), y_seg, sr)

        try:
            _, midi_data, _ = predict(
                str(seg_path),
                onset_threshold=0.35,   # relaxed from default 0.5
                frame_threshold=0.2,    # relaxed from default 0.3
                minimum_note_length=50.0,
                minimum_frequency=min_freq,
                maximum_frequency=max_freq,
            )
        except Exception as exc:
            logger.warning("Re-transcription of bar %d failed: %s", bar_idx, exc)
            continue
        finally:
            seg_path.unlink(missing_ok=True)

        # Collect new notes, shifted to absolute time
        new_notes: list[pretty_midi.Note] = []
        for inst in midi_data.instruments:
            for note in inst.notes:
                new_notes.append(pretty_midi.Note(
                    velocity=note.velocity,
                    pitch=note.pitch,
                    start=note.start + t_start,
                    end=note.end + t_start,
                ))

        if not new_notes:
            continue

        # Replace notes in this bar across all instruments in pm_new
        for inst in pm_new.instruments:
            if inst.is_drum:
                continue
            inst.notes = [n for n in inst.notes if not (t_start <= n.start < t_end)]

        # Add refined notes to the first non-drum instrument (or create one)
        target_inst = next((i for i in pm_new.instruments if not i.is_drum), None)
        if target_inst is None:
            target_inst = pretty_midi.Instrument(program=0)
            pm_new.instruments.append(target_inst)
        target_inst.notes.extend(new_notes)

        logger.debug("Bar %d re-transcribed: %d new notes", bar_idx, len(new_notes))

    return pm_new


# ── Main entry point ───────────────────────────────────────────────────────────

def refine(
    stem_path: Path,
    midi_path: Path,
    musicxml_path: Path,
    output_dir: Path,
    tempo_bpm: float = 120.0,
    beats_per_bar: int = 4,
    similarity_threshold: float = 0.65,
    stem_name: str = "",
) -> RefinementResult:
    """Run the chroma-based refinement loop for one stem.

    Steps:
    1. Synthesize the quantized MIDI to audio (pretty_midi additive synthesis).
    2. Compute per-bar chroma cosine similarity vs the original stem.
    3. Re-transcribe bars below ``similarity_threshold`` with relaxed thresholds.
    4. Write the refined MIDI and regenerate the MusicXML score.

    Args:
        stem_path: Original separated stem WAV (from Demucs).
        midi_path: Quantized MIDI for this stem.
        musicxml_path: Generated MusicXML for this stem.
        output_dir: Directory to write refined outputs.
        tempo_bpm: Song tempo (from librosa beat tracking in pipeline.py).
        beats_per_bar: Time signature numerator.
        similarity_threshold: Bars below this cosine similarity are re-transcribed.
        stem_name: Instrument name for frequency-bound selection.

    Returns:
        RefinementResult with paths and quality metrics.
    """
    start_time = time.monotonic()
    logger.info("Refinement starting for stem='%s'", stem_name)

    output_dir.mkdir(parents=True, exist_ok=True)

    # Step 1: Synthesize MIDI → WAV
    synth_wav = output_dir / f"{stem_name}_synth.wav"
    try:
        synthesize_midi(midi_path, synth_wav)
    except Exception as exc:
        logger.warning("Synthesis failed for '%s': %s — skipping refinement", stem_name, exc)
        return RefinementResult(
            refined_midi_path=midi_path,
            refined_musicxml_path=musicxml_path,
            bars_checked=0,
            bars_refined=0,
            mean_chroma_similarity=-1.0,
            processing_time_seconds=time.monotonic() - start_time,
        )

    # Step 2: Compute per-bar chroma similarity
    similarities = compute_bar_chroma_similarities(
        stem_wav=stem_path,
        synth_wav=synth_wav,
        tempo_bpm=tempo_bpm,
        beats_per_bar=beats_per_bar,
    )
    mean_sim = float(np.mean(similarities)) if similarities else 0.0
    seconds_per_bar = beats_per_bar * (60.0 / tempo_bpm)

    weak_bars = [i for i, s in enumerate(similarities) if s < similarity_threshold]
    logger.info(
        "Chroma analysis: bars=%d, weak=%d, mean_similarity=%.3f",
        len(similarities), len(weak_bars), mean_sim,
    )

    # Step 3: Re-transcribe weak bars
    refined_midi_path = midi_path
    refined_musicxml_path = musicxml_path
    bars_refined = 0

    if weak_bars:
        try:
            existing_pm = pretty_midi.PrettyMIDI(str(midi_path))
            pm_refined = retranscribe_bars(
                stem_path=stem_path,
                weak_bar_indices=weak_bars,
                seconds_per_bar=seconds_per_bar,
                existing_midi=existing_pm,
                stem_name=stem_name,
            )

            refined_midi_path = output_dir / f"{stem_name}_refined.mid"
            pm_refined.write(str(refined_midi_path))
            bars_refined = len(weak_bars)
            logger.info("Refined MIDI written: %s", refined_midi_path.name)

            # Step 4: Regenerate MusicXML from refined MIDI
            from pipeline.quantizer import quantize, QuantizationConfig
            from pipeline.score_generator import generate_score, ScoreConfig

            quantized_refined = output_dir / f"{stem_name}_refined_q.mid"
            quantize(refined_midi_path, quantized_refined, config=QuantizationConfig(tempo=tempo_bpm))

            refined_musicxml_path = output_dir / f"{stem_name}_refined.musicxml"
            generate_score(
                quantized_refined,
                refined_musicxml_path,
                config=ScoreConfig(title=f"{stem_name.capitalize()} (Refined)"),
                stem_name=stem_name,
            )
            logger.info("Refined MusicXML written: %s", refined_musicxml_path.name)

        except Exception as exc:
            logger.warning("Refinement failed for '%s': %s", stem_name, exc)
            refined_midi_path = midi_path
            refined_musicxml_path = musicxml_path
            bars_refined = 0

    processing_time = time.monotonic() - start_time
    logger.info(
        "Refinement complete for '%s': bars_refined=%d/%d, mean_similarity=%.3f, time=%.1fs",
        stem_name, bars_refined, len(similarities), mean_sim, processing_time,
    )

    return RefinementResult(
        refined_midi_path=refined_midi_path,
        refined_musicxml_path=refined_musicxml_path,
        bars_checked=len(similarities),
        bars_refined=bars_refined,
        mean_chroma_similarity=round(mean_sim, 3),
        processing_time_seconds=processing_time,
    )
