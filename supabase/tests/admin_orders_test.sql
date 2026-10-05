-- Behaviour checks for 0005_admin_orders_referrals.sql. run.sh applies 0005 after the other tests, so the
-- three orders they made check the backfill, as on the live database. Every check raises on failure.
\set ON_ERROR_STOP on

create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

-- buyer finishes sign-up and says a friend invited them; two more members answer the question
reset role;
update public.profiles set username = 'hoda.k', display_name = 'Hoda K', heard_from = 'friend', inviter_name = 'Mona  Adel'
 where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set username = 'sara.m', heard_from = 'friend', inviter_name = ' mona adel'
 where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set heard_from = 'social_media' where id = 'a0000000-0000-0000-0000-000000000004';
insert into public.community_members (community_id, user_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');

set role authenticated;

-- ---- orders made before 0005 got their history filled in
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
do $$
declare v_koshari uuid := (select id from public.admin_find_orders('koshari'));
begin
  assert (select count(*) from public.admin_find_orders()) = 3, 'support sees all three orders';
  assert (select count(*) from public.admin_find_orders('', 'cancelled')) = 1, 'one cancelled order';
  assert (select count(*) from public.admin_find_orders('', 'done')) = 2, 'two picked-up orders';
  assert (select count(*) from public.admin_find_orders('UM ALI')) = 3, 'find by cook name';
  assert (select count(*) from public.admin_find_orders(left(v_koshari::text, 8))) = 1, 'find by order code';
  assert (select array_agg(event order by event) from public.admin_order_timeline(v_koshari))
    = array['payment_received', 'picked_up', 'requested'], 'backfilled request, current step and payment';
  assert (select note from public.admin_order_timeline((select id from public.admin_find_orders('', 'cancelled'))) where event = 'cancelled')
    = 'Plans changed', 'backfilled cancel reason';
  begin
    perform * from public.reservation_events;
    raise exception 'FAIL: staff read order history directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---- a new order is recorded step by step, with who did it
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
reset role;
update public.posts set expires_at = now() + interval '8 hours', portions_left = 4 where id = 'cccccccc-0000-0000-0000-000000000002';
set role authenticated;
select id as r from public.reserve_plates('cccccccc-0000-0000-0000-000000000002', 1, now() + interval '3 hours', 'no onions') \gset
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select public.set_reservation_status(:'r', 'declined', 'Ran out of rice');

select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select status from public.admin_find_orders('hoda') order by created_at desc limit 1) = 'declined', 'find by buyer username';
  assert (select count(*) from public.admin_find_orders('hoda', 'open')) = 0, 'declined is not open';
end $$;
do $$ begin
  assert (select array_agg(event || ':' || coalesce(actor_username, '') || ':' || coalesce(note, '') order by created_at)
            from public.admin_order_timeline((select id from public.admin_find_orders('hoda') order by created_at desc limit 1)))
    = array['requested:hoda.k:no onions', 'declined:umali:Ran out of rice'], 'timeline with who and why';
end $$;

-- ---- referral tally: finished sign-ups only, by answer and week, for all or one community
do $$ begin
  assert (select sum(signups) from public.admin_referral_tally()) = 4, 'umali, hoda, sara and nour finished sign-up';
  assert (select sum(signups) from public.admin_referral_tally() where heard_from = 'friend') = 2, 'two heard from a friend';
  assert (select sum(signups) from public.admin_referral_tally() where heard_from is null) = 1, 'one skipped the question';
  assert (select week_start from public.admin_referral_tally() limit 1)
    = date_trunc('week', now() at time zone 'Africa/Cairo')::date, 'grouped by Cairo week';
  assert (select sum(signups) from public.admin_referral_tally('aaaaaaaa-0000-0000-0000-000000000001')) = 2,
    'community filter: umali and hoda are members';
  assert (select signups from public.admin_inviter_names()) = 2, 'spellings of one inviter folded together';
  assert (select count(*) from public.admin_inviter_names('aaaaaaaa-0000-0000-0000-000000000001')) = 1, 'inviters per community';
end $$;

-- ---- members cannot use any of it
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$ begin
  begin
    perform * from public.admin_find_orders();
    raise exception 'FAIL: member listed orders';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform * from public.admin_referral_tally();
    raise exception 'FAIL: member read referral tally';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;
\echo ADMIN ORDER AND REFERRAL CHECKS PASSED
