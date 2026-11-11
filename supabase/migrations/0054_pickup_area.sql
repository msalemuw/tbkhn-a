-- tabkheen A: pickup spots are private until the cook accepts (founder, 2026-11-11, safety).
-- Home cooks hand out their pickup point, so a stranger browsing the Menu must not see the exact building.
-- Step 1 (this migration, additive and safe for apps already in the stores): every pickup point gets a public
-- "area" position, the real spot moved a random 250 to 450 metres in a random direction. It is chosen once, when the
-- spot is saved, so reading it many times cannot average back to the real place. The app shows only the area (a circle
-- on the map, distance, the cook's area name) until the cook accepts an order, then the exact spot to that buyer.
-- Step 2 (later, once every installed app version uses the area): hide label, lat and lng from everyone but the owner
-- and the accepted buyer. Not done here so that the app versions already installed keep working.

alter table public.pickup_points
  add column if not exists area_lat double precision,
  add column if not exists area_lng double precision;

create or replace function public.pickup_points_set_area() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_angle double precision := random() * 2 * pi();
  v_metres double precision := 250 + random() * 200;
begin
  if tg_op = 'INSERT' or new.lat is distinct from old.lat or new.lng is distinct from old.lng or new.area_lat is null then
    new.area_lat := new.lat + (v_metres * cos(v_angle)) / 111320.0;
    new.area_lng := new.lng + (v_metres * sin(v_angle)) / (111320.0 * greatest(cos(radians(new.lat)), 0.05));
  end if;
  return new;
end $$;

drop trigger if exists pickup_points_area on public.pickup_points;
create trigger pickup_points_area before insert or update of lat, lng on public.pickup_points
  for each row execute function public.pickup_points_set_area();

-- Existing spots: one random shift each.
with r as (
  select id, random() * 2 * pi() as a, 250 + random() * 200 as d from public.pickup_points where area_lat is null
)
update public.pickup_points p
   set area_lat = p.lat + (r.d * cos(r.a)) / 111320.0,
       area_lng = p.lng + (r.d * sin(r.a)) / (111320.0 * greatest(cos(radians(p.lat)), 0.05))
  from r where r.id = p.id;
