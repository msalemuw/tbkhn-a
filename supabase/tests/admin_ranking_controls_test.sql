-- Behaviour checks for 0037_admin_ranking_controls.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('e9000000-0000-0000-0000-000000000001', 'rk-owner@example.com'),
  ('e9000000-0000-0000-0000-000000000002', 'rk-mod@example.com'),
  ('e9000000-0000-0000-0000-000000000003', 'rk-support@example.com'),
  ('e9000000-0000-0000-0000-000000000004', 'rk-cook-fresh@example.com'),
  ('e9000000-0000-0000-0000-000000000005', 'rk-cook-normal@example.com'),
  ('e9000000-0000-0000-0000-000000000006', 'rk-cook-burst@example.com'),
  ('e9000000-0000-0000-0000-000000000007', 'rk-outsider@example.com');
insert into public.admin_staff (user_id, role) values
  ('e9000000-0000-0000-0000-000000000001', 'owner'),
  ('e9000000-0000-0000-0000-000000000002', 'moderator'),
  ('e9000000-0000-0000-0000-000000000003', 'support');
update public.profiles set username = 'rk_fresh' where id = 'e9000000-0000-0000-0000-000000000004';
update public.profiles set username = 'rk_normal' where id = 'e9000000-0000-0000-0000-000000000005';
update public.profiles set username = 'rk_burst' where id = 'e9000000-0000-0000-0000-000000000006';

insert into public.communities (id, name, kind, governorate, status)
  values ('e9100000-0000-0000-0000-000000000001', 'Ranking Test Club', 'club', 'Giza', 'approved');
insert into public.community_members (community_id, user_id)
  select 'e9100000-0000-0000-0000-000000000001', ('e9000000-0000-0000-0000-00000000000' || n)::uuid from generate_series(4, 6) n;
insert into public.posts (id, author_id, kind, caption, media_path) values
  ('e9200000-0000-0000-0000-000000000004', 'e9000000-0000-0000-0000-000000000004', 'signature', 'Fresh dish', 'a.jpg'),
  ('e9200000-0000-0000-0000-000000000005', 'e9000000-0000-0000-0000-000000000005', 'signature', 'Normal dish', 'b.jpg'),
  ('e9200000-0000-0000-0000-000000000006', 'e9000000-0000-0000-0000-000000000006', 'signature', 'Burst dish', 'c.jpg');

