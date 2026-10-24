-- Admin app: the Members screen opens on the full list (newest first), and the Admin home tiles open "new this week" and "suspended".
-- p_filter is 'all', 'new' (joined in the last 7 days, like the tile) or 'suspended'; p_query narrows by username, name, email or phone.
create function public.admin_list_members(p_filter text default 'all', p_query text default '', p_limit int default 50, p_offset int default 0)
returns table (id uuid, username text, display_name text, phone text, email text, area text, governorate text,
               created_at timestamptz, suspended_at timestamptz, suspended_reason text, staff_role text,
               posts int, orders int, open_reports int, verified_at timestamptz,
               banned_at timestamptz, warnings int, notes int, total int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := lower(trim(coalesce(p_query, '')));
  v_digits text := regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g');
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
           (count(*) over ())::int
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.admin_staff s on s.user_id = p.id
     where (p_filter is null or p_filter = 'all'
            or (p_filter = 'new' and p.created_at > now() - interval '7 days')
            or (p_filter = 'suspended' and p.suspended_at is not null))
       and (v_q = ''
            or p.username like '%' || v_q || '%'
            or lower(p.display_name) like '%' || v_q || '%'
            or lower(u.email::text) like '%' || v_q || '%'
            or (char_length(v_digits) >= 6 and u.phone::text like '%' || right(v_digits, 10) || '%'))
     order by p.created_at desc, p.id
     limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke execute on function public.admin_list_members(text, text, int, int) from public, anon;
grant execute on function public.admin_list_members(text, text, int, int) to authenticated;
