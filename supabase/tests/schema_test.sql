-- Behaviour checks for 0001_initial_schema.sql on plain Postgres (run after supabase_stubs.sql).
-- Every check raises on failure; the run ends with "ALL CHECKS PASSED".
\set ON_ERROR_STOP on
\set cook  '''11111111-1111-1111-1111-111111111111'''
\set buyer '''22222222-2222-2222-2222-222222222222'''
\set other '''33333333-3333-3333-3333-333333333333'''

-- Phone verification creates the auth user, which creates the profile.
insert into auth.users (id, phone) values (:cook, '+201000000001'), (:buyer, '+201000000002'), (:other, '+201000000003');
do $$ begin assert (select count(*) from public.profiles) = 3, 'profile per auth user'; end $$;

insert into public.communities (id, name, kind, governorate, status)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Madinaty B2', 'compound', 'Cairo', 'approved');

create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

-- ---- cook sets up profile, pickup point and a cooking-today post
set role authenticated;
select pg_temp.act_as(:cook);
update public.profiles set username = 'umali', display_name = 'Um Ali', instapay_handle = 'umali@instapay' where id = auth.uid();
insert into public.community_members (community_id, user_id) values ('aaaaaaaa-0000-0000-0000-000000000001', auth.uid());
insert into public.pickup_points (id, owner_id, label, lat, lng)
  values ('bbbbbbbb-0000-0000-0000-000000000001', auth.uid(), 'Building 12 gate', 30.1, 31.6);
insert into public.posts (id, author_id, kind, community_id, dish_name, price_egp, portions_total, ready_at, pickup_point_id, expires_at)
  values ('cccccccc-0000-0000-0000-000000000001', auth.uid(), 'cooking_today', 'aaaaaaaa-0000-0000-0000-000000000001',
          'Molokhia with chicken', 120, 5, now() + interval '3 hours', 'bbbbbbbb-0000-0000-0000-000000000001', now() + interval '10 hours');
do $$ begin
  assert (select portions_left from public.posts where id = 'cccccccc-0000-0000-0000-000000000001') = 5, 'portions_left starts at total';
end $$;

-- a story gets a 24 h expiry automatically
insert into public.posts (author_id, kind, caption) values (auth.uid(), 'story', 'Kitchen today');
do $$ begin
  assert (select expires_at - created_at from public.posts where kind = 'story') = interval '24 hours', 'story lasts 24 h';
end $$;

-- cook cannot reserve their own dish
do $$ begin
  perform public.reserve_plates('cccccccc-0000-0000-0000-000000000001', 1);
  raise exception 'FAIL: own dish reserved';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;

