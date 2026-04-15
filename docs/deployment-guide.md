# ScoreFlow Deployment Guide

## Architecture Overview

| Layer | Service | URL |
|-------|---------|-----|
| Frontend | Vercel | https://scoreflow-gamma.vercel.app |
| Backend | Hugging Face Spaces (Docker) | `https://{HF_USERNAME}-scoreflow-api.hf.space` |
| Auto-deploy | GitHub Actions | Triggers on push to `main` |

> **Why Hugging Face Spaces?** Railway removed its free tier. Render's free tier has 512 MB RAM — too small for Demucs. HF Spaces Docker offers 16 GB RAM for free (public spaces), no credit card required — ideal for heavy ML workloads.

---

## One-Time Setup (do this once)

### 1. Create a Hugging Face account

Go to https://huggingface.co and sign up for a free account. Note your username (e.g. `icychew`).

### 2. Create an HF Access Token

1. Go to https://huggingface.co/settings/tokens
2. Click **New token**
3. Name it `scoreflow-github-actions`
4. Select **Write** permission
5. Copy the token — you won't see it again

### 3. Add GitHub Secrets

In your GitHub repo (https://github.com/icychew/scoreflow):

1. Go to **Settings → Secrets and variables → Actions**
2. Click **New repository secret** and add:
   - `HF_TOKEN` = the token from step 2
   - `HF_USERNAME` = your HF username (e.g. `icychew`)

### 4. Trigger the first deploy

Push any change to `main` OR go to **Actions → Deploy Backend to Hugging Face Spaces → Run workflow**.

The GitHub Action will:
- Create the HF Space `{HF_USERNAME}/scoreflow-api` if it doesn't exist
- Upload the `backend/` folder to the Space
- HF builds the Docker image (takes ~5–10 min on first build)

### 5. Update Vercel environment variable

Once the Space is live, update the Vercel frontend to point at it:

1. Go to https://vercel.com → scoreflow project → **Settings → Environment Variables**
2. Find `NEXT_PUBLIC_API_URL` and change its value to:
   ```
   https://{HF_USERNAME}-scoreflow-api.hf.space
   ```
   (Replace `{HF_USERNAME}` with your actual HF username, e.g. `icychew`)
3. Click **Save**
4. Go to **Deployments** → click the three dots on the latest deploy → **Redeploy**

---

## Verifying the deployment

```bash
# Check backend health
curl https://{HF_USERNAME}-scoreflow-api.hf.space/health
# Expected: {"status":"ok"}

# Check API docs
# Open in browser: https://{HF_USERNAME}-scoreflow-api.hf.space/docs
```

---

## How auto-deploy works

File: `.github/workflows/deploy-hf.yml`

- **Trigger:** Any push to `main` that touches `backend/**`
- **What it does:** Uses `huggingface_hub` Python library to upload the `backend/` folder to your HF Space
- **Build time:** ~5–10 min (Docker image with Demucs + Basic Pitch + music21)
- **Model caching:** Demucs `htdemucs` model is pre-downloaded during Docker build, so the first job request won't be slow

---

## HF Space configuration

The `backend/README.md` file contains the HF Spaces YAML frontmatter that configures the Space:

```yaml
---
title: ScoreFlow API
emoji: 🎵
colorFrom: violet
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---
```

The `backend/Dockerfile` runs uvicorn on port 7860 (HF requirement).

---

## Updating the backend URL

If you ever switch backend providers, update the frontend in one place:

**Vercel Dashboard** → scoreflow → Settings → Environment Variables → `NEXT_PUBLIC_API_URL`

Then redeploy. No code changes needed.

---

## Local development

Run the backend locally for testing:

```powershell
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

Run the frontend locally:

```powershell
cd frontend
# Create .env.local with:
# NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

---

## HF Spaces limits (free tier)

| Resource | Free limit |
|----------|-----------|
| RAM | 16 GB CPU |
| vCPU | 2 |
| Storage | 50 GB |
| Concurrent requests | ~2–3 |
| Sleep after inactivity | No (Docker spaces stay awake) |

The free tier is sufficient for a student/demo project processing one or two songs at a time.
