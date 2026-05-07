# Notara Proper Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand ScoreFlow → Notara with a professional marketing landing page, user auth (NextAuth v5), Stripe subscriptions, free-tier usage enforcement, a dashboard, a pricing page, and full SEO metadata.

**Architecture:** The existing transcription tool moves from `/` to `/app`. A new marketing landing page lives at `/`. Auth (NextAuth v5 + Google + email magic link) and a Supabase Postgres database power user accounts, tier tracking, and usage counting. Stripe Subscriptions handle payments; webhooks update the user's tier in Supabase. Middleware enforces free-tier limits before the pipeline runs.

**Tech Stack:** Next.js 16 App Router · TypeScript · Tailwind CSS v4 · NextAuth v5 · Supabase (Postgres) · Stripe · `@supabase/supabase-js` v2 · `next-auth` v5 · `stripe` npm package

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `frontend/app/app/page.tsx` | Transcription tool (moved from `/`) |
| `frontend/app/app/layout.tsx` | Layout wrapper for /app (usage banner) |
| `frontend/app/dashboard/page.tsx` | History page (Pro/Business) |
| `frontend/app/pricing/page.tsx` | Full pricing page |
| `frontend/app/signin/page.tsx` | Sign-in page |
| `frontend/app/api/auth/[...nextauth]/route.ts` | NextAuth HTTP handlers |
| `frontend/app/api/stripe/checkout/route.ts` | Create Stripe Checkout Session |
| `frontend/app/api/stripe/portal/route.ts` | Stripe Customer Portal redirect |
| `frontend/app/api/stripe/webhook/route.ts` | Handle Stripe webhook events |
| `frontend/app/sitemap.ts` | Auto-generate sitemap.xml |
| `frontend/app/robots.ts` | robots.txt |
| `frontend/lib/auth.ts` | NextAuth config (providers, callbacks) |
| `frontend/lib/db.ts` | Supabase server client |
| `frontend/lib/stripe.ts` | Stripe server client |
| `frontend/lib/usage.ts` | Usage counting + tier helpers |
| `frontend/middleware.ts` | Protect /dashboard; inject session |
| `frontend/components/UsageBanner.tsx` | "2 of 3 used" banner for free users |
| `frontend/components/UpgradePrompt.tsx` | Shown when free limit is hit |
| `frontend/components/PricingCards.tsx` | 3-tier pricing component (shared) |
| `frontend/public/og-image.png` | Open Graph image (1200×630) — created via script |
| `supabase/migrations/001_initial_schema.sql` | DB schema |

### Modified files
| File | Change |
|---|---|
| `frontend/app/layout.tsx` | Rename to Notara, update nav, global metadata |
| `frontend/app/page.tsx` | Replace with landing page |
| `frontend/app/globals.css` | Add brand CSS variables |
| `frontend/package.json` | Add 4 new deps |
| `CLAUDE.md` | Update project name throughout |

---

## Task 1: Rename ScoreFlow → Notara + update brand tokens

