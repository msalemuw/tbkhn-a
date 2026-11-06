-- tabkheen A: orders no longer stay open forever (founder, 2026-11-06).
-- 1. A request the cook never answers is cancelled after 24 hours and the plates go back on the menu.
-- 2. An accepted or ready order nobody collected is closed 24 hours after the pickup time as "Not picked up"
--    (plates are not returned: the food was made; it does not count as picked up for rankings or reviews).
-- 3. The cook gets one reminder first: 12 hours into an unanswered request, or 12 hours after pickup time.
-- 4. The buyer can cancel until the cook marks the order Ready (before: only while waiting).
-- The check runs every 15 minutes. Nothing is deleted: each step is in the order timeline and the history log.

create extension if not exists pg_cron;

alter table public.reservations drop constraint reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('pending', 'accepted', 'declined', 'ready', 'picked_up', 'cancelled', 'not_picked_up'));
alter table public.reservations add column reminded_at timestamptz;

alter table public.reservation_events drop constraint reservation_events_event_check;
alter table public.reservation_events add constraint reservation_events_event_check
  check (event in ('requested', 'accepted', 'declined', 'ready', 'picked_up', 'cancelled', 'payment_sent', 'payment_received',
                   'staff_note', 'expired', 'not_picked_up', 'reminded'));

-- Buyer may cancel while the order is waiting or accepted (not once it is ready).
create or replace function public.set_reservation_status(p_id uuid, p_status text, p_reason text default null)
returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.reservations;
  v_me uuid := auth.uid();
begin
  select * into v_row from public.reservations where id = p_id for update;
  if v_row.id is null or v_me not in (v_row.buyer_id, v_row.cook_id) then raise exception 'not found'; end if;

  if v_me = v_row.buyer_id and p_status = 'cancelled' and v_row.status in ('pending', 'accepted') then
    null;
  elsif v_me = v_row.cook_id and (
        (v_row.status = 'pending' and p_status in ('accepted', 'declined'))
     or (v_row.status = 'accepted' and p_status = 'ready')
     or (v_row.status = 'ready' and p_status = 'picked_up')) then
    null;
  else
    raise exception 'cannot change from % to %', v_row.status, p_status;
  end if;

  if p_status in ('cancelled', 'declined') then
    update public.posts set portions_left = least(portions_left + v_row.plates, portions_total) where id = v_row.post_id;
  end if;

  update public.reservations
     set status = p_status, cancel_reason = coalesce(p_reason, cancel_reason), updated_at = now()
   where id = p_id
   returning * into v_row;
  return v_row;
end;
$$;

