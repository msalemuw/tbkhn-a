-- tabkheen A: sign-up funnel dashboard for staff (founder, 2026-10-18). Read-only, all staff roles.
-- Reads public.signup_events (docs/SIGNUP-FUNNEL.md), which the app and the website both write.
-- Every count is of distinct visits (session_id). The website's Google/Apple redirect starts a new visit, so a later step
-- can be a little larger than the one before it: read the numbers as "how many visits reached this step".
-- p_via: null = everything, 'web' = the website, 'app' = the mobile app.

-- Visits that reached each step in the last p_days days.
create function public.admin_signup_funnel(p_days int default 14, p_via text default null)
returns table (step text, visits bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  if p_days not between 1 and 90 then raise exception 'choose 1 to 90 days'; end if;
  if p_via is not null and p_via not in ('web', 'app') then raise exception 'unknown source'; end if;
  return query
    select e.step, count(distinct e.session_id)
      from public.signup_events e
     where e.ts >= now() - make_interval(days => p_days)
       and (p_via is null or (p_via = 'web') = (coalesce(e.props ->> 'via', '') = 'web'))
     group by e.step
     order by 2 desc, 1;
end;
$$;

-- Day by day (Cairo time): visits that opened the welcome screen and visits that finished sign-up.
create function public.admin_signup_daily(p_days int default 14, p_via text default null)
returns table (day date, started bigint, completed bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  if p_days not between 1 and 90 then raise exception 'choose 1 to 90 days'; end if;
  if p_via is not null and p_via not in ('web', 'app') then raise exception 'unknown source'; end if;
  return query
    select d::date,
           count(distinct e.session_id) filter (where e.step = 'welcome_viewed'),
           count(distinct e.session_id) filter (where e.step = 'signup_completed')
      from generate_series((now() at time zone 'Africa/Cairo')::date - (p_days - 1), (now() at time zone 'Africa/Cairo')::date, interval '1 day') d
      left join public.signup_events e
        on (e.ts at time zone 'Africa/Cairo')::date = d::date
       and (p_via is null or (p_via = 'web') = (coalesce(e.props ->> 'via', '') = 'web'))
     group by d
     order by d;
end;
$$;

-- Where people get stuck: field errors, taken or conflicting identifiers, help taps, sign-in errors, in-app browser trouble.
create function public.admin_signup_problems(p_days int default 14, p_via text default null)
returns table (kind text, detail text, visits bigint, events bigint, last_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  if p_days not between 1 and 90 then raise exception 'choose 1 to 90 days'; end if;
  if p_via is not null and p_via not in ('web', 'app') then raise exception 'unknown source'; end if;
  return query
    with ev as (
      select e.*,
             case when e.step = 'profile_field_error' then 'Field error'
                  when e.step = 'identifier_conflict' then 'Already registered'
                  when e.step = 'help_opened' then 'Asked for help'
                  when e.step like 'inapp\_%' then 'In-app browser'
                  when e.step = 'signup_method_chosen' and e.props ->> 'result' = 'error' then 'Sign-in error'
                  when e.error_code is not null then 'Error code' end as k,
             case when e.step = 'profile_field_error' then e.props ->> 'field'
                  when e.step = 'identifier_conflict' then e.props ->> 'type'
                  when e.step = 'help_opened' then e.props ->> 'from'
                  when e.step like 'inapp\_%' then e.step || coalesce(' · ' || (e.props ->> 'app'), '')
                  when e.step = 'signup_method_chosen' and e.props ->> 'result' = 'error' then e.props ->> 'method'
                  when e.error_code is not null then e.step || ' · ' || e.error_code end as dt
        from public.signup_events e
       where e.ts >= now() - make_interval(days => p_days)
         and (p_via is null or (p_via = 'web') = (coalesce(e.props ->> 'via', '') = 'web'))
    )
    select ev.k, coalesce(ev.dt, '(not named)'), count(distinct ev.session_id), count(*), max(ev.ts)
      from ev
     where ev.k is not null
     group by ev.k, coalesce(ev.dt, '(not named)')
     order by 3 desc, 4 desc
     limit 40;
end;
$$;

-- By ad: visits reaching each step per campaign and placement (the website tags every event with them).
create function public.admin_signup_by_source(p_days int default 14)
returns table (campaign text, placement text, step text, visits bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  if p_days not between 1 and 90 then raise exception 'choose 1 to 90 days'; end if;
  return query
    with tagged as (
      select coalesce(nullif(e.props ->> 'utm_campaign', ''), case when e.props ->> 'via' = 'web' then '(website, no ad tag)' else '(app)' end) as c,
             coalesce(nullif(e.props ->> 'placement', ''), '') as pl, e.step, e.session_id
        from public.signup_events e
       where e.ts >= now() - make_interval(days => p_days)
         and e.step in ('welcome_viewed', 'signup_method_chosen', 'profile_started', 'communities_selected', 'signup_completed')
    ), top as (
      select c from tagged group by c order by count(distinct session_id) desc, c limit 15
    )
    select t.c, t.pl, t.step, count(distinct t.session_id)
      from tagged t join top on top.c = t.c
     group by t.c, t.pl, t.step
     order by t.c, t.pl, t.step;
end;
$$;

-- People who signed in but never finished the profile (no username), at least 30 minutes ago, newest first.
-- last_step is the last funnel step recorded for them; contact them by email or phone.
create function public.admin_unfinished_signups()
returns table (id uuid, email text, phone text, created_at timestamptz, source text, campaign text, last_step text, last_step_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select p.id, u.email::text, u.phone::text, p.created_at,
           coalesce(p.signup_source ->> 'utm_source', case when p.signup_source ? 'ref' then 'invite' when p.signup_source ->> 'via' = 'web' then 'website' else 'app' end),
           p.signup_source ->> 'utm_campaign',
           ls.step, ls.ts
      from public.profiles p
      join auth.users u on u.id = p.id
      left join lateral (select e.step, e.ts from public.signup_events e where e.user_ref = p.id order by e.ts desc, e.id desc limit 1) ls on true
     where p.username is null and p.created_at < now() - interval '30 minutes'
     order by p.created_at desc
     limit 100;
end;
$$;

revoke execute on function public.admin_signup_funnel(int, text), public.admin_signup_daily(int, text),
  public.admin_signup_problems(int, text), public.admin_signup_by_source(int), public.admin_unfinished_signups() from public, anon;
grant execute on function public.admin_signup_funnel(int, text), public.admin_signup_daily(int, text),
  public.admin_signup_problems(int, text), public.admin_signup_by_source(int), public.admin_unfinished_signups() to authenticated;