**Files:**
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/globals.css`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Global rename in layout.tsx**

Replace the entire content of `frontend/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Notara — Convert Audio to Sheet Music with AI",
  description:
    "Upload any audio file and get a clean PDF sheet music score in seconds. Notara uses AI to separate stems and transcribe each instrument. Free to try — no signup needed.",
  openGraph: {
    title: "Notara — Convert Audio to Sheet Music with AI",
    description:
      "Upload audio. Get sheet music. Powered by AI stem separation and transcription.",
    url: "https://notara.app",
    siteName: "Notara",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Notara — Convert Audio to Sheet Music with AI",
    description: "Upload audio. Get sheet music. Powered by AI.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${inter.className} min-h-screen bg-[#09090b] text-white antialiased`}
      >
        <header className="border-b border-[#27272a] px-6 py-4">
          <div className="mx-auto flex max-w-5xl items-center gap-4">
            <a href="/" className="flex items-center gap-2 group">
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-xs font-bold text-white">
                N
              </div>
              <span className="text-lg font-bold text-white group-hover:text-violet-300 transition-colors">
                Notara
              </span>
            </a>
            <nav className="flex items-center gap-6 ml-6">
              <a
                href="/app"
                className="text-sm text-[#a1a1aa] hover:text-white transition-colors"
              >
                Transcribe
              </a>
              <a
                href="/viewer"
                className="text-sm text-[#a1a1aa] hover:text-white transition-colors"
              >
                Viewer
              </a>
              <a
                href="/pricing"
                className="text-sm text-[#a1a1aa] hover:text-white transition-colors"
              >
                Pricing
              </a>
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <a
                href="/signin"
                className="text-sm text-[#a1a1aa] hover:text-white transition-colors"
              >
                Sign in
              </a>
              <a
                href="/pricing"
                className="rounded-md bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              >
                Get Pro
              </a>
            </div>
          </div>
        </header>
        <main>{children}</main>
        <footer className="border-t border-[#27272a] py-8 px-6 mt-20">
          <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-[10px] font-bold text-white">
                N
              </div>
              <span className="text-sm font-semibold text-white">Notara</span>
            </div>
            <nav className="flex gap-6">
              <a href="/pricing" className="text-xs text-[#71717a] hover:text-white transition-colors">Pricing</a>
              <a href="/app" className="text-xs text-[#71717a] hover:text-white transition-colors">Transcribe</a>
              <a href="/viewer" className="text-xs text-[#71717a] hover:text-white transition-colors">Viewer</a>
              <a href="/signin" className="text-xs text-[#71717a] hover:text-white transition-colors">Sign in</a>
            </nav>
            <p className="text-xs text-[#71717a]">
              © {new Date().getFullYear()} Notara. Powered by Demucs · Basic Pitch · music21
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Add brand CSS variables to globals.css**

Add to `frontend/app/globals.css` after the existing `@import "tailwindcss";`:

```css
:root {
  --notara-bg: #09090b;
  --notara-surface: #111113;
  --notara-border: #27272a;
  --notara-accent: #7c3aed;
  --notara-accent-light: #a78bfa;
  --notara-text-primary: #ffffff;
  --notara-text-secondary: #a1a1aa;
  --notara-text-muted: #71717a;
}

body {
  background: var(--notara-bg);
  color: var(--notara-text-primary);
}
```

- [ ] **Step 3: Update CLAUDE.md brand references**

In `CLAUDE.md` at repo root, replace every occurrence of `ScoreFlow` with `Notara` and update the description line:

```
**Notara** is a web app that converts audio files (MP3/WAV/FLAC) into sheet music (PDF, MusicXML) and MIDI files using a 4-stage AI pipeline:
```

Also update the Vercel URL placeholder from `scoreflow-gamma.vercel.app` to `notara.vercel.app`.

- [ ] **Step 4: Build check**

```powershell
cd C:\Users\User\Scoreflow\frontend
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/layout.tsx frontend/app/globals.css CLAUDE.md
git commit -m "feat: rename to Notara, update brand colours and nav"
```

---

## Task 2: Move transcription tool to /app

**Files:**
- Create: `frontend/app/app/page.tsx`
- Create: `frontend/app/app/layout.tsx`

- [ ] **Step 1: Create the /app directory**

```bash
mkdir -p frontend/app/app
```

- [ ] **Step 2: Create frontend/app/app/layout.tsx**

This is a minimal passthrough layout for the /app route:

```tsx
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Copy current home page to app/app/page.tsx**

Copy the entire content of `frontend/app/page.tsx` to `frontend/app/app/page.tsx`. Update the h1 text to:

```tsx
<h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
  Turn any recording into{" "}
  <span className="text-violet-400">sheet music</span>
</h1>
<p className="mt-4 text-lg text-[#a1a1aa]">
  Upload an MP3, WAV, or FLAC. Notara's AI separates the stems, transcribes
  each instrument, and delivers a clean PDF score — ready in seconds.
</p>
```

- [ ] **Step 4: Verify /app works**

```powershell
npm run dev
```

Navigate to `http://localhost:3000/app` — should show the upload tool. Navigate to `http://localhost:3000` — still shows old page (will be replaced in Task 3).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/app/
git commit -m "feat: move transcription tool to /app route"
```

---

## Task 3: Landing page at /

**Files:**
- Modify: `frontend/app/page.tsx` (full replacement)

- [ ] **Step 1: Replace frontend/app/page.tsx with the landing page**

```tsx
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notara — Convert Audio to Sheet Music with AI",
  description:
    "Upload any audio file and get a clean PDF sheet music score in seconds. Notara uses AI to separate stems and transcribe each instrument. Free to try — no signup needed.",
};

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative px-6 pt-20 pb-24 text-center overflow-hidden">
        {/* Background glow */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 flex items-center justify-center"
        >
          <div className="w-[600px] h-[400px] rounded-full bg-violet-700/20 blur-3xl" />
        </div>

        <div className="mx-auto max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-300 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Free to try — no signup needed
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-white leading-[1.1]">
            Upload audio.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
              Get sheet music.
            </span>
          </h1>

          <p className="mt-6 text-xl text-[#a1a1aa] max-w-2xl mx-auto leading-relaxed">
            Notara separates your recording into stems and transcribes each instrument
            to a clean PDF score — powered by AI, ready in seconds.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/app"
              className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-8 py-3.5 text-base font-semibold text-white hover:opacity-90 transition-opacity shadow-lg shadow-violet-900/30"
            >
              Try it free →
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg border border-[#27272a] bg-[#111113] px-8 py-3.5 text-base font-semibold text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-20 border-t border-[#27272a]">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold text-white mb-4">
            How it works
          </h2>
          <p className="text-center text-[#71717a] mb-14">Three steps. No music theory required.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Upload your audio",
                description:
                  "Drop in any MP3, WAV, or FLAC file — a recording, a song, a rehearsal. Up to 3 minutes free.",
              },
              {
                step: "02",
                title: "AI separates the stems",
                description:
                  "Notara splits your audio into vocals, bass, and other instruments using Demucs — studio-grade source separation.",
              },
              {
                step: "03",
                title: "Download your PDF score",
                description:
                  "Each stem is transcribed to notation and exported as a clean PDF score, ready to print or share.",
              },
            ].map(({ step, title, description }) => (
              <div
                key={step}
                className="flex flex-col gap-4 p-6 rounded-xl border border-[#27272a] bg-[#111113]"
              >
                <div className="text-xs font-mono text-violet-400 tracking-widest">{step}</div>
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                <p className="text-sm text-[#71717a] leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 border-t border-[#27272a]">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold text-white mb-4">
            Built for every musician
          </h2>
          <p className="text-center text-[#71717a] mb-14">From hobbyists to professional studios.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: "🎙️",
                title: "AI stem separation",
                description: "Demucs separates vocals, bass, and other instruments with studio-grade precision.",
              },
              {
                icon: "📄",
                title: "Clean PDF scores",
                description: "Every stem becomes a readable, printable sheet music PDF — perfect for rehearsal.",
              },
              {
                icon: "🎹",
                title: "MIDI & MusicXML",
                description: "Pro and Business users also get MIDI and MusicXML for import into any DAW or notation software.",
              },
              {
                icon: "⚡",
                title: "Fast processing",
                description: "Most tracks complete in under 60 seconds. Priority queue for Pro and Business users.",
              },
              {
                icon: "🆓",
                title: "Free to start",
                description: "3 transcriptions every month, no credit card required. Upgrade when you need more.",
              },
              {
                icon: "🔒",
                title: "Your files, private",
                description: "Audio files are processed and discarded. Results are available only to you.",
              },
            ].map(({ icon, title, description }) => (
              <div
                key={title}
                className="p-5 rounded-xl border border-[#27272a] bg-[#111113] flex flex-col gap-3"
              >
                <div className="text-2xl">{icon}</div>
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <p className="text-sm text-[#71717a] leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="px-6 py-20 border-t border-[#27272a]">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Start free. Upgrade when you're ready.
          </h2>
          <p className="text-[#71717a] mb-10">
            Free tier gives you 3 transcriptions per month, no card needed. Pro
            unlocks 50/month, MIDI, MusicXML, and your transcription history.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/app"
              className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-8 py-3.5 text-base font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Try free now →
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg border border-[#27272a] bg-[#111113] px-8 py-3.5 text-base font-semibold text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all"
            >
              View all plans
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Dev server visual check**

```powershell
npm run dev
```

Visit `http://localhost:3000` — should show the landing page with hero, "How it works", features, and pricing teaser sections.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat: add Notara landing page at /"
```

---

## Task 4: Install dependencies + Supabase schema

**Files:**
- Modify: `frontend/package.json`
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Install new packages**

```powershell
cd C:\Users\User\Scoreflow\frontend
npm install next-auth@beta @supabase/supabase-js stripe
```

Expected: packages install without error. `next-auth@beta` installs v5.

- [ ] **Step 2: Create supabase migrations directory**

```bash
mkdir -p supabase/migrations
```

(Run from repo root `C:\Users\User\Scoreflow`)

- [ ] **Step 3: Create the initial schema**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Users table (synced from NextAuth via callbacks)
create table if not exists users (
  id          text primary key,          -- NextAuth user id
  email       text unique not null,
  tier        text not null default 'free' check (tier in ('free','pro','business')),
  stripe_customer_id     text,
  stripe_subscription_id text,
  created_at  timestamptz default now()
);

-- Transcriptions table (one row per pipeline job)
create table if not exists transcriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       text references users(id) on delete set null,
  session_token text,                    -- for anonymous usage tracking
  job_id        text not null,
  filename      text,
  status        text not null default 'processing' check (status in ('processing','done','failed')),
  created_at    timestamptz default now()
);

-- Index for fast monthly usage count queries
create index if not exists transcriptions_user_month
  on transcriptions (user_id, created_at);

create index if not exists transcriptions_session_month
  on transcriptions (session_token, created_at);
```

- [ ] **Step 4: Run migration in Supabase**

In the Supabase dashboard SQL editor (or via CLI if installed), paste and run `001_initial_schema.sql`.

Manual step — no automated verify. Confirm both tables appear in the Supabase table editor.

- [ ] **Step 5: Add env vars to frontend/.env.local**

```
# NextAuth
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000

# Google OAuth (create at console.cloud.google.com)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Stripe Price IDs (copy from Stripe dashboard after creating products)
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_BUSINESS_MONTHLY=price_...
STRIPE_PRICE_BUSINESS_YEARLY=price_...
```

- [ ] **Step 6: Update .env.local.example**

Copy the above env block to `frontend/.env.local.example` (with empty values — no secrets).

- [ ] **Step 7: Commit**

```bash
git add supabase/ frontend/.env.local.example frontend/package.json frontend/package-lock.json
git commit -m "feat: add next-auth, supabase, stripe deps + DB schema"
```

---

## Task 5: NextAuth v5 + Supabase client

**Files:**
- Create: `frontend/lib/auth.ts`
- Create: `frontend/lib/db.ts`
- Create: `frontend/app/api/auth/[...nextauth]/route.ts`
- Create: `frontend/app/signin/page.tsx`
- Create: `frontend/middleware.ts`

- [ ] **Step 1: Create frontend/lib/db.ts**

```ts
import { createClient } from "@supabase/supabase-js";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

// Server-side only — uses service role key (bypasses RLS)
export const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
```

- [ ] **Step 2: Create frontend/lib/auth.ts**

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { db } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    // Email magic link — works without Resend in dev (logs to console)
    Resend({ from: "noreply@notara.app" }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      // Upsert user into Supabase on every sign-in
      await db.from("users").upsert(
        { id: user.id!, email: user.email },
        { onConflict: "id", ignoreDuplicates: true }
      );
      return true;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      // Attach tier from Supabase
      const { data } = await db
        .from("users")
        .select("tier")
        .eq("id", token.sub!)
        .single();
      session.user.tier = (data?.tier ?? "free") as "free" | "pro" | "business";
      return session;
    },
    async jwt({ token }) {
      return token;
    },
  },
  pages: {
    signIn: "/signin",
  },
});

// Extend next-auth Session type
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      tier: "free" | "pro" | "business";
    };
  }
}
```

- [ ] **Step 3: Create the NextAuth route handler**

Create `frontend/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 4: Create frontend/middleware.ts**

