# ScoreFlow AI Pipeline Architecture

## Overview

ScoreFlow converts audio recordings into music notation (MusicXML). The pipeline is a sequential four-stage process: source separation, pitch transcription, MIDI quantization, and score generation. Each stage is independently testable and produces a well-defined intermediate file.

---

## 1. Data Flow Diagram

```
                         ScoreFlow AI Pipeline
                         =====================

  INPUT                STAGE 1              STAGE 2              STAGE 3              STAGE 4            OUTPUT
  -----                -------              -------              -------              -------            ------

  Audio File      Source Separation     Pitch Detection        Quantization       Score Generation
  (WAV/MP3/       +--------------+     +--------------+     +--------------+     +--------------+
   FLAC/OGG)      |              |     |              |     |              |     |              |
  -------->       |   Demucs     |---->| Basic Pitch  |---->|  Quantizer   |---->|   music21    |-----> MusicXML
                  |  (htdemucs)  |     |              |     |              |     |              |       (.musicxml)
                  |              |     |              |     |              |     |              |
                  +--------------+     +--------------+     +--------------+     +--------------+

  File:           File:                File:                File:                File:
  input.wav       stems/vocals.wav     raw_output.mid       quantized.mid        score.musicxml
                  stems/bass.wav
                  stems/drums.wav
                  stems/other.wav
```

### Detailed Stage Transitions

```
input.{wav,mp3,flac,ogg}
    |
    v
[STAGE 1: Demucs htdemucs]
    |-- Validates input format and duration
    |-- Separates into 4 stems (vocals, bass, drums, other)
    |-- Output: separated/{track_id}/vocals.wav, bass.wav, drums.wav, other.wav
    |-- All stems: 44100 Hz, 16-bit, WAV
    |
    v
[User selects stem(s)] -- default: all non-drum stems
    |
    v
[STAGE 2: Basic Pitch]
    |-- Processes selected stem(s) individually
    |-- Detects note onsets, pitches, and velocities
    |-- Output: transcribed/{track_id}/{stem_name}.mid (Standard MIDI Type 0)
    |
    v
[STAGE 3: Quantization]
    |-- Snaps note onsets/durations to nearest musical grid position
    |-- Configurable grid resolution (1/4, 1/8, 1/16, 1/32 note)
    |-- Merges multi-stem MIDI into single multi-track MIDI
    |-- Output: quantized/{track_id}/quantized.mid (Standard MIDI Type 1)
    |
    v
[STAGE 4: music21 Score Generation]
    |-- Parses quantized MIDI
    |-- Assigns instruments, clefs, key signatures
    |-- Generates MusicXML with proper notation
    |-- Output: output/{track_id}/score.musicxml
```

---

## 2. File Formats at Each Stage

| Stage | Input Format | Output Format | Encoding Details |
|-------|-------------|---------------|------------------|
| **Input** | WAV, MP3, FLAC, OGG | -- | Any sample rate; converted to 44100 Hz internally |
| **Stage 1: Demucs** | WAV (44100 Hz) | WAV per stem | 44100 Hz, 16-bit signed integer, mono or stereo |
| **Stage 2: Basic Pitch** | WAV (single stem) | MIDI Type 0 | One track per stem, 480 ticks/quarter note |
| **Stage 3: Quantization** | MIDI Type 0 (per stem) | MIDI Type 1 | Multi-track, quantized timing, 480 ticks/quarter |
| **Stage 4: music21** | MIDI Type 1 | MusicXML 3.1 | UTF-8 encoded XML |

### Directory Structure for Processing

```
data/
  jobs/{track_id}/
    input/
      original.wav          # Original uploaded file
    separated/
      vocals.wav            # Demucs output stems
      bass.wav
      drums.wav
      other.wav
    transcribed/
      vocals.mid            # Basic Pitch raw MIDI per stem
      bass.mid
      other.mid
    quantized/
      quantized.mid         # Merged, quantized MIDI
    output/
      score.musicxml        # Final MusicXML output
    metadata.json           # Job config, timestamps, errors
```

