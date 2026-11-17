-- tabkheen A, 2026-11-17 (founder decisions):
--   1. An accepted or ready order the eater never collects closes 5 hours after the pickup time (was 24 hours).
--   2. A paid no-show is NOT refunded: the cook keeps the money, because she cooked it and cannot resell it. The owner can still
--      refund one by hand (Finance, Find order, Refund) if a case calls for it.
--   3. A request can never outlive its pickup time: the cook's answer deadline is the earlier of 45 minutes and the pickup
--      time, but never less than 15 minutes from the order. (The 45 minutes is still the default of reservations.answer_by.)
-- Nothing is deleted. Run once in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- 3. Answer deadline capped at the pickup time (new orders only).
-- ---------------------------------------------------------------------------
create function public.cap_answer_by() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.pickup_at is not null then
    new.answer_by := least(new.answer_by, greatest(new.pickup_at, now() + interval '15 minutes'));
  end if;
  return new;
end;
$$;
create trigger reservations_cap_answer_by before insert on public.reservations
  for each row execute function public.cap_answer_by();

-- ---------------------------------------------------------------------------
-- 1. The 15-minute check. Step 2 now closes at 5 hours after the pickup time and tells each person what it means for them.
--    Step 3 reminds the cook 2 hours after the pickup time (the order is still open then). The 24-hour cancel of an
--    unanswered request (step 1) can no longer be reached because requests now expire at their answer time; it stays as a safety net.
-- ---------------------------------------------------------------------------
create or replace function public.close_stale_orders() returns table (reminded int, cancelled int, closed int)
language plpgsql security definer set search_path = '' as $$
declare
  r public.reservations;
  v_dish text;
  v_paid boolean;
  n_rem int := 0;
  n_can int := 0;
  n_clo int := 0;
begin
  perform set_config('app.system_action', 'on', true);

  -- 1. Safety net: a request nobody answered for 24 hours is cancelled, plates back on the menu.
  for r in select * from public.reservations where status = 'pending' and created_at < now() - interval '24 hours' for update skip locked loop
    select dish_name into v_dish from public.posts where id = r.post_id;
    update public.posts set portions_left = least(portions_left + r.plates, portions_total) where id = r.post_id;
    update public.reservations set status = 'cancelled', updated_at = now(),
           cancel_reason = 'No answer from the cook in time' where id = r.id;
    insert into public.notifications (user_id, kind, payload)
      select u, 'order_expired', jsonb_build_object('reservation_id', r.id, 'from', case when u = r.buyer_id then r.cook_id else r.buyer_id end, 'dish', v_dish)
        from unnest(array[r.buyer_id, r.cook_id]) u;
    n_can := n_can + 1;
  end loop;

  -- 2. Accepted or ready, and 5 hours past the pickup time: close as not picked up.
  for r in select * from public.reservations where status in ('accepted', 'ready')
            and coalesce(pickup_at, updated_at) < now() - interval '5 hours' for update skip locked loop
    select dish_name into v_dish from public.posts where id = r.post_id;
    v_paid := r.pay_through_app and r.payment_status = 'received';
    update public.reservations set status = 'not_picked_up', updated_at = now(),
           cancel_reason = 'Closed automatically: not picked up within 5 hours of the pickup time' where id = r.id;
    insert into public.notifications (user_id, kind, payload)
      select u, 'order_not_picked_up',
             jsonb_build_object('reservation_id', r.id, 'from', case when u = r.buyer_id then r.cook_id else r.buyer_id end, 'dish', v_dish,
                                'role', case when u = r.cook_id then 'cook' else 'buyer' end, 'paid', v_paid)
        from unnest(array[r.buyer_id, r.cook_id]) u;
    n_clo := n_clo + 1;
  end loop;

  -- 3. One reminder to the cook, 2 hours after the pickup time, while the order is still open.
  for r in select * from public.reservations where reminded_at is null and status in ('accepted', 'ready')
            and coalesce(pickup_at, updated_at) < now() - interval '2 hours' for update skip locked loop
    select dish_name into v_dish from public.posts where id = r.post_id;
    insert into public.notifications (user_id, kind, payload)
      values (r.cook_id, 'order_reminder', jsonb_build_object('reservation_id', r.id, 'from', r.buyer_id, 'dish', v_dish, 'status', r.status));
    update public.reservations set reminded_at = now() where id = r.id;
    insert into public.reservation_events (reservation_id, event, note)
      values (r.id, 'reminded', 'Reminder sent to the cook');
    n_rem := n_rem + 1;
  end loop;

  perform set_config('app.system_action', '', true);
  return query select n_rem, n_can, n_clo;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The cook keeps the money of a paid no-show: it counts as payable at once (no problem window, the eater never had the food).
--    An open case still holds it. Same function as 0060 plus the not_picked_up branch.
-- ---------------------------------------------------------------------------
create or replace function public.ledger_cook_payable(p_cook uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select greatest(0, coalesce(sum(e.cook_egp), 0))
    from public.ledger_entries e
    left join public.reservations r on r.id = e.reservation_id
   where e.cook_id = p_cook
     and (e.reservation_id is null
          or ((   (r.status = 'picked_up' and coalesce(r.picked_up_at, r.updated_at) < now() - interval '12 hours')
               or  r.status = 'not_picked_up')
              and not exists (select 1 from public.payment_cases c where c.reservation_id = r.id and c.status = 'open')));
$$;
revoke all on function public.ledger_cook_payable(uuid) from public, anon, authenticated;

-- Refunds due: a paid no-show is no longer in this list (the owner can still refund it by hand from Find order).
create or replace function public.admin_refunds_due()
returns table (id uuid, order_code text, dish_name text, status text, amount_egp numeric,
               buyer_username text, buyer_name text, cook_username text, cook_name text, cancel_reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner']);
  return query
    select r.id, upper(left(r.id::text, 8)), p.dish_name, r.status, n.net, b.username, b.display_name, k.username, k.display_name, r.cancel_reason
      from (select e.reservation_id as rid, sum(e.cash_egp) as net
              from public.ledger_entries e
             where e.reservation_id is not null and e.entry_type in ('payment_received', 'refund', 'reversal')
             group by e.reservation_id having sum(e.cash_egp) > 0) n
      join public.reservations r on r.id = n.rid
      join public.posts p on p.id = r.post_id
      join public.profiles b on b.id = r.buyer_id
      join public.profiles k on k.id = r.cook_id
     where r.status in ('cancelled', 'declined')
     order by r.updated_at;
end;
$$;
