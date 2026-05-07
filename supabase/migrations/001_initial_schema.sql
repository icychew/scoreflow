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
