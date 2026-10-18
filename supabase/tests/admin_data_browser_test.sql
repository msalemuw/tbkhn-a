-- Behaviour checks for 0034_admin_data_browser.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('d7000000-0000-0000-0000-000000000001', 'data-owner@example.com'),
  ('d7000000-0000-0000-0000-000000000002', 'data-mod@example.com'),
  ('d7000000-0000-0000-0000-000000000003', 'data-member@example.com');
insert into public.admin_staff (user_id, role) values
  ('d7000000-0000-0000-0000-000000000001', 'owner'),
  ('d7000000-0000-0000-0000-000000000002', 'moderator');
update public.profiles set username = 'data_findme', display_name = '100% Alpha_Cook' where id = 'd7000000-0000-0000-0000-000000000003';
update public.profiles set username = 'data_other', display_name = 'Beta' where id = 'd7000000-0000-0000-0000-000000000002';
insert into public.messages (id, sender_id, recipient_id, body) values (gen_random_uuid(), 'd7000000-0000-0000-0000-000000000003', 'd7000000-0000-0000-0000-000000000002', 'private chat text')
  on conflict do nothing;

set role authenticated;
-- moderator and members are refused
select pg_temp.act_as('d7000000-0000-0000-0000-000000000002');
do $$ begin
  begin perform * from public.admin_data_tables(); raise exception 'FAIL: moderator listed tables'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform * from public.admin_data_rows('profiles'); raise exception 'FAIL: moderator read rows'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select pg_temp.act_as('d7000000-0000-0000-0000-000000000003');
do $$ begin
  begin perform * from public.admin_data_rows('profiles'); raise exception 'FAIL: member read rows'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform * from public.admin_data_tables_list(); raise exception 'FAIL: list callable'; exception when insufficient_privilege then null; end;
end $$;

-- owner
select pg_temp.act_as('d7000000-0000-0000-0000-000000000001');
do $$
declare n int;
begin
  assert (select count(*) from public.admin_data_tables()) = 26, 'all tables listed';
  assert not exists (select 1 from public.admin_data_tables() where table_name in ('messages', 'push_tokens')), 'private tables not listed';
  assert (select row_count from public.admin_data_tables() where table_name = 'profiles') >= 3, 'profile count';
  assert (select count(*) from public.admin_data_rows('profiles', '', 2, 0)) = 2, 'limit applied';
  assert (select max(total) from public.admin_data_rows('profiles', '', 2, 0)) >= 3, 'total is the whole count';
  assert (select count(*) from public.admin_data_rows('profiles', 'DATA_FINDME')) = 1, 'search ignores case';
  assert (select row_data ->> 'username' from public.admin_data_rows('profiles', 'data_findme')) = 'data_findme', 'row content';
  -- wildcard letters are searched literally
  assert (select count(*) from public.admin_data_rows('profiles', '100%')) = 1, 'percent literal';
  assert (select count(*) from public.admin_data_rows('profiles', 'alpha_c')) = 1, 'underscore literal';
  assert (select count(*) from public.admin_data_rows('profiles', 'zz_nothing_zz')) = 0, 'no match';
  assert (select count(*) from public.admin_data_rows('profiles', '', 1000, 0)) <= 200, 'limit capped';
  assert (select count(*) from public.admin_data_rows('profiles', '', 1, 1)) = 1, 'offset works';
  foreach n in array array[1] loop
    begin perform * from public.admin_data_rows('messages'); raise exception 'FAIL: opened messages'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
    begin perform * from public.admin_data_rows('push_tokens'); raise exception 'FAIL: opened push tokens'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
    begin perform * from public.admin_data_rows('profiles; drop table public.posts'); raise exception 'FAIL: injection'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
    begin perform * from public.admin_data_rows('pg_catalog.pg_user'); raise exception 'FAIL: other schema'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
    begin perform * from public.admin_data_rows(null); raise exception 'FAIL: null table'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  end loop;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.admin_actions where action = 'data_browsed' and target_id = 'profiles') = 3, 'first page logged each time';
end $$;
\echo DATA BROWSER CHECKS PASSED