### metadata.json Schema

```json
{
  "trackId": "uuid-v4",
  "createdAt": "2026-04-08T10:00:00Z",
  "status": "completed | processing | failed",
  "currentStage": "demucs | basic_pitch | quantization | score_gen | done",
  "inputFile": {
    "originalName": "song.mp3",
    "format": "mp3",
    "sampleRate": 44100,
    "durationSeconds": 180,
    "fileSizeBytes": 5242880
  },
  "config": {
    "selectedStems": ["vocals", "bass", "other"],
    "quantizationGrid": "1/8",
    "quantizationStrength": 0.8
  },
  "stages": {
    "demucs": { "status": "completed", "startedAt": "...", "completedAt": "...", "durationMs": 45000 },
    "basic_pitch": { "status": "completed", "startedAt": "...", "completedAt": "...", "durationMs": 12000 },
    "quantization": { "status": "completed", "startedAt": "...", "completedAt": "...", "durationMs": 500 },
    "score_gen": { "status": "completed", "startedAt": "...", "completedAt": "...", "durationMs": 2000 }
  },
  "error": null
}
```

---

## 3. Error Handling Strategy

Each pipeline stage has its own failure modes. Errors are caught per-stage, recorded in `metadata.json`, and surfaced to the user with actionable messages.

### 3.1 Error Classification

| Category | Retryable | Action |
|----------|-----------|--------|
| `INPUT_INVALID` | No | Reject with user-facing message |
| `INPUT_TOO_LONG` | No | Reject; suggest trimming audio |
| `STAGE_TIMEOUT` | Yes (1x) | Retry once with same parameters |
| `STAGE_OOM` | No | Fail; suggest shorter audio or fewer stems |
| `STAGE_RUNTIME` | Yes (1x) | Retry once; fail with diagnostics on second attempt |
| `OUTPUT_CORRUPT` | Yes (1x) | Retry stage; if still corrupt, fail |

### 3.2 Per-Stage Error Handling

**Stage 1 -- Demucs:**
- Validate input before processing: check file exists, format is supported, duration <= 10 minutes
- Catch `torch.cuda.OutOfMemoryError` (GPU) or `MemoryError` (CPU) -- report as `STAGE_OOM`
- Verify all 4 stem files exist and are non-empty after completion
- Timeout: 120 seconds per minute of audio (e.g., 5-minute song = 600s max)

**Stage 2 -- Basic Pitch:**
- Validate input stem WAV exists and is non-empty
- Catch empty MIDI output (no notes detected) -- warn user, not an error
- Timeout: 30 seconds per minute of audio per stem

**Stage 3 -- Quantization:**
- Validate MIDI input has at least one note event
- If all notes quantize to the same grid position, warn (likely mono-pitched input)
- This stage is pure computation; timeout of 30 seconds is generous

**Stage 4 -- music21 Score Generation:**
- Validate MIDI input is parseable by music21
- Catch `music21.converter.ConverterException` -- report as `STAGE_RUNTIME`
- Validate output XML is well-formed before writing
- Timeout: 60 seconds

### 3.3 Error Response Format

```python
@dataclass
class PipelineError:
    stage: str              # "demucs" | "basic_pitch" | "quantization" | "score_gen"
    category: str           # Error category from table above
    message: str            # User-facing message
    detail: str | None      # Technical detail for logging (not shown to user)
    retryable: bool
    suggestion: str | None  # Actionable suggestion for the user
```

### 3.4 Cleanup on Failure

When a stage fails:
1. Record error in `metadata.json` with stage, category, and timestamps
2. Preserve all intermediate files from completed stages (user may inspect)
3. Clean up partial output from the failed stage only
4. Set job status to `"failed"` with `currentStage` pointing to the failed stage

---

## 4. Resource Requirements

### 4.1 Demucs (htdemucs model)

