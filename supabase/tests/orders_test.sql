-- Behaviour checks for 0002_orders_and_notifications.sql (run after schema_test.sql, same database).
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;
reset role;
delete from public.notifications;

-- the buyer follows the cook, so a new cooking-today post notifies them
insert into public.follows (follower_id, followee_id) values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');

set role authenticated;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
insert into public.posts (id, author_id, kind, community_id, dish_name, price_egp, portions_total, ready_at, pickup_point_id, expires_at, main_ingredients, cuisine)
  values ('cccccccc-0000-0000-0000-000000000002', auth.uid(), 'cooking_today', 'aaaaaaaa-0000-0000-0000-000000000001',
          'Koshari', 60, 4, now() + interval '2 hours', 'bbbbbbbb-0000-0000-0000-000000000001', now() + interval '8 hours',
          '{Vegetables}', 'Egyptian');

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$ begin
  assert (select count(*) from public.notifications where kind = 'cooking_today') = 1, 'follower told about cooking today';
  begin
    perform public.reserve_plates('cccccccc-0000-0000-0000-000000000002', 1, now() + interval '30 minutes', null);
    raise exception 'FAIL: pickup before ready time accepted';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.reserve_plates('cccccccc-0000-0000-0000-000000000002', 1, now() + interval '9 hours', null);
    raise exception 'FAIL: pickup after end of day accepted';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
select id as r from public.reserve_plates('cccccccc-0000-0000-0000-000000000002', 2, now() + interval '3 hours', '  less spicy  ') \gset
do $$ begin
  assert (select note from public.reservations where post_id = 'cccccccc-0000-0000-0000-000000000002') = 'less spicy', 'note trimmed';
  assert (select pickup_at > now() + interval '2 hours' from public.reservations where post_id = 'cccccccc-0000-0000-0000-000000000002'), 'pickup time kept';
end $$;
select public.set_payment_status(:'r', 'sent');

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
do $$ begin
  assert (select count(*) from public.notifications where kind = 'order_new') = 1, 'cook told about new order';
  assert (select count(*) from public.notifications where kind = 'payment_sent') = 1, 'cook told payment sent';
end $$;
select public.set_reservation_status(:'r', 'accepted');
select public.set_reservation_status(:'r', 'ready');
select public.set_reservation_status(:'r', 'picked_up');

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$ begin
  assert (select array_agg(kind order by kind) from public.notifications)
    = array['cooking_today', 'order_accepted', 'order_ready', 'review_request'], 'buyer sees only their own notifications';
end $$;

-- the buyer still sees the dish of a past order after it expires, a stranger does not
reset role;
update public.posts set expires_at = now() - interval '1 minute' where id = 'cccccccc-0000-0000-0000-000000000002';
set role authenticated;
do $$ begin assert (select count(*) from public.posts where id = 'cccccccc-0000-0000-0000-000000000002') = 1, 'buyer keeps past dish'; end $$;
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
do $$ begin assert (select count(*) from public.posts where id = 'cccccccc-0000-0000-0000-000000000002') = 0, 'expired dish hidden from others'; end $$;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

-- nobody can write notifications directly
do $$ begin
  begin
    insert into public.notifications (user_id, kind) values ('11111111-1111-1111-1111-111111111111', 'fake');
    raise exception 'FAIL: wrote a notification';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo ORDER CHECKS PASSED
