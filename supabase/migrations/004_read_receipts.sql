-- ============================================================
-- Phase 5: Read receipts
-- ============================================================

create table if not exists message_reads (
  message_id  uuid not null references messages(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  chat_id     uuid not null references chats(id) on delete cascade,
  read_at     timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table message_reads enable row level security;

-- Users insert their own read records
create policy "Users can mark messages as read"
  on message_reads for insert
  with check (auth.uid() = user_id);

-- Any member of the chat can see read receipts for that chat
create policy "Chat members can view read receipts"
  on message_reads for select
  using (
    exists (
      select 1 from chat_members
      where chat_members.chat_id = message_reads.chat_id
        and chat_members.user_id = auth.uid()
    )
  );

create index if not exists message_reads_message_idx on message_reads(message_id);
create index if not exists message_reads_chat_idx    on message_reads(chat_id);
