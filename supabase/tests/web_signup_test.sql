-- Behaviour checks for 0011_web_signup.sql (run after admin_test.sql). Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values ('b0000000-0000-0000-0000-000000000001', 'mona@example.com');

-- ---- a visitor signs in with Google on the website and finishes the profile, like the app does
set role authenticated;
select pg_temp.act_as('b0000000-0000-0000-0000-000000000001');
update public.profiles
   set display_name = 'Mona', username = 'mona.web', governorate = 'Cairo', area = 'Zamalek',
       whatsapp = '+201001234567', signup_source = '{"via":"web","utm_source":"instagram"}', lang = 'ar'
 where id = auth.uid();
do $$ begin
  assert (select whatsapp from public.my_profile()) = '+201001234567', 'member reads own WhatsApp number';
  begin
    update public.profiles set whatsapp = '01001234567' where id = auth.uid();
    raise exception 'FAIL: unnormalized number accepted';
  exception when check_violation then null;
  end;
end $$;

-- ---- other people cannot read the number
set role anon;
select pg_temp.act_as('');
do $$ begin
  begin
    perform whatsapp from public.profiles;
    raise exception 'FAIL: visitor read WhatsApp numbers';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.admin_web_signups();
    raise exception 'FAIL: visitor read the summary';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---- staff see web sign-ups by source
set role authenticated;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select signups from public.admin_web_signups() where source = 'instagram' and governorate = 'Cairo') = 1, 'web sign-up counted';
end $$;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000004');
do $$ begin
  begin
    perform * from public.admin_web_signups();
    raise exception 'FAIL: member read the summary';
  exception when raise_exception then
    if sqlerrm <> 'not allowed' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  assert to_regclass('public.waitlist') is null, 'plain waitlist removed';
end $$;
select 'web_signup_test ok';