| Resource | Minimum | Recommended | Notes |
|----------|---------|-------------|-------|
| **CPU** | 4 cores | 8 cores | Uses all available cores via PyTorch |
| **RAM** | 4 GB | 8 GB | Peak usage scales with audio duration |
| **GPU** | Not required | NVIDIA GPU 4+ GB VRAM | 5-10x speedup; falls back to CPU gracefully |
| **Disk** | 1.5 GB | 1.5 GB | Model weights (~1.2 GB) + temp files |
| **Processing time** | ~60s/min (CPU) | ~10s/min (GPU) | For stereo 44100 Hz input |

**Memory scaling:** Demucs loads the full audio into memory. For a 10-minute stereo WAV at 44100 Hz:
- Raw audio: ~100 MB
- Peak working memory: ~2-3 GB (CPU) or ~1.5 GB VRAM (GPU)
- Limit input to 10 minutes to keep peak RAM under 4 GB

### 4.2 Basic Pitch

| Resource | Minimum | Recommended | Notes |
|----------|---------|-------------|-------|
| **CPU** | 2 cores | 4 cores | TensorFlow Lite inference |
| **RAM** | 1 GB | 2 GB | Lightweight model |
| **GPU** | Not required | Not required | CPU inference is fast enough |
| **Disk** | 50 MB | 50 MB | Model weights |
| **Processing time** | ~5s/min (CPU) | ~2s/min (CPU, AVX2) | Per stem |

### 4.3 Quantization (custom code)

| Resource | Minimum | Notes |
|----------|---------|-------|
| **CPU** | 1 core | Pure Python/NumPy computation |
| **RAM** | 100 MB | MIDI data is small |
| **Processing time** | < 1s | Even for complex multi-track MIDI |

### 4.4 music21 Score Generation

| Resource | Minimum | Notes |
|----------|---------|-------|
| **CPU** | 1 core | Single-threaded XML generation |
| **RAM** | 500 MB | music21 loads many internal datasets on import |
| **Disk** | 200 MB | music21 corpus data |
| **Processing time** | 1-5s | Depends on note density |

### 4.5 Total System Requirements

| Scenario | CPU | RAM | Disk | GPU |
|----------|-----|-----|------|-----|
| **Minimum (CPU only)** | 4 cores | 6 GB | 3 GB | None |
| **Recommended (CPU)** | 8 cores | 12 GB | 5 GB | None |
| **With GPU** | 4 cores | 8 GB | 5 GB | NVIDIA 4+ GB VRAM |

---

## 5. Supported Input Formats and Limitations

### 5.1 Supported Formats

| Format | Extension | Codec | Notes |
|--------|-----------|-------|-------|
| WAV | `.wav` | PCM 16/24/32-bit | Preferred; no conversion needed |
| MP3 | `.mp3` | MPEG Layer 3 | Converted to WAV via ffmpeg before processing |
| FLAC | `.flac` | Free Lossless Audio Codec | Converted to WAV via ffmpeg |
| OGG | `.ogg` | Vorbis | Converted to WAV via ffmpeg |

### 5.2 Input Validation Rules

| Constraint | Value | Error if violated |
|-----------|-------|-------------------|
| Max file size | 100 MB | `INPUT_INVALID`: "File exceeds 100 MB limit" |
| Max duration | 10 minutes | `INPUT_TOO_LONG`: "Audio exceeds 10-minute limit. Trim your audio and try again." |
| Min duration | 5 seconds | `INPUT_INVALID`: "Audio must be at least 5 seconds long" |
| Sample rate | Any (resampled to 44100 Hz) | -- |
| Channels | Mono or Stereo | `INPUT_INVALID` if >2 channels |
| Bit depth | 16, 24, or 32-bit | `INPUT_INVALID` if unsupported |

### 5.3 Known Limitations

1. **Drums are not transcribed to pitched notation.** Demucs separates drums, but Basic Pitch cannot meaningfully transcribe unpitched percussion. Drum stems are excluded from transcription by default.
2. **Polyphonic accuracy degrades with dense textures.** Basic Pitch works best on monophonic or lightly polyphonic sources. Source separation via Demucs mitigates this.
3. **Tempo detection is not built-in.** The quantizer assumes a default tempo of 120 BPM unless the user specifies one. Future work: auto-detect tempo via librosa.
4. **No lyrics extraction.** Vocal stems are transcribed as pitched notes only.
5. **Real-time processing is not supported.** The pipeline is batch-only; a 5-minute song takes 3-8 minutes to process on CPU.

