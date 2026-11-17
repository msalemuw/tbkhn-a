-- tabkheen A: payments go through the app (operations system, phase 2; founder 2026-11-17).
-- Behind a switch: nothing changes for anyone until the owner turns on "Pay through tabkheen A" in the admin (Controls),
-- and only orders placed after that use the new flow. Orders already open keep the old person-to-person InstaPay flow.
--
-- The new flow for an order:
--   1. The cook accepts. The eater has 20 minutes to pay tabkheen A's InstaPay and enter the transfer reference.
--   2. The owner sees the payment in the Finance tab, checks the money arrived, and confirms it (this writes the ledger row).
--   3. Only then can the cook mark the order ready. A reference nobody can find is rejected and the eater tries again.
--   4. At pickup the cook types the eater's 4-digit code. Wrong codes are counted; five wrong ones lock the order for staff.
--   5. The eater has 12 hours after pickup to report a problem, which opens a case and holds the cook's money.
--   No payment within 20 minutes: the order cancels itself and the plates go back on the menu.

-- ---------------------------------------------------------------------------
-- Controls: the switch and tabkheen A's own InstaPay address.
-- ---------------------------------------------------------------------------
alter table public.app_controls drop constraint app_controls_key_check;
alter table public.app_controls add constraint app_controls_key_check check (key in
  ('ordering_enabled', 'posting_enabled', 'maintenance', 'maintenance_message', 'min_app_version', 'menu_enabled', 'menu_message',
   'pay_through_app', 'app_instapay'));
insert into public.app_controls (key, value) values ('pay_through_app', 'false'::jsonb), ('app_instapay', '""'::jsonb)
  on conflict (key) do nothing;

