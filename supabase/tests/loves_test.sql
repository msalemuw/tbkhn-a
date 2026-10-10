-- Behaviour checks for 0012_loves.sql (run after web_signup_test.sql). Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;
set role authenticated;
select pg_temp.act_as('b0000000-0000-0000-0000-000000000001');
update public.profiles set loves = 'both' where id = auth.uid();
do $$ begin
  assert (select loves from public.my_profile()) = 'both', 'member saves and reads own answer';
  begin
    update public.profiles set loves = 'sleeping' where id = auth.uid();
    raise exception 'FAIL: unknown answer accepted';
  exception when check_violation then null;
  end;
end $$;
set role anon;
do $$ begin
  begin
    perform loves from public.profiles;
    raise exception 'FAIL: visitor read answers';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'loves_test ok';
