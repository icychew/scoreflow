# ScoreFlow — Technical Report

**Project**: ScoreFlow — AI Audio-to-Sheet-Music Web Application  
**Developer**: ICY (icychew)  
**Date**: April 2026  
**Repository**: https://github.com/icychew/scoreflow  
**Live URL**: https://scoreflow-gamma.vercel.app

---

## 1. Executive Summary

ScoreFlow is a full-stack web application that converts audio files into sheet music using a four-stage AI pipeline. Users upload an MP3, WAV, or FLAC file through a drag-and-drop interface; the system separates the audio into musical stems, transcribes each stem to MIDI, quantizes the notes to a musical grid, and generates MusicXML sheet music that can be opened in MuseScore or any standard notation software.

The project was built in a single development session using Claude Code as the AI engineering assistant, starting from a working Python CLI pipeline and ending with a fully deployed web application accessible at a public URL.

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
User (Browser)
    │
    ▼
Frontend — Next.js 14 on Vercel (scoreflow-gamma.vercel.app)
    │  NEXT_PUBLIC_API_URL
    ▼
ngrok tunnel (https://xxxx.ngrok-free.dev)
    │
    ▼
Backend — FastAPI on localhost:8000
    │
    ▼
ML Pipeline (Python, runs in background thread)
    ├── Stage 1: Demucs — source separation
    ├── Stage 2: Basic Pitch — audio → MIDI
    ├── Stage 3: Quantizer — beat alignment
    └── Stage 4: music21 — MusicXML generation
```

### 2.2 Backend Architecture

The FastAPI backend uses a simple in-process job queue:

- **Job Store**: Python dict (`_JOBS: dict[str, JobState]`) protected by a `threading.Lock`
- **Job Execution**: Each job runs in a `daemon=True` background thread
- **File Storage**: `/tmp/scoreflow-jobs/{job_id}/` (ephemeral, sufficient for MVP)
- **No external dependencies**: No Redis, Celery, or database required

```python
# Job lifecycle
POST /api/jobs     → creates job, spawns thread, returns job_id
GET  /api/jobs/id  → returns current JobState (status + stages)
GET  /api/jobs/id/download/stem/fmt → streams file to browser
```

### 2.3 Frontend Architecture

The Next.js frontend uses the App Router (Next.js 14+):

- **`/`** — Static page with UploadZone component. On submit, calls `POST /api/jobs` and redirects to `/job/{id}`.
- **`/job/[id]`** — Dynamic server-rendered page. Polls `GET /api/jobs/{id}` every 2.5 seconds. Shows ProgressCard while running, ResultsPanel when done.

---

## 3. The AI Pipeline — Technical Detail

### Stage 1: Source Separation (Demucs)

**Model**: `htdemucs` — Meta's Hybrid Transformer Demucs  
**Output stems**: `vocals`, `drums`, `bass`, `other`  
**Implementation**: `backend/pipeline/separator.py`

Demucs separates a mixed audio signal into isolated instrument stems. The `htdemucs` model combines a time-domain (Demucs) and frequency-domain (HDemucs) approach using a transformer bottleneck.

**Known issue resolved**: torchaudio 2.11 introduced a torchcodec backend that requires FFmpeg "full-shared" DLLs not included in the standard Windows FFmpeg CLI install. Fixed by patching both audio load and save operations to fall back to `soundfile`:

```python
def _load_audio(input_path):
    try:
        waveform, sample_rate = torchaudio.load(str(input_path))
    except Exception:
        import soundfile as sf
        data, sample_rate = sf.read(str(input_path), always_2d=True)
        waveform = torch.from_numpy(data.T.copy()).float()
    return waveform, sample_rate
```

### Stage 2: Audio-to-MIDI Transcription (Basic Pitch)

**Library**: `basic-pitch` 0.4.0 by Spotify  
**Model**: ONNX (`saved_models/icassp_2022/nmp.onnx`) — runs via `onnxruntime`, no TensorFlow needed  
**Implementation**: `backend/pipeline/transcriber.py`

Basic Pitch uses a convolutional neural network trained on the ICASSP 2022 dataset to detect note onsets, offsets, and pitch from audio spectrograms. It outputs MIDI with per-note confidence scores.

**Stem-specific configs**:
- Vocals: lower onset threshold (more sensitive to soft notes)
- Bass: pitch range clamped to bass register (E1–G3)
- Other: default settings
- Drums: **skipped** — percussion has no defined pitch

### Stage 3: MIDI Quantization

**Library**: `pretty_midi`  
**Implementation**: `backend/pipeline/quantizer.py`

Quantization snaps note onsets/offsets to the nearest subdivision of the beat (default: 16th note). This corrects timing imprecision from the transcription model and makes the resulting notation readable.

**Parameters**:
- `subdivision`: 4/8/16/32 (note value: quarter/eighth/sixteenth/thirty-second)
- `strength`: 0.0–1.0 (how aggressively to snap — 1.0 = full quantization)

### Stage 4: Score Generation (music21)

**Library**: `music21` 9.x  
**Implementation**: `backend/pipeline/score_generator.py`

music21 converts the quantized MIDI into a `Stream` object, detects the key signature, organizes notes into measures, and exports to MusicXML. MusicXML is an open standard readable by MuseScore, Finale, Sibelius, and most DAWs.

---

## 4. Development Challenges & Solutions

### 4.1 Python 3.14 on Windows — Broken bash Environment

**Problem**: The development machine runs Python 3.14, which fails to import the `encodings` module when invoked from Git Bash:
```
Fatal Python error: Failed to import encodings module
```

**Root cause**: Python 3.14 changed how it resolves its standard library path, and the Git Bash environment doesn't set `PYTHONHOME` correctly.

**Solution**: All Python invocations throughout development used `powershell -Command "..."` to bypass the broken bash environment.

### 4.2 basic-pitch TensorFlow Incompatibility

**Problem**: `basic-pitch` declares `tensorflow<2.15.1` as a dependency. No TensorFlow wheels exist for Python 3.14 on Windows.

**Solution**: Install basic-pitch without dependencies (`--no-deps`), then install `onnxruntime` separately. basic-pitch 0.4.0 auto-detects the available inference backend and uses ONNX when TF is absent.

```powershell
pip install basic-pitch --no-deps
pip install onnxruntime librosa mir_eval
pip install resampy==0.4.2   # pin: basic-pitch needs <0.4.3
```

### 4.3 torchaudio 2.11 torchcodec Regression

**Problem**: torchaudio 2.11 changed the default audio I/O backend to torchcodec, which requires FFmpeg "full-shared" build. The standard `winget install FFmpeg` only installs the CLI binary without the required DLLs.

**Solution**: Patch `separator.py` to catch the exception and fall back to `soundfile`, which natively handles WAV/FLAC without any codec.

### 4.4 Railway Free Plan Removed

**Problem**: Railway removed their free tier and now requires a Hobby plan ($5/month) to deploy services.

**Solution**: Use ngrok to expose the local FastAPI server (running on the development machine) via a public HTTPS tunnel. The Vercel frontend is pointed at the ngrok URL via `NEXT_PUBLIC_API_URL`.

### 4.5 PDF Generation on Cloud

**Problem**: The original pipeline used MuseScore 4's CLI (`MuseScore4.exe`) to render MusicXML to PDF. MuseScore is a GUI application that doesn't install cleanly on headless Linux servers.

**Solution**: For the web app, only MusicXML and MIDI are served. PDF generation remains available locally. Future upgrade path: containerize with MuseScore headless or use VexFlow for browser-side rendering.

---

## 5. File Inventory

### Backend (`backend/`)

| File | Purpose |
|------|---------|
| `app/main.py` | FastAPI app with job API |
| `pipeline/pipeline.py` | Pipeline orchestrator |
| `pipeline/separator.py` | Demucs source separation (patched) |
| `pipeline/transcriber.py` | Basic Pitch transcription |
| `pipeline/quantizer.py` | MIDI quantization |
| `pipeline/score_generator.py` | MusicXML generation |
| `requirements.txt` | Python dependencies |
| `Procfile` | Railway/Heroku deployment command |
| `Dockerfile` | Docker container definition |
| `create_test_audio.py` | Synthetic C-major scale test WAV generator |

### Frontend (`frontend/`)

| File | Purpose |
|------|---------|
| `app/layout.tsx` | Root layout — dark theme, Inter font, header/footer |
| `app/page.tsx` | Home page — upload zone + "how it works" explainer |
| `app/job/[id]/page.tsx` | Job page — progress tracking + download panel |
| `components/UploadZone.tsx` | Drag-and-drop file input with validation |
| `components/ProgressCard.tsx` | 4-stage pipeline progress tracker |
| `components/ResultsPanel.tsx` | Per-stem download buttons |
| `lib/api.ts` | `uploadAudio`, `pollJob`, `downloadUrl` helpers |
| `vercel.json` | Vercel deployment configuration |

---

## 6. Performance Characteristics

| Audio length | Separation (Demucs) | Transcription | Quantization | Score gen | Total |
|-------------|--------------------:|--------------|-------------|----------|-------|
| 10s (synthetic) | ~45s | ~5s | <1s | <1s | ~52s |
| 3min song | ~8–12 min | ~2 min | <5s | <5s | ~10–15 min |

**Notes**:
- Demucs dominates the runtime and benefits enormously from GPU (10× speedup)
- Basic Pitch ONNX is CPU-only; approximately 1× realtime on modern CPU
- First run downloads ~300MB Demucs model weights (cached after that)

---

## 7. Testing

The test suite is in `backend/tests/`:

```
tests/
├── test_pipeline.py       — end-to-end pipeline test
├── test_separator.py      — Demucs separation unit tests
├── test_transcriber.py    — Basic Pitch transcription tests
├── test_quantizer.py      — quantization logic tests
├── test_score_generator.py — music21 score tests
└── benchmark/
    ├── run_benchmark.py   — accuracy benchmarking
    └── create_sample_dirs.py — test fixture generator
```

Run tests:
```powershell
cd backend
.venv\Scripts\python.exe -m pytest tests/ -v
```

---

## 8. Future Roadmap

### Near-term (MVP improvements)
- [ ] Add GPU support detection (fall back to CPU gracefully)
- [ ] Add file size progress during upload
- [ ] Serve PDF via headless MuseScore in Docker
- [ ] Add WebSocket/SSE for real-time progress (replace polling)

### Medium-term (production hardening)
- [ ] Replace in-memory job store with Redis
- [ ] Add S3/R2 for file storage (persistent across restarts)
- [ ] Add job cleanup cron (delete files older than 24h)
- [ ] Rate limiting per IP
- [ ] User authentication (JWT — scaffold exists in `requirements.txt`)

### Long-term (product features)
- [ ] Support guitar/piano-specific transcription models
- [ ] MIDI playback in browser (Tone.js)
- [ ] Embedded sheet music viewer (OpenSheetMusicDisplay)
- [ ] Multi-file batch processing
- [ ] Export to ABC notation, LilyPond