### 5.4 External Dependencies

| Dependency | Version | Purpose | Install |
|-----------|---------|---------|---------|
| Python | >= 3.10 | Runtime | System |
| PyTorch | >= 2.0 | Demucs backend | `pip install torch` |
| Demucs | >= 4.0 | Source separation | `pip install demucs` |
| basic-pitch | >= 0.3 | Pitch transcription | `pip install basic-pitch` |
| music21 | >= 9.0 | Score generation | `pip install music21` |
| ffmpeg | >= 5.0 | Audio format conversion | System package |
| numpy | >= 1.24 | Numeric operations | `pip install numpy` |
| mido | >= 1.3 | MIDI manipulation | `pip install mido` |

---

## 6. Pipeline Configuration Options

### 6.1 Configuration Schema

```python
@dataclass
class PipelineConfig:
    # Stem selection
    selected_stems: list[str] = field(default_factory=lambda: ["vocals", "bass", "other"])
    # Options: "vocals", "bass", "drums", "other"
    # "drums" is excluded by default (unpitched percussion)

    # Quantization
    quantization_grid: str = "1/8"
    # Options: "1/4", "1/8", "1/16", "1/32"
    # Finer grids preserve more rhythmic detail but produce busier notation

    quantization_strength: float = 0.8
    # Range: 0.0 to 1.0
    # 0.0 = no quantization (raw timing preserved)
    # 1.0 = full snap to grid
    # 0.8 = default; snaps notes within 80% of grid distance

    # Tempo
    tempo_bpm: int = 120
    # Range: 40 to 300
    # Used by quantizer to define grid positions

    # Score generation
    key_signature: str | None = None
    # None = auto-detect from pitch content
    # e.g., "C major", "A minor", "Bb major"

    time_signature: str = "4/4"
    # Options: "2/4", "3/4", "4/4", "6/8", "3/8"

    transpose_semitones: int = 0
    # Range: -24 to 24
    # Applied after transcription, before score generation

    # Processing
    use_gpu: bool = False
    # If True and CUDA available, Demucs uses GPU

    max_duration_seconds: int = 600
    # Hard cap on input duration (10 minutes default)
```

### 6.2 Quantization Detail

The quantizer works by:
1. Computing a grid of valid onset positions based on `tempo_bpm` and `quantization_grid`
2. For each note, finding the nearest grid position
3. If `distance_to_grid / grid_spacing <= quantization_strength`, snap to grid
4. Otherwise, keep original onset (allows swing/rubato to survive with lower strength)
5. Durations are quantized independently to the same grid

```
Example: quantization_grid="1/8", tempo_bpm=120

Grid positions (seconds): 0.000, 0.250, 0.500, 0.750, 1.000, ...
Note onset at 0.230s:
  - Nearest grid: 0.250s (distance = 0.020)
  - Grid spacing: 0.250s
  - Ratio: 0.020 / 0.250 = 0.08
  - strength=0.8: 0.08 <= 0.8 -> SNAP to 0.250s
  - strength=0.05: 0.08 > 0.05 -> KEEP at 0.230s
```

### 6.3 Stem Selection Presets

| Preset | Stems | Use Case |
|--------|-------|----------|
| `melody` | `["vocals"]` | Lead vocal melody extraction |
| `accompaniment` | `["bass", "other"]` | Backing instruments |
| `full` | `["vocals", "bass", "other"]` | Full arrangement (default) |
| `all` | `["vocals", "bass", "drums", "other"]` | Everything including drums (experimental) |

---

## 7. Extensibility Design for Phase 4 Instruments

### 7.1 Current Instrument Mapping (Phase 1)

Demucs htdemucs produces 4 fixed stems. The pipeline maps them to music21 instruments:

