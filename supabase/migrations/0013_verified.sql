-- Verified mark (founder, 2026-10-12): shown next to a name only when an admin has seen the person's
-- ID and confirmed their identity. Staff turn it on or off; nobody can set it for themselves.
alter table public.profiles add column if not exists verified_at timestamptz;
grant select (verified_at) on public.profiles to anon, authenticated;

create function public.admin_set_verified(p_user_id uuid, p_verified boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  update public.profiles
     set verified_at = case when p_verified then coalesce(verified_at, now()) end
   where id = p_user_id;
  if not found then raise exception 'member not found'; end if;
  perform public.log_admin_action(case when p_verified then 'member_verified' else 'member_unverified' end,
                                  'profile', p_user_id::text, null);
end;
$$;
revoke execute on function public.admin_set_verified(uuid, boolean) from public, anon;
grant execute on function public.admin_set_verified(uuid, boolean) to authenticated;

-- Members search also returns the verified state.
drop function public.admin_find_members(text);
create function public.admin_find_members(p_query text)
returns table (id uuid, username text, display_name text, phone text, email text, area text, governorate text,
               created_at timestamptz, suspended_at timestamptz, suspended_reason text, staff_role text,
               posts int, orders int, open_reports int, verified_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := lower(trim(p_query));
  v_digits text := regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g');
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  if char_length(v_q) < 2 then return; end if;
  return query
    select p.id, p.username, p.display_name, u.phone::text, u.email::text, p.area, p.governorate,
           p.created_at, p.suspended_at, p.suspended_reason, s.role,
           (select count(*)::int from public.posts x where x.author_id = p.id),
           (select count(*)::int from public.reservations x where p.id in (x.buyer_id, x.cook_id)),
           (select count(*)::int from public.reports x
             where x.status = 'open'
               and (x.profile_id = p.id or x.post_id in (select y.id from public.posts y where y.author_id = p.id))),
           p.verified_at
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.admin_staff s on s.user_id = p.id
     where p.username like '%' || v_q || '%'
        or lower(p.display_name) like '%' || v_q || '%'
        or lower(u.email::text) like '%' || v_q || '%'
        or (char_length(v_digits) >= 6 and u.phone::text like '%' || right(v_digits, 10) || '%')
     order by p.created_at desc
     limit 30;
end;
$$;
revoke execute on function public.admin_find_members(text) from public, anon;
grant execute on function public.admin_find_members(text) to authenticated;
