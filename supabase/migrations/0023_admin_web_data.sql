-- tabkheen A: data for the web admin (tabkheen-a.com/admin): charts and downloads.
-- Run after 0022. Charts are open to every staff role; downloads (which carry emails and phone numbers)
-- are owner only, and each download is written to the admin action log.

-- ---------------------------------------------------------------------------
-- Per day, Cairo time, for the last p_days days (1 to 365): finished sign-ups, orders placed, orders picked up,
-- orders cancelled or declined that day, and posts. Days with nothing show as zeros so charts have no gaps.
-- ---------------------------------------------------------------------------
create function public.admin_daily_stats(p_days int default 30)
returns table (day date, signups int, orders int, picked_up int, cancelled int, posts int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_today date := (now() at time zone 'Africa/Cairo')::date;
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select d.day,
           (select count(*)::int from public.profiles p
             where p.username is not null and (p.created_at at time zone 'Africa/Cairo')::date = d.day),
           (select count(*)::int from public.reservations r
             where (r.created_at at time zone 'Africa/Cairo')::date = d.day),
           (select count(*)::int from public.reservation_events e
             where e.event = 'picked_up' and (e.created_at at time zone 'Africa/Cairo')::date = d.day),
           (select count(*)::int from public.reservation_events e
             where e.event in ('cancelled', 'declined') and (e.created_at at time zone 'Africa/Cairo')::date = d.day),
           (select count(*)::int from public.posts x
             where (x.created_at at time zone 'Africa/Cairo')::date = d.day)
      from generate_series(0, v_days - 1) as g(n),
           lateral (select v_today - (v_days - 1) + g.n as day) d
     order by d.day;
end;
$$;

-- ---------------------------------------------------------------------------
-- Where finished members come from: p_by is 'governorate', 'area', 'heard_from', 'loves' or 'source'
-- (the ad or link they signed up from). Biggest first; blanks show as "Not given".
-- ---------------------------------------------------------------------------
create function public.admin_member_breakdown(p_by text)
returns table (label text, members int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  if p_by not in ('governorate', 'area', 'heard_from', 'loves', 'source') then raise exception 'unknown breakdown'; end if;
  return query
    select coalesce(nullif(trim(v.value), ''), 'Not given'), count(*)::int
      from (select case p_by
                     when 'governorate' then p.governorate
                     when 'area' then p.area
                     when 'heard_from' then p.heard_from
                     when 'loves' then p.loves
                     else coalesce(p.signup_source ->> 'utm_source', case when p.signup_source ? 'ref' then 'invite' else 'direct' end)
                   end as value
              from public.profiles p
             where p.username is not null) v
     group by 1
     order by 2 desc, 1
     limit 40;
end;
$$;

-- ---------------------------------------------------------------------------
-- Downloads (owner only, logged). Everything the owner can already look up one by one, as a list.
-- ---------------------------------------------------------------------------
create function public.admin_export_members()
returns table (id uuid, username text, display_name text, email text, phone text, whatsapp text, country_code text,
               governorate text, area text, loves text, heard_from text, heard_detail text, source text,
               joined_at timestamptz, verified_at timestamptz, suspended_at timestamptz, posts int, orders int)
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
           (select count(*)::int from public.reservations x where p.id in (x.buyer_id, x.cook_id))
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.username is not null
     order by p.created_at desc
     limit 100000;
end;
$$;

create function public.admin_export_orders()
returns table (code text, created_at timestamptz, status text, payment_status text, dish_name text, plates int,
               price_egp numeric, total_egp numeric, pickup_at timestamptz, cancel_reason text, community text,
               buyer text, cook text)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner']);
  perform public.log_admin_action('data_exported', 'orders', 'all', null);
  return query
    select upper(left(r.id::text, 8)), r.created_at, r.status, r.payment_status, p.dish_name, r.plates,
           p.price_egp, p.price_egp * r.plates, r.pickup_at, r.cancel_reason, c.name,
           coalesce('@' || b.username, b.display_name), coalesce('@' || k.username, k.display_name)
      from public.reservations r
      join public.posts p on p.id = r.post_id
      join public.profiles b on b.id = r.buyer_id
      join public.profiles k on k.id = r.cook_id
      left join public.communities c on c.id = p.community_id
     order by r.created_at desc
     limit 100000;
end;
$$;

revoke execute on function public.admin_daily_stats(int), public.admin_member_breakdown(text),
  public.admin_export_members(), public.admin_export_orders() from public, anon;
grant execute on function public.admin_daily_stats(int), public.admin_member_breakdown(text),
  public.admin_export_members(), public.admin_export_orders() to authenticated;
