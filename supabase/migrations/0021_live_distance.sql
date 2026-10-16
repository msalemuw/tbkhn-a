-- Live distance between two members on the Home feed ("52 km away" = how far the cook is from you right now).
-- Positions stay private: other members never read last_lat / last_lng. They call people_distance(), which returns
-- only a distance rounded up to a whole km, and only for people whose position was updated in the last 2 days.

alter table public.profiles add column if not exists located_at timestamptz;

create or replace function public.profiles_stamp_located()
returns trigger
language plpgsql
as $$
begin
  if new.last_lat is distinct from old.last_lat or new.last_lng is distinct from old.last_lng then
    new.located_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_stamp_located on public.profiles;
create trigger profiles_stamp_located before update on public.profiles
  for each row execute function public.profiles_stamp_located();

create or replace function public.people_distance(p_ids uuid[], p_lat double precision, p_lng double precision)
returns table (id uuid, meters int)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         (ceil(
           6371000 * 2 * asin(sqrt(
             power(sin(radians(p.last_lat - p_lat) / 2), 2) +
             cos(radians(p_lat)) * cos(radians(p.last_lat)) * power(sin(radians(p.last_lng - p_lng) / 2), 2)
           )) / 1000.0
         ) * 1000)::int as meters
  from public.profiles p
  where auth.uid() is not null
    and p.id = any (p_ids[1:100])
    and p.last_lat is not null
    and p.last_lng is not null
    and p.located_at > now() - interval '2 days';
$$;

revoke execute on function public.people_distance(uuid[], double precision, double precision) from public, anon;
grant execute on function public.people_distance(uuid[], double precision, double precision) to authenticated;
