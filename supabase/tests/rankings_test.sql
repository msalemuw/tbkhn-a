-- Behaviour checks for 0009_rankings.sql (run after schema_test.sql, same database).
\set ON_ERROR_STOP on
reset role;
\set comm '''aaaaaaaa-0000-0000-0000-000000000001'''
\set cook  '''11111111-1111-1111-1111-111111111111'''
\set buyer '''22222222-2222-2222-2222-222222222222'''
\set other '''33333333-3333-3333-3333-333333333333'''
\set dish  '''cccccccc-0000-0000-0000-000000000001'''

insert into public.community_members (community_id, user_id) values (:comm, :buyer), (:comm, :other) on conflict do nothing;

do $$ begin
  assert (select count(*) from public.community_ranking('service', array[]::uuid[])) = 0, 'no communities, no ranking';
  assert (select count(*) from public.community_ranking('bogus', array['aaaaaaaa-0000-0000-0000-000000000001'::uuid])) = 0, 'unknown kind returns nothing';
end $$;

-- cook: two picked-up orders rated 5 and 4 (score 4.5 x 2 = 9) and one cancelled order that must not count
-- other: one picked-up order rated 5 (score 5)
delete from public.reviews; delete from public.reservations;
do $$ begin assert (select count(*) from public.community_ranking('service', array['aaaaaaaa-0000-0000-0000-000000000001'::uuid])) = 0, 'nobody ranked without orders'; end $$;
insert into public.reservations (id, post_id, buyer_id, cook_id, plates, status) values
  ('dddddddd-0000-0000-0000-000000000001', :dish, :buyer, :cook, 1, 'picked_up'),
  ('dddddddd-0000-0000-0000-000000000002', :dish, :other, :cook, 1, 'picked_up'),
  ('dddddddd-0000-0000-0000-000000000003', :dish, :other, :cook, 1, 'cancelled'),
  ('dddddddd-0000-0000-0000-000000000004', :dish, :buyer, :other, 1, 'picked_up');
insert into public.reviews (reservation_id, reviewer_id, cook_id, rating) values
  ('dddddddd-0000-0000-0000-000000000001', :buyer, :cook, 5),
  ('dddddddd-0000-0000-0000-000000000002', :other, :cook, 4),
  ('dddddddd-0000-0000-0000-000000000004', :buyer, :other, 5);
do $$
declare r record;
begin
  select * into r from public.community_ranking('service', array['aaaaaaaa-0000-0000-0000-000000000001'::uuid]) where rank = 1;
  assert r.cook_id = '11111111-1111-1111-1111-111111111111' and r.score = 9.00 and r.orders = 2, 'service rank 1 is rating x picked-up orders';
  select * into r from public.community_ranking('service', array['aaaaaaaa-0000-0000-0000-000000000001'::uuid]) where rank = 2;
  assert r.cook_id = '33333333-3333-3333-3333-333333333333' and r.score = 5.00, 'service rank 2';
  assert (select count(*) from public.community_ranking('service', array['aaaaaaaa-0000-0000-0000-000000000001'::uuid])) = 2, 'the buyer with no orders is not ranked';
end $$;

-- likes: other has a signature dish with 2 likes plus their own like (ignored); cook has one with 1 like
insert into public.posts (id, author_id, kind, caption, media_path) values
  ('eeeeeeee-0000-0000-0000-000000000001', :other, 'signature', 'Mahshi', 'x.jpg'),
  ('eeeeeeee-0000-0000-0000-000000000002', :cook, 'signature', 'Koshari', 'y.jpg');
insert into public.likes (post_id, user_id) values
  ('eeeeeeee-0000-0000-0000-000000000001', :cook), ('eeeeeeee-0000-0000-0000-000000000001', :buyer), ('eeeeeeee-0000-0000-0000-000000000001', :other),
  ('eeeeeeee-0000-0000-0000-000000000002', :other);
do $$
declare r record;
begin
  select * into r from public.community_ranking('likes', array['aaaaaaaa-0000-0000-0000-000000000001'::uuid]) where rank = 1;
  assert r.cook_id = '33333333-3333-3333-3333-333333333333' and r.likes = 2, 'likes rank 1 ignores own like';
  select * into r from public.community_ranking('likes', array['aaaaaaaa-0000-0000-0000-000000000001'::uuid]) where rank = 2;
  assert r.cook_id = '11111111-1111-1111-1111-111111111111' and r.likes = 1, 'likes rank 2';
end $$;

-- anyone signed in can read the rankings, and only aggregates come back
set role authenticated;
select set_config('request.jwt.claim.sub', :buyer, false);
do $$ begin
  assert (select count(*) from public.community_ranking('service', array['aaaaaaaa-0000-0000-0000-000000000001'::uuid])) = 2, 'members can read rankings';
end $$;
reset role;
select 'ok rankings' as ok;
