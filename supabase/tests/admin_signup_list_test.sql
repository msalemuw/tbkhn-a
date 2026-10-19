-- Behaviour checks for 0039_admin_signup_list.sql: every staff role sees the sign-up list with emails,
-- members cannot, and the owner's download includes people who never finished the profile.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('f3900000-0000-0000-0000-000000000001', 'list-owner@example.com'),
  ('f3900000-0000-0000-0000-000000000002', 'list-support@example.com'),
  ('f3900000-0000-0000-0000-000000000003', 'list-done@example.com'),
  ('f3900000-0000-0000-0000-000000000004', 'list-halfway@example.com');
insert into public.admin_staff (user_id, role) values
  ('f3900000-0000-0000-0000-000000000001', 'owner'), ('f3900000-0000-0000-0000-000000000002', 'support');
update public.profiles set username = 'list.done', whatsapp = '+201000000039',
       signup_source = '{"via": "web", "utm_source": "facebook"}'
 where id = 'f3900000-0000-0000-0000-000000000003';

set role authenticated;

select pg_temp.act_as('f3900000-0000-0000-0000-000000000002');
do $$
declare r record;
begin
  select * into r from public.admin_list_signups(200, 0) where email = 'list-done@example.com';
  assert r.finished and r.whatsapp = '+201000000039' and r.source = 'facebook' and r.via = 'website', 'finished web sign-up listed';
  select * into r from public.admin_list_signups(200, 0) where email = 'list-halfway@example.com';
  assert r.id is not null and not r.finished and r.via = 'app', 'unfinished sign-up listed too';
  assert (select count(*) from public.admin_list_signups(1, 0)) = 1, 'page size respected';
  assert (select count(*) from public.admin_list_signups(9999, 0)) <= 200, 'page size capped';
  assert (select max(total) from public.admin_list_signups(1, 0)) = (select count(*) from public.admin_list_signups(200, 0)), 'total counts everyone';
  assert (select count(*) from public.admin_list_signups(50, 100000)) = 0, 'past the end is empty';
  begin
    perform * from public.admin_export_members();
    raise exception 'FAIL: support downloaded members';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

select pg_temp.act_as('f3900000-0000-0000-0000-000000000003');
do $$ begin
  begin
    perform * from public.admin_list_signups();
    raise exception 'FAIL: member read the sign-up list';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

select pg_temp.act_as('f3900000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.admin_export_members() where email like 'list-%') = 4, 'download has every sign-up';
  assert (select not finished from public.admin_export_members() where email = 'list-halfway@example.com'), 'unfinished marked';
end $$;
reset role;
\echo ADMIN SIGNUP LIST CHECKS PASSED