| Stem | music21 Instrument | Clef | Notes |
|------|-------------------|------|-------|
| `vocals` | `instrument.Vocalist()` | Treble | Melody line |
| `bass` | `instrument.ElectricBass()` | Bass | Bass line |
| `other` | `instrument.Piano()` | Grand Staff | Catch-all for other instruments |
| `drums` | (excluded) | -- | Not transcribed in Phase 1 |

### 7.2 Phase 4 Extension Points

Phase 4 will add instrument-specific models and finer stem separation. The architecture supports this through three extension points:

#### Extension Point 1: Custom Separator Models

```python
class StemSeparator(Protocol):
    """Interface for source separation backends."""

    def separate(self, audio_path: Path, output_dir: Path) -> dict[str, Path]:
        """
        Separate audio into stems.

        Returns:
            Mapping of stem name -> output WAV file path.
            e.g., {"vocals": Path("vocals.wav"), "guitar": Path("guitar.wav")}
        """
        ...

    @property
    def supported_stems(self) -> list[str]:
        """List of stem names this separator produces."""
        ...

# Phase 1: Uses DemucsHTSeparator (4 stems)
# Phase 4: Can swap to DemucsHTFine (6 stems) or custom model
```

Adding a new separator:
1. Implement `StemSeparator` protocol
2. Register in `SEPARATOR_REGISTRY`
3. Update `PipelineConfig.selected_stems` options
4. No changes needed to downstream stages

#### Extension Point 2: Instrument Classifier

Phase 4 introduces a classification step between separation and transcription:

```python
class InstrumentClassifier(Protocol):
    """Identifies specific instruments within a stem."""

    def classify(self, stem_path: Path, stem_name: str) -> list[InstrumentTag]:
        """
        Analyze a stem and return instrument tags with confidence scores.

        Returns:
            e.g., [InstrumentTag("acoustic_guitar", 0.92), InstrumentTag("piano", 0.15)]
        """
        ...

@dataclass
class InstrumentTag:
    name: str          # e.g., "acoustic_guitar", "violin", "trumpet"
    confidence: float  # 0.0 to 1.0
```

In Phase 1, classification is skipped (stems map directly to default instruments). The pipeline checks for a classifier and uses it if present:

```python
# Pipeline pseudocode
classifier = config.instrument_classifier  # None in Phase 1
if classifier:
    tags = classifier.classify(stem_path, stem_name)
    instrument = INSTRUMENT_MAP[tags[0].name]
else:
    instrument = DEFAULT_INSTRUMENT_MAP[stem_name]
```

#### Extension Point 3: Instrument-Specific Notation Rules

Different instruments have different notation conventions:

```python
INSTRUMENT_NOTATION_RULES: dict[str, NotationRules] = {
    # Phase 1 defaults
    "vocals": NotationRules(clef="treble", transpose=0, notation_style="standard"),
    "bass": NotationRules(clef="bass", transpose=0, notation_style="standard"),
    "other": NotationRules(clef="treble", transpose=0, notation_style="standard"),

    # Phase 4 additions (examples)
    "guitar": NotationRules(clef="treble", transpose=-12, notation_style="tab_and_standard"),
    "violin": NotationRules(clef="treble", transpose=0, notation_style="standard"),
    "trumpet": NotationRules(clef="treble", transpose=2, notation_style="standard"),  # Bb transposition
    "alto_sax": NotationRules(clef="treble", transpose=9, notation_style="standard"),  # Eb transposition
    "drum_kit": NotationRules(clef="percussion", transpose=0, notation_style="percussion_map"),
}
```

Adding a new instrument in Phase 4:
1. Add entry to `INSTRUMENT_NOTATION_RULES`
2. Add mapping in `INSTRUMENT_MAP` (tag name -> music21 instrument class)
3. If the instrument needs special notation (e.g., guitar tab), implement a `NotationRenderer` for that style
4. No changes to the pipeline core

### 7.3 Plugin Architecture Summary

