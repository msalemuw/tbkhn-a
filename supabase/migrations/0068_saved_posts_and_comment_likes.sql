-- Save a post, like Instagram (founder, 2026-11-22). A save is private: only the member who saved it can see or change it.
create table if not exists public.saved_posts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.saved_posts enable row level security;

create policy "saved posts: mine" on public.saved_posts for select to authenticated using (user_id = auth.uid());
create policy "saved posts: save" on public.saved_posts for insert to authenticated with check (user_id = auth.uid());
create policy "saved posts: unsave" on public.saved_posts for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.saved_posts to authenticated;

create index if not exists saved_posts_user_created on public.saved_posts (user_id, created_at desc);

-- Like a comment, like Instagram (founder, 2026-11-22). Anyone can see the likes (they make the count); you can only add
-- or remove your own.
create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.comment_likes enable row level security;

create policy "comment likes readable" on public.comment_likes for select using (true);
create policy "comment like" on public.comment_likes for insert to authenticated with check (user_id = auth.uid());
create policy "comment unlike" on public.comment_likes for delete to authenticated using (user_id = auth.uid());

grant select on public.comment_likes to anon, authenticated;
grant insert, delete on public.comment_likes to authenticated;