create or replace function public.admin_set_control(p_key text, p_value jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_ended int := 0;
begin
  if p_key in ('ordering_enabled', 'posting_enabled', 'menu_enabled') then
    perform public.require_staff(array['owner', 'moderator']);
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'on or off only'; end if;
  elsif p_key = 'menu_message' then
    perform public.require_staff(array['owner', 'moderator']);
    if jsonb_typeof(p_value) <> 'string' or char_length(btrim(p_value #>> '{}')) not between 3 and 300 then raise exception 'write a message of 3 to 300 letters'; end if;
  elsif p_key = 'maintenance' then
    perform public.require_staff(array['owner']);
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'on or off only'; end if;
  elsif p_key = 'maintenance_message' then
    perform public.require_staff(array['owner']);
    if jsonb_typeof(p_value) <> 'string' or char_length(btrim(p_value #>> '{}')) not between 3 and 300 then raise exception 'write a message of 3 to 300 letters'; end if;
  elsif p_key = 'min_app_version' then
    perform public.require_staff(array['owner']);
    if jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') !~ '^([0-9]+(\.[0-9]+){0,2})?$' then raise exception 'use a version like 1.0.2, or leave it empty'; end if;
  elsif p_key = 'pay_through_app' then
    perform public.require_staff(array['owner']);
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'on or off only'; end if;
    if p_value = 'true'::jsonb and char_length(btrim(coalesce((select value #>> '{}' from public.app_controls where key = 'app_instapay'), ''))) < 3 then
      raise exception 'add tabkheen A''s InstaPay address first';
    end if;
  elsif p_key = 'app_instapay' then
    perform public.require_staff(array['owner']);
    if jsonb_typeof(p_value) <> 'string' or char_length(btrim(p_value #>> '{}')) > 60
       or (char_length(btrim(p_value #>> '{}')) between 1 and 2) then
      raise exception 'write the InstaPay address (3 to 60 letters), or leave it empty';
    end if;
    p_value := to_jsonb(btrim(p_value #>> '{}'));
  else
    raise exception 'unknown control';
  end if;
  select value into v_old from public.app_controls where key = p_key;
  update public.app_controls set value = p_value, updated_by = auth.uid(), updated_at = now() where key = p_key;
  -- Switching the menu off also ends today's dishes that are still open (orders already placed are not touched).
  if p_key = 'menu_enabled' and p_value = 'false'::jsonb then
    update public.posts set expires_at = now() where kind = 'cooking_today' and expires_at > now();
    get diagnostics v_ended = row_count;
  end if;
  perform public.log_admin_action('control_changed', 'control', p_key, null, jsonb_build_object('from', v_old, 'to', p_value, 'dishes_ended', v_ended));
end;
$$;

-- True when the new flow is on and tabkheen A's InstaPay address is set.
create function public.pay_through_app_on() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.control_on('pay_through_app')
     and char_length(coalesce((select value #>> '{}' from public.app_controls where key = 'app_instapay'), '')) >= 3;
$$;
revoke execute on function public.pay_through_app_on() from public, anon;
grant execute on function public.pay_through_app_on() to authenticated;

create or replace function public.app_status()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'maintenance', coalesce((select (value)::text = 'true' from public.app_controls where key = 'maintenance'), false),
    'maintenance_message', (select value #>> '{}' from public.app_controls where key = 'maintenance_message'),
    'min_app_version', coalesce((select value #>> '{}' from public.app_controls where key = 'min_app_version'), ''),
    'ordering_enabled', public.control_on('ordering_enabled'),
    'posting_enabled', public.control_on('posting_enabled'),
    'menu_enabled', public.control_on('menu_enabled'),
    'menu_message', (select value #>> '{}' from public.app_controls where key = 'menu_message'),
    'pay_through_app', public.pay_through_app_on());
$$;

-- ---------------------------------------------------------------------------
-- Orders: what the new flow needs.
-- ---------------------------------------------------------------------------
alter table public.reservations
  add column pay_through_app boolean not null default false,
  add column pay_by timestamptz,
  add column payment_reference text check (char_length(payment_reference) <= 80),
  add column payment_sent_at timestamptz,
  add column paid_at timestamptz,
  add column picked_up_at timestamptz;

-- The pickup code lives apart from the order so the cook's app can never read it.
create table public.reservation_codes (
  reservation_id uuid primary key references public.reservations (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$'),
  attempts int not null default 0,
  verified_at timestamptz
);
alter table public.reservation_codes enable row level security; -- no policies: only the functions below
revoke all on public.reservation_codes from anon, authenticated;

-- New orders follow the new flow when it is on.
create or replace function public.reserve_plates(p_post_id uuid, p_plates int, p_pickup_at timestamptz default null, p_note text default null)
returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_post public.posts;
  v_row public.reservations;
  v_pickup timestamptz;
  v_new boolean := public.pay_through_app_on();
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into v_post from public.posts where id = p_post_id for update;
  if v_post.id is null or v_post.kind <> 'cooking_today' then raise exception 'not orderable'; end if;
  if v_post.author_id = auth.uid() then raise exception 'cannot reserve your own dish'; end if;
  if v_post.expires_at <= now() then raise exception 'this dish is no longer available today'; end if;
  if exists (select 1 from public.blocks where blocker_id = v_post.author_id and blocked_id = auth.uid()) then
    raise exception 'not orderable';
  end if;
  if p_plates < 1 or p_plates > v_post.portions_left then raise exception 'only % plates left', v_post.portions_left; end if;
  v_pickup := coalesce(p_pickup_at, v_post.ready_at);
  if v_pickup < v_post.ready_at - interval '1 minute' or v_pickup > v_post.expires_at then
    raise exception 'pick a time between the ready time and the end of the day';
  end if;

  update public.posts set portions_left = portions_left - p_plates where id = p_post_id;
  insert into public.reservations (post_id, buyer_id, cook_id, plates, pickup_at, note, pay_through_app)
    values (p_post_id, auth.uid(), v_post.author_id, p_plates, v_pickup, nullif(trim(p_note), ''), v_new)
    returning * into v_row;
  if v_new then
    insert into public.reservation_codes (reservation_id, code) values (v_row.id, lpad((floor(random() * 10000))::int::text, 4, '0'));
  end if;
  return v_row;
end;
$$;

-- Status changes. New orders: the cook can mark ready only after payment is confirmed, and picked up only after the
-- eater's code was verified (see confirm_pickup). Accepting starts the 20 minutes to pay.
drop function public.set_reservation_status(uuid, text, text);
create function public.set_reservation_status(p_id uuid, p_status text, p_reason text default null)
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
    if v_row.pay_through_app and p_status = 'ready' and v_row.payment_status <> 'received' then
      raise exception 'payment not confirmed yet';
    end if;
    if v_row.pay_through_app and p_status = 'picked_up'
       and not exists (select 1 from public.reservation_codes c where c.reservation_id = p_id and c.verified_at > now() - interval '5 minutes') then
      raise exception 'enter the eater''s pickup code';
    end if;
  else
    raise exception 'cannot change from % to %', v_row.status, p_status;
  end if;

  if p_status in ('cancelled', 'declined') then
    update public.posts set portions_left = least(portions_left + v_row.plates, portions_total) where id = v_row.post_id;
  end if;

  update public.reservations
     set status = p_status, cancel_reason = coalesce(p_reason, cancel_reason), updated_at = now(),
         pay_by = case when p_status = 'accepted' and v_row.pay_through_app then now() + interval '20 minutes' else pay_by end,
         picked_up_at = case when p_status = 'picked_up' then now() else picked_up_at end
   where id = p_id
   returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.set_reservation_status(uuid, text, text) from public, anon;
grant execute on function public.set_reservation_status(uuid, text, text) to authenticated;

-- The old person-to-person payment buttons do not apply to new-flow orders.
create or replace function public.set_payment_status(p_id uuid, p_status text) returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.reservations;
begin
  select * into v_row from public.reservations where id = p_id for update;
  if v_row.id is null then raise exception 'not found'; end if;
  if v_row.pay_through_app then raise exception 'not allowed'; end if;
  if not ((p_status = 'sent' and auth.uid() = v_row.buyer_id)
       or (p_status = 'received' and auth.uid() = v_row.cook_id)) then
    raise exception 'not allowed';
  end if;
  update public.reservations set payment_status = p_status, updated_at = now() where id = p_id returning * into v_row;
  return v_row;
end;
$$;

-- The eater says they paid, with the InstaPay transfer reference.
create function public.submit_payment(p_id uuid, p_reference text) returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.reservations;
  v_ref text := trim(coalesce(p_reference, ''));
begin
  select * into v_row from public.reservations where id = p_id for update;
  if v_row.id is null or v_row.buyer_id <> auth.uid() or not v_row.pay_through_app then raise exception 'not allowed'; end if;
  if v_row.status <> 'accepted' then raise exception 'this order is not waiting for payment'; end if;
  if v_row.payment_status <> 'none' then raise exception 'payment was already sent'; end if;
  if char_length(v_ref) < 3 then raise exception 'enter the InstaPay reference'; end if;
  update public.reservations
     set payment_status = 'sent', payment_reference = v_ref, payment_sent_at = now(), updated_at = now()
   where id = p_id returning * into v_row;
  return v_row;
end;
$$;

-- What the eater's order screen needs: where to pay, by when, and (once paid) the pickup code.
create function public.order_payment_info(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_r public.reservations;
begin
  select * into v_r from public.reservations where id = p_id;
  if v_r.id is null or v_r.buyer_id <> auth.uid() or not v_r.pay_through_app then return null; end if;
  return jsonb_build_object(
    'instapay', (select value #>> '{}' from public.app_controls where key = 'app_instapay'),
    'pay_by', v_r.pay_by,
    'pickup_code', case when v_r.payment_status = 'received'
                        then (select c.code from public.reservation_codes c where c.reservation_id = v_r.id) end);
end;
$$;

-- The cook enters the eater's code. Returns 'ok' (the order is now picked up), 'wrong' or 'locked'.
-- Wrong tries are counted outside the change so they are kept; five wrong tries lock the order for staff.
create function public.confirm_pickup(p_id uuid, p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_r public.reservations;
  v_c public.reservation_codes;
begin
  select * into v_r from public.reservations where id = p_id for update;
  if v_r.id is null or v_r.cook_id <> auth.uid() then raise exception 'not found'; end if;
  if not v_r.pay_through_app then raise exception 'not allowed'; end if;
  if v_r.status <> 'ready' then raise exception 'cannot change from % to picked_up', v_r.status; end if;
  select * into v_c from public.reservation_codes where reservation_id = p_id for update;
  if v_c.reservation_id is null or v_c.attempts >= 5 then return 'locked'; end if;
  if trim(coalesce(p_code, '')) <> v_c.code then
    update public.reservation_codes set attempts = attempts + 1 where reservation_id = p_id;
    return case when v_c.attempts + 1 >= 5 then 'locked' else 'wrong' end;
  end if;
  update public.reservation_codes set verified_at = now() where reservation_id = p_id;
  perform public.set_reservation_status(p_id, 'picked_up', null);
  return 'ok';
end;
$$;

-- Unpaid orders cancel themselves 20 minutes after the cook accepts. Checked every minute.
create function public.expire_unpaid_orders() returns int
language plpgsql security definer set search_path = '' as $$
declare
  r public.reservations;
  v_dish text;
  n int := 0;
begin
  perform set_config('app.system_action', 'on', true);
  for r in select * from public.reservations
            where pay_through_app and status = 'accepted' and payment_status = 'none' and pay_by < now()
              for update skip locked loop
    select dish_name into v_dish from public.posts where id = r.post_id;
    update public.posts set portions_left = least(portions_left + r.plates, portions_total) where id = r.post_id;
    update public.reservations set status = 'cancelled', updated_at = now(),
           cancel_reason = 'No payment within 20 minutes' where id = r.id;
    insert into public.notifications (user_id, kind, payload)
      select u, 'order_unpaid', jsonb_build_object('reservation_id', r.id, 'from', case when u = r.buyer_id then r.cook_id else r.buyer_id end, 'dish', v_dish)
        from unnest(array[r.buyer_id, r.cook_id]) u;
    n := n + 1;
  end loop;
  perform set_config('app.system_action', '', true);
  return n;
end;
$$;
revoke execute on function public.expire_unpaid_orders() from public, anon, authenticated;
select cron.schedule('expire-unpaid-orders', '* * * * *', 'select public.expire_unpaid_orders()');

-- The eater reports a problem within 12 hours of pickup: a case opens and the cook's money for the order is held.
create function public.report_order_problem(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_r public.reservations;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'tell us what went wrong'; end if;
  select * into v_r from public.reservations where id = p_id;
  if v_r.id is null or v_r.buyer_id <> auth.uid() or not v_r.pay_through_app then raise exception 'not allowed'; end if;
  if v_r.status <> 'picked_up' or coalesce(v_r.picked_up_at, v_r.updated_at) < now() - interval '12 hours' then
    raise exception 'problems can be reported within 12 hours of pickup';
  end if;
  if exists (select 1 from public.payment_cases where reservation_id = p_id and status = 'open') then return; end if;
  insert into public.payment_cases (reservation_id, opened_by, reason) values (p_id, auth.uid(), left(trim(p_reason), 500));
end;
$$;

-- Notifications for the new flow. Same as before, except: the cook is not asked to confirm payment, the eater and the
-- cook are told when tabkheen A confirms it.
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
    if new.pay_through_app then
      if new.payment_status = 'received' then
        insert into public.notifications (user_id, kind, payload)
          values (new.buyer_id, 'payment_confirmed', jsonb_build_object('reservation_id', new.id, 'dish', v_dish)),
                 (new.cook_id, 'payment_confirmed_cook', jsonb_build_object('reservation_id', new.id, 'from', new.buyer_id, 'dish', v_dish));
      end if;
    else
      insert into public.notifications (user_id, kind, payload)
        values (case new.payment_status when 'sent' then new.cook_id else new.buyer_id end,
                'payment_' || new.payment_status,
                jsonb_build_object('reservation_id', new.id, 'from', case new.payment_status when 'sent' then new.buyer_id else new.cook_id end, 'dish', v_dish));
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ledger: a payment recorded for a new-flow order also marks the order paid. A cook's money is payable 12 hours after pickup.
-- ---------------------------------------------------------------------------
create or replace function public.ledger_cook_payable(p_cook uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select greatest(0, coalesce(sum(e.cook_egp), 0))
    from public.ledger_entries e
    left join public.reservations r on r.id = e.reservation_id
   where e.cook_id = p_cook
     and (e.reservation_id is null
          or (r.status = 'picked_up' and coalesce(r.picked_up_at, r.updated_at) < now() - interval '12 hours'
              and not exists (select 1 from public.payment_cases c where c.reservation_id = r.id and c.status = 'open')));
$$;
revoke all on function public.ledger_cook_payable(uuid) from public, anon, authenticated;

create or replace function public.admin_ledger_record_payment(p_reservation_id uuid, p_reference text, p_amount numeric default null, p_note text default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.require_staff(array['owner']);
  v_r public.reservations;
  v_expected numeric;
  v_amount numeric;
  v_ref text := trim(coalesce(p_reference, ''));
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('ledger'));
  if char_length(v_ref) < 3 then raise exception 'the InstaPay reference is required'; end if;
  select * into v_r from public.reservations where id = p_reservation_id for update;
  if v_r.id is null then raise exception 'order not found'; end if;
  select coalesce(p.price_egp, 0) * v_r.plates into v_expected from public.posts p where p.id = v_r.post_id;
  v_amount := round(coalesce(p_amount, v_expected), 2);
  if v_amount <= 0 then raise exception 'enter the amount received'; end if;
  if v_amount <> v_expected and char_length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'the amount differs from the order total (% EGP): write why', v_expected;
  end if;
  if exists (select 1 from public.ledger_entries e
              where e.reservation_id = v_r.id and e.entry_type = 'payment_received'
                and not exists (select 1 from public.ledger_entries x where x.reverses_id = e.id)) then
    raise exception 'a payment is already recorded for this order';
  end if;
  if exists (select 1 from public.ledger_entries e
              where e.entry_type = 'payment_received' and lower(e.reference) = lower(v_ref)
                and not exists (select 1 from public.ledger_entries x where x.reverses_id = e.id)) then
    raise exception 'this InstaPay reference was already used for another payment';
  end if;

  insert into public.ledger_entries (entry_type, cash_egp, cook_egp, reservation_id, cook_id, buyer_id, reference, note, recorded_by)
    values ('payment_received', v_amount, v_amount, v_r.id, v_r.cook_id, v_r.buyer_id, v_ref, nullif(trim(p_note), ''), v_actor)
    returning id into v_id;
  if v_r.pay_through_app and v_r.payment_status <> 'received' then
    update public.reservations set payment_status = 'received', paid_at = now(), updated_at = now() where id = v_r.id;
  end if;
  perform public.log_admin_action('ledger_payment_recorded', 'order', v_r.id::text, p_note,
    jsonb_build_object('ledger_id', v_id, 'amount_egp', v_amount, 'reference', v_ref));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Finance tab: payments waiting for the owner, and refunds that are due.
-- ---------------------------------------------------------------------------
create function public.admin_payments_waiting()
returns table (id uuid, order_code text, dish_name text, plates int, total_egp numeric, buyer_username text, buyer_name text,
               cook_username text, cook_name text, payment_reference text, payment_sent_at timestamptz, status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner']);
  return query
    select r.id, upper(left(r.id::text, 8)), p.dish_name, r.plates, p.price_egp * r.plates,
           b.username, b.display_name, k.username, k.display_name, r.payment_reference, r.payment_sent_at, r.status
      from public.reservations r
      join public.posts p on p.id = r.post_id
      join public.profiles b on b.id = r.buyer_id
      join public.profiles k on k.id = r.cook_id
     where r.pay_through_app and r.payment_status = 'sent'
     order by r.payment_sent_at;
end;
$$;

create function public.admin_confirm_payment(p_id uuid, p_amount numeric default null, p_note text default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_r public.reservations;
begin
  perform public.require_staff(array['owner']);
  select * into v_r from public.reservations where id = p_id;
  if v_r.id is null or not v_r.pay_through_app then raise exception 'order not found'; end if;
  if v_r.payment_status <> 'sent' then raise exception 'there is no payment waiting for this order'; end if;
  return public.admin_ledger_record_payment(p_id, v_r.payment_reference, p_amount, p_note);
end;
$$;

-- No money found for this reference: the eater is told and has another 20 minutes.
create function public.admin_reject_payment(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_r public.reservations;
  v_dish text;
begin
  perform public.require_staff(array['owner']);
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  select * into v_r from public.reservations where id = p_id for update;
  if v_r.id is null or not v_r.pay_through_app or v_r.payment_status <> 'sent' then raise exception 'there is no payment waiting for this order'; end if;
  select dish_name into v_dish from public.posts where id = v_r.post_id;
  update public.reservations
     set payment_status = 'none', payment_reference = null, payment_sent_at = null, pay_by = now() + interval '20 minutes', updated_at = now()
   where id = p_id;
  insert into public.reservation_events (reservation_id, event, actor_id, note)
    values (p_id, 'staff_note', auth.uid(), 'Payment not found: ' || trim(p_reason));
  insert into public.notifications (user_id, kind, payload)
    values (v_r.buyer_id, 'payment_rejected', jsonb_build_object('reservation_id', p_id, 'dish', v_dish, 'reason', left(trim(p_reason), 200)));
  perform public.log_admin_action('payment_rejected', 'order', p_id::text, p_reason);
end;
$$;

-- Money to give back: an order with money in the ledger that ended cancelled, declined or not picked up.
create function public.admin_refunds_due()
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
     where r.status in ('cancelled', 'declined', 'not_picked_up')
     order by r.updated_at;
end;
$$;

revoke execute on function
  public.submit_payment(uuid, text), public.order_payment_info(uuid), public.confirm_pickup(uuid, text),
  public.report_order_problem(uuid, text), public.admin_payments_waiting(), public.admin_confirm_payment(uuid, numeric, text),
  public.admin_reject_payment(uuid, text), public.admin_refunds_due() from public, anon;
grant execute on function
  public.submit_payment(uuid, text), public.order_payment_info(uuid), public.confirm_pickup(uuid, text),
  public.report_order_problem(uuid, text), public.admin_payments_waiting(), public.admin_confirm_payment(uuid, numeric, text),
  public.admin_reject_payment(uuid, text), public.admin_refunds_due() to authenticated;
