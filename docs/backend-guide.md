# ScoreFlow Backend Guide

**Stack**: Python 3.14 · FastAPI · uvicorn · Demucs · Basic Pitch · music21  
**Location**: `backend/`  
**Default port**: 8000

---

## Local Development

```powershell
# IMPORTANT: Always use PowerShell, never bash, for Python on this machine
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --host 0.0.0.0 --reload
```

The `--reload` flag restarts the server on file changes (dev only).

---

## File Structure

```
backend/
├── app/
│   └── main.py              # FastAPI app — all API endpoints
├── pipeline/
│   ├── __init__.py
│   ├── pipeline.py          # run_pipeline() orchestrator
│   ├── separator.py         # Demucs source separation (PATCHED for torchaudio 2.11)
│   ├── transcriber.py       # Basic Pitch audio→MIDI
│   ├── quantizer.py         # MIDI quantization
│   └── score_generator.py   # music21 MusicXML generation
├── tests/                   # pytest test suite
├── requirements.txt         # Python dependencies
├── Procfile                 # Railway: uvicorn entry point
├── Dockerfile               # Docker deployment
├── pyproject.toml           # Build config
├── .env.example             # Environment variable template
├── create_test_audio.py     # Generates synthetic C-major scale WAV for testing
└── render_scores.py         # Piano roll PNG renderer (local debugging only)
```

---

## API Endpoints

### `GET /`
Returns service info. Useful to verify the server is reachable.
```json
{"service": "ScoreFlow API", "status": "ok", "docs": "/docs"}
```

### `GET /health`
Health check for deployment platforms and monitoring.
```json
{"status": "ok"}
```

### `GET /docs`
FastAPI's auto-generated Swagger UI — use this to test endpoints interactively.

### `POST /api/jobs`
Upload an audio file and start the pipeline.

**Request**: `multipart/form-data` with field `file` (MP3/WAV/FLAC, max 50 MB)

**Response** (201 Created):
```json
{"job_id": "uuid-string", "status": "queued"}
```

**Errors**:
- `400` — unsupported file type
- `413` — file too large (>50 MB)

### `GET /api/jobs/{job_id}`
Poll job status and progress.

**Response**:
```json
{
  "job_id": "uuid",
  "status": "queued | processing | done | failed",
  "current_stage": "separation",
  "stages": [
    {"name": "separation", "status": "done", "message": ""},
    {"name": "transcription", "status": "running", "message": ""},
    {"name": "quantization", "status": "pending", "message": ""},
    {"name": "score_generation", "status": "pending", "message": ""}
  ],
  "scores": {
    "vocals": ["musicxml", "mid"],
    "bass": ["musicxml", "mid"],
    "other": ["musicxml", "mid"]
  },
  "error": "",
  "total_time_seconds": 277.5
}
```

### `GET /api/jobs/{job_id}/download/{stem}/{fmt}`
Download a generated output file.

- `stem`: `vocals`, `bass`, `other`, `guitar`, `piano`
- `fmt`: `musicxml` or `mid`

Returns the file as a download attachment.

**Errors**:
- `404` — job not found, or file not yet available
- `400` — unknown format

---

## The Pipeline (`pipeline/pipeline.py`)

The main function is `run_pipeline()`:

```python
result = run_pipeline(
    input_path=Path("audio.mp3"),
    output_dir=Path("/tmp/scoreflow-jobs/job-id/output"),
    model_name="htdemucs",           # or "htdemucs_ft", "htdemucs_6s"
    quantization_config=QuantizationConfig(subdivision=16, strength=1.0),
    score_config=ScoreConfig(title="My Song"),
)
```

**Output directory structure**:
```
output/
├── stems/         # separated WAV files: vocals.wav, bass.wav, other.wav, drums.wav
├── midi/          # raw MIDI: vocals.mid, bass.mid, other.mid
├── quantized/     # beat-aligned MIDI
├── scores/        # MusicXML: vocals.musicxml, bass.musicxml, other.musicxml
└── pipeline_summary.json
```

