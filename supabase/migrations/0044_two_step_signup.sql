-- tabkheen A: sign-up now has two steps (founder, 2026-10-25). Step 1 (photo, name, username) is saved on its own;
-- step 2 (communities, how you heard, InstaPay) finishes it. A profile counts as finished only once it has a username
-- AND an area, so people who stopped between the steps still show as "not finished" and in the unfinished list.
-- Run after 0043. Same functions as before with only that definition changed; nothing is dropped or deleted.

create or replace function public.admin_list_signups(p_limit int default 50, p_offset int default 0)
returns table (id uuid, username text, display_name text, phone text, email text, area text, governorate text,
               created_at timestamptz, suspended_at timestamptz, suspended_reason text, staff_role text,
               posts int, orders int, open_reports int, verified_at timestamptz,
               banned_at timestamptz, warnings int, notes int,
               whatsapp text, source text, via text, finished boolean, total int)
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
           (count(*) over ())::int
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.admin_staff s on s.user_id = p.id
     order by p.created_at desc, p.id
     limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;

create or replace function public.admin_export_members()
returns table (id uuid, username text, display_name text, email text, phone text, whatsapp text, country_code text,
               governorate text, area text, loves text, heard_from text, heard_detail text, source text,
               joined_at timestamptz, verified_at timestamptz, suspended_at timestamptz, posts int, orders int,
               finished boolean)
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
           (p.username is not null and p.area is not null)
      from public.profiles p
      join auth.users u on u.id = p.id
     order by p.created_at desc
     limit 100000;
end;
$$;

create or replace function public.admin_unfinished_signups()
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
     where (p.username is null or p.area is null) and p.created_at < now() - interval '30 minutes'
     order by p.created_at desc
     limit 100;
end;
$$;
