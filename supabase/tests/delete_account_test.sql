-- Behaviour checks for 0015_delete_account.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;
reset role;
insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-000000000001', 'cook@example.com'),
  ('d0000000-0000-0000-0000-000000000002', 'buyer@example.com'),
  ('d0000000-0000-0000-0000-000000000003', 'del-owner@example.com'),
  ('d0000000-0000-0000-0000-000000000004', 'del-owner2@example.com');
insert into public.profiles (id, username, display_name) values
  ('d0000000-0000-0000-0000-000000000001', 'del_cook', 'Cook'),
  ('d0000000-0000-0000-0000-000000000002', 'del_buyer', 'Buyer'),
  ('d0000000-0000-0000-0000-000000000003', 'del_owner', 'Owner'),
  ('d0000000-0000-0000-0000-000000000004', 'del_owner2', 'Owner2')
on conflict (id) do update set username = excluded.username, display_name = excluded.display_name;
-- the earlier admin tests share this database: this test needs its owner to be the only one
delete from public.admin_staff;
insert into public.admin_staff (user_id, role) values ('d0000000-0000-0000-0000-000000000003', 'owner');
insert into public.pickup_points (id, owner_id, label, lat, lng)
  values ('d3000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Home', 30.0, 31.0);
insert into public.posts (id, author_id, kind, dish_name, price_egp, portions_total, ready_at, pickup_point_id, expires_at)
  values ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'cooking_today', 'Koshary', 50, 5,
          now() + interval '1 hour', 'd3000000-0000-0000-0000-000000000001', now() + interval '5 hours');
insert into public.reservations (id, post_id, buyer_id, cook_id, plates, status)
  values ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 1, 'pending');
insert into public.signup_events (session_id, user_ref, step) values ('s1', 'd0000000-0000-0000-0000-000000000001', 'welcome_viewed');

set role anon;
do $$ begin
  begin perform public.delete_my_account(); raise exception 'FAIL: visitor deleted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set role authenticated;
select pg_temp.act_as('d0000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.delete_my_account(); raise exception 'FAIL: deleted with an open order';
  exception when others then assert sqlerrm = 'open orders', 'open orders blocks: ' || sqlerrm; end;
end $$;
select pg_temp.act_as('d0000000-0000-0000-0000-000000000003');
do $$ begin
  begin perform public.delete_my_account(); raise exception 'FAIL: last owner deleted';
  exception when others then assert sqlerrm = 'last owner', 'last owner blocks: ' || sqlerrm; end;
end $$;
reset role;

update public.reservations set status = 'picked_up' where id = 'd2000000-0000-0000-0000-000000000001';
set role authenticated;
select pg_temp.act_as('d0000000-0000-0000-0000-000000000001');
select public.delete_my_account();
reset role;
do $$ begin
  assert not exists (select 1 from auth.users where id = 'd0000000-0000-0000-0000-000000000001'), 'sign-in removed';
  assert not exists (select 1 from public.profiles where id = 'd0000000-0000-0000-0000-000000000001'), 'profile removed';
  assert not exists (select 1 from public.posts where id = 'd1000000-0000-0000-0000-000000000001'), 'posts removed';
  assert not exists (select 1 from public.reservations where id = 'd2000000-0000-0000-0000-000000000001'), 'order history removed';
  assert exists (select 1 from public.profiles where id = 'd0000000-0000-0000-0000-000000000002'), 'the buyer stays';
  assert exists (select 1 from public.signup_events where session_id = 's1' and user_ref is null), 'funnel row kept, unlinked';
end $$;

-- A second owner exists: the first may now leave.
insert into public.admin_staff (user_id, role) values ('d0000000-0000-0000-0000-000000000004', 'owner');
set role authenticated;
select pg_temp.act_as('d0000000-0000-0000-0000-000000000003');
select public.delete_my_account();
reset role;
do $$ begin
  assert not exists (select 1 from public.admin_staff where user_id = 'd0000000-0000-0000-0000-000000000003'), 'owner left with another owner in place';
end $$;
select 'delete_account_test ok';