```ts
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl, auth: session } = req;

  // Protect /dashboard — redirect to sign-in if not authenticated
  if (nextUrl.pathname.startsWith("/dashboard") && !session) {
    return NextResponse.redirect(new URL("/signin", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

- [ ] **Step 5: Create frontend/app/signin/page.tsx**

```tsx
import { signIn } from "@/lib/auth";

export default function SignInPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-xl font-bold text-white mx-auto mb-4">
            N
          </div>
          <h1 className="text-2xl font-bold text-white">Sign in to Notara</h1>
          <p className="text-sm text-[#71717a] mt-2">
            Continue with Google or your email address
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/app" });
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 rounded-lg border border-[#27272a] bg-[#111113] px-4 py-3 text-sm font-medium text-white hover:bg-[#18181b] transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </form>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#27272a]" />
            </div>
            <div className="relative flex justify-center text-xs text-[#71717a]">
              <span className="bg-[#09090b] px-2">or</span>
            </div>
          </div>

          <form
            action={async (formData: FormData) => {
              "use server";
              await signIn("resend", {
                email: formData.get("email") as string,
                redirectTo: "/app",
              });
            }}
            className="flex flex-col gap-3"
          >
            <input
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="rounded-lg border border-[#27272a] bg-[#111113] px-4 py-3 text-sm text-white placeholder-[#52525b] focus:outline-none focus:border-violet-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Send magic link
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[#52525b] mt-6">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Build check**

```powershell
npx tsc --noEmit
```

Expected: 0 errors. (NextAuth types are included in `next-auth@beta`.)

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/auth.ts frontend/lib/db.ts \
  frontend/app/api/auth/ \
  frontend/app/signin/ \
  frontend/middleware.ts
git commit -m "feat: add NextAuth v5 with Google + email magic link"
```

---

## Task 6: Usage tracking helpers + UsageBanner

**Files:**
- Create: `frontend/lib/usage.ts`
- Create: `frontend/components/UsageBanner.tsx`
- Create: `frontend/components/UpgradePrompt.tsx`
- Modify: `frontend/app/app/page.tsx`
- Modify: `frontend/app/app/layout.tsx`

- [ ] **Step 1: Write failing tests for usage helpers**

Create `frontend/lib/usage.test.ts`:

```ts
import { getTierLimits, canTranscribeSync } from "./usage";

describe("getTierLimits", () => {
  it("free tier allows 3 transcriptions per month, 3-min max", () => {
    const limits = getTierLimits("free");
    expect(limits.monthlyLimit).toBe(3);
    expect(limits.maxAudioMinutes).toBe(3);
    expect(limits.formats).toEqual(["pdf"]);
  });

  it("pro tier allows 50 transcriptions per month", () => {
    const limits = getTierLimits("pro");
    expect(limits.monthlyLimit).toBe(50);
    expect(limits.maxAudioMinutes).toBe(30);
    expect(limits.formats).toEqual(["pdf", "midi", "musicxml"]);
  });

  it("business tier is unlimited", () => {
    const limits = getTierLimits("business");
    expect(limits.monthlyLimit).toBe(Infinity);
    expect(limits.maxAudioMinutes).toBe(120);
  });
});

describe("canTranscribeSync", () => {
  it("allows transcription when under limit", () => {
    expect(canTranscribeSync("free", 2)).toBe(true);
  });

  it("blocks transcription when at limit", () => {
    expect(canTranscribeSync("free", 3)).toBe(false);
  });

  it("always allows business tier", () => {
    expect(canTranscribeSync("business", 10000)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```powershell
npx jest frontend/lib/usage.test.ts 2>&1 | head -20
```

Expected: FAIL — `usage` module not found.

- [ ] **Step 3: Create frontend/lib/usage.ts**

```ts
import { db } from "@/lib/db";

export type Tier = "free" | "pro" | "business";

interface TierLimits {
  monthlyLimit: number;   // Infinity for unlimited
  maxAudioMinutes: number;
  formats: string[];
}

export function getTierLimits(tier: Tier): TierLimits {
  switch (tier) {
    case "pro":
      return { monthlyLimit: 50, maxAudioMinutes: 30, formats: ["pdf", "midi", "musicxml"] };
    case "business":
      return { monthlyLimit: Infinity, maxAudioMinutes: 120, formats: ["pdf", "midi", "musicxml"] };
    default: // free
      return { monthlyLimit: 3, maxAudioMinutes: 3, formats: ["pdf"] };
  }
}

/** Pure sync check — use when you already have the count from DB */
export function canTranscribeSync(tier: Tier, usedThisMonth: number): boolean {
  const limits = getTierLimits(tier);
  return usedThisMonth < limits.monthlyLimit;
}

/** Get monthly usage count for a logged-in user */
export async function getMonthlyUsage(userId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count, error } = await db
    .from("transcriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", monthStart.toISOString());

  if (error) throw error;
  return count ?? 0;
}

/** Get monthly usage count for an anonymous session token */
export async function getAnonymousUsage(sessionToken: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count, error } = await db
    .from("transcriptions")
    .select("id", { count: "exact", head: true })
    .eq("session_token", sessionToken)
    .gte("created_at", monthStart.toISOString());

  if (error) throw error;
  return count ?? 0;
}

/** Record a new transcription in the DB */
export async function recordTranscription({
  userId,
  sessionToken,
  jobId,
  filename,
}: {
  userId?: string;
  sessionToken?: string;
  jobId: string;
  filename: string;
}): Promise<void> {
  const { error } = await db.from("transcriptions").insert({
    user_id: userId ?? null,
    session_token: sessionToken ?? null,
    job_id: jobId,
    filename,
    status: "processing",
  });
  if (error) throw error;
}

/** Update transcription status after job completes */
export async function updateTranscriptionStatus(
  jobId: string,
  status: "done" | "failed"
): Promise<void> {
  await db
    .from("transcriptions")
    .update({ status })
    .eq("job_id", jobId);
}
```

- [ ] **Step 4: Run tests — verify they pass**

```powershell
npx jest frontend/lib/usage.test.ts
```

Expected: PASS — 5 tests pass.

- [ ] **Step 5: Create frontend/components/UsageBanner.tsx**

```tsx
import Link from "next/link";
import { getTierLimits } from "@/lib/usage";
import type { Tier } from "@/lib/usage";

interface UsageBannerProps {
  used: number;
  tier: Tier;
}

export default function UsageBanner({ used, tier }: UsageBannerProps) {
  if (tier !== "free") return null;
  const limit = getTierLimits("free").monthlyLimit; // 3
  const remaining = limit - used;

  return (
    <div className="mb-6 flex items-center justify-between rounded-lg border border-[#27272a] bg-[#111113] px-4 py-3 text-sm">
      <span className="text-[#a1a1aa]">
        <span className="text-white font-medium">{remaining} of {limit}</span> free transcriptions
        remaining this month
      </span>
      <Link
        href="/pricing"
        className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
      >
        Upgrade →
      </Link>
    </div>
  );
}
```

- [ ] **Step 6: Create frontend/components/UpgradePrompt.tsx**

```tsx
import Link from "next/link";

export default function UpgradePrompt() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-xl border border-[#27272a] bg-[#111113] p-12 text-center">
      <div className="text-4xl">🎼</div>
      <div>
        <h2 className="text-xl font-bold text-white mb-2">
          You've used all 3 free transcriptions this month
        </h2>
        <p className="text-[#71717a] text-sm max-w-sm">
          Upgrade to Pro for 50 transcriptions per month, plus MIDI and MusicXML export.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/pricing"
          className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
        >
          Upgrade to Pro — $12/mo
        </Link>
        <Link
          href="/signin"
          className="rounded-lg border border-[#27272a] px-6 py-2.5 text-sm font-medium text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all"
        >
          Sign in to a different account
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Update frontend/app/app/layout.tsx to check usage server-side**

Replace the entire content of `frontend/app/app/layout.tsx`:

```tsx
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getMonthlyUsage, getAnonymousUsage, canTranscribeSync } from "@/lib/usage";
import UsageBanner from "@/components/UsageBanner";
import UpgradePrompt from "@/components/UpgradePrompt";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const tier = session?.user?.tier ?? "free";

  let used = 0;
  if (session?.user?.id) {
    used = await getMonthlyUsage(session.user.id);
  } else {
    // Anonymous: use session token cookie (set by /app/page.tsx on upload)
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("notara_session")?.value;
    if (sessionToken) {
      used = await getAnonymousUsage(sessionToken);
    }
  }

  const canTranscribe = canTranscribeSync(tier, used);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <UsageBanner used={used} tier={tier} />
      {canTranscribe ? (
        children
      ) : (
        <UpgradePrompt />
      )}
    </div>
  );
}
```

- [ ] **Step 8: Build check**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/lib/usage.ts frontend/lib/usage.test.ts \
  frontend/components/UsageBanner.tsx \
  frontend/components/UpgradePrompt.tsx \
  frontend/app/app/layout.tsx
git commit -m "feat: usage tracking helpers, UsageBanner, UpgradePrompt"
```

---

## Task 6b: Wire up session cookie + record transcriptions

**Files:**
- Modify: `frontend/middleware.ts`
- Create: `frontend/app/api/transcriptions/route.ts`
- Modify: `frontend/app/app/page.tsx`

This task closes the loop: the anonymous session cookie must be set so the layout can count anonymous usage, and every successful upload must be recorded in Supabase.

- [ ] **Step 1: Set session cookie in middleware**

Replace `frontend/middleware.ts` with this version that sets a `notara_session` cookie for anonymous visitors:

```ts
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid"; // add: npm install nanoid

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const res = NextResponse.next();

  // Protect /dashboard
  if (nextUrl.pathname.startsWith("/dashboard") && !session) {
    return NextResponse.redirect(new URL("/signin", nextUrl));
  }

  // Set anonymous session token cookie (30-day) if not present
  if (!session && !req.cookies.get("notara_session")) {
    res.cookies.set("notara_session", nanoid(), {
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  return res;
});

export const config = {
  matcher: ["/dashboard/:path*", "/app/:path*"],
};
```

Install nanoid:

```powershell
cd C:\Users\User\Scoreflow\frontend
npm install nanoid
```

- [ ] **Step 2: Create the transcription recording API route**

Create `frontend/app/api/transcriptions/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordTranscription } from "@/lib/usage";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const session = await auth();
  const { jobId, filename } = (await req.json()) as { jobId: string; filename: string };

  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("notara_session")?.value;

  await recordTranscription({
    userId: session?.user?.id,
    sessionToken,
    jobId,
    filename,
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Call the recording API from the upload flow**

In `frontend/app/app/page.tsx`, update `handleUpload` to record the transcription after a successful job creation:

```tsx
const handleUpload = async (file: File) => {
  setLoading(true);
  setError("");
  try {
    const { job_id } = await uploadAudio(file, quality, refine);

    // Record transcription in DB (for usage tracking + dashboard history)
    await fetch("/api/transcriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job_id, filename: file.name }),
    });

    router.push(`/job/${job_id}`);
  } catch (e: unknown) {
    setError(e instanceof Error ? e.message : "Upload failed");
    setLoading(false);
  }
};
```

- [ ] **Step 4: Build check**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/middleware.ts \
  frontend/app/api/transcriptions/ \
  frontend/app/app/page.tsx
git commit -m "feat: set session cookie in middleware, record transcriptions after upload"
```

---

## Task 7: Stripe checkout + webhook

**Files:**
- Create: `frontend/lib/stripe.ts`
- Create: `frontend/app/api/stripe/checkout/route.ts`
- Create: `frontend/app/api/stripe/portal/route.ts`
- Create: `frontend/app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Create frontend/lib/stripe.ts**

```ts
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) throw new Error("Missing STRIPE_SECRET_KEY");

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-04-30.basil",
});
```

- [ ] **Step 2: Create checkout route**

Create `frontend/app/api/stripe/checkout/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { priceId } = (await req.json()) as { priceId: string };
  if (!priceId) {
    return NextResponse.json({ error: "Missing priceId" }, { status: 400 });
  }

  // Get or create Stripe customer
  const { data: users } = await db
    .from("users")
    .select("stripe_customer_id")
    .eq("id", session.user.id)
    .single();

  let customerId = users?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      metadata: { notara_user_id: session.user.id },
    });
    customerId = customer.id;
    await db
      .from("users")
      .update({ stripe_customer_id: customerId })
      .eq("id", session.user.id);
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXTAUTH_URL}/dashboard?upgrade=success`,
    cancel_url: `${process.env.NEXTAUTH_URL}/pricing`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
```

