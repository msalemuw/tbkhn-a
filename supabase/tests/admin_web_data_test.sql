-- Behaviour checks for 0023_admin_web_data.sql: charts for all staff, downloads for the owner only and logged.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, phone, email) values
  ('e0000000-0000-0000-0000-000000000001', '+201200000001', 'web-owner@example.com'),
  ('e0000000-0000-0000-0000-000000000002', '+201200000002', 'web-support@example.com'),
  ('e0000000-0000-0000-0000-000000000003', '+201200000003', 'web-member@example.com'),
  ('e0000000-0000-0000-0000-000000000004', '+201200000004', 'web-member2@example.com');
insert into public.admin_staff (user_id, role) values
  ('e0000000-0000-0000-0000-000000000001', 'owner'), ('e0000000-0000-0000-0000-000000000002', 'support');
update public.profiles set username = 'web.one', governorate = 'Cairo', heard_from = 'friend', loves = 'cooking',
       signup_source = '{"via": "web", "utm_source": "instagram"}'
 where id = 'e0000000-0000-0000-0000-000000000003';
update public.profiles set username = 'web.two', governorate = 'Giza', heard_from = 'friend', loves = 'both'
 where id = 'e0000000-0000-0000-0000-000000000004';

set role authenticated;

-- ---- support sees charts but cannot download
select pg_temp.act_as('e0000000-0000-0000-0000-000000000002');
do $$ begin
  assert (select count(*) from public.admin_daily_stats(7)) = 7, 'seven days, none missing';
  assert (select count(*) from public.admin_daily_stats(0)) = 1, 'at least one day';
  assert (select count(*) from public.admin_daily_stats(9999)) = 365, 'capped at a year';
  assert (select signups from public.admin_daily_stats(1)) >= 2, 'today counts the two new members';
  assert (select max(day) from public.admin_daily_stats(30)) = (now() at time zone 'Africa/Cairo')::date, 'ends today, Cairo time';
  assert (select members from public.admin_member_breakdown('heard_from') where label = 'friend') >= 2, 'two heard from a friend';
  assert (select members from public.admin_member_breakdown('source') where label = 'instagram') >= 1, 'ad source counted';
  assert (select members from public.admin_member_breakdown('governorate') where label = 'Giza') >= 1, 'by governorate';
  begin
    perform * from public.admin_member_breakdown('email');
    raise exception 'FAIL: unknown breakdown accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform * from public.admin_export_members();
    raise exception 'FAIL: support downloaded members';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform * from public.admin_export_orders();
    raise exception 'FAIL: support downloaded orders';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

-- ---- a member sees nothing
select pg_temp.act_as('e0000000-0000-0000-0000-000000000003');
do $$ begin
  begin
    perform * from public.admin_daily_stats();
    raise exception 'FAIL: member read charts';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

-- ---- the owner downloads, and each download is logged
select pg_temp.act_as('e0000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.admin_export_members() where email like 'web-member%') = 2, 'owner gets members with emails';
  assert (select source from public.admin_export_members() where username = 'web.one') = 'instagram', 'source in download';
  assert (select count(*) from public.admin_export_orders()) >= 0, 'orders download runs';
  assert (select count(*) from public.admin_recent_actions(50) where action = 'data_exported') = 3, 'every download call logged (members twice, orders once)';
end $$;
reset role;
\echo ADMIN WEB DATA CHECKS PASSED
