-- tabkheen A: a signature post keeps its photos' shape, like Instagram (tall up to 4:5, wide down to 1.91:1).
-- media_aspect = width / height. Null means a square photo, which is every post made before this.
alter table public.posts add column if not exists media_aspect real
  check (media_aspect is null or media_aspect between 0.5 and 2.0);
