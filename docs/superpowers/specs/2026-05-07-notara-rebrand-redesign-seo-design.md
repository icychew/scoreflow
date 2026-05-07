# Notara — Rebrand, Redesign, SEO & Monetization

**Date:** 2026-05-07  
**Status:** Approved  
**Scope:** Phase 1 — Brand identity, frontend redesign, SEO, auth, Stripe monetization

---

## Background

The app is currently named **ScoreFlow** — an audio-to-sheet-music AI converter built on Next.js 14 + FastAPI. The name conflicts with the existing product at scoreflow.app. The app needs a new name, a professional frontend redesign, SEO foundation, and a working monetization system before it can be publicly launched and generate revenue.

---

## Brand Identity

### Name
**Notara** — from Latin *nota* (musical note). One word, easy to say, domain-available.

### Tagline
> "Turn sound into score"

### Colour Palette — Deep Violet
| Token | Value | Usage |
|---|---|---|
| `--bg` | `#09090b` | Page background |
| `--surface` | `#111113` | Cards, panels |
| `--border` | `#27272a` | Borders, dividers |
| `--accent` | `#7c3aed` | Primary CTA, highlights |
| `--accent-light` | `#a78bfa` | Secondary accent, hover states |
| `--accent-gradient` | `linear-gradient(90deg,#7c3aed,#4338ca)` | Buttons, logo |
| `--text-primary` | `#ffffff` | Headings |
| `--text-secondary` | `#a1a1aa` | Body copy, descriptions |
| `--text-muted` | `#71717a` | Labels, captions |

### Typography
- **Font:** Inter (already loaded via `next/font/google`)
- **Heading scale:** 4xl/5xl for hero, 3xl for section headings, xl for card headings
- **Body:** text-base / text-sm
- **Letter spacing:** `tracking-tight` on large headings, `tracking-widest` on uppercase labels

### Tone of Voice
Calm, confident, professional. No exclamation marks in headings. No "revolutionary" or "game-changing". Short sentences. Active voice.

---

## Hero Message

The landing page hero combines three angles:

1. **Simplicity** — "Upload audio. Get sheet music."
2. **AI accuracy** — AI stem separation (vocals, bass, other) + transcription
3. **PDF output** — "Download a clean PDF score" (PDF is the primary output highlighted for all users)

**Hero headline:** "Upload audio. Get sheet music."  
**Subheadline:** "Notara separates your recording into stems and transcribes each one to a clean PDF score — powered by AI, ready in seconds."  
**Primary CTA:** "Try it free — no signup needed" → `/app`  
**Secondary CTA:** "See pricing" → `/pricing`

---

## Target Audience

All three tiers via freemium model:

| Tier | User type | Primary need |
|---|---|---|
| Free | Hobbyists, casual learners | Quick transcription, zero friction |
| Pro | Students, teachers, musicians | Accurate multi-format output, history |
| Business | Producers, studios, composers | Unlimited, API, bulk processing |

---

## Page Structure

| Route | Purpose | Auth required |
|---|---|---|
| `/` | Marketing landing page | No |
| `/app` | Transcription tool (usage-limited) | No (free), Yes for history |
| `/dashboard` | Transcription history + redownload | Pro / Business only |
| `/pricing` | Full pricing page | No |
| `/signin` | NextAuth sign-in | No |
| `/viewer` | ABC notation viewer (existing) | No |

### `/` — Landing Page Sections
1. **Nav** — Logo left, "Sign in" + "Get Pro" right
2. **Hero** — Headline, subheadline, two CTAs, subtle animated waveform background (CSS only, no canvas)
3. **Demo** — Static screenshot or short GIF of a transcription result (PDF preview)
4. **How it works** — 3 steps: Upload → AI separates stems → Download PDF
5. **Features** — 3-column grid: AI stem separation, PDF output, 3 stems (vocals/bass/other)
6. **Pricing** — 3-tier cards (abbreviated; link to `/pricing` for full detail)
7. **Footer** — Logo, links (Pricing, Sign in, Viewer), copyright

### `/app` — Transcription Tool
- Identical to current `page.tsx` functionality
- Add usage counter banner for free users: "2 of 3 free transcriptions used this month"
- Add upgrade prompt when limit hit: replace upload zone with an upgrade CTA
- Logged-in Pro/Business users see no banner

### `/dashboard` — User Dashboard
- List of past transcriptions: filename, date, stems, status
- Re-download buttons for each output file
- "Upgrade to Pro" banner for free users who try to access

### `/pricing` — Pricing Page
- Annual/monthly toggle (saves ~31%)
- 3 tier cards matching the approved design
- FAQ section: "What formats do I get?", "Can I cancel?", "What counts as one transcription?"

---

## Pricing Tiers

| | Free | Pro | Business |
|---|---|---|---|
| Price | $0 | $12/mo or $99/yr | $49/mo or $399/yr |
| Transcriptions | 3 / month | 50 / month | Unlimited |
| Output formats | PDF only | PDF + MIDI + MusicXML | PDF + MIDI + MusicXML |
| Max audio length | 3 minutes | 30 minutes | 2 hours |
| Stems | All 3 | All 3 | All 3 + stem selection |
| Dashboard / history | ✗ | ✓ | ✓ |
| Priority queue | ✗ | ✓ | ✓ |
| API access | ✗ | ✗ | ✓ |
| Bulk upload | ✗ | ✗ | Up to 10 files |

