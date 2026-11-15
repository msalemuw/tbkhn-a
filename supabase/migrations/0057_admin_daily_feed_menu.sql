-- tabkheen A: the admin "Day by day" chart splits posts into feed posts (signature dishes), menu posts
-- ("Today's menu" dishes) and stories, instead of one combined "posts" number (founder, 2026-11-15).
-- Same rules as 0023: Cairo days, none missing, every staff role can read.

drop function public.admin_daily_stats(int);

create function public.admin_daily_stats(p_days int default 30)
returns table (day date, signups int, orders int, picked_up int, cancelled int,
               feed_posts int, menu_posts int, stories int)
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
             where x.kind = 'signature' and (x.created_at at time zone 'Africa/Cairo')::date = d.day),
           (select count(*)::int from public.posts x
             where x.kind = 'cooking_today' and (x.created_at at time zone 'Africa/Cairo')::date = d.day),
           (select count(*)::int from public.posts x
             where x.kind = 'story' and (x.created_at at time zone 'Africa/Cairo')::date = d.day)
      from generate_series(0, v_days - 1) as g(n),
           lateral (select v_today - (v_days - 1) + g.n as day) d
     order by d.day;
end;
$$;

revoke all on function public.admin_daily_stats(int) from public, anon;
grant execute on function public.admin_daily_stats(int) to authenticated;
