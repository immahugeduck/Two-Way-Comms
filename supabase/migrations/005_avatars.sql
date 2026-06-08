-- ============================================================
-- Phase 6: Avatar storage bucket
-- ============================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Authenticated users can upload/replace avatars
create policy "Authenticated users can upload avatars"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars');

create policy "Authenticated users can update avatars"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars');

-- Anyone can view avatars (they're public profile images)
create policy "Anyone can view avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');
