-- Posts keep the whole (uncropped) photo. media_focus says which part the square feed frame shows, one {x, y} per photo
-- in order (0..1: 0 = left/top edge, 1 = right/bottom edge; 0.5 = centre). Null = centred, as every older post.
alter table public.posts add column if not exists media_focus jsonb;