-- 6 brand-new accounts like the "fresh" cook; 5 month-old accounts like the "normal" cook over several days;
-- 10 month-old accounts like the "burst" cook inside one hour.
insert into auth.users (id, email)
  select ('e9300000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'rk-liker' || n || '@example.com' from generate_series(1, 21) n;
update public.profiles set created_at = now() - interval '30 days'
 where id in (select ('e9300000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid from generate_series(7, 21) n);
insert into public.likes (post_id, user_id, created_at)
  select 'e9200000-0000-0000-0000-000000000004', ('e9300000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, now() - (n || ' minutes')::interval from generate_series(1, 6) n;
insert into public.likes (post_id, user_id, created_at)
  select 'e9200000-0000-0000-0000-000000000005', ('e9300000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, now() - (n || ' days')::interval from generate_series(7, 11) n;
insert into public.likes (post_id, user_id, created_at)
  select 'e9200000-0000-0000-0000-000000000006', ('e9300000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, now() - (n || ' minutes')::interval from generate_series(12, 21) n;
-- the cook liking their own dish never counts
insert into public.likes (post_id, user_id) values ('e9200000-0000-0000-0000-000000000005', 'e9000000-0000-0000-0000-000000000005');

-- members and signed-out visitors cannot use the staff functions
set role authenticated;
select pg_temp.act_as('e9000000-0000-0000-0000-000000000007');
do $$ begin
  begin perform public.admin_ranking_suspicious_likes(); raise exception 'FAIL: member read the list'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_ranking_exclude('e9000000-0000-0000-0000-000000000004', 'cheating'); raise exception 'FAIL: member excluded'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin perform public.admin_ranking_standings('likes'); raise exception 'FAIL: anon ran a staff function'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- the review list: fresh-accounts cook and burst cook are flagged, the normal cook is not (support can read)
set role authenticated;
select pg_temp.act_as('e9000000-0000-0000-0000-000000000003');
do $$ declare r record; begin
  select * into r from public.admin_ranking_suspicious_likes() where username = 'rk_fresh';
  assert r.likes = 6 and r.new_account_likes = 6 and r.reasons = array['new_accounts'] and not r.excluded, 'fresh-account likes flagged';
  select * into r from public.admin_ranking_suspicious_likes() where username = 'rk_burst';
  assert r.likes = 10 and r.new_account_likes = 0 and r.peak_hour_likes = 10 and r.reasons = array['burst'], 'burst flagged';
  assert (select count(*) from public.admin_ranking_suspicious_likes() where username = 'rk_normal') = 0, 'normal cook not flagged';
  assert (select count(*) from public.admin_ranking_likers('e9000000-0000-0000-0000-000000000004')) = 6, 'six likers listed';
  assert (select count(*) from public.admin_ranking_likers('e9000000-0000-0000-0000-000000000005')) = 5, 'own like not listed';
  assert (select max(account_age_hours) from public.admin_ranking_likers('e9000000-0000-0000-0000-000000000004')) < 24, 'fresh accounts are young';
  assert (select count(*) from public.admin_ranking_standings('likes') where community_name = 'Ranking Test Club') = 3, 'three cooks ranked';
  assert (select cook_id from public.admin_ranking_standings('likes') where community_name = 'Ranking Test Club' and rank = 1) = 'e9000000-0000-0000-0000-000000000006', 'burst cook leads';
  begin perform public.admin_ranking_standings('nonsense'); raise exception 'FAIL: bad kind'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  -- support cannot exclude
  begin perform public.admin_ranking_exclude('e9000000-0000-0000-0000-000000000006', 'looks fake'); raise exception 'FAIL: support excluded'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- moderator excludes (reason required), the member leaves the ranking, the list shows it, and it is logged
select pg_temp.act_as('e9000000-0000-0000-0000-000000000002');
do $$ begin
  begin perform public.admin_ranking_exclude('e9000000-0000-0000-0000-000000000006', ' '); raise exception 'FAIL: no reason'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_ranking_exclude('e9000000-0000-0000-0000-0000000000ff', 'looks fake'); raise exception 'FAIL: unknown member'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.admin_ranking_exclude('e9000000-0000-0000-0000-000000000006', 'Ten likes in one hour from month-old accounts');
  assert (select count(*) from public.community_ranking('likes', array['e9100000-0000-0000-0000-000000000001'::uuid])) = 2, 'excluded cook left the ranking';
  assert (select cook_id from public.community_ranking('likes', array['e9100000-0000-0000-0000-000000000001'::uuid]) where rank = 1) = 'e9000000-0000-0000-0000-000000000004', 'next cook moves up';
  assert (select count(*) from public.admin_ranking_exclusions() where username = 'rk_burst' and reason like 'Ten likes%') = 1, 'exclusion listed';
  assert (select excluded from public.admin_ranking_suspicious_likes() where username = 'rk_burst'), 'flagged list shows excluded';
  -- excluding again just updates the reason
  perform public.admin_ranking_exclude('e9000000-0000-0000-0000-000000000006', 'Confirmed: same-hour burst');
  assert (select count(*) from public.admin_ranking_exclusions() where username = 'rk_burst') = 1, 'still one row';
end $$;
-- the app's own ranking call (any signed-in member, and signed out) skips them too
select pg_temp.act_as('e9000000-0000-0000-0000-000000000007');
do $$ begin
  assert (select count(*) from public.community_ranking('likes', array['e9100000-0000-0000-0000-000000000001'::uuid])) = 2, 'members see the exclusion';
end $$;

-- restore: reversible, logged, and refused when not excluded
select pg_temp.act_as('e9000000-0000-0000-0000-000000000002');
do $$ begin
  perform public.admin_ranking_restore('e9000000-0000-0000-0000-000000000006', 'Checked, they are real');
  assert (select count(*) from public.community_ranking('likes', array['e9100000-0000-0000-0000-000000000001'::uuid])) = 3, 'back in the ranking';
  assert (select count(*) from public.admin_ranking_exclusions() where username = 'rk_burst') = 0, 'no longer listed';
  begin perform public.admin_ranking_restore('e9000000-0000-0000-0000-000000000006'); raise exception 'FAIL: restored twice'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- the table itself is locked
select pg_temp.act_as('e9000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform 1 from public.ranking_exclusions; raise exception 'FAIL: table readable'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.admin_actions where action = 'ranking_excluded' and target_id = 'e9000000-0000-0000-0000-000000000006') = 2, 'both logged';
  assert (select count(*) from public.admin_actions where action = 'ranking_restored' and reason = 'Checked, they are real') = 1, 'restore logged';
end $$;
\echo ADMIN RANKING CONTROL CHECKS PASSED
