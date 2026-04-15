"""ScoreFlow FastAPI backend.

Exposes a simple job-based API:
  POST /api/jobs           — upload audio, start pipeline in background thread
  GET  /api/jobs/{id}      — poll job status / progress
  GET  /api/jobs/{id}/download/{stem}/{fmt} — download output file
  GET  /health             — health check

No Redis/Celery — jobs run in-process threads and are tracked in memory.
Files stored under JOBS_DIR (default /tmp/scoreflow-jobs).
"""

import logging
import os
import shutil
import threading
import uuid
from enum import Enum
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

JOBS_DIR = Path(os.environ.get("JOBS_DIR", "/tmp/scoreflow-jobs"))
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac"}

app = FastAPI(title="ScoreFlow API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory job store ────────────────────────────────────────────────────────

class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class StageInfo(BaseModel):
    name: str
    status: str  # "pending" | "running" | "done" | "failed" | "skipped"
    message: str = ""


class JobState(BaseModel):
    job_id: str
    status: JobStatus = JobStatus.QUEUED
    current_stage: str = ""
    stages: list[StageInfo] = []
    scores: dict[str, list[str]] = {}  # stem → list of available formats
    error: str = ""
    total_time_seconds: float = 0.0


_JOBS: dict[str, JobState] = {}
_JOBS_LOCK = threading.Lock()


def _get_job(job_id: str) -> JobState:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ── Pipeline runner ────────────────────────────────────────────────────────────

STAGE_NAMES = ["separation", "transcription", "quantization", "score_generation"]


def _run_pipeline_thread(job_id: str, audio_path: Path) -> None:
    """Execute the pipeline in a background thread, updating job state."""
    from pipeline.pipeline import run_pipeline
    from pipeline.quantizer import QuantizationConfig

    job_dir = JOBS_DIR / job_id

    def _set_stage(stage: str) -> None:
        with _JOBS_LOCK:
            job = _JOBS[job_id]
            job.current_stage = stage
            job.status = JobStatus.PROCESSING
            for s in job.stages:
                if s.name == stage:
                    s.status = "running"

    def _done_stage(stage: str, message: str = "") -> None:
        with _JOBS_LOCK:
            job = _JOBS[job_id]
            for s in job.stages:
                if s.name == stage:
                    s.status = "done"
                    s.message = message

    def _fail_stage(stage: str, message: str) -> None:
        with _JOBS_LOCK:
            job = _JOBS[job_id]
            for s in job.stages:
                if s.name == stage:
                    s.status = "failed"
                    s.message = message

    try:
        # Initialize stages
        with _JOBS_LOCK:
            _JOBS[job_id].stages = [
                StageInfo(name=s, status="pending") for s in STAGE_NAMES
            ]
            _JOBS[job_id].status = JobStatus.PROCESSING

        output_dir = job_dir / "output"

        # Run the pipeline — it handles all 4 stages internally
        _set_stage("separation")

        result = run_pipeline(
            input_path=audio_path,
            output_dir=output_dir,
            model_name="htdemucs",
            quantization_config=QuantizationConfig(),
        )

        # Map pipeline result stages to our stage tracking
        stage_map = {
            "separation": "separation",
            "transcription": "transcription",
            "quantization": "quantization",
            "score_generation": "score_generation",
        }

        for report in result.reports:
            for stage_status in report.stages:
                stage_key = stage_map.get(stage_status.stage)
                if stage_key is None:
                    continue
                if stage_status.success:
                    _done_stage(stage_key, f"{report.stem_name}: ok")
                else:
                    err = stage_status.error or "failed"
                    if "skipped" in err:
                        with _JOBS_LOCK:
                            for s in _JOBS[job_id].stages:
                                if s.name == stage_key:
                                    s.status = "skipped"
                                    s.message = err
                    else:
                        _fail_stage(stage_key, f"{report.stem_name}: {err}")

        # Mark all pending stages done (they may not have had reports)
        with _JOBS_LOCK:
            for s in _JOBS[job_id].stages:
                if s.status in ("pending", "running"):
                    s.status = "done"

        # Generate PDFs from MusicXML files
        from pipeline.score_generator import generate_pdf_from_musicxml
        for stem, musicxml_path in result.scores.items():
            if Path(musicxml_path).exists():
                pdf_path = output_dir / "scores" / f"{stem}.pdf"
                try:
                    generate_pdf_from_musicxml(Path(musicxml_path), pdf_path)
                except Exception as pdf_exc:
                    logger.warning("PDF generation skipped for %s: %s", stem, pdf_exc)

        # Build scores dict — which stems have which formats available
        scores: dict[str, list[str]] = {}
        for stem, path in result.scores.items():
            fmts = []
            pdf_path = output_dir / "scores" / f"{stem}.pdf"
            if pdf_path.exists():
                fmts.append("pdf")
            if Path(path).exists():
                fmts.append("musicxml")
            midi_path = output_dir / "quantized" / f"{stem}.mid"
            if midi_path.exists():
                fmts.append("mid")
            if fmts:
                scores[stem] = fmts

        with _JOBS_LOCK:
            _JOBS[job_id].status = JobStatus.DONE
            _JOBS[job_id].scores = scores
            _JOBS[job_id].total_time_seconds = result.total_time_seconds
            _JOBS[job_id].current_stage = "done"

        logger.info("Job %s completed in %.1fs", job_id, result.total_time_seconds)

    except Exception as exc:
        logger.exception("Job %s failed: %s", job_id, exc)
        with _JOBS_LOCK:
            _JOBS[job_id].status = JobStatus.FAILED
            _JOBS[job_id].error = str(exc)
            for s in _JOBS[job_id].stages:
                if s.status == "running":
                    s.status = "failed"


# ── Routes ─────────────────────────────────────────────────────────────────────


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "ScoreFlow API", "status": "ok", "docs": "/docs"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/jobs", status_code=201)
async def create_job(file: UploadFile = File(...)) -> dict[str, Any]:
    """Upload an audio file and start pipeline processing."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    job_id = str(uuid.uuid4())
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    audio_path = job_dir / f"input{suffix}"
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")

    audio_path.write_bytes(content)

    job = JobState(job_id=job_id)
    with _JOBS_LOCK:
        _JOBS[job_id] = job

    thread = threading.Thread(
        target=_run_pipeline_thread,
        args=(job_id, audio_path),
        daemon=True,
        name=f"pipeline-{job_id[:8]}",
    )
    thread.start()

    return {"job_id": job_id, "status": job.status}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> JobState:
    """Poll job status and progress."""
    return _get_job(job_id)


@app.get("/api/jobs/{job_id}/download/{stem}/{fmt}")
def download_file(job_id: str, stem: str, fmt: str) -> FileResponse:
    """Download a generated output file.

    stem: vocals | bass | other | piano | guitar
    fmt:  musicxml | mid
    """
    _get_job(job_id)  # validates job exists

    output_dir = JOBS_DIR / job_id / "output"

    if fmt == "pdf":
        path = output_dir / "scores" / f"{stem}.pdf"
        media_type = "application/pdf"
        filename = f"{stem}.pdf"
    elif fmt == "musicxml":
        path = output_dir / "scores" / f"{stem}.musicxml"
        media_type = "application/xml"
        filename = f"{stem}.musicxml"
    elif fmt == "mid":
        path = output_dir / "quantized" / f"{stem}.mid"
        media_type = "audio/midi"
        filename = f"{stem}.mid"
    else:
        raise HTTPException(status_code=400, detail=f"Unknown format '{fmt}'")

    if not path.exists():
        raise HTTPException(status_code=404, detail="File not yet available")

    return FileResponse(path=str(path), media_type=media_type, filename=filename)
