-- Behaviour checks for 0032_support_inbox.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('d5000000-0000-0000-0000-000000000001', 'sup-support@example.com'),
  ('d5000000-0000-0000-0000-000000000002', 'sup-member@example.com'),
  ('d5000000-0000-0000-0000-000000000003', 'sup-other@example.com');
insert into public.admin_staff (user_id, role) values ('d5000000-0000-0000-0000-000000000001', 'support');
delete from public.notifications where user_id in ('d5000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000003');

-- a visitor who is not signed in: needs a contact, gets a ticket
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare t uuid;
begin
  begin perform public.support_submit('Cannot sign in', 'Google says error', null); raise exception 'FAIL: no contact';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  t := public.support_submit('Cannot sign in', 'Google says error', 'visitor@example.com', null, 'web');
  assert t is not null, 'visitor ticket';
  begin perform public.support_submit('x', 'follow up', 'visitor@example.com', t); raise exception 'FAIL: visitor replied to a ticket';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform * from public.support_tickets; raise exception 'FAIL: read tickets directly';
  exception when insufficient_privilege then null; end;
end $$;

-- a member
set role authenticated;
select pg_temp.act_as('d5000000-0000-0000-0000-000000000002');
do $$
declare t uuid;
begin
  t := public.support_submit('My order', 'The cook did not show up');
  assert (select count(*) from public.support_my_tickets()) = 1, 'listed';
  assert (select status from public.support_my_tickets()) = 'open', 'open';
  begin perform public.support_submit('', 'no subject'); raise exception 'FAIL: empty subject'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.support_submit('x', repeat('a', 2001)); raise exception 'FAIL: long message'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  -- the limit of 5 new conversations an hour (one already made, so four more)
  perform public.support_submit('two', 'b'); perform public.support_submit('three', 'c'); perform public.support_submit('four', 'd'); perform public.support_submit('five', 'e');
  begin perform public.support_submit('six', 'f'); raise exception 'FAIL: no rate limit'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
-- keep one ticket for the rest, drop the extras
delete from public.support_tickets where user_id = 'd5000000-0000-0000-0000-000000000002' and subject <> 'My order';

-- another member cannot see or reply to it; staff can
set role authenticated;
select pg_temp.act_as('d5000000-0000-0000-0000-000000000003');
do $$
declare t uuid;
begin
  select id into t from public.admin_support_tickets('open') limit 0;
exception when raise_exception then null;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.support_tickets where subject = 'My order') = 1, 'ticket exists';
end $$;
set role authenticated;
select pg_temp.act_as('d5000000-0000-0000-0000-000000000003');
do $$
declare t uuid;
begin
  assert (select count(*) from public.support_my_tickets()) = 0, 'other member sees nothing';
  begin perform public.admin_support_tickets('open'); raise exception 'FAIL: member read staff list'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

select pg_temp.act_as('d5000000-0000-0000-0000-000000000001');
do $$
declare t uuid; n int;
begin
  assert public.admin_support_open_count() = 2, 'open count: visitor + member';
  select id into t from public.admin_support_tickets('open') where subject = 'My order';
  assert (select member_email from public.admin_support_tickets('open') where id = t) = 'sup-member@example.com', 'staff sees the member email';
  assert (select contact from public.admin_support_tickets('open') where subject = 'Cannot sign in') = 'visitor@example.com', 'visitor contact shown';
  perform public.admin_support_note(t, 'Checked: cook was suspended that day');
  perform public.admin_support_reply(t, 'Sorry about that, we refunded your plate.');
  assert (select status from public.admin_support_tickets(null) where id = t) = 'pending', 'pending after reply';
  assert (select count(*) from public.admin_support_thread(t)) = 3, 'thread has member message, note and reply';
  begin perform public.admin_support_reply(t, ' '); raise exception 'FAIL: empty reply'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_support_set_status(t, 'weird'); raise exception 'FAIL: bad status'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- the member sees the reply, not the note, and was notified
select pg_temp.act_as('d5000000-0000-0000-0000-000000000002');
do $$
declare t uuid;
begin
  select id into t from public.support_my_tickets();
  assert (select count(*) from public.support_ticket_thread(t)) = 2, 'member sees 2 messages, no note';
  assert not exists (select 1 from public.support_ticket_thread(t) where sender = 'note'), 'no internal note';
  assert (select last_sender from public.support_my_tickets()) = 'staff', 'last from staff';
  -- follow-up reopens it
  perform public.support_submit(null, 'Thanks, one more thing', null, t);
  assert (select status from public.support_my_tickets()) = 'open', 'reopened';
end $$;
select pg_temp.act_as('d5000000-0000-0000-0000-000000000003');
do $$
declare t uuid;
begin
  select id into t from public.support_tickets limit 0;
exception when insufficient_privilege then null;
end $$;
reset role;
do $$
declare t uuid;
begin
  select id into t from public.support_tickets where subject = 'My order';
  assert (select count(*) from public.notifications where user_id = 'd5000000-0000-0000-0000-000000000002' and kind = 'support_reply' and payload ->> 'ticket_id' = t::text) = 1, 'member notified';
  -- another member cannot read or reply to it
  perform set_config('request.jwt.claim.sub', 'd5000000-0000-0000-0000-000000000003', false);
end $$;
set role authenticated;
do $$
declare t uuid;
begin
  select id into t from (select id from public.support_tickets) x limit 0;
exception when insufficient_privilege then null;
end $$;
reset role;
do $$ declare t uuid; begin
  select id into t from public.support_tickets where subject = 'My order';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd5000000-0000-0000-0000-000000000003', true);
  begin perform public.support_submit(null, 'hijack', null, t); raise exception 'FAIL: replied to another member''s ticket';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  assert (select count(*) from public.support_ticket_thread(t)) = 0, 'cannot read another member''s thread';
  reset role;
end $$;

set role authenticated;
select pg_temp.act_as('d5000000-0000-0000-0000-000000000001');
do $$
declare t uuid;
begin
  select id into t from public.admin_support_tickets('open') where subject = 'My order';
  perform public.admin_support_reply(t, 'Closing this one, take care.', true);
  assert (select status from public.admin_support_tickets('closed') where id = t) = 'closed', 'closed with reply';
  perform public.admin_support_set_status(t, 'open');
  assert (select status from public.admin_support_tickets('open') where id = t) = 'open', 'reopened by staff';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.admin_actions where action in ('support_replied', 'support_note_added', 'support_status_set')) = 4, 'logged';
end $$;
\echo SUPPORT INBOX CHECKS PASSED
