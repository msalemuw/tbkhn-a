-- tabkheen A: carousel posts. A signature post keeps its first photo in posts.media_path (so every old post and every old
-- phone still works) and any further photos go here, in order (position 1 = the second photo). Founder, 2026-11-24.
create table if not exists public.post_media (
  post_id  uuid not null references public.posts(id) on delete cascade,
  position int  not null check (position between 1 and 9),
  path     text not null,
  primary key (post_id, position)
);

alter table public.post_media enable row level security;

create policy "post media readable" on public.post_media for select using (true);
create policy "add media to own posts" on public.post_media for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));
create policy "remove media from own posts" on public.post_media for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

grant select on public.post_media to anon, authenticated;
grant insert, delete on public.post_media to authenticated;

-- Every change is kept in the audit trail, like the other member data (0052).
create trigger audit_post_media after insert or update or delete on public.post_media
  for each row execute function public.audit_row();