- [ ] **Step 3: Create customer portal route**

Create `frontend/app/api/stripe/portal/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: user } = await db
    .from("users")
    .select("stripe_customer_id")
    .eq("id", session.user.id)
    .single();

  if (!user?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account" }, { status: 400 });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id as string,
    return_url: `${process.env.NEXTAUTH_URL}/dashboard`,
  });

  return NextResponse.json({ url: portalSession.url });
}
```

- [ ] **Step 4: Create webhook route**

Create `frontend/app/api/stripe/webhook/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import Stripe from "stripe";

// Stripe requires raw body for webhook signature verification
export const config = { api: { bodyParser: false } };

async function setUserTier(customerId: string, tier: "free" | "pro" | "business", subscriptionId?: string) {
  await db
    .from("users")
    .update({
      tier,
      stripe_subscription_id: subscriptionId ?? null,
    })
    .eq("stripe_customer_id", customerId);
}

function priceIdToTier(priceId: string): "pro" | "business" {
  const proIds = [
    process.env.STRIPE_PRICE_PRO_MONTHLY,
    process.env.STRIPE_PRICE_PRO_YEARLY,
  ];
  return proIds.includes(priceId) ? "pro" : "business";
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;
      const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
      const priceId = subscription.items.data[0].price.id;
      const tier = priceIdToTier(priceId);
      await setUserTier(session.customer as string, tier, subscription.id);
      break;
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      if (subscription.status !== "active") break;
      const priceId = subscription.items.data[0].price.id;
      const tier = priceIdToTier(priceId);
      await setUserTier(subscription.customer as string, tier, subscription.id);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await setUserTier(subscription.customer as string, "free");
      break;
    }
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 5: Build check**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Test webhook locally (manual)**

```powershell
# Terminal 1: run dev server
npm run dev

