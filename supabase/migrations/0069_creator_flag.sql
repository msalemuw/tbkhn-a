-- "Are you an influencer / creator?" asked in sign-up step 3 and Edit profile (app and website).
-- Self-declared, default false. Never shown as a public tag by itself; it feeds the Creator tag and the admin list.
alter table public.profiles add column if not exists is_creator boolean not null default false;

grant select (is_creator) on public.profiles to anon, authenticated;
grant update (is_creator) on public.profiles to authenticated;
