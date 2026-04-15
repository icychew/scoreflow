# ScoreFlow Frontend Guide

**Stack**: Next.js 16 · TypeScript · Tailwind CSS 4 · App Router  
**Location**: `frontend/`  
**Live URL**: https://scoreflow-gamma.vercel.app

---

## Local Development

```powershell
cd frontend
npm install
cp .env.local.example .env.local
# Edit .env.local: set NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
# Open http://localhost:3000
```

---

## File Structure

```
frontend/
├── app/
│   ├── globals.css          # Tailwind base styles
│   ├── layout.tsx           # Root layout: header, footer, Inter font, dark bg
│   ├── page.tsx             # Home page (upload UI)
│   └── job/
│       └── [id]/
│           └── page.tsx     # Job progress + download page
├── components/
│   ├── UploadZone.tsx       # Drag-and-drop audio input
│   ├── ProgressCard.tsx     # Pipeline stage progress tracker
│   └── ResultsPanel.tsx     # Per-stem download buttons
├── lib/
│   └── api.ts               # All backend fetch calls
├── public/                  # Static assets
├── vercel.json              # Vercel deployment config
├── .env.local.example       # Template for local env vars
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend URL (ngrok or Railway) |

Set for local dev in `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Set for Vercel production:
```powershell
cd frontend
vercel env add NEXT_PUBLIC_API_URL production
# Enter: https://your-ngrok-url.ngrok-free.dev
vercel --prod
```

---

## Pages

### `/` — Home Page (`app/page.tsx`)

Client component (`"use client"`). Renders:
1. Hero heading + description
2. `<UploadZone>` — handles file selection and upload
3. Error display (if upload fails)
4. "How it works" 4-step explainer grid

On successful upload, redirects to `/job/{job_id}`.

### `/job/[id]` — Job Page (`app/job/[id]/page.tsx`)

Client component. On mount, starts a polling loop:
- Calls `pollJob(id)` every 2.5 seconds
- Shows spinner while `job.stages.length === 0`
- Shows `<ProgressCard>` with live stage updates
- Shows `<ResultsPanel>` when `job.status === "done"`
- Shows error panel when `job.status === "failed"`
- Stops polling when done or failed

---

## Components

### `UploadZone`

```tsx
<UploadZone onUpload={(file: File) => void} loading={boolean} />
```

- Accepts `.mp3`, `.wav`, `.flac` up to 50 MB
- Validates file type and size client-side before upload
- Supports drag-and-drop and click-to-browse
- Shows spinner when `loading={true}`

### `ProgressCard`

```tsx
<ProgressCard stages={StageInfo[]} />
```

Renders 4 pipeline stages as a vertical timeline:
- `pending` → grey circle with number
- `running` → spinning violet ring
- `done` → green checkmark
- `failed` → red X
- `skipped` → dash (drums stem)

### `ResultsPanel`

```tsx
<ResultsPanel jobId={string} scores={Record<string, string[]>} totalTime={number} />
```

Renders one row per stem (vocals/bass/other) with download buttons for each available format (MusicXML, MIDI). Download links point directly to the backend `/download` endpoint.

---

## API Client (`lib/api.ts`)

All backend calls go through this module. The `ngrok-skip-browser-warning` header is added to every request — this bypasses ngrok's interstitial page that would otherwise block browser API calls.

```typescript
// Upload audio file, returns { job_id, status }
uploadAudio(file: File): Promise<{ job_id: string; status: string }>

// Poll job state
pollJob(jobId: string): Promise<JobState>

// Get download URL for a stem/format
downloadUrl(jobId: string, stem: string, fmt: string): string
```

**JobState shape:**
```typescript
interface JobState {
  job_id: string;
  status: "queued" | "processing" | "done" | "failed";
  current_stage: string;
  stages: StageInfo[];
  scores: Record<string, string[]>;  // { "vocals": ["musicxml", "mid"] }
  error: string;
  total_time_seconds: number;
}
```

---

## Deployment (Vercel)

### First deploy
```powershell
cd frontend
vercel --prod
```

### Redeploy after changes
```powershell
cd frontend
vercel --prod
```

### Update backend URL (when ngrok URL changes)
```powershell
cd frontend
vercel env rm NEXT_PUBLIC_API_URL production
vercel env add NEXT_PUBLIC_API_URL production
# Enter the new ngrok URL
vercel --prod
```

### Build locally
```powershell
npm run build   # production build
npm run lint    # ESLint check
```

---

## Styling Guide

The app uses **Tailwind CSS 4** with a dark music theme:

| Role | Tailwind class | Colour |
|------|---------------|--------|
| Page background | `bg-slate-950` | Near-black |
| Card/panel | `bg-slate-800/60` | Dark grey |
| Card border | `border-slate-700` | Subtle grey |
| Primary accent | `text-violet-400`, `bg-violet-600` | Purple |
| Success | `text-emerald-400` | Green |
| Error | `text-red-400` | Red |
| Muted text | `text-slate-400`, `text-slate-500` | Grey |

---

## Adding New Features

### Add a new page
Create `app/your-page/page.tsx`. Add `"use client"` if it uses hooks.

### Add a new component
Create `components/YourComponent.tsx`. Import in the page that needs it.

### Add a new API call
Add a function to `lib/api.ts` following the existing pattern. Always include `NGROK_HEADERS` in the `headers` option.

### Change polling interval
In `app/job/[id]/page.tsx`, change `POLL_INTERVAL_MS = 2500` (currently 2.5 seconds).
