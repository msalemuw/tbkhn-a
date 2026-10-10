-- Behaviour checks for 0010_waitlist.sql (run after admin_test.sql). Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into public.communities (id, name, kind, governorate, status)
  values ('ae000000-0000-0000-0000-000000000001', 'Zamalek', 'area', 'Cairo', 'approved'),
         ('ae000000-0000-0000-0000-000000000002', 'Not yet', 'area', 'Cairo', 'pending');

-- ---- a visitor from an ad joins (not signed in)
set role anon;
select pg_temp.act_as('');
do $$
declare r record; inviter text;
begin
  select * into r from public.join_waitlist(' Mona ', '+201001234567', 'eat', 'Cairo', 'ae000000-0000-0000-0000-000000000001', null, 'ar', true, null,
                                           '{"utm_source":"instagram","utm_campaign":"waitlist-1","evil":"x"}');
  assert r.already = false, 'first join is new';
  assert char_length(r.ref_code) = 8, 'invite code returned';
  inviter := r.ref_code;

  select * into r from public.join_waitlist('Mona', '+201001234567', 'cook', 'Giza', null, null, 'en', true, null, '{}');
  assert r.already = true and r.ref_code = inviter, 'same number twice is told it is already on the list';

  select * into r from public.join_waitlist('Karim', '+201112223334', 'cook', 'Cairo', 'ae000000-0000-0000-0000-000000000002', 'Garden City', 'en', true, inviter, '{}');
  assert r.already = false, 'invited friend joins';

  begin
    perform public.join_waitlist('Sara', '+201223334445', 'eat', 'Cairo', null, null, 'ar', false, null, '{}');
    raise exception 'FAIL: joined without consent';
  exception when raise_exception then
    if sqlerrm <> 'consent required' then raise; end if;
  end;

  begin
    perform public.join_waitlist('Sara', '01223334445', 'eat', 'Cairo', null, null, 'ar', true, null, '{}');
    raise exception 'FAIL: unnormalized phone accepted';
  exception when check_violation then null;
  end;

  begin
    perform * from public.waitlist;
    raise exception 'FAIL: visitor read the list';
  exception when insufficient_privilege then null;
  end;

  begin
    perform * from public.admin_waitlist_summary();
    raise exception 'FAIL: visitor read the summary';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---- what was stored
reset role;
do $$ begin
  assert (select name from public.waitlist where phone = '+201001234567') = 'Mona', 'name trimmed';
  assert (select role from public.waitlist where phone = '+201001234567') = 'eat', 'second attempt did not overwrite';
  assert (select utm from public.waitlist where phone = '+201001234567') = '{"utm_source":"instagram","utm_campaign":"waitlist-1"}'::jsonb, 'only ad fields kept';
  assert (select community_id from public.waitlist where phone = '+201112223334') is null, 'pending community not linked';
  assert (select area from public.waitlist where phone = '+201112223334') = 'Garden City', 'typed area kept';
end $$;

-- ---- staff see the summary, members do not
set role authenticated;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select sum(signups) from public.admin_waitlist_summary()) = 2, 'support sees both sign-ups';
  assert (select invited from public.admin_waitlist_summary() where role = 'cook') = 1, 'invite counted';
  assert (select source from public.admin_waitlist_summary() where role = 'eat') = 'instagram', 'ad source shown';
end $$;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000004');
do $$ begin
  begin
    perform * from public.admin_waitlist_summary();
    raise exception 'FAIL: member read the summary';
  exception when raise_exception then
    if sqlerrm <> 'not allowed' then raise; end if;
  end;
end $$;
reset role;
select 'waitlist_test ok';
