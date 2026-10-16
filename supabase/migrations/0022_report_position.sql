-- Live distance, part 2: a member's phone reports "I am here now" through report_position(), which stamps the time on
-- every call. Before, the time was only stamped when the point changed, so a phone that had not moved (or whose point
-- was saved before the time column existed) looked stale and its posts showed no distance.

create or replace function public.report_position(p_lat double precision, p_lng double precision)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set last_lat = p_lat, last_lng = p_lng, located_at = now()
   where id = auth.uid()
     and p_lat between -90 and 90
     and p_lng between -180 and 180;
$$;

revoke execute on function public.report_position(double precision, double precision) from public, anon;
grant execute on function public.report_position(double precision, double precision) to authenticated;