-- The timeline names the system's own steps. A step taken by the system (app.system_action) sends its own
-- notifications, so the usual "buyer cancelled" one is skipped.
create or replace function public.log_reservation_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_system boolean := coalesce(current_setting('app.system_action', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    insert into public.reservation_events (reservation_id, event, actor_id, note)
      values (new.id, 'requested', new.buyer_id, new.note);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.reservation_events (reservation_id, event, actor_id, note)
      values (new.id,
              case when v_system and new.status = 'cancelled' then 'expired' else new.status end,
              auth.uid(),
              case when new.status in ('cancelled', 'declined') then new.cancel_reason end);
  end if;
  if new.payment_status is distinct from old.payment_status and new.payment_status <> 'none' then
    insert into public.reservation_events (reservation_id, event, actor_id)
      values (new.id, 'payment_' || new.payment_status, auth.uid());
  end if;
  return new;
end;
$$;

create or replace function public.notify_reservation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_dish text;
  v_quiet boolean := coalesce(current_setting('app.staff_action', true), '') = 'on'
                  or coalesce(current_setting('app.system_action', true), '') = 'on';
begin
  select dish_name into v_dish from public.posts where id = new.post_id;

  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, kind, payload)
      values (new.cook_id, 'order_new', jsonb_build_object('reservation_id', new.id, 'from', new.buyer_id, 'dish', v_dish, 'plates', new.plates));
    return new;
  end if;

  if new.status is distinct from old.status and not v_quiet then
    if new.status in ('accepted', 'declined', 'ready') then
      insert into public.notifications (user_id, kind, payload)
        values (new.buyer_id, 'order_' || new.status, jsonb_build_object('reservation_id', new.id, 'from', new.cook_id, 'dish', v_dish));
    elsif new.status = 'cancelled' then
      insert into public.notifications (user_id, kind, payload)
        values (new.cook_id, 'order_cancelled', jsonb_build_object('reservation_id', new.id, 'from', new.buyer_id, 'dish', v_dish));
    elsif new.status = 'picked_up' then
      insert into public.notifications (user_id, kind, payload)
        values (new.buyer_id, 'review_request', jsonb_build_object('reservation_id', new.id, 'from', new.cook_id, 'dish', v_dish));
    end if;
  end if;

  if new.payment_status is distinct from old.payment_status and new.payment_status in ('sent', 'received') then
    insert into public.notifications (user_id, kind, payload)
      values (case new.payment_status when 'sent' then new.cook_id else new.buyer_id end,
              'payment_' || new.payment_status,
              jsonb_build_object('reservation_id', new.id, 'from', case new.payment_status when 'sent' then new.buyer_id else new.cook_id end, 'dish', v_dish));
  end if;
  return new;
end;
$$;

-- The 15-minute check. Returns how many orders it reminded, cancelled and closed.
create function public.close_stale_orders() returns table (reminded int, cancelled int, closed int)
language plpgsql security definer set search_path = '' as $$
declare
  r public.reservations;
  v_dish text;
  n_rem int := 0;
  n_can int := 0;
  n_clo int := 0;
begin
  perform set_config('app.system_action', 'on', true);

  -- 1. Request nobody answered for 24 hours: cancel it, plates back on the menu.
  for r in select * from public.reservations where status = 'pending' and created_at < now() - interval '24 hours' for update skip locked loop
    select dish_name into v_dish from public.posts where id = r.post_id;
    update public.posts set portions_left = least(portions_left + r.plates, portions_total) where id = r.post_id;
    update public.reservations set status = 'cancelled', updated_at = now(),
           cancel_reason = 'No answer from the cook in 24 hours' where id = r.id;
    insert into public.notifications (user_id, kind, payload)
      select u, 'order_expired', jsonb_build_object('reservation_id', r.id, 'from', case when u = r.buyer_id then r.cook_id else r.buyer_id end, 'dish', v_dish)
        from unnest(array[r.buyer_id, r.cook_id]) u;
    n_can := n_can + 1;
  end loop;

  -- 2. Accepted or ready, and 24 hours past the pickup time: close as not picked up.
  for r in select * from public.reservations where status in ('accepted', 'ready')
            and coalesce(pickup_at, updated_at) < now() - interval '24 hours' for update skip locked loop
    select dish_name into v_dish from public.posts where id = r.post_id;
    update public.reservations set status = 'not_picked_up', updated_at = now(),
           cancel_reason = 'Closed automatically: not picked up within 24 hours of the pickup time' where id = r.id;
    insert into public.notifications (user_id, kind, payload)
      select u, 'order_not_picked_up', jsonb_build_object('reservation_id', r.id, 'from', case when u = r.buyer_id then r.cook_id else r.buyer_id end, 'dish', v_dish)
        from unnest(array[r.buyer_id, r.cook_id]) u;
    n_clo := n_clo + 1;
  end loop;

  -- 3. One reminder to the cook, 12 hours before either happens.
  for r in select * from public.reservations where reminded_at is null and (
              (status = 'pending' and created_at < now() - interval '12 hours')
           or (status in ('accepted', 'ready') and coalesce(pickup_at, updated_at) < now() - interval '12 hours')) for update skip locked loop
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
revoke execute on function public.close_stale_orders() from public, anon, authenticated;

select cron.schedule('close-stale-orders', '*/15 * * * *', 'select public.close_stale_orders()');

-- Staff order search: "Cancelled" also lists the orders the system closed as not picked up.
create or replace function public.admin_find_orders(p_query text default '', p_state text default null)
returns table (id uuid, created_at timestamptz, updated_at timestamptz, status text, payment_status text,
               plates int, price_egp numeric, pickup_at timestamptz, note text, cancel_reason text,
               dish_name text, community_name text,
               buyer_id uuid, buyer_username text, buyer_name text,
               cook_id uuid, cook_username text, cook_name text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := lower(trim(coalesce(p_query, '')));
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  if p_state is not null and p_state not in ('open', 'done', 'cancelled', 'stuck') then raise exception 'unknown order state'; end if;
  return query
    select r.id, r.created_at, r.updated_at, r.status, r.payment_status, r.plates, p.price_egp, r.pickup_at,
           r.note, r.cancel_reason, p.dish_name, c.name,
           b.id, b.username, b.display_name, k.id, k.username, k.display_name
      from public.reservations r
      join public.posts p on p.id = r.post_id
      join public.profiles b on b.id = r.buyer_id
      join public.profiles k on k.id = r.cook_id
      left join public.communities c on c.id = p.community_id
     where (p_state is null
            or (p_state = 'open' and r.status in ('pending', 'accepted', 'ready'))
            or (p_state = 'stuck' and r.status in ('pending', 'accepted', 'ready') and r.updated_at < now() - interval '24 hours')
            or (p_state = 'done' and r.status = 'picked_up')
            or (p_state = 'cancelled' and r.status in ('cancelled', 'declined', 'not_picked_up')))
       and (v_q = ''
            or r.id::text like v_q || '%'
            or b.username like '%' || v_q || '%' or lower(b.display_name) like '%' || v_q || '%'
            or k.username like '%' || v_q || '%' or lower(k.display_name) like '%' || v_q || '%'
            or lower(p.dish_name) like '%' || v_q || '%')
     order by r.created_at desc
     limit 50;
end;
$$;