```
Phase 1 (current):
  DemucsHTSeparator -> [skip classifier] -> BasicPitchTranscriber -> Quantizer -> ScoreGenerator

Phase 4 (future):
  StemSeparator      -> InstrumentClassifier -> Transcriber          -> Quantizer -> ScoreGenerator
  (swappable)          (optional plugin)       (may be instrument-     (unchanged)  (uses notation
                                                specific in future)                  rules registry)
```

Each component communicates through well-defined file formats (WAV, MIDI, MusicXML) and Python protocol classes. Adding new instruments requires only registry entries and optional new notation renderers -- no changes to the pipeline orchestration logic.

---

## 8. Pipeline Orchestrator

The orchestrator manages job lifecycle and stage execution:

```python
class PipelineOrchestrator:
    """Runs the full pipeline for a single audio file."""

    def __init__(self, config: PipelineConfig):
        self.config = config
        self.separator = DemucsHTSeparator()
        self.transcriber = BasicPitchTranscriber()
        self.quantizer = MidiQuantizer()
        self.score_generator = MusicXMLGenerator()

    def run(self, input_path: Path, job_dir: Path) -> Path:
        """
        Execute the full pipeline.

        Args:
            input_path: Path to input audio file
            job_dir: Working directory for this job (data/jobs/{track_id}/)

        Returns:
            Path to final MusicXML output

        Raises:
            PipelineError on any stage failure
        """
        metadata = JobMetadata.create(input_path, self.config)

        try:
            # Stage 1: Source separation
            metadata.start_stage("demucs")
            stems = self.separator.separate(input_path, job_dir / "separated")
            metadata.complete_stage("demucs")

            # Stage 2: Transcription (per selected stem)
            metadata.start_stage("basic_pitch")
            midi_files = {}
            for stem_name in self.config.selected_stems:
                if stem_name in stems:
                    midi_path = self.transcriber.transcribe(
                        stems[stem_name],
                        job_dir / "transcribed" / f"{stem_name}.mid"
                    )
                    midi_files[stem_name] = midi_path
            metadata.complete_stage("basic_pitch")

            # Stage 3: Quantization
            metadata.start_stage("quantization")
            quantized_path = self.quantizer.quantize(
                midi_files,
                job_dir / "quantized" / "quantized.mid",
                grid=self.config.quantization_grid,
                strength=self.config.quantization_strength,
                tempo=self.config.tempo_bpm
            )
            metadata.complete_stage("quantization")

            # Stage 4: Score generation
            metadata.start_stage("score_gen")
            score_path = self.score_generator.generate(
                quantized_path,
                job_dir / "output" / "score.musicxml",
                key=self.config.key_signature,
                time_sig=self.config.time_signature,
                transpose=self.config.transpose_semitones
            )
            metadata.complete_stage("score_gen")

            metadata.set_completed()
            return score_path

        except PipelineError:
            metadata.set_failed()
            raise
        except Exception as e:
            metadata.set_failed(str(e))
            raise PipelineError(
                stage=metadata.current_stage,
                category="STAGE_RUNTIME",
                message="An unexpected error occurred during processing.",
                detail=str(e),
                retryable=True,
                suggestion="Try again. If the problem persists, try a different audio file."
            )
```

---

## Appendix: Quick Reference

| Question | Answer |
|----------|--------|
| What audio formats are accepted? | WAV, MP3, FLAC, OGG |
| Max input duration? | 10 minutes |
| Max file size? | 100 MB |
| What stems does Demucs produce? | vocals, bass, drums, other |
| Which stems are transcribed by default? | vocals, bass, other (not drums) |
| What MIDI format is used? | Type 0 (per stem), Type 1 (merged) |
| What is the output format? | MusicXML 3.1 |
| Default quantization? | 1/8 note grid, 0.8 strength |
| Default tempo? | 120 BPM |
| GPU required? | No (optional, speeds up Demucs 5-10x) |
| Min Python version? | 3.10 |
| How to add a new instrument? | Add to INSTRUMENT_NOTATION_RULES + INSTRUMENT_MAP |
