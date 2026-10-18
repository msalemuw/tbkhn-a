-- Behaviour checks for 0027_admin_staff_controls.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('f6000000-0000-0000-0000-000000000001', 'ctl-owner@example.com'),
  ('f6000000-0000-0000-0000-000000000002', 'ctl-owner2@example.com'),
  ('f6000000-0000-0000-0000-000000000003', 'ctl-mod@example.com'),
  ('f6000000-0000-0000-0000-000000000004', 'ctl-support@example.com'),
  ('f6000000-0000-0000-0000-000000000005', 'ctl-newbie@example.com');
update public.profiles set username = 'ctlnewbie' where id = 'f6000000-0000-0000-0000-000000000005';
insert into public.admin_staff (user_id, role) values
  ('f6000000-0000-0000-0000-000000000001', 'owner'),
  ('f6000000-0000-0000-0000-000000000002', 'owner'),
  ('f6000000-0000-0000-0000-000000000003', 'moderator'),
  ('f6000000-0000-0000-0000-000000000004', 'support');

-- the app can read the status with no sign-in
set role anon;
do $$ begin
  assert (public.app_status() ->> 'ordering_enabled')::boolean, 'ordering on by default';
  assert (public.app_status() ->> 'maintenance')::boolean = false, 'maintenance off by default';
  assert public.app_status() ->> 'min_app_version' = '', 'no minimum version by default';
end $$;
reset role;

-- staff list: owner only
set role authenticated;
select pg_temp.act_as('f6000000-0000-0000-0000-000000000003');
do $$ begin
  begin perform * from public.admin_list_staff(); raise exception 'FAIL: moderator listed staff';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select pg_temp.act_as('f6000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.admin_list_staff() where email like 'ctl-%') = 4, 'owner sees all four staff';
  -- add, change, remove; another owner is protected
  perform public.admin_set_staff_role('f6000000-0000-0000-0000-000000000005', 'support');
  assert (select role from public.admin_list_staff() where email = 'ctl-newbie@example.com') = 'support', 'added as support';
  perform public.admin_set_staff_role('f6000000-0000-0000-0000-000000000005', 'moderator');
  assert (select role from public.admin_list_staff() where email = 'ctl-newbie@example.com') = 'moderator', 'changed to moderator';
  perform public.admin_set_staff_role('f6000000-0000-0000-0000-000000000005', null);
  assert (select count(*) from public.admin_list_staff() where email = 'ctl-newbie@example.com') = 0, 'removed';
  begin perform public.admin_set_staff_role('f6000000-0000-0000-0000-000000000002', null); raise exception 'FAIL: removed another owner';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_set_staff_role('f6000000-0000-0000-0000-000000000002', 'support'); raise exception 'FAIL: demoted another owner';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- controls: who may change what
select pg_temp.act_as('f6000000-0000-0000-0000-000000000004');
do $$ begin
  assert (select count(*) from public.admin_get_controls()) = 5, 'support can read controls';
  begin perform public.admin_set_control('ordering_enabled', 'false'::jsonb); raise exception 'FAIL: support paused ordering';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select pg_temp.act_as('f6000000-0000-0000-0000-000000000003');
do $$ begin
  begin perform public.admin_set_control('maintenance', 'true'::jsonb); raise exception 'FAIL: moderator set maintenance';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_set_control('ordering_enabled', '"no"'::jsonb); raise exception 'FAIL: bad value accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.admin_set_control('ordering_enabled', 'false'::jsonb);
  perform public.admin_set_control('posting_enabled', 'false'::jsonb);
end $$;
select pg_temp.act_as('f6000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.admin_set_control('min_app_version', '"banana"'::jsonb); raise exception 'FAIL: bad version accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_set_control('nope', 'true'::jsonb); raise exception 'FAIL: unknown key accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.admin_set_control('min_app_version', '"1.2.0"'::jsonb);
  perform public.admin_set_control('maintenance_message', '"Back soon"'::jsonb);
  perform public.admin_set_control('maintenance', 'true'::jsonb);
end $$;
reset role;

set role anon;
do $$ begin
  assert (public.app_status() ->> 'ordering_enabled')::boolean = false, 'ordering paused shows';
  assert (public.app_status() ->> 'posting_enabled')::boolean = false, 'posting paused shows';
  assert (public.app_status() ->> 'maintenance')::boolean, 'maintenance shows';
  assert public.app_status() ->> 'min_app_version' = '1.2.0', 'min version shows';
  assert public.app_status() ->> 'maintenance_message' = 'Back soon', 'message shows';
end $$;
reset role;

-- the pauses are enforced in the database
do $$
declare v_cook uuid := 'f6000000-0000-0000-0000-000000000004';
begin
  begin
    insert into public.posts (author_id, kind, dish_name) values (v_cook, 'cooking_today', 'Blocked dish');
    raise exception 'FAIL: post allowed while paused';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; assert sqlerrm like '%Posting is paused%', sqlerrm; end;
end $$;

-- logged, then switch everything back on so later tests are unaffected
select set_config('request.jwt.claim.sub', 'f6000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.admin_recent_actions(200) where action = 'control_changed') >= 5, 'changes logged';
  perform public.admin_set_control('ordering_enabled', 'true'::jsonb);
  perform public.admin_set_control('posting_enabled', 'true'::jsonb);
  perform public.admin_set_control('maintenance', 'false'::jsonb);
  perform public.admin_set_control('min_app_version', '""'::jsonb);
end $$;
reset role;
\echo ADMIN STAFF CONTROLS CHECKS PASSED
