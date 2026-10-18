-- Behaviour checks for 0035_menu_switch.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('d8000000-0000-0000-0000-000000000001', 'menu-owner@example.com'),
  ('d8000000-0000-0000-0000-000000000002', 'menu-mod@example.com'),
  ('d8000000-0000-0000-0000-000000000003', 'menu-support@example.com'),
  ('d8000000-0000-0000-0000-000000000004', 'menu-cook@example.com'),
  ('d8000000-0000-0000-0000-000000000005', 'menu-buyer@example.com');
insert into public.admin_staff (user_id, role) values
  ('d8000000-0000-0000-0000-000000000001', 'owner'),
  ('d8000000-0000-0000-0000-000000000002', 'moderator'),
  ('d8000000-0000-0000-0000-000000000003', 'support');
insert into public.pickup_points (id, owner_id, label, lat, lng) values ('d8100000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000004', 'Gate', 30.0, 31.0);
insert into public.posts (id, author_id, kind, dish_name, price_egp, portions_total, portions_left, ready_at, pickup_point_id, expires_at)
  values ('d8200000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000004', 'cooking_today', 'Koshari', 40, 10, 10, now() + interval '2 hours', 'd8100000-0000-0000-0000-000000000001', now() + interval '8 hours');

-- on by default, and the app can read the switch and the message signed out
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (public.app_status() ->> 'menu_enabled')::boolean, 'menu on by default';
  assert (public.app_status() ->> 'menu_message') like '%coming soon%', 'default message';
end $$;

-- support cannot change it
set role authenticated;
select pg_temp.act_as('d8000000-0000-0000-0000-000000000003');
do $$ begin
  begin perform public.admin_set_control('menu_enabled', 'false'::jsonb); raise exception 'FAIL: support switched menu'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- moderator can; wrong types and short messages are refused
select pg_temp.act_as('d8000000-0000-0000-0000-000000000002');
do $$ begin
  begin perform public.admin_set_control('menu_enabled', '"off"'::jsonb); raise exception 'FAIL: string accepted'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_set_control('menu_message', '"hi"'::jsonb); raise exception 'FAIL: short message'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.admin_set_control('menu_message', '"Menu and orders are coming soon. Stay tuned!"'::jsonb);
  perform public.admin_set_control('menu_enabled', 'false'::jsonb);
  assert not (public.app_status() ->> 'menu_enabled')::boolean, 'menu off';
  assert (public.app_status() ->> 'menu_message') = 'Menu and orders are coming soon. Stay tuned!', 'message saved';
end $$;

-- while off, a new order is refused with the menu message; posting still works
select pg_temp.act_as('d8000000-0000-0000-0000-000000000005');
do $$ begin
  begin perform public.reserve_plates('d8200000-0000-0000-0000-000000000001', 1); raise exception 'FAIL: ordered while menu off';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; assert sqlerrm like '%not open yet%', sqlerrm; end;
end $$;
reset role;
do $$ begin
  assert (select portions_left from public.posts where id = 'd8200000-0000-0000-0000-000000000001') = 10, 'plates untouched';
  insert into public.posts (author_id, kind) values ('d8000000-0000-0000-0000-000000000004', 'story');
end $$;

-- back on: orders work again
set role authenticated;
select pg_temp.act_as('d8000000-0000-0000-0000-000000000002');
do $$ begin perform public.admin_set_control('menu_enabled', 'true'::jsonb); end $$;
select pg_temp.act_as('d8000000-0000-0000-0000-000000000005');
do $$ begin
  perform public.reserve_plates('d8200000-0000-0000-0000-000000000001', 1);
  assert (select count(*) from public.reservations where buyer_id = 'd8000000-0000-0000-0000-000000000005') = 1, 'order placed';
end $$;
-- ordering paused still has its own message
reset role;
update public.app_controls set value = 'false'::jsonb where key = 'ordering_enabled';
set role authenticated;
select pg_temp.act_as('d8000000-0000-0000-0000-000000000005');
do $$ begin
  begin perform public.reserve_plates('d8200000-0000-0000-0000-000000000001', 1); raise exception 'FAIL: ordered while paused';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; assert sqlerrm like '%paused%', sqlerrm; end;
end $$;
reset role;
update public.app_controls set value = 'true'::jsonb where key = 'ordering_enabled';
do $$ begin
  assert (select count(*) from public.admin_actions where action = 'control_changed' and target_id in ('menu_enabled', 'menu_message')) = 3, 'changes logged';
end $$;
\echo MENU SWITCH CHECKS PASSED