# Terminal 2: run Stripe CLI to forward webhooks
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use `stripe trigger checkout.session.completed` to verify the webhook handler fires and updates the DB.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/stripe.ts frontend/app/api/stripe/
git commit -m "feat: Stripe checkout, customer portal, and webhook handler"
```

---

## Task 8: Dashboard page

**Files:**
- Create: `frontend/app/dashboard/page.tsx`

- [ ] **Step 1: Create frontend/app/dashboard/page.tsx**

```tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getTierLimits, getMonthlyUsage } from "@/lib/usage";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const [transcriptionsRes, used] = await Promise.all([
    db
      .from("transcriptions")
      .select("id, job_id, filename, status, created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    getMonthlyUsage(session.user.id),
  ]);

  const transcriptions = transcriptionsRes.data ?? [];
  const tier = session.user.tier;
  const limits = getTierLimits(tier);
  const remaining = limits.monthlyLimit === Infinity ? "∞" : String(limits.monthlyLimit - used);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-[#71717a] mt-1">
            {session.user.email} ·{" "}
            <span className="capitalize text-violet-400">{tier}</span> plan
          </p>
        </div>
        <div className="flex gap-3">
          {tier === "free" && (
            <Link
              href="/pricing"
              className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Upgrade to Pro
            </Link>
          )}
          {tier !== "free" && (
            <form action="/api/stripe/portal" method="POST">
              <button
                type="submit"
                className="rounded-lg border border-[#27272a] px-4 py-2 text-sm font-medium text-[#a1a1aa] hover:text-white transition-colors"
              >
                Manage billing
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Usage stat */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-[#27272a] bg-[#111113] p-5">
          <div className="text-xs text-[#71717a] mb-1 uppercase tracking-widest">Used this month</div>
          <div className="text-3xl font-bold text-white">{used}</div>
          <div className="text-sm text-[#52525b] mt-1">of {limits.monthlyLimit === Infinity ? "unlimited" : limits.monthlyLimit}</div>
        </div>
        <div className="rounded-xl border border-[#27272a] bg-[#111113] p-5">
          <div className="text-xs text-[#71717a] mb-1 uppercase tracking-widest">Remaining</div>
          <div className="text-3xl font-bold text-white">{remaining}</div>
          <div className="text-sm text-[#52525b] mt-1">resets 1st of month</div>
        </div>
        <div className="rounded-xl border border-[#27272a] bg-[#111113] p-5">
          <div className="text-xs text-[#71717a] mb-1 uppercase tracking-widest">Max audio</div>
          <div className="text-3xl font-bold text-white">{limits.maxAudioMinutes}<span className="text-lg font-normal text-[#52525b]"> min</span></div>
          <div className="text-sm text-[#52525b] mt-1">per transcription</div>
        </div>
      </div>

      {/* Transcription history */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Transcription history</h2>
        {transcriptions.length === 0 ? (
          <div className="text-center py-12 text-[#52525b] border border-[#27272a] rounded-xl">
            No transcriptions yet.{" "}
            <Link href="/app" className="text-violet-400 hover:underline">
              Start your first one →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {transcriptions.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-[#27272a] bg-[#111113] px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-white">{t.filename ?? "Untitled"}</div>
                  <div className="text-xs text-[#52525b] mt-0.5">
                    {new Date(t.created_at as string).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      t.status === "done"
                        ? "bg-green-900/40 text-green-400"
                        : t.status === "failed"
                        ? "bg-red-900/40 text-red-400"
                        : "bg-yellow-900/40 text-yellow-400"
                    }`}
                  >
                    {t.status}
                  </span>
                  {t.status === "done" && (
                    <Link
                      href={`/job/${t.job_id}`}
                      className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      View →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/page.tsx
git commit -m "feat: add dashboard with usage stats and transcription history"
```

---

## Task 9: Pricing page

**Files:**
- Create: `frontend/app/pricing/page.tsx`
- Create: `frontend/components/PricingCards.tsx`

- [ ] **Step 1: Create frontend/components/PricingCards.tsx**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PLANS = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    yearlyPrice: 0,
    monthlyPriceId: null,
    yearlyPriceId: null,
    description: "For casual listening and exploration",
    features: [
      "3 transcriptions / month",
      "PDF sheet music",
      "Up to 3-min audio",
      "All 3 stems",
    ],
    missing: ["MIDI & MusicXML export", "Dashboard & history", "Priority queue"],
    cta: "Start free",
    ctaHref: "/app",
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 12,
    yearlyPrice: 99,
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY,
    yearlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY,
    description: "For students, teachers, and working musicians",
    features: [
      "50 transcriptions / month",
      "PDF + MIDI + MusicXML",
      "Up to 30-min audio",
      "All 3 stems",
      "Dashboard & history",
      "Priority queue",
    ],
    missing: ["API access", "Bulk upload"],
    cta: "Get Pro",
    ctaHref: null, // handled by checkout
    highlight: true,
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: 49,
    yearlyPrice: 399,
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY,
    yearlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_YEARLY,
    description: "For studios, producers, and teams",
    features: [
      "Unlimited transcriptions",
      "PDF + MIDI + MusicXML",
      "Up to 2-hour audio",
      "All 3 stems + stem selection",
      "Dashboard & history",
      "Priority queue",
      "REST API access",
      "Bulk upload (10 files)",
    ],
    missing: [],
    cta: "Get Business",
    ctaHref: null,
    highlight: false,
  },
];

export default function PricingCards() {
  const [annual, setAnnual] = useState(false);
  const router = useRouter();

  const handleUpgrade = async (priceId: string | null | undefined) => {
    if (!priceId) return;
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId }),
    });
    const data = await res.json() as { url?: string; error?: string };
    if (data.url) {
      router.push(data.url);
    } else if (data.error === "Not authenticated") {
      router.push("/signin");
    }
  };

  return (
    <div>
      {/* Annual toggle */}
      <div className="flex items-center justify-center gap-3 mb-10">
        <span className={`text-sm ${!annual ? "text-white" : "text-[#71717a]"}`}>Monthly</span>
        <button
          onClick={() => setAnnual(!annual)}
          className={`relative w-11 h-6 rounded-full transition-colors ${annual ? "bg-violet-600" : "bg-[#27272a]"}`}
        >
          <div
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${annual ? "translate-x-5" : ""}`}
          />
        </button>
        <span className={`text-sm ${annual ? "text-white" : "text-[#71717a]"}`}>
          Annual <span className="text-green-400 text-xs font-medium">save ~31%</span>
        </span>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const price = annual ? plan.yearlyPrice : plan.monthlyPrice;
          const priceId = annual ? plan.yearlyPriceId : plan.monthlyPriceId;
          return (
            <div
              key={plan.id}
              className={`rounded-xl p-6 flex flex-col gap-4 ${
                plan.highlight
                  ? "border-2 border-violet-600 bg-[#1a1025]"
                  : "border border-[#27272a] bg-[#111113]"
              }`}
            >
              {plan.highlight && (
                <div className="text-xs font-bold uppercase tracking-widest text-violet-400">
                  Most Popular
                </div>
              )}
              <div>
                <div className="text-sm font-semibold text-[#71717a] uppercase tracking-widest mb-1">
                  {plan.name}
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold text-white">${price}</span>
                  <span className="text-[#71717a] text-sm mb-1">
                    {plan.monthlyPrice === 0 ? "" : annual ? "/yr" : "/mo"}
                  </span>
                </div>
                {annual && plan.monthlyPrice > 0 && (
                  <div className="text-xs text-[#52525b] mt-0.5">
                    (${Math.round(price / 12)}/mo billed annually)
                  </div>
                )}
                <p className="text-sm text-[#71717a] mt-2">{plan.description}</p>
              </div>

              <div className="h-px bg-[#27272a]" />

              <ul className="flex flex-col gap-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-[#d4d4d8]">
                    <span className="text-green-400 mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
                {plan.missing.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-[#52525b]">
                    <span className="mt-0.5">✗</span>
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-2">
                {plan.ctaHref ? (
                  <a
                    href={plan.ctaHref}
                    className={`block text-center rounded-lg py-2.5 text-sm font-semibold transition-all ${
                      plan.highlight
                        ? "bg-gradient-to-r from-violet-600 to-indigo-700 text-white hover:opacity-90"
                        : "border border-[#3f3f46] text-[#a1a1aa] hover:text-white hover:border-[#52525b]"
                    }`}
                  >
                    {plan.cta}
                  </a>
                ) : (
                  <button
                    onClick={() => handleUpgrade(priceId)}
                    className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-all ${
                      plan.highlight
                        ? "bg-gradient-to-r from-violet-600 to-indigo-700 text-white hover:opacity-90"
                        : "border border-[#3f3f46] text-[#a1a1aa] hover:text-white hover:border-[#52525b]"
                    }`}
                  >
                    {plan.cta}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create frontend/app/pricing/page.tsx**

```tsx
import type { Metadata } from "next";
import PricingCards from "@/components/PricingCards";

export const metadata: Metadata = {
  title: "Notara Pricing — Free, Pro & Business Plans",
  description:
    "Start free with 3 transcriptions per month. Upgrade to Pro for 50/month with MIDI and MusicXML. Business gets unlimited transcriptions and API access.",
};

const FAQ = [
  {
    q: "What counts as one transcription?",
    a: "Each audio file you upload and process counts as one transcription, regardless of length (within your plan's audio limit).",
  },
  {
    q: "What formats do I get?",
    a: "Free users get PDF sheet music. Pro and Business users also get MIDI (for DAWs) and MusicXML (for notation software like MuseScore, Sibelius, or Finale).",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes — cancel any time from your dashboard. Your plan stays active until the end of the billing period.",
  },
  {
    q: "Does usage reset every month?",
    a: "Yes, on the 1st of each calendar month (UTC). Unused transcriptions do not roll over.",
  },
  {
    q: "What is the Business API?",
    a: "Business subscribers get a REST API key to integrate Notara's transcription pipeline into their own tools and workflows. Documentation is available in the dashboard.",
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="text-center mb-14">
        <h1 className="text-4xl font-bold text-white mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-[#71717a] max-w-xl mx-auto">
          Start free. Upgrade when you need more. No hidden fees, no surprises.
        </p>
      </div>

      <PricingCards />

      {/* FAQ */}
      <div className="mt-20">
        <h2 className="text-2xl font-bold text-white text-center mb-10">
          Frequently asked questions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {FAQ.map(({ q, a }) => (
            <div key={q} className="p-5 rounded-xl border border-[#27272a] bg-[#111113]">
              <div className="text-sm font-semibold text-white mb-2">{q}</div>
              <div className="text-sm text-[#71717a] leading-relaxed">{a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add two env vars for public Stripe price IDs to .env.local**

```
NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_YEARLY=price_...
```

(These are `NEXT_PUBLIC_` because they're referenced in the client component `PricingCards.tsx`.)

- [ ] **Step 4: Build check**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/pricing/ frontend/components/PricingCards.tsx
git commit -m "feat: pricing page with annual/monthly toggle and Stripe checkout"
```

---

## Task 10: SEO — metadata, sitemap, robots, JSON-LD, OG image

**Files:**
- Create: `frontend/app/sitemap.ts`
- Create: `frontend/app/robots.ts`
- Create: `frontend/public/og-image.png` (via script)
- Modify: `frontend/app/app/page.tsx` (add metadata export)
- Modify: `frontend/app/viewer/page.tsx` (add metadata export)

- [ ] **Step 1: Create frontend/app/sitemap.ts**

```ts
import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://notara.app";
  return [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/app`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/pricing`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/viewer`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  ];
}
```

- [ ] **Step 2: Create frontend/app/robots.ts**

```ts
import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://notara.app/sitemap.xml",
  };
}
```

- [ ] **Step 3: Add JSON-LD structured data to the landing page**

At the bottom of `frontend/app/page.tsx`, add a `<script>` tag inside the last section (before the closing `</div>`):

```tsx
{/* JSON-LD structured data */}
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "Notara",
      "description": "Convert audio files to sheet music PDF using AI stem separation and transcription.",
      "url": "https://notara.app",
      "applicationCategory": "MusicApplication",
      "operatingSystem": "Web",
      "offers": [
        { "@type": "Offer", "name": "Free", "price": "0", "priceCurrency": "USD" },
        { "@type": "Offer", "name": "Pro", "price": "12", "priceCurrency": "USD" },
        { "@type": "Offer", "name": "Business", "price": "49", "priceCurrency": "USD" },
      ],
    }),
  }}
