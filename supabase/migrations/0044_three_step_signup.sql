-- tabkheen A: sign-up has three steps (founder, 2026-10-25), and the admin tells the steps apart.
--   step 0  signed in only (no username yet)
--   step 1  photo, name and username saved (a username, no area yet)
--   step 2  required details saved (an area): the account is complete
--   step 3  the optional extras were saved or skipped (profiles.extras_done_at)
-- A profile counts as "finished" once it has a username AND an area (step 2). Nothing is dropped or deleted:
-- the three admin functions are replaced with a stage column added, and one small count function is new.
-- Run after 0043. Profiles that already had an area (the old one-page sign-up) count as step 3.

alter table public.profiles add column if not exists extras_done_at timestamptz;
grant update (extras_done_at) on public.profiles to authenticated;
update public.profiles set extras_done_at = coalesce(created_at, now()) where area is not null and extras_done_at is null;

drop function if exists public.admin_list_signups(int, int);
drop function if exists public.admin_export_members();
drop function if exists public.admin_unfinished_signups();

create function public.admin_list_signups(p_limit int default 50, p_offset int default 0)
returns table (id uuid, username text, display_name text, phone text, email text, area text, governorate text,
               created_at timestamptz, suspended_at timestamptz, suspended_reason text, staff_role text,
               posts int, orders int, open_reports int, verified_at timestamptz,
               banned_at timestamptz, warnings int, notes int,
               whatsapp text, source text, via text, finished boolean, stage int, total int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select p.id, p.username, p.display_name, u.phone::text, u.email::text, p.area, p.governorate,
           p.created_at, p.suspended_at, p.suspended_reason, s.role,
           (select count(*)::int from public.posts x where x.author_id = p.id),
           (select count(*)::int from public.reservations x where p.id in (x.buyer_id, x.cook_id)),
           (select count(*)::int from public.reports x
             where x.status = 'open'
               and (x.profile_id = p.id or x.post_id in (select y.id from public.posts y where y.author_id = p.id))),
           p.verified_at, p.banned_at,
           (select count(*)::int from public.member_warnings w where w.member_id = p.id),
           (select count(*)::int from public.member_notes n where n.member_id = p.id),
           p.whatsapp,
           coalesce(p.signup_source ->> 'utm_source', case when p.signup_source ? 'ref' then 'invite' else 'direct' end),
           case when p.signup_source ->> 'via' = 'web' then 'website' else 'app' end,
           (p.username is not null and p.area is not null),
           (case when p.username is null then 0 when p.area is null then 1 when p.extras_done_at is null then 2 else 3 end),
           (count(*) over ())::int
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.admin_staff s on s.user_id = p.id
     order by p.created_at desc, p.id
     limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;

create function public.admin_export_members()
returns table (id uuid, username text, display_name text, email text, phone text, whatsapp text, country_code text,
               governorate text, area text, loves text, heard_from text, heard_detail text, source text,
               joined_at timestamptz, verified_at timestamptz, suspended_at timestamptz, posts int, orders int,
               finished boolean, signup_step int)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner']);
  perform public.log_admin_action('data_exported', 'members', 'all', null);
  return query
    select p.id, p.username, p.display_name, u.email::text, u.phone::text, p.whatsapp, p.country_code,
           p.governorate, p.area, p.loves, p.heard_from, p.heard_detail,
           coalesce(p.signup_source ->> 'utm_source', case when p.signup_source ? 'ref' then 'invite' else 'direct' end),
           p.created_at, p.verified_at, p.suspended_at,
           (select count(*)::int from public.posts x where x.author_id = p.id),
           (select count(*)::int from public.reservations x where p.id in (x.buyer_id, x.cook_id)),
           (p.username is not null and p.area is not null),
           (case when p.username is null then 0 when p.area is null then 1 when p.extras_done_at is null then 2 else 3 end)
      from public.profiles p
      join auth.users u on u.id = p.id
     order by p.created_at desc
     limit 100000;
end;
$$;

create function public.admin_unfinished_signups()
returns table (id uuid, email text, phone text, created_at timestamptz, source text, campaign text, last_step text, last_step_at timestamptz, stage int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select p.id, u.email::text, u.phone::text, p.created_at,
           coalesce(p.signup_source ->> 'utm_source', case when p.signup_source ? 'ref' then 'invite' when p.signup_source ->> 'via' = 'web' then 'website' else 'app' end),
           p.signup_source ->> 'utm_campaign',
           ls.step, ls.ts,
           (case when p.username is null then 0 when p.area is null then 1 when p.extras_done_at is null then 2 else 3 end)
      from public.profiles p
      join auth.users u on u.id = p.id
      left join lateral (select e.step, e.ts from public.signup_events e where e.user_ref = p.id order by e.ts desc, e.id desc limit 1) ls on true
     where (p.username is null or p.area is null) and p.created_at < now() - interval '30 minutes'
     order by p.created_at desc
     limit 100;
end;
$$;

-- How many members are at each step, for the counts above the Members list.
create function public.admin_signup_stages()
returns table (stage int, members bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select s.stage, count(*) from (
      select (case when p.username is null then 0 when p.area is null then 1 when p.extras_done_at is null then 2 else 3 end) as stage from public.profiles p
    ) s group by s.stage order by s.stage;
end;
$$;

revoke execute on function public.admin_list_signups(int, int), public.admin_export_members(), public.admin_unfinished_signups(),
  public.admin_signup_stages() from public, anon;
grant execute on function public.admin_list_signups(int, int), public.admin_export_members(), public.admin_unfinished_signups(),
  public.admin_signup_stages() to authenticated;
