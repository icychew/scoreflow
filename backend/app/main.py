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

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
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
    omr_scores: dict[str, float] = {}  # stem → 0.0–1.0 confidence, or -1.0 = not run
    refinement_scores: dict[str, float] = {}  # stem → mean chroma similarity 0.0–1.0
    # stem → list of difficulty variants available; "hard" always present when scored
    score_difficulties: dict[str, list[str]] = {}


_JOBS: dict[str, JobState] = {}
_JOBS_LOCK = threading.Lock()


def _get_job(job_id: str) -> JobState:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ── Helpers ───────────────────────────────────────────────────────────────────

def _count_midi_notes_approx(midi_path: Path) -> int:
    """Count notes in a MIDI file — used to supply expected_note_count to OMR."""
    try:
        import pretty_midi
        pm = pretty_midi.PrettyMIDI(str(midi_path))
        return sum(len(inst.notes) for inst in pm.instruments)
    except Exception:
        return 0


# ── Pipeline runner ────────────────────────────────────────────────────────────

STAGE_NAMES = ["separation", "transcription", "quantization", "score_generation", "refinement"]


def _run_pipeline_thread(job_id: str, audio_path: Path, quality: str = "standard", refine: bool = False) -> None:
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
            model_name="htdemucs_6s",
            quantization_config=QuantizationConfig(),
            quality=quality,
            refine=refine,
        )

        # Map pipeline result stages to our stage tracking
        stage_map = {
            "separation": "separation",
            "transcription": "transcription",
            "quantization": "quantization",
            "score_generation": "score_generation",
            "refinement": "refinement",
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

        # Mark all pending stages done (they may not have had reports).
        # If refinement was disabled, mark it skipped rather than done.
        with _JOBS_LOCK:
            for s in _JOBS[job_id].stages:
                if s.status in ("pending", "running"):
                    if s.name == "refinement" and not refine:
                        s.status = "skipped"
                        s.message = "refinement not requested"
                    else:
                        s.status = "done"

        # Generate PDFs from MusicXML files
        from pipeline.score_generator import generate_pdf_from_musicxml, render_score_to_png
        from pipeline.omr_validator import validate_score as omr_validate
        for stem, musicxml_path in result.scores.items():
            if Path(musicxml_path).exists():
                pdf_path = output_dir / "scores" / f"{stem}.pdf"
                try:
                    generate_pdf_from_musicxml(Path(musicxml_path), pdf_path)
                except Exception as pdf_exc:
                    logger.warning("PDF generation skipped for %s: %s", stem, pdf_exc)

        # OMR validation — render page 1 of each score to PNG, run Roboflow inference
        omr_scores: dict[str, float] = {}
        for stem, musicxml_path in result.scores.items():
            if not Path(musicxml_path).exists():
                continue
            png_path = output_dir / "scores" / f"{stem}_page1.png"
            rendered = render_score_to_png(Path(musicxml_path), png_path)
            if rendered:
                expected = _count_midi_notes_approx(output_dir / "quantized" / f"{stem}.mid")
                omr_scores[stem] = omr_validate(png_path, expected)

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

        # Cross-check what the pipeline reported vs what's on disk — only
        # advertise a difficulty if the corresponding files actually exist.
        verified_difficulties: dict[str, list[str]] = {}
        for stem, reported in (result.score_difficulties or {}).items():
            actual: list[str] = []
            for diff in reported:
                suffix = "" if diff == "hard" else f"-{diff}"
                xml_p = output_dir / "scores" / f"{stem}{suffix}.musicxml"
                if xml_p.exists():
                    actual.append(diff)
            if actual:
                verified_difficulties[stem] = actual

        with _JOBS_LOCK:
            _JOBS[job_id].status = JobStatus.DONE
            _JOBS[job_id].scores = scores
            _JOBS[job_id].omr_scores = omr_scores
            _JOBS[job_id].refinement_scores = result.refinement_scores
            _JOBS[job_id].score_difficulties = verified_difficulties
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
async def create_job(
    file: UploadFile = File(...),
    quality: str = Form("standard"),
    refine: bool = Form(True),  # Lever 3 in accuracy plan — chroma refinement default-on
) -> dict[str, Any]:
    """Upload an audio file and start pipeline processing.

    quality: 'standard' (Demucs + Basic Pitch) or 'high' (BS-RoFormer + piano_transcription).
    refine: If True (default), run chroma-based refinement loop after score
            generation. Pass `refine=false` in the form to opt out for speed.
    """
    if quality not in ("standard", "high"):
        quality = "standard"
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
        args=(job_id, audio_path, quality, refine),
        daemon=True,
        name=f"pipeline-{job_id[:8]}",
    )
    thread.start()

    return {"job_id": job_id, "status": job.status}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> JobState:
    """Poll job status and progress."""
    return _get_job(job_id)