/>
```

- [ ] **Step 4: Add metadata to /app page**

Add at the top of `frontend/app/app/page.tsx` (before the default export):

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notara — Upload Audio & Get Sheet Music",
  description:
    "Drag and drop any MP3, WAV, or FLAC. Notara's AI transcribes your audio to sheet music and delivers a PDF score in seconds. Free to try.",
};
```

- [ ] **Step 5: Generate og-image.png**

Run this Node script to create a simple Open Graph image (1200×630):

```powershell
cd C:\Users\User\Scoreflow\frontend
node -e "
const { createCanvas } = require('canvas');
" 2>&1
```

If `canvas` is not available, use an online tool (Canva, Figma) to create a 1200×630 PNG with:
- Background: `#09090b`
- Large text: **Notara** in white, bold, centered
- Subtitle: *"Turn sound into score"* in `#a78bfa`
- Small gradient box with the "N" logo mark

Save as `frontend/public/og-image.png`.

> **Note:** If you have Figma or Canva, this is faster to create manually than scripting. The image just needs to exist at `public/og-image.png` for the metadata tags to work.

- [ ] **Step 6: Build check**

```powershell
npx tsc --noEmit && npm run build
```

Expected: clean build, 0 type errors, no "missing module" errors.

- [ ] **Step 7: Verify sitemap and robots**