---

## Stage Details

### Stage 1: Separator (`pipeline/separator.py`)

Calls `separate(input_path, stems_dir, model_name="htdemucs")`.

**CRITICAL PATCH** — torchaudio 2.11 fix. Both `_load_audio()` and the stem save loop
use `soundfile` as a fallback when torchaudio raises an exception. Do NOT remove this.

```python
# Load audio with soundfile fallback
try:
    waveform, sample_rate = torchaudio.load(str(input_path))
except Exception:
    import soundfile as sf
    data, sample_rate = sf.read(str(input_path), always_2d=True)
    waveform = torch.from_numpy(data.T.copy()).float()
```

### Stage 2: Transcriber (`pipeline/transcriber.py`)

Calls `transcribe(stem_path, midi_path, config=TranscriptionConfig(...))`.

Stem-specific presets:
- `VOCAL_CONFIG` — lower onset threshold for soft vocals
- `BASS_CONFIG` — pitch clamped to bass register
- `PIANO_CONFIG` — default settings
- `drums` stem → **skipped entirely**

Requires `onnxruntime` (not TensorFlow). basic-pitch loads `nmp.onnx` automatically.

### Stage 3: Quantizer (`pipeline/quantizer.py`)

Calls `quantize(midi_path, output_path, config=QuantizationConfig(...))`.

```python
@dataclass
class QuantizationConfig:
    subdivision: int = 16    # 4=quarter, 8=eighth, 16=sixteenth, 32=thirty-second
    strength: float = 1.0    # 0.0=no change, 1.0=fully quantized
```

### Stage 4: Score Generator (`pipeline/score_generator.py`)

Calls `generate_score(midi_path, output_path, config=ScoreConfig(...))`.

Uses `music21` to:
1. Load quantized MIDI into a `Stream`
2. Detect key signature via `stream.analyze('key')`
3. Organize into `Measure` objects
4. Export to MusicXML

---

## Job State Machine

```
POST /api/jobs
    │
    ▼
JobStatus.QUEUED
    │  (background thread starts)
    ▼
JobStatus.PROCESSING
    │  stages update as pipeline runs
    ▼
JobStatus.DONE    ←── or ──→   JobStatus.FAILED
```

Jobs are stored in memory (`_JOBS` dict). They are **lost on server restart**.

---

## Running Tests

```powershell
cd backend
.venv\Scripts\python.exe -m pytest tests/ -v
```

Generate a test WAV file:
```powershell
.venv\Scripts\python.exe create_test_audio.py
# Creates test_input.wav (C major scale, 4 seconds)
```

Run the full pipeline CLI:
```powershell
.venv\Scripts\python.exe -m pipeline.pipeline test_input.wav --output-dir ./results --verbose
```

---

## Installing Dependencies

```powershell
# Pipeline deps (heavy — includes torch, demucs ~2GB)
.venv\Scripts\pip.exe install demucs music21 pretty_midi soundfile

# Basic Pitch without TensorFlow (Python 3.14 has no TF wheels)
.venv\Scripts\pip.exe install basic-pitch --no-deps
.venv\Scripts\pip.exe install onnxruntime librosa mir_eval resampy==0.4.2

# Web API deps
.venv\Scripts\pip.exe install fastapi uvicorn[standard] python-multipart
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JOBS_DIR` | `/tmp/scoreflow-jobs` | Where to store uploaded files and outputs |
| `PORT` | `8000` | Port for uvicorn (Railway sets this automatically) |

---

## Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| `encodings` import error | Running Python from bash | Use `powershell -Command` instead |
| `No module named 'fastapi'` | Wrong Python executable | Use `.venv\Scripts\python.exe` |
| `torchaudio.load` fails | torchcodec backend, missing FFmpeg DLLs | Already fixed in `separator.py` |
| `basic-pitch` TF error | No TF wheels for Python 3.14 | Install `--no-deps` + `onnxruntime` |
| `resampy` version conflict | basic-pitch needs `<0.4.3` | `pip install resampy==0.4.2` |