-- ---- buyer: cannot read private profile columns, can reserve
select pg_temp.act_as(:buyer);
do $$ begin
  begin
    perform instapay_handle from public.profiles;
    raise exception 'FAIL: instapay readable by others';
  exception when insufficient_privilege then null;
  end;
  assert (select username from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'umali', 'public columns readable';
  assert public.username_available('UmAli') = false, 'username taken (case-insensitive)';
  assert public.username_available('admin') = false, 'reserved username';
  assert public.username_available('newcook') = true, 'free username';
  assert public.phone_registered('+201000000001') = true, 'registered phone';
  assert public.phone_registered('+201099999999') = false, 'unknown phone';
  assert public.phone_registered('01000000001') = false, 'only normalized input';
end $$;

-- cannot edit another profile (RLS silently filters the row)
update public.profiles set display_name = 'hacked' where id = '11111111-1111-1111-1111-111111111111';
-- cannot write someone else's reservation directly
do $$ begin
  begin
    insert into public.reservations (post_id, buyer_id, cook_id, plates)
      values ('cccccccc-0000-0000-0000-000000000001', auth.uid(), '11111111-1111-1111-1111-111111111111', 1);
    raise exception 'FAIL: direct reservation insert allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- too many plates is refused; 2 plates is fine
do $$ begin
  begin
    perform public.reserve_plates('cccccccc-0000-0000-0000-000000000001', 6);
    raise exception 'FAIL: over-reserved';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
select id as res1 from public.reserve_plates('cccccccc-0000-0000-0000-000000000001', 2) \gset
do $$ begin
  assert (select portions_left from public.posts where id = 'cccccccc-0000-0000-0000-000000000001') = 3, 'portions decremented';
end $$;
-- buyer can see the cook's InstaPay handle for their own reservation only
select public.reservation_instapay(:'res1') = 'umali@instapay' as instapay_ok \gset
\if :instapay_ok
\else
  \echo 'FAIL: reservation_instapay' \q
\endif
select public.set_payment_status(:'res1', 'sent');

-- buyer cannot accept their own reservation
do $$ begin
  perform public.set_reservation_status((select id from public.reservations limit 1), 'accepted');
  raise exception 'FAIL: buyer accepted';
exception when others then if sqlerrm like 'FAIL%' then raise; end if;
end $$;

-- ---- a third user cannot see the reservation or its InstaPay handle
select pg_temp.act_as(:other);
do $$ begin
  assert (select count(*) from public.reservations) = 0, 'reservation hidden from others';
  assert public.reservation_instapay((select id from public.reservations limit 1)) is null, 'instapay hidden from others';
end $$;

-- ---- cook accepts, buyer can no longer cancel, cook marks ready and picked up
select pg_temp.act_as(:cook);
select public.set_reservation_status(:'res1', 'accepted');
select pg_temp.act_as(:buyer);
do $$ begin
  perform public.set_reservation_status((select id from public.reservations limit 1), 'cancelled');
  raise exception 'FAIL: cancelled after accept';
exception when others then if sqlerrm like 'FAIL%' then raise; end if;
end $$;

-- review is only allowed after pickup
do $$ begin
  begin
    insert into public.reviews (reservation_id, reviewer_id, cook_id, rating)
      values ((select id from public.reservations limit 1), auth.uid(), '11111111-1111-1111-1111-111111111111', 5);
    raise exception 'FAIL: review before pickup';
  exception when insufficient_privilege then null;
  end;
end $$;

select pg_temp.act_as(:cook);
select public.set_payment_status(:'res1', 'received');
select public.set_reservation_status(:'res1', 'ready');
select public.set_reservation_status(:'res1', 'picked_up');

select pg_temp.act_as(:buyer);
insert into public.reviews (reservation_id, reviewer_id, cook_id, rating, body)
  values (:'res1', auth.uid(), '11111111-1111-1111-1111-111111111111', 5, 'Delicious');

-- a pending reservation cancelled by the buyer gives the plates back
select id as res2 from public.reserve_plates('cccccccc-0000-0000-0000-000000000001', 3) \gset
select public.set_reservation_status(:'res2', 'cancelled', 'Plans changed');
do $$ begin
  assert (select portions_left from public.posts where id = 'cccccccc-0000-0000-0000-000000000001') = 3, 'plates restored on cancel';
end $$;

-- messages: only the two people in the chat see them
insert into public.messages (sender_id, recipient_id, reservation_id, body)
  values (auth.uid(), '11111111-1111-1111-1111-111111111111', :'res1', 'Thank you!');
select pg_temp.act_as(:other);
do $$ begin assert (select count(*) from public.messages) = 0, 'messages private'; end $$;

-- storage: write only inside your own folder
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('media', '11111111-1111-1111-1111-111111111111/dish.jpg');
    raise exception 'FAIL: wrote into another user folder';
  exception when insufficient_privilege then null;
  end;
end $$;
insert into storage.objects (bucket_id, name) values ('media', '33333333-3333-3333-3333-333333333333/avatar.jpg');

-- ---- guest (not signed in): can browse, cannot write, can log funnel events
set role anon;
select pg_temp.act_as('');
do $$ begin
  assert (select count(*) from public.posts) = 2, 'guest sees live posts';
  begin
    insert into public.likes (post_id, user_id) values ('cccccccc-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333');
    raise exception 'FAIL: guest liked';
  exception when insufficient_privilege then null;
  end;
end $$;
insert into public.signup_events (session_id, step) values ('s-1', 'phone_entered');
do $$ begin
  begin
    perform 1 from public.signup_events;
    raise exception 'FAIL: guest read funnel events';
  exception when insufficient_privilege then null;
  end;
end $$;

-- expired posts disappear from feeds
reset role;
update public.posts set expires_at = now() - interval '1 minute' where kind = 'story';
set role anon;
do $$ begin assert (select count(*) from public.posts) = 1, 'expired story hidden'; end $$;
reset role;

\echo ALL CHECKS PASSED