```powershell
npm run dev
```

- Visit `http://localhost:3000/sitemap.xml` — should return XML with 4 URLs
- Visit `http://localhost:3000/robots.txt` — should return `User-agent: *` + sitemap URL

- [ ] **Step 8: Commit**

```bash
git add frontend/app/sitemap.ts frontend/app/robots.ts \
  frontend/app/page.tsx frontend/app/app/page.tsx \
  frontend/public/og-image.png
git commit -m "feat: SEO — sitemap, robots, JSON-LD, og-image, per-page metadata"
```

---

## Task 11: Final build + deploy

**Files:**
- No new files

- [ ] **Step 1: Full production build**

```powershell
cd C:\Users\User\Scoreflow\frontend
npm run build
```

Expected: `✓ Compiled successfully`. All pages listed with no errors.

- [ ] **Step 2: Set Vercel environment variables**

In the Vercel dashboard for the Notara project, add every variable from `frontend/.env.local.example`:
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL` (set to the Vercel deployment URL, e.g. `https://notara.vercel.app`)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- All 4 Stripe price ID variables

- [ ] **Step 3: Update Google OAuth redirect URIs**

In the Google Cloud Console for the OAuth client, add:
```
https://notara.vercel.app/api/auth/callback/google
```

- [ ] **Step 4: Register Stripe webhook for production**

In Stripe dashboard → Webhooks → Add endpoint:
- URL: `https://notara.vercel.app/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- Copy the webhook signing secret → set as `STRIPE_WEBHOOK_SECRET` in Vercel

- [ ] **Step 5: Deploy**

```bash
git push origin master
```

Vercel auto-deploys on push. Monitor the Vercel deployment log for errors.

- [ ] **Step 6: Smoke test production**

- `https://notara.vercel.app/` — landing page loads
- `https://notara.vercel.app/app` — upload tool works
- `https://notara.vercel.app/pricing` — pricing page with annual toggle
- `https://notara.vercel.app/signin` → Google sign-in flow completes → redirected to `/app`
- `https://notara.vercel.app/sitemap.xml` — returns 4 URLs
- `https://notara.vercel.app/robots.txt` — returns correctly
- Complete a test transcription as a free user → usage banner shows correct count
- Complete a test Stripe checkout with card `4242 4242 4242 4242` → dashboard shows Pro tier

- [ ] **Step 7: Final commit**

```bash
git tag v1.0.0-notara-launch
git push --tags
git commit --allow-empty -m "chore: tag v1.0.0-notara-launch"
```
