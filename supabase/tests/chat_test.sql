-- Behaviour checks for 0003_chat.sql (run after orders_test.sql, same database).
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;
reset role;
select id as r from public.reservations where post_id = 'cccccccc-0000-0000-0000-000000000002' \gset
-- start from this order's chat only (schema checks left other messages behind)
delete from public.messages where reservation_id is distinct from :'r';
set role authenticated;

-- the buyer's "Payment sent" from the order checks shows in the chat with the amount (2 plates x EGP 60)
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$ begin
  assert (select count(*) from public.messages where kind = 'payment_sent' and body = 'Payment sent · EGP 120 by InstaPay') = 1, 'payment sent line in chat';
end $$;
insert into public.messages (sender_id, recipient_id, body) values (auth.uid(), '11111111-1111-1111-1111-111111111111', 'Sent it, see you at 2');
do $$ begin
  begin
    insert into public.messages (sender_id, recipient_id, body, kind) values (auth.uid(), '11111111-1111-1111-1111-111111111111', 'Payment received · EGP 999', 'payment_received');
    raise exception 'FAIL: app wrote a payment line';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.messages (sender_id, recipient_id, body) values ('11111111-1111-1111-1111-111111111111', auth.uid(), 'pretending to be the cook');
    raise exception 'FAIL: sent as someone else';
  exception when insufficient_privilege then null;
  end;
end $$;

-- the cook sees 2 unread from the buyer, confirms payment, and reads the chat
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
do $$ begin
  assert (select unread from public.my_conversations() where partner_id = '22222222-2222-2222-2222-222222222222') = 2, 'cook has 2 unread';
  assert (select last_body from public.my_conversations()) = 'Sent it, see you at 2', 'latest message first';
end $$;
select public.set_payment_status(:'r', 'received');
update public.messages set read_at = now() where sender_id = '22222222-2222-2222-2222-222222222222' and recipient_id = auth.uid() and read_at is null;
do $$ begin
  assert (select unread from public.my_conversations()) = 0, 'cook read everything';
  assert (select last_kind from public.my_conversations()) = 'payment_received', 'payment received is the latest line';
end $$;

-- the buyer sees the received line as unread; a stranger sees nothing
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$ begin
  assert (select unread from public.my_conversations()) = 1, 'buyer has the payment line unread';
  begin
    update public.messages set body = 'edited' where sender_id = auth.uid();
    raise exception 'FAIL: edited a message';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
do $$ begin
  assert (select count(*) from public.messages) = 0, 'stranger reads no messages';
  assert (select count(*) from public.my_conversations()) = 0, 'stranger has no conversations';
end $$;

-- a cook who blocks someone stops getting their messages
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), '33333333-3333-3333-3333-333333333333');
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
do $$ begin
  begin
    insert into public.messages (sender_id, recipient_id, body) values (auth.uid(), '11111111-1111-1111-1111-111111111111', 'hello?');
    raise exception 'FAIL: blocked member messaged the cook';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo CHAT CHECKS PASSED
