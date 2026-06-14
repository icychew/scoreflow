FROM python:3.11-slim

WORKDIR /app

# System deps for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    git \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user — required by Hugging Face Spaces
RUN useradd -m -u 1000 appuser

# Install CPU-only torch FIRST so demucs doesn't pull the multi-GB CUDA build.
# This is the single biggest build-time and image-size saving on CPU-only
# hosts (HF Spaces free tier) — the CUDA wheels are ~2.5 GB and were causing
# the Space's Docker build to hit "Job timeout". torchaudio 2.11's torchcodec
# backend is handled by separator.py's soundfile fallback.
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu

# Install Python deps (torch is already satisfied by the CPU install above)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# NOTE: Demucs/Basic Pitch models are downloaded lazily on the first job
# instead of at build time. Pre-downloading them here previously pushed the
# free-tier build past its timeout; the small first-job delay is the trade-off.

# Jobs directory owned by appuser
RUN mkdir -p /tmp/scoreflow-jobs && chown appuser:appuser /tmp/scoreflow-jobs

COPY --chown=appuser:appuser . .

USER appuser

# Hugging Face Spaces routes to port 7860 (see README.md `app_port`). Other
# PaaS (Cloud Run / Railway / Render) inject $PORT; default to 7860 so the HF
# Space works out of the box and `${PORT:-7860}` picks up any injected value.
ENV PORT=7860
EXPOSE 7860

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}
