-- Behaviour checks for 0030_admin_order_disputes.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('c1000000-0000-0000-0000-000000000001', 'disp-owner@example.com'),
  ('c1000000-0000-0000-0000-000000000002', 'disp-support@example.com'),
  ('c1000000-0000-0000-0000-000000000003', 'disp-cook@example.com'),
  ('c1000000-0000-0000-0000-000000000004', 'disp-buyer@example.com'),
  ('c1000000-0000-0000-0000-000000000005', 'disp-mod@example.com');
insert into public.admin_staff (user_id, role) values
  ('c1000000-0000-0000-0000-000000000001', 'owner'),
  ('c1000000-0000-0000-0000-000000000002', 'support'),
  ('c1000000-0000-0000-0000-000000000005', 'moderator');
insert into public.pickup_points (id, owner_id, label, lat, lng) values ('c3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'Gate', 30.0, 31.0);
insert into public.posts (id, author_id, kind, dish_name, price_egp, portions_total, portions_left, ready_at, pickup_point_id, expires_at)
  values ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'cooking_today', 'Molokhia', 50, 5, 3, now() + interval '2 hours', 'c3000000-0000-0000-0000-000000000001', now() + interval '8 hours');
-- two plates already reserved by the buyer (portions_left 3 of 5 means 2 are taken)
insert into public.reservations (id, post_id, buyer_id, cook_id, plates, status)
  values ('c4000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000003', 2, 'pending');
delete from public.notifications where user_id in ('c1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000004');

set role authenticated;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000002');
do $$ begin
  perform public.admin_add_order_note('c4000000-0000-0000-0000-000000000001', 'Buyer rang support: cook not answering');
  assert (select count(*) from public.admin_order_timeline('c4000000-0000-0000-0000-000000000001') where event = 'staff_note') = 1, 'note in the timeline';
  begin perform public.admin_force_order_status('c4000000-0000-0000-0000-000000000001', 'cancelled', 'support cannot'); raise exception 'FAIL: support forced a status';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_add_order_note('c4000000-0000-0000-0000-000000000001', ' '); raise exception 'FAIL: empty note';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- a member cannot use any of it
select pg_temp.act_as('c1000000-0000-0000-0000-000000000004');
do $$ begin
  begin perform public.admin_force_order_status('c4000000-0000-0000-0000-000000000001', 'picked_up', 'I want it'); raise exception 'FAIL: buyer forced status';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_add_order_note('c4000000-0000-0000-0000-000000000001', 'hi'); raise exception 'FAIL: buyer added note';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

select pg_temp.act_as('c1000000-0000-0000-0000-000000000005');
do $$ begin
  begin perform public.admin_force_order_status('c4000000-0000-0000-0000-000000000001', 'cancelled', ''); raise exception 'FAIL: no reason';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_force_order_status('c4000000-0000-0000-0000-000000000001', 'pending', 'same'); raise exception 'FAIL: same status';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_force_order_status('c4000000-0000-0000-0000-000000000001', 'flying', 'nope'); raise exception 'FAIL: bad status';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  -- cancel on the buyer's behalf: plates go back
  perform public.admin_force_order_status('c4000000-0000-0000-0000-000000000001', 'cancelled', 'Buyer asked support to cancel');
end $$;
reset role;
do $$ declare n int; begin
  assert (select status from public.reservations where id = 'c4000000-0000-0000-0000-000000000001') = 'cancelled', 'cancelled';
  assert (select cancel_reason from public.reservations where id = 'c4000000-0000-0000-0000-000000000001') = 'Staff: Buyer asked support to cancel', 'reason kept';
  assert (select portions_left from public.posts where id = 'c2000000-0000-0000-0000-000000000001') = 5, 'plates returned';
  -- both told, with the staff wording, and not also the normal "buyer cancelled" one
  assert (select count(*) from public.notifications where kind = 'order_staff' and payload ->> 'reservation_id' = 'c4000000-0000-0000-0000-000000000001') = 2, 'both notified';
  assert not exists (select 1 from public.notifications where kind = 'order_cancelled' and payload ->> 'reservation_id' = 'c4000000-0000-0000-0000-000000000001'), 'no misleading buyer-cancelled notice';
  assert current_setting('app.staff_action', true) in ('', 'off') or current_setting('app.staff_action', true) is null, 'flag reset';
end $$;

set role authenticated;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
do $$ begin
  -- bring it back: plates are taken again
  perform public.admin_force_order_status('c4000000-0000-0000-0000-000000000001', 'accepted', 'Cancelled by mistake');
end $$;
reset role;
do $$ begin
  assert (select portions_left from public.posts where id = 'c2000000-0000-0000-0000-000000000001') = 3, 'plates taken again';
  -- not enough plates left to revive
  update public.posts set portions_left = 1 where id = 'c2000000-0000-0000-0000-000000000001';
  update public.reservations set status = 'cancelled' where id = 'c4000000-0000-0000-0000-000000000001';
end $$;
set role authenticated;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.admin_force_order_status('c4000000-0000-0000-0000-000000000001', 'ready', 'try'); raise exception 'FAIL: revived without plates';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; assert sqlerrm like '%not enough plates%', sqlerrm; end;
end $$;
reset role;
-- stuck filter: open orders untouched for a day
update public.posts set portions_left = 3 where id = 'c2000000-0000-0000-0000-000000000001';
update public.reservations set status = 'ready', updated_at = now() - interval '2 days' where id = 'c4000000-0000-0000-0000-000000000001';
set role authenticated;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000002');
do $$ begin
  assert (select count(*) from public.admin_find_orders('', 'stuck') where id = 'c4000000-0000-0000-0000-000000000001') = 1, 'stuck order listed';
  assert (select count(*) from public.admin_find_orders('', 'open') where id = 'c4000000-0000-0000-0000-000000000001') = 1, 'also open';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.admin_actions where action in ('order_note_added', 'order_status_forced')) = 3, 'logged';
end $$;
\echo ADMIN ORDER DISPUTE CHECKS PASSED
