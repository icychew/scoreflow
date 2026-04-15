---
title: ScoreFlow API
emoji: 🎵
colorFrom: purple
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# ScoreFlow Backend

AI-powered audio-to-sheet-music conversion pipeline and API.

## Overview

ScoreFlow converts uploaded audio files into staff notation (sheet music) and MIDI using a multi-stage AI pipeline:

1. **Source Separation** (Demucs) — isolate instrument stems
2. **Audio-to-MIDI Transcription** (Basic Pitch) — convert stems to MIDI
3. **MIDI Quantization** — beat-align and clean up MIDI data
4. **Score Generation** (music21) — produce MusicXML sheet music

## Setup

### Prerequisites

- Python 3.11+
- Redis (for Celery task queue)
- PostgreSQL (for data storage)
- S3-compatible storage (AWS S3 or MinIO)

### Installation

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
# .venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment config
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
alembic upgrade head

# Start the API server
uvicorn app.main:app --reload

# Start Celery worker (separate terminal)
celery -A app.workers.celery_app worker --loglevel=info
```

## Project Structure

```
backend/
├── app/
│   ├── api/          # API route handlers
│   ├── core/         # Config, security, constants
│   ├── models/       # SQLAlchemy ORM models
│   ├── schemas/      # Pydantic request/response schemas
│   ├── services/     # Business logic layer
│   └── workers/      # Celery task definitions
├── pipeline/         # AI processing pipeline
│   ├── separator.py       # Demucs integration
│   ├── transcriber.py     # Basic Pitch integration
│   ├── quantizer.py       # MIDI quantization
│   ├── score_generator.py # music21 MusicXML generation
│   └── pipeline.py        # Pipeline orchestrator
├── tests/            # Test suite
├── requirements.txt
└── Dockerfile
```

## Testing

```bash
pytest --cov=app --cov=pipeline
```
