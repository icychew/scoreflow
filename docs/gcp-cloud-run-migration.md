# GCP Cloud Run Migration Plan

## Context

Notara's backend currently runs on ngrok-tunnelled localhost ($0 but URL
rotates on restart + interstitial annoys browsers). Moving to **Google Cloud
Run** gives a persistent URL, real SLA, scale-to-zero idle costs, and no
ngrok flakiness — for an expected ~$8–15 / month total.

The existing `backend/Dockerfile` already pre-downloads the Demucs + Basic
Pitch models inside the image, so cold-starts are mostly model-load time
(~10–20s) rather than internet-bound (60s+). With `min-instances=1` cold
starts disappear entirely.

This document captures the migration recipe so it can be executed in one
session without re-discovery.

---

## Architecture decision: keep local-disk + always-warm (Strategy A)

Two real choices for storing job artifacts:

**A. min-instances=1 + local /tmp on Cloud Run** — Cloud Run keeps one
container always running; /tmp persists between requests. Code changes
zero — backend reads/writes local paths exactly as today. Recommended.

**B. GCS for everything** — Backend reads/writes through GCS API. Truly
stateless, scale-to-zero. Requires 2–3 days of refactoring across every
file-path call site. Worth it only when load justifies multiple instances.

We pick **A**. Cost difference is ~$8/month for the always-warm instance
(vs ~$0 for cold-start) — well worth it for the simpler code and instant
first request. The B refactor remains a Tier-2 option if Notara ever needs
to scale horizontally.

---

## Pre-migration checklist

- [ ] You have a Google Cloud project with billing enabled. If not:
      `console.cloud.google.com` → New Project → link billing account.
- [ ] `gcloud` CLI installed locally — `gcloud --version` works.
- [ ] You're authenticated: `gcloud auth login` + `gcloud config set project <PROJECT_ID>`.
- [ ] Required APIs enabled (run these once):
      ```
      gcloud services enable run.googleapis.com
      gcloud services enable artifactregistry.googleapis.com
      gcloud services enable cloudbuild.googleapis.com
      ```
- [ ] Region chosen (recommend `asia-southeast1` for Malaysia/SEA users —
      ~50ms latency vs ~250ms for us-central1).

---

## Stage 1 — Verify the Dockerfile is Cloud Run-ready (~30 min)

Cloud Run requires:

1. **Listens on $PORT** (Cloud Run injects this — typically 8080).
2. **Single HTTP server**, no separate worker (current setup matches).
3. **Stateless across requests** (Strategy A: relax this — we keep
   min-instances=1 so /tmp is durable).

Check `backend/Dockerfile`'s last lines — the CMD must respect `$PORT`:

```dockerfile
# Existing CMD should look like:
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Change to:

```dockerfile
ENV PORT=8080
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
```

This way the same Dockerfile runs locally (defaulting to 8080) AND on
Cloud Run (using injected `$PORT`).

---

## Stage 2 — Build + deploy (~½ hour first time)

Cloud Run can build straight from source via Cloud Build — no local Docker
push needed:

```bash
cd backend
gcloud run deploy notara-backend \
  --source=. \
  --region=asia-southeast1 \
  --platform=managed \
  --allow-unauthenticated \
  --memory=4Gi \
  --cpu=2 \
  --timeout=900 \
  --min-instances=1 \
  --max-instances=3 \
  --concurrency=4 \
  --port=8080
```

Key flags:

- `--memory=4Gi` — Demucs + Basic Pitch each take ~1.5 GiB when active.
  4 GiB is the comfortable floor; bump to 8 GiB only if jobs OOM.
- `--cpu=2` — Demucs is single-thread-bound, but 2 vCPU helps with
  ffmpeg + concurrent stem writes.
- `--timeout=900` — 15 min per request. Long jobs (5 min audio + refine
  pass + simplifier) can run 3–5 min today. 60 min is the absolute Cloud
  Run ceiling.
- `--min-instances=1` — the strategy choice. Set to 0 to save $8/mo at
  the cost of ~20s cold-start on the first job after idle.
- `--max-instances=3` — caps cost spikes if you get hit with traffic.
- `--concurrency=4` — let one container handle up to 4 in-flight jobs
  before spawning a second instance. Demucs is RAM-heavy, so 4 is the
  practical concurrent ceiling on a 4 GiB instance.

The first deploy takes ~6–8 min (image build + push + cold-start). On
success, `gcloud` prints the service URL — looks like
`https://notara-backend-xxxx-as.a.run.app`.

