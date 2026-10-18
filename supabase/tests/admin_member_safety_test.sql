-- Behaviour checks for 0029_admin_member_safety.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('fd000000-0000-0000-0000-000000000001', 'safety-owner@example.com'),
  ('fd000000-0000-0000-0000-000000000002', 'safety-mod@example.com'),
  ('fd000000-0000-0000-0000-000000000003', 'safety-support@example.com'),
  ('fd000000-0000-0000-0000-000000000004', 'safety-member@example.com'),
  ('fd000000-0000-0000-0000-000000000005', 'safety-busy@example.com'),
  ('fd000000-0000-0000-0000-000000000006', 'safety-other@example.com');
insert into public.admin_staff (user_id, role) values
  ('fd000000-0000-0000-0000-000000000001', 'owner'),
  ('fd000000-0000-0000-0000-000000000002', 'moderator'),
  ('fd000000-0000-0000-0000-000000000003', 'support');
-- the member has a post, so deleting them has something to take along
insert into public.posts (id, author_id, kind) values ('fe000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000004', 'story');
insert into public.push_tokens (user_id, token) values ('fd000000-0000-0000-0000-000000000004', 'ExponentPushToken[safety]');

set role authenticated;
-- support: can read and add notes, nothing else
select pg_temp.act_as('fd000000-0000-0000-0000-000000000003');
do $$ begin
  perform public.admin_add_member_note('fd000000-0000-0000-0000-000000000004', '  Asked about refund by WhatsApp  ');
  assert jsonb_array_length(public.admin_member_history('fd000000-0000-0000-0000-000000000004') -> 'notes') = 1, 'note saved';
  begin perform public.admin_warn_member('fd000000-0000-0000-0000-000000000004', 'Please be polite'); raise exception 'FAIL: support warned';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_set_banned('fd000000-0000-0000-0000-000000000004', true, 'x'); raise exception 'FAIL: support banned';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_delete_member('fd000000-0000-0000-0000-000000000004', 'x'); raise exception 'FAIL: support deleted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_add_member_note('fd000000-0000-0000-0000-000000000004', '   '); raise exception 'FAIL: empty note';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  -- ordinary members cannot read the tables directly
  begin perform * from public.member_notes; raise exception 'FAIL: read notes directly';
  exception when insufficient_privilege then null; end;
end $$;

-- a member cannot call any of it
select pg_temp.act_as('fd000000-0000-0000-0000-000000000006');
do $$ begin
  begin perform public.admin_member_history('fd000000-0000-0000-0000-000000000004'); raise exception 'FAIL: member read history';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_add_member_note('fd000000-0000-0000-0000-000000000004', 'hi'); raise exception 'FAIL: member added note';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- moderator: warn, ban, lift; cannot delete
select pg_temp.act_as('fd000000-0000-0000-0000-000000000002');
do $$
declare r record;
begin
  perform public.admin_warn_member('fd000000-0000-0000-0000-000000000004', ' Please keep comments polite ');
  begin perform public.admin_warn_member('fd000000-0000-0000-0000-000000000004', 'x'); raise exception 'FAIL: tiny warning';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_warn_member('fd000000-0000-0000-0000-000000000002', 'to myself'); raise exception 'FAIL: warned self';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  assert (public.admin_member_history('fd000000-0000-0000-0000-000000000004') -> 'warnings' -> 0 ->> 'message') = 'Please keep comments polite', 'warning kept and trimmed';
  select * into r from public.admin_find_members('safety-member');
  assert r.warnings = 1 and r.notes = 1 and r.banned_at is null, 'counts in search';

  begin perform public.admin_set_banned('fd000000-0000-0000-0000-000000000004', true, ''); raise exception 'FAIL: ban without reason';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_set_banned('fd000000-0000-0000-0000-000000000003', true, 'staff'); raise exception 'FAIL: banned staff';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_set_banned('fd000000-0000-0000-0000-000000000002', true, 'self'); raise exception 'FAIL: banned self';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;

  perform public.admin_set_banned('fd000000-0000-0000-0000-000000000004', true, 'Scam listings');
  select * into r from public.admin_find_members('safety-member');
  assert r.banned_at is not null and r.suspended_at is not null and r.suspended_reason = 'Scam listings', 'banned and suspended';
  begin perform public.admin_set_suspended('fd000000-0000-0000-0000-000000000004', false); raise exception 'FAIL: lifted suspension of a banned member';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; assert sqlerrm like '%lift the ban%', sqlerrm; end;
  begin perform public.admin_delete_member('fd000000-0000-0000-0000-000000000004', 'x'); raise exception 'FAIL: moderator deleted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