**Free tier note:** Free users do not need to sign up to use 3 transcriptions. Usage is tracked by session token (cookie, 30-day expiry) for anonymous users. Signing up links usage to an account.

**Usage reset:** Calendar month — resets on the 1st of each month UTC, not a rolling 30-day window.

---

## Authentication

**Library:** NextAuth.js v5 (compatible with Next.js App Router)

**Providers:**
- Google OAuth (primary — lowest friction)
- Email magic link (fallback for users without Google)

**Session strategy:** JWT (stateless, no session table needed)

**Protected routes:** `/dashboard` — middleware redirects unauthenticated users to `/signin`

**Post-login redirect:** User is sent back to the page they were on, or `/app` by default.

---

## Monetization — Stripe Integration

### Products & Prices
Create in Stripe dashboard:
- Product: "Notara Pro" — recurring price $12/mo + $99/yr
- Product: "Notara Business" — recurring price $49/mo + $399/yr

### Checkout flow
1. User clicks "Get Pro" on pricing page
2. App creates a Stripe Checkout Session (server action) with `customer_email` pre-filled from NextAuth session
3. User completes payment on Stripe-hosted checkout
4. Stripe fires `checkout.session.completed` webhook
5. Webhook handler updates `users.tier` in Supabase to `'pro'` or `'business'`

### Webhook events to handle
| Event | Action |
|---|---|
| `checkout.session.completed` | Set user tier to pro/business, record subscription_id |
| `customer.subscription.deleted` | Reset user tier to `'free'` |
| `customer.subscription.updated` | Handle plan changes (pro ↔ business) |

### Billing portal
Users manage subscription (cancel, change plan, update card) via Stripe Customer Portal — no custom billing UI needed.

---

## Database — Supabase (Postgres)

### Tables

**`users`**
```sql
id          uuid primary key (from NextAuth)
email       text unique not null
tier        text not null default 'free'  -- 'free' | 'pro' | 'business'
stripe_customer_id  text
stripe_subscription_id  text
created_at  timestamptz default now()
```

**`transcriptions`**
```sql
id          uuid primary key default gen_random_uuid()
user_id     uuid references users(id)  -- null for anonymous
session_token  text  -- for anonymous usage tracking
job_id      text not null  -- backend job UUID
filename    text
status      text  -- 'processing' | 'done' | 'failed'
created_at  timestamptz default now()
```

### Usage counting
Monthly usage = `count(*) from transcriptions where user_id = $1 and created_at >= date_trunc('month', now() at time zone 'UTC')`.  
For anonymous users: same query on `session_token`.  
Resets on the 1st of each calendar month UTC.

---

## SEO Strategy

### Target keywords
| Keyword | Intent | Page |
|---|---|---|
| convert audio to sheet music | Commercial | `/` |
| audio to sheet music converter | Commercial | `/` |
| AI music transcription | Informational | `/` |
| free audio to sheet music | Commercial | `/` + `/pricing` |
| MP3 to PDF sheet music | Commercial | `/` |
| MP3 to MIDI converter | Commercial | `/pricing` |
| audio to MusicXML | Long-tail | `/pricing` |

### Technical implementation
- **`metadata` export** on every page (`title`, `description`, `openGraph`, `twitter`)
- **`app/sitemap.ts`** — generates `sitemap.xml` dynamically
- **`app/robots.ts`** — allows all crawlers, points to sitemap
- **JSON-LD** — `SoftwareApplication` schema on `/` with `name`, `description`, `offers`, `applicationCategory: "MusicApplication"`
- **Open Graph image** — static `public/og-image.png` (1200×630, dark violet brand background, Notara wordmark + tagline)

### Page titles (examples)
- `/` → `"Notara — Convert Audio to Sheet Music with AI"`
- `/pricing` → `"Notara Pricing — Free, Pro & Business Plans"`
- `/app` → `"Notara — Upload Audio & Get Sheet Music"`

### Description template
> "Upload any audio file and get a clean PDF sheet music score in seconds. Notara uses AI to separate stems and transcribe each instrument. Free to try — no signup needed."

---

## Implementation Order

1. **Rename** — global find/replace ScoreFlow → Notara, update `package.json` name, `CLAUDE.md`, page titles
2. **Design tokens** — add CSS variables to `globals.css`, update Tailwind config with brand colours
3. **Landing page** — new `/` (marketing page), move transcription tool to `/app`
4. **Supabase setup** — create project, run schema migrations, add env vars
5. **NextAuth** — install, configure Google + email providers, protect `/dashboard` route
6. **Stripe** — create products/prices, build Checkout Session server action, webhook handler
7. **Usage enforcement** — middleware checks tier + monthly count before pipeline runs
8. **Dashboard page** — `/dashboard` with transcription history
9. **Pricing page** — `/pricing` with full tier cards + annual toggle
10. **SEO** — metadata on all pages, sitemap.ts, robots.ts, JSON-LD, og:image
11. **Deploy** — update Vercel project name + env vars, verify ngrok/Railway backend still works

---

## Out of Scope (Phase 2)

- Referral / waitlist system
- Blog / content marketing
- Admin panel
- Team/seat-based billing
- Email notifications (transcription complete)

---

## Success Criteria

- `/` ranks on page 1 for "convert audio to sheet music" within 3 months
- Free-to-Pro conversion rate ≥ 5%
- First paying customer within 2 weeks of launch
- TypeScript build passes, Lighthouse performance ≥ 85
- Stripe webhook correctly enforces tier limits end-to-end