---

## Stage 3 — Update CORS + Vercel env (~10 min)

In `backend/app/main.py` the CORS middleware needs the Vercel URL:

```python
# Should already look like this — verify:
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://scoreflow-gamma.vercel.app",  # ← already there
        # No change needed — Vercel domain doesn't change
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

On Vercel:

```bash
# Production
echo "https://notara-backend-xxxx-as.a.run.app" | npx vercel env add NEXT_PUBLIC_API_URL production --scope icychews-projects --force

# Development (local frontend dev still uses this if no .env.local override)
echo "https://notara-backend-xxxx-as.a.run.app" | npx vercel env add NEXT_PUBLIC_API_URL development --scope icychews-projects --force

# Trigger a deploy so the new env var takes effect
git commit --allow-empty -m "chore: cut over backend to Cloud Run"
git push origin master
```

---

## Stage 4 — Smoke test (~½ hour)

After Cloud Run reports "Ready" and Vercel finishes the redeploy:

1. Open `https://scoreflow-gamma.vercel.app/app`
2. Upload a short MP3
3. Watch the job page — should progress without ngrok errors
4. Verify each format downloads: PDF Score, MusicXML, MIDI
5. Open the inline viewer — confirm cursor sync still works
6. Switch to Original audio mode — confirm the audio plays
7. Open the Mix Player — confirm all stems load and play in sync

Then **regression-check the existing API key path** (the v1 proxy
expects `NEXT_PUBLIC_API_URL` to be reachable):

```bash
curl -H "Authorization: Bearer $NOTARA_KEY" https://scoreflow-gamma.vercel.app/api/v1/jobs
```

Should return JSON, not a 502.

---

## Stage 5 — Decommission ngrok (~10 min, after 1 week of stability)

Once you've used Cloud Run for a week without issues:

```powershell
# Stop the local ngrok tunnel (was: C:\tools\ngrok\ngrok.exe http 8000)
# Just close the window. No env-var cleanup needed.

# Optional: stop the local backend if you're not using it for dev anymore
# (Cloud Run is now the only production target)
```

Update `CLAUDE.md` in the repo root to reflect Cloud Run as the deploy
target (replace the ngrok section).

---

## Cost estimate

Assuming ~50 transcription jobs/month (low-traffic v1):

| Resource | Cost |
|---|---|
| Cloud Run always-warm (1 instance × 4 GiB × 2 vCPU × 24h) | **~$8.40/mo** |
| Cloud Run per-job processing (50 jobs × 90s × 4 GiB) | **~$2.50/mo** |
| Egress (50 jobs × ~10 MB download) | **~$0.10/mo** |
| Cloud Build (50 deploys × free tier covers 120/day) | **$0** |
| **Total** | **~$11/mo** |

For higher traffic (500 jobs/mo): ~$25/mo. Still well under the
$49/mo Business tier revenue per customer.

---

## Rollback procedure (in case it breaks)

If anything regresses after cut-over:

1. **Restore ngrok**: re-run the tunnel locally, copy the URL
2. **Revert Vercel env**:
   ```bash
   echo "https://your-ngrok-url.ngrok-free.dev" | npx vercel env add NEXT_PUBLIC_API_URL production --scope icychews-projects --force
   ```
3. **Trigger Vercel redeploy** (empty commit + push)
4. **Pause Cloud Run** to stop charges while you debug:
   `gcloud run services update notara-backend --min-instances=0 --max-instances=0 --region=asia-southeast1`

The frontend is the only thing that needs to know the backend URL, so
rollback is a single env var change + redeploy. ~5 min end-to-end.

---

## Future Tier-2: full GCS-backed stateless backend

Worth doing IF Notara grows to:
- 100+ concurrent users (Cloud Run instance count saturates)
- Multi-region failover needed
- Jobs longer than 15 min (Cloud Run ceiling)

The refactor is:
- Replace `JOBS_DIR / job_id` with `gcs.bucket("notara-jobs").blob(job_id)`
- Wrap with a `Storage` protocol so both local filesystem AND GCS are
  drop-in alternatives (for local dev)
- Stream uploads/downloads via `google-cloud-storage` resumable transfers
- Switch to `min-instances=0`, `max-instances=20`, true scale-to-zero
- ~2 days of work

Don't do this preemptively — wait until the scale problem is real.
