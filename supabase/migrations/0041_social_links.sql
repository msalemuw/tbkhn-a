-- Optional Instagram, Facebook and TikTok links on a profile, shown to everyone on the profile page.
alter table public.profiles
  add column if not exists instagram_url text check (instagram_url is null or char_length(instagram_url) <= 200),
  add column if not exists facebook_url text check (facebook_url is null or char_length(facebook_url) <= 200),
  add column if not exists tiktok_url text check (tiktok_url is null or char_length(tiktok_url) <= 200);

grant select (instagram_url, facebook_url, tiktok_url) on public.profiles to anon, authenticated;
grant update (instagram_url, facebook_url, tiktok_url) on public.profiles to authenticated;
