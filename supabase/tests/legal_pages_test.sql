-- Behaviour checks for 0038_legal_pages.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('f7000000-0000-0000-0000-000000000001', 'lg-owner@example.com'),
  ('f7000000-0000-0000-0000-000000000002', 'lg-mod@example.com'),
  ('f7000000-0000-0000-0000-000000000003', 'lg-member@example.com');
insert into public.admin_staff (user_id, role) values
  ('f7000000-0000-0000-0000-000000000001', 'owner'),
  ('f7000000-0000-0000-0000-000000000002', 'moderator');

-- anyone, signed in or not, can read both pages in both languages
set role anon;
do $$ begin
  assert (select count(*) from public.app_pages) = 2, 'two pages seeded';
  assert (select count(*) from public.app_pages where body_en <> '' and body_ar <> '' and title_en <> '' and title_ar <> '') = 2, 'both languages filled in';
  begin perform public.admin_get_pages(); raise exception 'FAIL: anon read admin pages';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- staff can read through the admin function; only the owner can change
set role authenticated;
select pg_temp.act_as('f7000000-0000-0000-0000-000000000003');
do $$ begin
  begin perform * from public.admin_get_pages(); raise exception 'FAIL: member read admin pages';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select pg_temp.act_as('f7000000-0000-0000-0000-000000000002');
do $$ begin
  assert (select count(*) from public.admin_get_pages()) = 2, 'moderator reads';
  begin perform public.admin_set_page('terms', 'T', 'ت', 'x', 'س'); raise exception 'FAIL: moderator edited a page';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select pg_temp.act_as('f7000000-0000-0000-0000-000000000001');
do $$ begin
  perform public.admin_set_page('terms', 'Terms of use', 'شروط الاستخدام', E'## Hello\n\nNew text', E'## مرحبا\n\nنص جديد');
  assert (select body_en from public.app_pages where slug = 'terms') like '%New text%', 'owner edit saved';
  begin perform public.admin_set_page('terms', 'T', 'ت', '  ', 'س'); raise exception 'FAIL: empty text accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_set_page('nope', 'T', 'ت', 'x', 'س'); raise exception 'FAIL: unknown page accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.admin_actions where action = 'page_changed' and target_id = 'terms') = 1, 'edit logged';
end $$;
select 'legal_pages ok';
