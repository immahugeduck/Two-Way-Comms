-- ============================================================
-- Phase 7: Group E2E encryption key distribution
-- ============================================================

-- Stores the group symmetric key encrypted for each member.
-- The creator generates one 32-byte symmetric key per group and
-- encrypts it with nacl.box for every member who has a public key.
create table if not exists group_keys (
  chat_id           uuid not null references chats(id) on delete cascade,
  user_id           uuid not null references profiles(id) on delete cascade,
  encrypted_sym_key text not null,   -- base64(nacl.box(symKey, nonce, memberPubKey, creatorSecretKey))
  key_nonce         text not null,   -- base64 nonce used in the box above
  sender_public_key text not null,   -- base64 creator public key (needed by recipient to decrypt)
  primary key (chat_id, user_id)
);

alter table group_keys enable row level security;

-- Each user may only read their own key
create policy "Users can view their own group key"
  on group_keys for select
  using (user_id = auth.uid());

-- Any chat member may insert keys for that chat
-- (creator inserts rows for all members during group creation)
create policy "Chat members can distribute group keys"
  on group_keys for insert
  with check (
    exists (
      select 1 from chat_members
      where chat_members.chat_id = group_keys.chat_id
        and chat_members.user_id = auth.uid()
    )
  );

create index if not exists group_keys_chat_idx on group_keys(chat_id);
