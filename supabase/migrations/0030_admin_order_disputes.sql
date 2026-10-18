-- tabkheen A: order disputes for staff (founder, 2026-10-18).
-- 1. Staff notes on an order, shown in its timeline (any staff role).
-- 2. Force an order into any status with a reason (owner or moderator): plates go back to the dish when an order
--    is cancelled or declined, and are taken again if it is revived. Both people are told in a notification.
-- 3. Orders search gets a "stuck" filter: open orders nobody has touched for 24 hours.
-- Every action is written to the activity log.

-- The order timeline can hold staff notes.
alter table public.reservation_events drop constraint reservation_events_event_check;
alter table public.reservation_events add constraint reservation_events_event_check
  check (event in ('requested', 'accepted', 'declined', 'ready', 'picked_up', 'cancelled', 'payment_sent', 'payment_received', 'staff_note'));

-- A forced status change sends its own notification, so the usual "the buyer cancelled" / "the cook declined"
-- ones are skipped when app.staff_action is set (by admin_force_order_status, for that one statement only).
create or replace function public.notify_reservation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_dish text;
begin
  select dish_name into v_dish from public.posts where id = new.post_id;

  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, kind, payload)
      values (new.cook_id, 'order_new', jsonb_build_object('reservation_id', new.id, 'from', new.buyer_id, 'dish', v_dish, 'plates', new.plates));
    return new;
  end if;

  if new.status is distinct from old.status and coalesce(current_setting('app.staff_action', true), '') <> 'on' then
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

-- ---------------------------------------------------------------------------
-- Staff note on an order
-- ---------------------------------------------------------------------------
create function public.admin_add_order_note(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  if char_length(btrim(coalesce(p_note, ''))) not between 1 and 500 then raise exception 'write a note of up to 500 letters'; end if;
  if not exists (select 1 from public.reservations where id = p_id) then raise exception 'order not found'; end if;
  insert into public.reservation_events (reservation_id, event, actor_id, note) values (p_id, 'staff_note', auth.uid(), btrim(p_note));
  perform public.log_admin_action('order_note_added', 'order', p_id::text, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Force a status
-- ---------------------------------------------------------------------------
create function public.admin_force_order_status(p_id uuid, p_status text, p_reason text) returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.reservations;
  v_post public.posts;
  v_old text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_was_off boolean;
  v_now_off boolean := p_status in ('cancelled', 'declined');
begin
  perform public.require_staff(array['owner', 'moderator']);
  if p_status not in ('pending', 'accepted', 'ready', 'picked_up', 'declined', 'cancelled') then raise exception 'unknown status'; end if;
  if char_length(v_reason) not between 3 and 190 then raise exception 'write a reason of 3 to 190 letters'; end if;

  select * into v_row from public.reservations where id = p_id for update;
  if v_row.id is null then raise exception 'order not found'; end if;
  if v_row.status = p_status then raise exception 'the order is already %', p_status; end if;
  v_old := v_row.status;
  v_was_off := v_old in ('cancelled', 'declined');

  select * into v_post from public.posts where id = v_row.post_id for update;
  if v_now_off and not v_was_off then
    update public.posts set portions_left = least(portions_left + v_row.plates, portions_total) where id = v_row.post_id;
  elsif v_was_off and not v_now_off then
    if v_post.portions_left < v_row.plates then raise exception 'not enough plates left on that dish to bring the order back'; end if;
    update public.posts set portions_left = portions_left - v_row.plates where id = v_row.post_id;
  end if;

  perform set_config('app.staff_action', 'on', true);
  update public.reservations
     set status = p_status, updated_at = now(),
         cancel_reason = case when v_now_off then 'Staff: ' || v_reason else cancel_reason end
   where id = p_id
   returning * into v_row;
  perform set_config('app.staff_action', '', true);

  insert into public.reservation_events (reservation_id, event, actor_id, note)
    values (p_id, 'staff_note', auth.uid(), 'Status set to ' || p_status || ' by staff: ' || v_reason);
  insert into public.notifications (user_id, kind, payload)
    select u, 'order_staff', jsonb_build_object('reservation_id', p_id, 'dish', v_post.dish_name, 'status', p_status, 'note', v_reason)
      from unnest(array[v_row.buyer_id, v_row.cook_id]) u;
  perform public.log_admin_action('order_status_forced', 'order', p_id::text, v_reason,
                                  jsonb_build_object('from', v_old, 'to', p_status));
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Orders search: add the 'stuck' filter (open orders untouched for 24 hours).
-- ---------------------------------------------------------------------------
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
            or (p_state = 'cancelled' and r.status in ('cancelled', 'declined')))
       and (v_q = ''
            or r.id::text like v_q || '%'
            or b.username like '%' || v_q || '%' or lower(b.display_name) like '%' || v_q || '%'
            or k.username like '%' || v_q || '%' or lower(k.display_name) like '%' || v_q || '%'
            or lower(p.dish_name) like '%' || v_q || '%')
     order by r.created_at desc
     limit 50;
end;
$$;

revoke execute on function public.admin_add_order_note(uuid, text), public.admin_force_order_status(uuid, text, text),
  public.admin_find_orders(text, text), public.notify_reservation() from public, anon, authenticated;
grant execute on function public.admin_add_order_note(uuid, text), public.admin_force_order_status(uuid, text, text),
  public.admin_find_orders(text, text) to authenticated;
