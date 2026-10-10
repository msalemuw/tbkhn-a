-- Sign up on the website before the app is in the stores (founder, 2026-10-10): the web page signs
-- people in with Google and saves the same profile and communities as the app's sign-up, so on launch
-- day they only sign in. It replaces the plain waitlist from 0010.

drop function if exists public.join_waitlist(text, text, text, text, uuid, text, text, boolean, text, jsonb);
drop function if exists public.admin_waitlist_summary();
drop table if exists public.waitlist;

-- WhatsApp number for the launch message (E.164, e.g. +201001234567). Private: not in the public
-- column grant, read through my_profile() and by staff.
alter table public.profiles add column if not exists whatsapp text check (whatsapp ~ '^\+[1-9][0-9]{7,14}$');
-- Where and from which ad or invite link the member signed up: {"via": "web", "utm_source": …, "ref": …}.
alter table public.profiles add column if not exists signup_source jsonb not null default '{}'::jsonb
  check (pg_column_size(signup_source) <= 2000);
grant update (whatsapp, signup_source) on public.profiles to authenticated;

-- Staff: finished web sign-ups per day, governorate and ad source.
create function public.admin_web_signups()
returns table (day date, governorate text, source text, signups int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select (p.created_at at time zone 'Africa/Cairo')::date, p.governorate,
           coalesce(p.signup_source ->> 'utm_source', case when p.signup_source ? 'ref' then 'invite' else 'direct' end),
           count(*)::int
      from public.profiles p
     where p.username is not null and p.signup_source ->> 'via' = 'web'
     group by 1, 2, 3
     order by 1 desc, 4 desc;
end;
$$;
revoke execute on function public.admin_web_signups() from public, anon;
grant execute on function public.admin_web_signups() to authenticated;
