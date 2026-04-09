# ScoreFlow — AI Agent Context File

This file is the primary reference for any AI agent (Claude Code or otherwise) working on this repository.
Read this before making any changes to the codebase.

---

## What This Project Is

**ScoreFlow** is a web app that converts audio files (MP3/WAV/FLAC) into sheet music (MusicXML) and MIDI files using a 4-stage AI pipeline:

```
Audio → [Demucs] → Stems → [Basic Pitch] → MIDI → [Quantizer] → [music21] → MusicXML
```

It consists of:
- **Backend**: FastAPI server (Python) running the ML pipeline in background threads
- **Frontend**: Next.js 14 (TypeScript + Tailwind CSS) with drag-and-drop upload and live progress tracking
- **Deployment**: Frontend on Vercel, backend exposed via ngrok (local) or Railway (paid)

---

## Repository Structure

```
scoreflow/
├── CLAUDE.md                    ← YOU ARE HERE
├── .gitignore                   ← root-level (excludes .venv, results, *.wav, etc.)
├── backend/
│   ├── app/
│   │   └── main.py              ← FastAPI app — job API endpoints
│   ├── pipeline/
│   │   ├── pipeline.py          ← run_pipeline() orchestrator (4 stages)
│   │   ├── separator.py         ← Stage 1: Demucs source separation (PATCHED)
│   │   ├── transcriber.py       ← Stage 2: Basic Pitch audio→MIDI
│   │   ├── quantizer.py         ← Stage 3: MIDI quantization
│   │   └── score_generator.py   ← Stage 4: music21 MusicXML generation
│   ├── tests/                   ← pytest test suite
│   ├── requirements.txt         ← Python dependencies
│   ├── Procfile                 ← Railway deployment: uvicorn entry point
│   ├── Dockerfile               ← Docker deployment (Python 3.11-slim)
│   └── .venv/                   ← local virtual environment (NOT committed)
├── frontend/
│   ├── app/
│   │   ├── layout.tsx           ← root layout (dark theme, Inter font)
│   │   ├── page.tsx             ← home page (upload UI)
│   │   └── job/[id]/page.tsx   ← job progress + download page
│   ├── components/
│   │   ├── UploadZone.tsx       ← drag-and-drop audio file input
│   │   ├── ProgressCard.tsx     ← 4-stage pipeline progress tracker
│   │   └── ResultsPanel.tsx     ← per-stem download buttons
│   ├── lib/
│   │   └── api.ts               ← fetch helpers (uploadAudio, pollJob, downloadUrl)
│   ├── vercel.json              ← Vercel deployment config
│   └── .env.local.example       ← template for local dev env vars
└── docs/
    ├── technical-report.md      ← full development history and decisions
    ├── frontend-guide.md        ← Next.js frontend reference
    ├── backend-guide.md         ← FastAPI backend reference
    ├── deployment-guide.md      ← deployment instructions (ngrok + Vercel + Railway)
    ├── safety-sustainability.md ← security and sustainability improvements
    ├── ai-prompts.md            ← prompts for future AI-assisted development
    └── ai-pipeline-architecture.md ← original pipeline design doc
```

---

## Critical Known Issues & Fixes

### 1. torchaudio 2.11 torchcodec regression (ALREADY FIXED)
**File**: `backend/pipeline/separator.py`
**Problem**: torchaudio 2.11 switched default backend to torchcodec, which requires FFmpeg "full-shared" DLLs. winget only installs the CLI-only FFmpeg.
**Fix**: Both `_load_audio()` and the stem save loop fall back to `soundfile` when torchaudio fails.
**Do NOT revert this fix.**

### 2. Python 3.14 on Windows — broken bash environment
**Problem**: Running `python` from bash on this machine fails with `Fatal Python error: Failed to import encodings module`.
**Fix**: ALWAYS use `powershell -Command "..."` for any Python or pip invocations.
**Never run Python directly from bash on this machine.**

### 3. basic-pitch without TensorFlow
**Problem**: basic-pitch requires tensorflow<2.15.1, but no TF wheels exist for Python 3.14.
**Fix**: Install with `pip install basic-pitch --no-deps`, then install `onnxruntime` separately.
basic-pitch 0.4.0 uses its bundled ONNX model (`nmp.onnx`) when TF is absent.

### 4. resampy version conflict
**Fix**: Pin `pip install resampy==0.4.2` — basic-pitch requires `<0.4.3`.

---

## API Reference

### Backend (FastAPI) — default port 8000

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/jobs` | Upload audio file, start pipeline. Returns `{job_id, status}` |
| `GET` | `/api/jobs/{id}` | Poll job. Returns `JobState` with stages + scores |
| `GET` | `/api/jobs/{id}/download/{stem}/{fmt}` | Download output. `fmt`: `musicxml` or `mid` |
| `GET` | `/health` | Health check. Returns `{"status": "ok"}` |

**Job lifecycle**: `queued → processing → done | failed`

**Stems**: `vocals`, `bass`, `other` (drums skipped — no pitch)

**Formats**: `musicxml` (MusicXML sheet music), `mid` (quantized MIDI)

### Frontend environment variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend URL | `https://xxxx.ngrok-free.dev` |

---

## Local Development

### Start backend
```powershell
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --reload
```

### Start frontend
```powershell
cd frontend
npm run dev
```

### Expose backend publicly (ngrok)
```powershell
C:\tools\ngrok\ngrok.exe http 8000
# Copy the https://xxxx.ngrok-free.dev URL
# Set it in frontend/.env.local as NEXT_PUBLIC_API_URL=https://xxxx.ngrok-free.dev
```

### Run pipeline directly (CLI)
```powershell
cd backend
.venv\Scripts\python.exe -m pipeline.pipeline "path/to/audio.mp3" --output-dir ./results --verbose
```

---

## Deployment

| Component | Platform | URL |
|-----------|----------|-----|
| Frontend | Vercel | https://scoreflow-gamma.vercel.app |
| Backend | ngrok (local) | Changes on restart — see deployment-guide.md |
| Repository | GitHub | https://github.com/icychew/scoreflow |

For permanent backend deployment, see `docs/deployment-guide.md`.

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Source separation | Demucs (htdemucs model) | 4.x |
| Audio transcription | Basic Pitch (Spotify, ONNX) | 0.4.x |
| MIDI processing | pretty_midi | 0.2.x |
| Score generation | music21 | 9.x |
| Backend framework | FastAPI + uvicorn | 0.109+ |
| Frontend framework | Next.js (App Router) | 16.x |
| Styling | Tailwind CSS | 4.x |
| Language (backend) | Python | 3.14 |
| Language (frontend) | TypeScript | 5.x |

---

## Architecture Decisions

1. **No Redis/Celery**: Jobs run in Python background threads. Simple and works for single-server MVP.
   Upgrade path: swap the in-memory `_JOBS` dict for Redis + Celery (scaffold already in `requirements.txt`).

2. **No database**: Job state is in-memory. Lost on server restart. Acceptable for demo.
   Upgrade path: add SQLAlchemy + Alembic (scaffold already exists in `backend/app/`).

3. **No S3**: Output files stored in `/tmp/scoreflow-jobs/{job_id}/`. Ephemeral.
   Upgrade path: add boto3 S3 upload after pipeline completes.

4. **ngrok for backend**: Free, zero-config for demo. URL changes on restart.
   Upgrade path: Railway Hobby ($5/month) or Render ($7/month) for persistent URL.

5. **PDF not served via API**: MuseScore CLI not available on cloud servers.
   Upgrade path: Containerize with MuseScore headless, or use VexFlow for in-browser rendering.