_ALLOWED_DIFFICULTIES = {"easy", "medium", "hard"}


@app.get("/api/jobs/{job_id}/download/{stem}/{fmt}")
def download_file(job_id: str, stem: str, fmt: str, difficulty: str = "hard") -> FileResponse:
    """Download a generated output file.

    stem:        vocals | bass | other | piano | guitar
    fmt:         musicxml | mid | pdf
    difficulty:  easy | medium | hard  (default: hard = original transcription).
                 Only meaningful for fmt in {musicxml, pdf}; ignored for mid.
    """
    _get_job(job_id)  # validates job exists

    if difficulty not in _ALLOWED_DIFFICULTIES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown difficulty '{difficulty}'; expected easy/medium/hard",
        )

    output_dir = JOBS_DIR / job_id / "output"
    # "hard" keeps the original filenames; easy/medium append a suffix.
    suffix = "" if difficulty == "hard" else f"-{difficulty}"

    if fmt == "pdf":
        path = output_dir / "scores" / f"{stem}{suffix}.pdf"
        media_type = "application/pdf"
        filename = f"{stem}{suffix}.pdf"
    elif fmt == "musicxml":
        # For the "hard" (default) difficulty AND musicxml only, prefer the
        # user-edited file when it exists. This means once a user edits a
        # score, all downloads + the inline viewer pick up the edited version
        # without any extra client-side plumbing. Easy/medium variants stay
        # AI-generated since editing happens at the hard level.
        canonical = output_dir / "scores" / f"{stem}{suffix}.musicxml"
        edited = output_dir / "scores" / f"{stem}-edited.musicxml"
        if difficulty == "hard" and edited.exists():
            path = edited
            filename = f"{stem}-edited.musicxml"
        else:
            path = canonical
            filename = f"{stem}{suffix}.musicxml"
        media_type = "application/xml"
    elif fmt == "mid":
        # MIDI is not regenerated per difficulty — same file regardless
        path = output_dir / "quantized" / f"{stem}.mid"
        media_type = "audio/midi"
        filename = f"{stem}.mid"
    else:
        raise HTTPException(status_code=400, detail=f"Unknown format '{fmt}'")

    if not path.exists():
        raise HTTPException(status_code=404, detail="File not yet available")

    return FileResponse(path=str(path), media_type=media_type, filename=filename)


# ── Original-audio playback ──────────────────────────────────────────────────

_AUDIO_MEDIA_TYPES: dict[str, str] = {
    ".mp3":  "audio/mpeg",
    ".wav":  "audio/wav",
    ".flac": "audio/flac",
    ".m4a":  "audio/mp4",
    ".ogg":  "audio/ogg",
}


@app.get("/api/jobs/{job_id}/stems/{stem}/audio")
def download_stem_audio(job_id: str, stem: str) -> FileResponse:
    """Stream the Demucs-separated audio for a single stem.

    Demucs writes each stem as ``output/stems/{stem}.wav`` (mono or stereo
    PCM_16). This endpoint serves that file so the UnifiedPlayer can load
    all stems and play them in sync with per-stem mute/solo/volume.

    Used by the unified DAW-style player in ResultsPanel.
    """
    _get_job(job_id)
    _validate_stem(stem)

    path = JOBS_DIR / job_id / "output" / "stems" / f"{stem}.wav"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Stem audio for '{stem}' not available for this job",
        )
    return FileResponse(
        path=str(path),
        media_type="audio/wav",
        headers={"Content-Disposition": f'inline; filename="{stem}.wav"'},
    )


