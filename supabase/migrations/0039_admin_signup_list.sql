-- tabkheen A: a plain list of everyone who signed up, newest first, on the admin website's Members tab.
-- Run after 0038. Emails live in Supabase's private auth.users table (not in public.profiles), so the admin
-- page reads them through these staff-only functions.

-- ---------------------------------------------------------------------------
-- Everyone who signed up (finished or not), newest first, p_limit (1 to 200) at a time from p_offset.
-- Same columns as admin_find_members so the Members table can show either, plus WhatsApp, where they came
-- from, whether they finished the profile, and the total number of sign-ups (same on every row).
-- ---------------------------------------------------------------------------
create function public.admin_list_signups(p_limit int default 50, p_offset int default 0)
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
           p.username is not null,
           (count(*) over ())::int
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.admin_staff s on s.user_id = p.id
     order by p.created_at desc, p.id
     limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- The owner's "Download all members" now also carries people who signed in but never finished the profile
-- (column finished = false), so the download holds every email that signed up.
-- ---------------------------------------------------------------------------
drop function public.admin_export_members();
create function public.admin_export_members()
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
           p.username is not null
      from public.profiles p
      join auth.users u on u.id = p.id
     order by p.created_at desc
     limit 100000;
end;
$$;

revoke execute on function public.admin_list_signups(int, int), public.admin_export_members() from public, anon;
grant execute on function public.admin_list_signups(int, int), public.admin_export_members() to authenticated;
