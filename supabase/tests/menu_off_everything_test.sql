-- Behaviour checks for 0036_menu_off_everything.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('d9000000-0000-0000-0000-000000000001', 'moff-mod@example.com'),
  ('d9000000-0000-0000-0000-000000000002', 'moff-cook@example.com'),
  ('d9000000-0000-0000-0000-000000000003', 'moff-buyer@example.com');
insert into public.admin_staff (user_id, role) values ('d9000000-0000-0000-0000-000000000001', 'moderator');
insert into public.pickup_points (id, owner_id, label, lat, lng) values ('d9100000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000002', 'Gate', 30.0, 31.0);
insert into public.posts (id, author_id, kind, dish_name, price_egp, portions_total, portions_left, ready_at, pickup_point_id, expires_at)
  values ('d9200000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000002', 'cooking_today', 'Koshari', 40, 10, 10, now() + interval '2 hours', 'd9100000-0000-0000-0000-000000000001', now() + interval '8 hours');
-- a story and a signature post must survive switching the menu off
insert into public.posts (id, author_id, kind) values ('d9200000-0000-0000-0000-000000000002', 'd9000000-0000-0000-0000-000000000002', 'story');
-- an order already placed before the switch
insert into public.reservations (id, post_id, buyer_id, cook_id, plates, status)
  values ('d9300000-0000-0000-0000-000000000001', 'd9200000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000003', 'd9000000-0000-0000-0000-000000000002', 1, 'accepted');

set role authenticated;
select pg_temp.act_as('d9000000-0000-0000-0000-000000000001');
do $$ begin
  perform public.admin_set_control('menu_enabled', 'false'::jsonb);
end $$;
reset role;
do $$ begin
  assert (select expires_at <= now() from public.posts where id = 'd9200000-0000-0000-0000-000000000001'), 'menu dish ended';
  assert (select expires_at is null or expires_at > now() from public.posts where id = 'd9200000-0000-0000-0000-000000000002'), 'story kept';
  assert (select status from public.reservations where id = 'd9300000-0000-0000-0000-000000000001') = 'accepted', 'placed order untouched';
  assert (select (details ->> 'dishes_ended')::int from public.admin_actions where action = 'control_changed' and target_id = 'menu_enabled' order by created_at desc limit 1) >= 1, 'ended count logged';
end $$;

-- the cook cannot post a new menu dish, but can still post a story
set role authenticated;
select pg_temp.act_as('d9000000-0000-0000-0000-000000000002');
do $$ begin
  begin
    insert into public.posts (author_id, kind, dish_name, price_egp, portions_total, portions_left, ready_at, pickup_point_id, expires_at)
      values ('d9000000-0000-0000-0000-000000000002', 'cooking_today', 'Molokhia', 50, 5, 5, now() + interval '2 hours', 'd9100000-0000-0000-0000-000000000001', now() + interval '8 hours');
    raise exception 'FAIL: menu dish posted while menu off';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; assert sqlerrm like '%not open yet%', sqlerrm; end;
  insert into public.posts (author_id, kind) values ('d9000000-0000-0000-0000-000000000002', 'story');
end $$;

-- back on: the cook can post a dish again
select pg_temp.act_as('d9000000-0000-0000-0000-000000000001');
do $$ begin perform public.admin_set_control('menu_enabled', 'true'::jsonb); end $$;
select pg_temp.act_as('d9000000-0000-0000-0000-000000000002');
do $$ begin
  insert into public.posts (author_id, kind, dish_name, price_egp, portions_total, portions_left, ready_at, pickup_point_id, expires_at)
    values ('d9000000-0000-0000-0000-000000000002', 'cooking_today', 'Molokhia', 50, 5, 5, now() + interval '2 hours', 'd9100000-0000-0000-0000-000000000001', now() + interval '8 hours');
end $$;
reset role;
\echo MENU OFF EVERYTHING CHECKS PASSED