@app.get("/api/jobs/{job_id}/audio")
def download_original_audio(job_id: str) -> FileResponse:
    """Stream the user's original uploaded audio for the job.

    The upload endpoint stores exactly one ``input.<ext>`` file per job, so we
    glob for it rather than tracking the extension. Returns the file with the
    matching audio MIME type so the browser's ``<audio>`` element can stream
    it (FastAPI's FileResponse honours Range requests, which the audio element
    uses for seek).

    Used by the inline viewer's "Original" playback mode to play the recording
    while the OSMD cursor follows along on the score — closing the
    verification loop after editable-scores.
    """
    _get_job(job_id)

    job_dir = JOBS_DIR / job_id
    # The upload writes exactly one input.* per job. Sort so the result is
    # deterministic in the (defensive) case where two extensions snuck in.
    candidates = sorted(p for p in job_dir.glob("input.*") if p.is_file())
    if not candidates:
        raise HTTPException(status_code=404, detail="Original audio not available for this job")

    path = candidates[0]
    media_type = _AUDIO_MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")
    # inline so the browser plays it rather than triggering a download
    return FileResponse(
        path=str(path),
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{path.name}"'},
    )


# ── Score editing endpoints ───────────────────────────────────────────────────

# Sanity caps on uploaded MusicXML — keeps the endpoint from being a vector
# for filling up disk. Real MusicXML for a 3-min stem is ~30-80 KB; 5 MB is
# generous headroom even for highly polyphonic content.
_MAX_MUSICXML_BYTES = 5 * 1024 * 1024
# Whitelist stem names to prevent path traversal
_STEM_RE = "vocals|bass|other|piano|guitar|drums"


def _validate_stem(stem: str) -> None:
    import re
    if not re.fullmatch(_STEM_RE, stem):
        raise HTTPException(status_code=400, detail=f"Unknown stem '{stem}'")


@app.put("/api/jobs/{job_id}/score/{stem}")
async def save_edited_score(job_id: str, stem: str, request: Request) -> dict[str, Any]:
    """Upload a user-edited MusicXML for a stem.

    The body must be a valid MusicXML document (best-effort validated by a
    simple parse). The file lands at
    ``{job_dir}/output/scores/{stem}-edited.musicxml`` and from then on the
    download endpoint serves it instead of the AI-generated version.

    Idempotent: re-PUTing overwrites the previous edit.
    """
    _get_job(job_id)
    _validate_stem(stem)

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Body is empty")
    if len(body) > _MAX_MUSICXML_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"MusicXML too large (max {_MAX_MUSICXML_BYTES // 1024} KB)",
        )

    # Light validation: must parse as XML and contain a <score-partwise> or
    # <score-timewise> root. Reject anything that doesn't look like MusicXML
    # so we never write garbage that breaks downstream readers.
    try:
        from xml.etree import ElementTree as ET
        root = ET.fromstring(body)
    except ET.ParseError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid XML: {exc}")

    if root.tag not in ("score-partwise", "score-timewise"):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Root element '{root.tag}' is not MusicXML "
                f"(expected score-partwise or score-timewise)"
            ),
        )

    scores_dir = JOBS_DIR / job_id / "output" / "scores"
    scores_dir.mkdir(parents=True, exist_ok=True)
    target = scores_dir / f"{stem}-edited.musicxml"
    target.write_bytes(body)

    logger.info("Saved edited MusicXML for job=%s stem=%s (%d bytes)", job_id, stem, len(body))
    return {
        "success": True,
        "stem": stem,
        "bytes": len(body),
        "edited": True,
    }


@app.get("/api/jobs/{job_id}/edits")
def list_edited_stems(job_id: str) -> dict[str, list[str]]:
    """List which stems have a user-edited MusicXML file.

    Returns ``{ "edited": ["vocals", "bass"] }``. Used by the frontend to
    decide whether to show the "Revert to AI version" button per stem.
    """
    _get_job(job_id)

    scores_dir = JOBS_DIR / job_id / "output" / "scores"
    if not scores_dir.exists():
        return {"edited": []}

    edited = [
        p.name.removesuffix("-edited.musicxml")
        for p in scores_dir.glob("*-edited.musicxml")
    ]
    return {"edited": sorted(edited)}


@app.delete("/api/jobs/{job_id}/score/{stem}/edited")
def revert_edited_score(job_id: str, stem: str) -> dict[str, Any]:
    """Delete a user-edited MusicXML, reverting to the AI-generated version.

    Returns ``{ "reverted": false }`` if nothing was edited (no-op, not an error).
    """
    _get_job(job_id)
    _validate_stem(stem)

    edited = JOBS_DIR / job_id / "output" / "scores" / f"{stem}-edited.musicxml"
    if not edited.exists():
        return {"success": True, "stem": stem, "reverted": False}

    edited.unlink()
    logger.info("Reverted edited MusicXML for job=%s stem=%s", job_id, stem)
    return {"success": True, "stem": stem, "reverted": True}
