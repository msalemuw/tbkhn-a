-- Chat between members (s20 Inbox > Messages, s23 conversation).
-- Payment is InstaPay person to person (section 13), confirmed in the chat: when the buyer taps
-- "Payment sent" or the cook taps "Payment received", a payment line appears in their conversation.

alter table public.messages add column kind text not null default 'text'
  check (kind in ('text', 'payment_sent', 'payment_received'));

-- Whether p_blocker has blocked the signed-in member. Policies need this helper because a member
-- can only see their own blocks, so a policy reading public.blocks never saw the other side's block.
create function public.blocked_by(p_blocker uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks where blocker_id = p_blocker and blocked_id = auth.uid());
$$;
revoke execute on function public.blocked_by(uuid) from public, anon;
grant execute on function public.blocked_by(uuid) to authenticated;

-- The app sends text only; payment lines come from the trigger below. Nobody can message someone who blocked them.
drop policy "send messages" on public.messages;
create policy "send messages" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and kind = 'text' and not public.blocked_by(recipient_id));

create function public.chat_payment_line() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_total numeric;
begin
  if new.payment_status is distinct from old.payment_status and new.payment_status in ('sent', 'received') then
    select p.price_egp * new.plates into v_total from public.posts p where p.id = new.post_id;
    insert into public.messages (sender_id, recipient_id, reservation_id, kind, body)
      values (case new.payment_status when 'sent' then new.buyer_id else new.cook_id end,
              case new.payment_status when 'sent' then new.cook_id else new.buyer_id end,
              new.id,
              'payment_' || new.payment_status,
              -- Fallback wording; the app writes its own from kind and the order.
              case new.payment_status when 'sent' then 'Payment sent' else 'Payment received' end
                || ' · EGP ' || coalesce(trim(trailing '.' from trim(trailing '0' from v_total::text)), '?') || ' by InstaPay');
  end if;
  return new;
end;
$$;

create trigger reservations_chat_payment after update of payment_status on public.reservations
  for each row execute function public.chat_payment_line();

revoke execute on function public.chat_payment_line() from public, anon, authenticated;

-- Inbox list: one row per person, newest conversation first, with unread count.
create function public.my_conversations()
returns table (partner_id uuid, last_body text, last_kind text, last_at timestamptz, last_from_me boolean, unread int)
language sql stable security invoker set search_path = '' as $$
  with mine as (
    select m.*, case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end as partner
      from public.messages m
     where auth.uid() in (m.sender_id, m.recipient_id)
  ), latest as (
    select distinct on (partner) partner, body, kind, created_at, sender_id = auth.uid() as from_me
      from mine
     order by partner, created_at desc
  )
  select l.partner, l.body, l.kind, l.created_at, l.from_me,
         (select count(*) from mine u where u.partner = l.partner and u.recipient_id = auth.uid() and u.read_at is null)::int
    from latest l
   order by l.created_at desc;
$$;

revoke execute on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

-- New messages arrive live in an open conversation (Supabase Realtime respects the select policy).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
