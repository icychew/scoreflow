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

# Install Python deps first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Demucs htdemucs model (~80 MB) so the first job isn't slow
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs'); print('Demucs model cached')" || echo "Demucs pre-download skipped"

# Pre-download Basic Pitch ONNX model
RUN python -c "import basic_pitch; print('Basic Pitch model path:', basic_pitch.__file__)" || echo "Basic Pitch pre-download skipped"

# Jobs directory owned by appuser
RUN mkdir -p /tmp/scoreflow-jobs && chown appuser:appuser /tmp/scoreflow-jobs

COPY --chown=appuser:appuser . .

USER appuser

# Hugging Face Spaces requires port 7860; Render/Railway use $PORT
ENV PORT=7860
EXPOSE 7860

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}
