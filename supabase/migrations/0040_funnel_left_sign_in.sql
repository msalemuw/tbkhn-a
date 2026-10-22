-- tabkheen A: the sign-up funnel's "Where people get stuck" list also counts people who tapped Google and came back to
-- the page without signing in, and people who closed Apple's window (new website events, docs/SIGNUP-FUNNEL.md).
-- Same signature as before, so the existing grants stay.

-- Where people get stuck: field errors, taken or conflicting identifiers, help taps, sign-in errors, in-app browser trouble.
create or replace function public.admin_signup_problems(p_days int default 14, p_via text default null)
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
                  when e.step = 'google_returned_no_sign_in' then 'Left Google without signing in'
                  when e.step = 'apple_cancelled' then 'Closed Apple sign-in'
                  when e.step = 'signup_method_chosen' and e.props ->> 'result' = 'error' then 'Sign-in error'
                  when e.error_code is not null then 'Error code' end as k,
             case when e.step = 'profile_field_error' then e.props ->> 'field'
                  when e.step = 'identifier_conflict' then e.props ->> 'type'
                  when e.step = 'help_opened' then e.props ->> 'from'
                  when e.step like 'inapp\_%' then e.step || coalesce(' · ' || (e.props ->> 'app'), '')
                  when e.step in ('google_returned_no_sign_in', 'apple_cancelled') then coalesce(e.props ->> 'app', 'browser')
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
