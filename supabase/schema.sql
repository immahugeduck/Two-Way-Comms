-- ============================================================
-- 2Way Secure Walkie — Phase 1 Database Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- profiles
-- ============================================================
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  phone         text unique,
  email         text unique,
  username      text not null unique,
  display_name  text not null,
  avatar_url    text,
  created_at    timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can read any profile"
  on profiles for select using (true);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- ============================================================
-- contacts
-- ============================================================
create table if not exists contacts (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references profiles(id) on delete cascade,
  contact_user_id   uuid not null references profiles(id) on delete cascade,
  status            text not null check (status in ('pending', 'accepted', 'blocked')) default 'pending',
  created_at        timestamptz not null default now(),
  unique (owner_id, contact_user_id)
);

alter table contacts enable row level security;

create policy "Users manage own contacts"
  on contacts for all using (auth.uid() = owner_id);

-- ============================================================
-- chats
-- ============================================================
create table if not exists chats (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('direct', 'group')) default 'direct',
  created_at  timestamptz not null default now()
);

alter table chats enable row level security;

create policy "Members can read chat"
  on chats for select using (
    exists (
      select 1 from chat_members
      where chat_members.chat_id = chats.id
        and chat_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- chat_members
-- ============================================================
create table if not exists chat_members (
  id        uuid primary key default gen_random_uuid(),
  chat_id   uuid not null references chats(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  role      text not null check (role in ('member', 'admin')) default 'member',
  unique (chat_id, user_id)
);

alter table chat_members enable row level security;

create policy "Members can read chat_members"
  on chat_members for select using (auth.uid() = user_id);

create policy "Members can insert chat_members"
  on chat_members for insert with check (auth.uid() = user_id);

-- ============================================================
-- messages
-- ============================================================
create table if not exists messages (
  id                uuid primary key default gen_random_uuid(),
  chat_id           uuid not null references chats(id) on delete cascade,
  sender_id         uuid not null references profiles(id) on delete cascade,
  message_type      text not null check (message_type in ('text', 'audio', 'system')) default 'text',
  content           text,
  audio_url         text,
  encryption_status text not null check (encryption_status in ('none', 'in_transit', 'e2e')) default 'in_transit',
  expires_at        timestamptz,
  created_at        timestamptz not null default now()
);

alter table messages enable row level security;

create policy "Chat members can read messages"
  on messages for select using (
    exists (
      select 1 from chat_members
      where chat_members.chat_id = messages.chat_id
        and chat_members.user_id = auth.uid()
    )
  );

create policy "Chat members can insert messages"
  on messages for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from chat_members
      where chat_members.chat_id = messages.chat_id
        and chat_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- Supabase Storage bucket for voice messages
-- ============================================================
insert into storage.buckets (id, name, public)
values ('voice-messages', 'voice-messages', true)
on conflict (id) do nothing;

create policy "Authenticated users can upload voice"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'voice-messages');

create policy "Anyone can read voice messages"
  on storage.objects for select
  using (bucket_id = 'voice-messages');

-- ============================================================
-- Helper: get_direct_chat(user_a, user_b)
-- Returns the chat id of an existing direct chat between two users,
-- or null if none exists.
-- ============================================================
create or replace function get_direct_chat(user_a uuid, user_b uuid)
returns uuid
language sql
security definer
as $$
  select c.id
  from chats c
  where c.type = 'direct'
    and exists (select 1 from chat_members where chat_id = c.id and user_id = user_a)
    and exists (select 1 from chat_members where chat_id = c.id and user_id = user_b)
  limit 1;
$$;

-- ============================================================
-- Auto-expire messages (runs as a cron via pg_cron if enabled)
-- ============================================================
-- select cron.schedule('expire-messages', '*/15 * * * *', $$
--   delete from messages where expires_at is not null and expires_at < now();
-- $$);