do $$ begin
  assert (select banned_until from auth.users where id = 'fd000000-0000-0000-0000-000000000004') = 'infinity', 'sign-in blocked';
  assert not exists (select 1 from public.push_tokens where user_id = 'fd000000-0000-0000-0000-000000000004'), 'push tokens removed';
  assert (select payload ->> 'message' from public.notifications where user_id = 'fd000000-0000-0000-0000-000000000004' and kind = 'staff_warning') = 'Please keep comments polite', 'member told';
end $$;

set role authenticated;
select pg_temp.act_as('fd000000-0000-0000-0000-000000000002');
do $$ begin
  perform public.admin_set_banned('fd000000-0000-0000-0000-000000000004', false);
  assert (select banned_at is null and suspended_at is null from public.admin_find_members('safety-member')), 'ban lifted';
  perform public.admin_set_suspended('fd000000-0000-0000-0000-000000000004', true, 'cool off');
  perform public.admin_set_suspended('fd000000-0000-0000-0000-000000000004', false);
end $$;
reset role;
do $$ begin
  assert (select banned_until from auth.users where id = 'fd000000-0000-0000-0000-000000000004') is null, 'sign-in allowed again';
end $$;

-- owner: delete
set role authenticated;
select pg_temp.act_as('fd000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.admin_delete_member('fd000000-0000-0000-0000-000000000004', ''); raise exception 'FAIL: delete without reason';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_delete_member('fd000000-0000-0000-0000-000000000001', 'self'); raise exception 'FAIL: deleted self';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_delete_member('fd000000-0000-0000-0000-000000000003', 'staff'); raise exception 'FAIL: deleted staff';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
-- an open order blocks deletion
insert into public.pickup_points (id, owner_id, label, lat, lng) values ('ff000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000005', 'Gate', 30.0, 31.0);
insert into public.posts (id, author_id, kind, dish_name, price_egp, portions_total, portions_left, ready_at, pickup_point_id, expires_at)
  values ('fe000000-0000-0000-0000-000000000002', 'fd000000-0000-0000-0000-000000000005', 'cooking_today', 'Koshari', 40, 5, 5, now() + interval '2 hours', 'ff000000-0000-0000-0000-000000000001', now() + interval '8 hours');
insert into public.reservations (post_id, buyer_id, cook_id, plates, status)
  values ('fe000000-0000-0000-0000-000000000002', 'fd000000-0000-0000-0000-000000000006', 'fd000000-0000-0000-0000-000000000005', 1, 'pending');
set role authenticated;
select pg_temp.act_as('fd000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.admin_delete_member('fd000000-0000-0000-0000-000000000005', 'spam'); raise exception 'FAIL: deleted with an open order';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; assert sqlerrm like '%open order%', sqlerrm; end;
  perform public.admin_delete_member('fd000000-0000-0000-0000-000000000004', 'Duplicate account');
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from auth.users where id = 'fd000000-0000-0000-0000-000000000004'), 'sign-in gone';
  assert not exists (select 1 from public.profiles where id = 'fd000000-0000-0000-0000-000000000004'), 'profile gone';
  assert not exists (select 1 from public.posts where id = 'fe000000-0000-0000-0000-000000000001'), 'posts gone';
  assert not exists (select 1 from public.member_notes where member_id = 'fd000000-0000-0000-0000-000000000004'), 'notes gone with them';
  assert (select details ->> 'email' from public.admin_actions where action = 'member_deleted' and target_id = 'fd000000-0000-0000-0000-000000000004') = 'safety-member@example.com', 'log keeps who it was';
  assert (select count(*) from public.admin_actions where action in ('member_note_added', 'member_warned', 'member_banned', 'member_unbanned', 'member_deleted')) = 5, 'all logged';
end $$;
\echo ADMIN MEMBER SAFETY CHECKS PASSED
