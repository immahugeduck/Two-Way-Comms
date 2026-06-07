-- ============================================================
-- Phase 3: E2E public keys + group chat metadata
-- ============================================================

-- Add public key column to profiles for E2E encryption
alter table profiles
  add column if not exists public_key text;

-- Add group metadata to chats
alter table chats
  add column if not exists group_name text,
  add column if not exists group_avatar_url text;

-- Index for looking up chats by type
create index if not exists chats_type_idx on chats (type);
