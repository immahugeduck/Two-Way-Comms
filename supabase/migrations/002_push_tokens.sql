-- ============================================================
-- Phase 2: push_tokens table
-- Stores Expo push tokens per user device.
-- A user can have multiple tokens (multiple devices).
-- ============================================================

create table if not exists push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  token       text not null,
  platform    text not null check (platform in ('ios', 'android', 'web')),
  created_at  timestamptz not null default now(),
  unique (user_id, token)
);

alter table push_tokens enable row level security;

create policy "Users manage own push tokens"
  on push_tokens for all using (auth.uid() = user_id);

-- Index for fast lookup of all tokens for a user
create index if not exists push_tokens_user_id_idx on push_tokens (user_id);
