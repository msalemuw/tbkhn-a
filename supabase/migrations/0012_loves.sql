-- Sign-up question (founder, 2026-10-10): "I love cooking", "I love eating" or "I love cooking and
-- eating". Asked on the website and in the app; private like the other sign-up answers.
alter table public.profiles add column if not exists loves text check (loves in ('cooking', 'eating', 'both'));
grant update (loves) on public.profiles to authenticated;
