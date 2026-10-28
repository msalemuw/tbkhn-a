-- Admin sign-up funnel: who has opened the Android app (the Google Play closed test), newest first.
-- Google Play only shows the NUMBER of testers who opted in, never their names. This lists the accounts that signed in
-- from the Android app (a sign-up event from "android ..." that is not the website), with the step they reached
-- (0 signed in only .. 3 all steps), so the founder can compare it with the tester email list.
-- Run after 0047. Read-only; nothing is changed or deleted.

create function public.admin_android_testers()
returns table (id uuid, username text, display_name text, email text, first_seen timestamptz, last_seen timestamptz,
               events int, app_version text, os text, stage int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select p.id, p.username, p.display_name, u.email::text, a.first_seen, a.last_seen, a.events, a.app_version, a.os,
           (case when p.username is null then 0 when p.area is null then 1 when p.extras_done_at is null then 2 else 3 end)
      from (
        select e.user_ref, min(e.ts) as first_seen, max(e.ts) as last_seen, count(*)::int as events,
               (array_agg(e.app_version order by e.ts desc))[1] as app_version,
               (array_agg(e.os order by e.ts desc))[1] as os
          from public.signup_events e
         where e.user_ref is not null and e.os like 'android%' and e.app_version is distinct from 'web'
         group by e.user_ref
      ) a
      join public.profiles p on p.id = a.user_ref
      join auth.users u on u.id = p.id
     order by a.last_seen desc
     limit 500;
end;
$$;

revoke execute on function public.admin_android_testers() from public, anon;
grant execute on function public.admin_android_testers() to authenticated;
