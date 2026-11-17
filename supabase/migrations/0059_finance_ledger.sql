-- tabkheen A: the money ledger (operations system, phase 1; founder 2026-11-17).
-- Every payment, refund and payout is one permanent row. Rows are never edited or deleted: a mistake is fixed with a reversal row.
-- Two amounts per row keep the books honest:
--   cash_egp = change in the money in the founder's InstaPay account
--   cook_egp = change in what the founder owes the cook (positive = owed to the cook)
-- Cook balance = sum of cook_egp. Money held for cooks can never exceed the cash, and the difference is the founder's own money.
-- This migration changes nothing in the app: it only adds the ledger, cases and the owner-only Finance tab functions.

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  entry_type text not null check (entry_type in
    ('payment_received', 'refund', 'cook_payout', 'platform_fee', 'packaging_sale', 'packaging_cost', 'adjustment', 'reversal')),
  cash_egp numeric(12, 2) not null,
  cook_egp numeric(12, 2) not null default 0,
  reservation_id uuid references public.reservations (id) on delete restrict,
  cook_id uuid references public.profiles (id) on delete restrict,
  buyer_id uuid references public.profiles (id) on delete restrict,
  reference text check (char_length(reference) <= 80),
  note text check (char_length(note) <= 500),
  reverses_id bigint references public.ledger_entries (id) on delete restrict,
  recorded_by uuid not null,
  constraint ledger_shape check (case entry_type
    when 'payment_received' then cash_egp > 0 and cook_egp = cash_egp and reservation_id is not null and cook_id is not null
    when 'refund' then cash_egp < 0 and cook_egp = cash_egp and reservation_id is not null and cook_id is not null
    when 'cook_payout' then cash_egp < 0 and cook_egp = cash_egp and cook_id is not null and reservation_id is null
    when 'platform_fee' then cash_egp = 0 and cook_egp < 0 and cook_id is not null
    when 'packaging_sale' then cash_egp >= 0 and cook_egp <= 0 and cash_egp - cook_egp > 0 and cook_id is not null
    when 'packaging_cost' then cash_egp < 0 and cook_egp = 0
    when 'adjustment' then (cash_egp <> 0 or cook_egp <> 0) and char_length(coalesce(note, '')) >= 3
    when 'reversal' then reverses_id is not null
  end)
);
create index ledger_entries_cook_idx on public.ledger_entries (cook_id, created_at desc);
create index ledger_entries_reservation_idx on public.ledger_entries (reservation_id);
create index ledger_entries_reverses_idx on public.ledger_entries (reverses_id) where reverses_id is not null;
create index ledger_entries_day_idx on public.ledger_entries (created_at desc);

alter table public.ledger_entries enable row level security;
revoke all on public.ledger_entries from anon, authenticated;
revoke all on sequence public.ledger_entries_id_seq from anon, authenticated;

create function public.ledger_no_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'ledger rows cannot be changed or deleted: add a reversal instead';
end;
$$;
create trigger ledger_immutable before update or delete on public.ledger_entries
  for each row execute function public.ledger_no_change();
create trigger ledger_no_truncate before truncate on public.ledger_entries
  for each statement execute function public.ledger_no_change();

-- A case holds a cook's payout for one order while a problem is looked into.
create table public.payment_cases (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete restrict,
  opened_by uuid not null,
  opened_at timestamptz not null default now(),
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text check (char_length(resolution) <= 500),
  resolved_by uuid,
  resolved_at timestamptz
);
create unique index payment_cases_one_open on public.payment_cases (reservation_id) where status = 'open';
alter table public.payment_cases enable row level security;
revoke all on public.payment_cases from anon, authenticated;
create trigger audit_payment_cases after insert or update or delete on public.payment_cases
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- What the founder can pay a cook right now: money from orders picked up more than 12 hours ago with no open case,
-- minus payouts already made. Internal helper, not callable from the app.
-- ---------------------------------------------------------------------------
create function public.ledger_cook_payable(p_cook uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select greatest(0, coalesce(sum(e.cook_egp), 0))
    from public.ledger_entries e
    left join public.reservations r on r.id = e.reservation_id
   where e.cook_id = p_cook
     and (e.reservation_id is null
          or (r.status = 'picked_up' and r.updated_at < now() - interval '12 hours'
              and not exists (select 1 from public.payment_cases c where c.reservation_id = r.id and c.status = 'open')));
$$;
revoke all on function public.ledger_cook_payable(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Writing to the ledger (owner only; every use is also written to the activity log).
-- ---------------------------------------------------------------------------
create function public.admin_ledger_record_payment(p_reservation_id uuid, p_reference text, p_amount numeric default null, p_note text default null)
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
  select * into v_r from public.reservations where id = p_reservation_id;
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
  perform public.log_admin_action('ledger_payment_recorded', 'order', v_r.id::text, p_note,
    jsonb_build_object('ledger_id', v_id, 'amount_egp', v_amount, 'reference', v_ref));
  return v_id;
end;
$$;

create function public.admin_ledger_record_refund(p_reservation_id uuid, p_amount numeric, p_reason text, p_reference text default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.require_staff(array['owner']);
  v_r public.reservations;
  v_net numeric;
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('ledger'));
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  if v_amount <= 0 then raise exception 'enter the amount to refund'; end if;
  select * into v_r from public.reservations where id = p_reservation_id;
  if v_r.id is null then raise exception 'order not found'; end if;
  select coalesce(sum(e.cash_egp), 0) into v_net from public.ledger_entries e
   where e.reservation_id = v_r.id and e.entry_type in ('payment_received', 'refund', 'reversal');
  if v_amount > v_net then raise exception 'only % EGP is left to refund on this order', v_net; end if;

  insert into public.ledger_entries (entry_type, cash_egp, cook_egp, reservation_id, cook_id, buyer_id, reference, note, recorded_by)
    values ('refund', -v_amount, -v_amount, v_r.id, v_r.cook_id, v_r.buyer_id, nullif(trim(p_reference), ''), trim(p_reason), v_actor)
    returning id into v_id;
  perform public.log_admin_action('ledger_refund_recorded', 'order', v_r.id::text, p_reason,
    jsonb_build_object('ledger_id', v_id, 'amount_egp', v_amount));
  return v_id;
end;
$$;

create function public.admin_ledger_record_payout(p_cook_id uuid, p_amount numeric, p_reference text, p_note text default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.require_staff(array['owner']);
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_ref text := trim(coalesce(p_reference, ''));
  v_payable numeric;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('ledger'));
  if char_length(v_ref) < 3 then raise exception 'the InstaPay reference of the transfer is required'; end if;
  if v_amount <= 0 then raise exception 'enter the amount paid'; end if;
  if not exists (select 1 from public.profiles where id = p_cook_id) then raise exception 'cook not found'; end if;
  v_payable := public.ledger_cook_payable(p_cook_id);
  if v_amount > v_payable then raise exception 'only % EGP is payable to this cook now', v_payable; end if;
  if exists (select 1 from public.ledger_entries e
              where e.entry_type = 'cook_payout' and lower(e.reference) = lower(v_ref)
                and not exists (select 1 from public.ledger_entries x where x.reverses_id = e.id)) then
    raise exception 'this transfer reference was already used for another payout';
  end if;

  insert into public.ledger_entries (entry_type, cash_egp, cook_egp, cook_id, reference, note, recorded_by)
    values ('cook_payout', -v_amount, -v_amount, p_cook_id, v_ref, nullif(trim(p_note), ''), v_actor)
    returning id into v_id;
  perform public.log_admin_action('ledger_payout_recorded', 'profile', p_cook_id::text, p_note,
    jsonb_build_object('ledger_id', v_id, 'amount_egp', v_amount, 'reference', v_ref));
  return v_id;
end;
$$;

-- For anything else (a bank fee, an opening balance): either amount may be positive or negative. A reason is required.
create function public.admin_ledger_adjust(p_cash numeric, p_cook numeric, p_cook_id uuid, p_reason text)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.require_staff(array['owner']);
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('ledger'));
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  if coalesce(p_cash, 0) = 0 and coalesce(p_cook, 0) = 0 then raise exception 'enter an amount'; end if;
  if coalesce(p_cook, 0) <> 0 and p_cook_id is null then raise exception 'choose the cook this affects'; end if;
  if p_cook_id is not null and not exists (select 1 from public.profiles where id = p_cook_id) then raise exception 'cook not found'; end if;
  insert into public.ledger_entries (entry_type, cash_egp, cook_egp, cook_id, note, recorded_by)
    values ('adjustment', round(coalesce(p_cash, 0), 2), round(coalesce(p_cook, 0), 2), p_cook_id, trim(p_reason), v_actor)
    returning id into v_id;
  perform public.log_admin_action('ledger_adjustment', 'ledger', v_id::text, p_reason,
    jsonb_build_object('cash_egp', p_cash, 'cook_egp', p_cook, 'cook_id', p_cook_id));
  return v_id;
end;
$$;

create function public.admin_ledger_reverse(p_entry_id bigint, p_reason text)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.require_staff(array['owner']);
  v_e public.ledger_entries;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('ledger'));
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  select * into v_e from public.ledger_entries where id = p_entry_id;
  if v_e.id is null then raise exception 'entry not found'; end if;
  if v_e.entry_type = 'reversal' then raise exception 'a reversal cannot be reversed'; end if;
  if exists (select 1 from public.ledger_entries x where x.reverses_id = v_e.id) then raise exception 'this entry was already reversed'; end if;
  insert into public.ledger_entries (entry_type, cash_egp, cook_egp, reservation_id, cook_id, buyer_id, reference, note, reverses_id, recorded_by)
    values ('reversal', -v_e.cash_egp, -v_e.cook_egp, v_e.reservation_id, v_e.cook_id, v_e.buyer_id, v_e.reference, trim(p_reason), v_e.id, v_actor)
    returning id into v_id;
  perform public.log_admin_action('ledger_reversed', 'ledger', v_e.id::text, p_reason, jsonb_build_object('reversal_id', v_id));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading the ledger (owner only).
-- ---------------------------------------------------------------------------
create function public.admin_ledger_list(p_limit int default 100, p_type text default null, p_cook uuid default null)
returns table (id bigint, created_at timestamptz, entry_type text, cash_egp numeric, cook_egp numeric, order_code text,
               cook_id uuid, cook_username text, cook_name text, buyer_username text, buyer_name text,
               reference text, note text, reversed boolean, reverses_id bigint, recorded_by_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner']);
  return query
    select e.id, e.created_at, e.entry_type, e.cash_egp, e.cook_egp,
           case when e.reservation_id is null then null else upper(left(e.reservation_id::text, 8)) end,
           e.cook_id, k.username, k.display_name, b.username, b.display_name,
           e.reference, e.note,
           exists (select 1 from public.ledger_entries x where x.reverses_id = e.id),
           e.reverses_id,
           coalesce('@' || s.username, s.display_name)
      from public.ledger_entries e
      left join public.profiles k on k.id = e.cook_id
      left join public.profiles b on b.id = e.buyer_id
      left join public.profiles s on s.id = e.recorded_by
     where (p_type is null or e.entry_type = p_type)
       and (p_cook is null or e.cook_id = p_cook)
     order by e.created_at desc, e.id desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

create function public.admin_cook_balances()
returns table (cook_id uuid, username text, display_name text, balance numeric, payable_now numeric, held numeric, open_cases int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner']);
  return query
    select k.id, k.username, k.display_name, b.bal,
           public.ledger_cook_payable(k.id),
           greatest(greatest(b.bal, 0) - public.ledger_cook_payable(k.id), 0),
           (select count(*)::int from public.payment_cases c
              join public.reservations r on r.id = c.reservation_id
             where r.cook_id = k.id and c.status = 'open')
      from (select e.cook_id as cid, sum(e.cook_egp) as bal from public.ledger_entries e where e.cook_id is not null group by e.cook_id) b
      join public.profiles k on k.id = b.cid
     order by 5 desc, 4 desc;
end;
$$;

-- One row: the position today, and money in and out over the last p_days days (Cairo time).
create function public.admin_finance_summary(p_days int default 30)
returns table (cash_balance numeric, owed_to_cooks numeric, payable_now numeric, held_for_cooks numeric, own_money numeric,
               money_in numeric, money_out numeric, entries int, open_cases int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_from timestamptz := ((now() at time zone 'Africa/Cairo')::date - (least(greatest(coalesce(p_days, 30), 1), 365) - 1))::timestamp at time zone 'Africa/Cairo';
begin
  perform public.require_staff(array['owner']);
  return query
    with per_cook as (
      select e.cook_id as cid, sum(e.cook_egp) as bal from public.ledger_entries e where e.cook_id is not null group by e.cook_id),
    totals as (
      select coalesce(sum(greatest(pc.bal, 0)), 0) as owed, coalesce(sum(public.ledger_cook_payable(pc.cid)), 0) as payable from per_cook pc)
    select (select coalesce(sum(e.cash_egp), 0) from public.ledger_entries e),
           t.owed,
           t.payable,
           greatest(t.owed - t.payable, 0),
           (select coalesce(sum(e.cash_egp), 0) - coalesce(sum(e.cook_egp), 0) from public.ledger_entries e),
           (select coalesce(sum(e.cash_egp) filter (where e.cash_egp > 0), 0) from public.ledger_entries e where e.created_at >= v_from),
           (select coalesce(-sum(e.cash_egp) filter (where e.cash_egp < 0), 0) from public.ledger_entries e where e.created_at >= v_from),
           (select count(*)::int from public.ledger_entries e where e.created_at >= v_from),
           (select count(*)::int from public.payment_cases c where c.status = 'open')
      from totals t;
end;
$$;

create function public.admin_finance_daily(p_days int default 30)
returns table (day date, money_in numeric, money_out numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_today date := (now() at time zone 'Africa/Cairo')::date;
begin
  perform public.require_staff(array['owner']);
  return query
    select d.day,
           coalesce(sum(e.cash_egp) filter (where e.cash_egp > 0), 0),
           coalesce(-sum(e.cash_egp) filter (where e.cash_egp < 0), 0)
      from generate_series(0, v_days - 1) as g(n)
      cross join lateral (select v_today - (v_days - 1) + g.n as day) d
      left join public.ledger_entries e on (e.created_at at time zone 'Africa/Cairo')::date = d.day
     group by d.day
     order by d.day;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cases: a problem on one order. While a case is open the cook's money for that order is not payable.
-- ---------------------------------------------------------------------------
create function public.admin_case_open(p_reservation_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.require_staff(array['owner', 'moderator']);
  v_id uuid;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  if not exists (select 1 from public.reservations where id = p_reservation_id) then raise exception 'order not found'; end if;
  if exists (select 1 from public.payment_cases where reservation_id = p_reservation_id and status = 'open') then
    raise exception 'there is already an open case on this order';
  end if;
  insert into public.payment_cases (reservation_id, opened_by, reason)
    values (p_reservation_id, v_actor, trim(p_reason)) returning id into v_id;
  perform public.log_admin_action('payment_case_opened', 'order', p_reservation_id::text, p_reason, jsonb_build_object('case_id', v_id));
  return v_id;
end;
$$;

create function public.admin_case_resolve(p_case_id uuid, p_resolution text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.require_staff(array['owner']);
  v_c public.payment_cases;
begin
  if char_length(trim(coalesce(p_resolution, ''))) < 3 then raise exception 'write how it was settled'; end if;
  select * into v_c from public.payment_cases where id = p_case_id for update;
  if v_c.id is null then raise exception 'case not found'; end if;
  if v_c.status <> 'open' then raise exception 'this case is already resolved'; end if;
  update public.payment_cases
     set status = 'resolved', resolution = trim(p_resolution), resolved_by = v_actor, resolved_at = now()
   where id = p_case_id;
  perform public.log_admin_action('payment_case_resolved', 'order', v_c.reservation_id::text, p_resolution, jsonb_build_object('case_id', p_case_id));
end;
$$;

create function public.admin_cases_list(p_status text default 'open')
returns table (id uuid, reservation_id uuid, order_code text, dish_name text, amount_egp numeric,
               buyer_username text, buyer_name text, cook_username text, cook_name text,
               reason text, status text, opened_at timestamptz, resolution text, resolved_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator']);
  if p_status is not null and p_status not in ('open', 'resolved') then raise exception 'unknown status'; end if;
  return query
    select c.id, c.reservation_id, upper(left(c.reservation_id::text, 8)), p.dish_name, p.price_egp * r.plates,
           b.username, b.display_name, k.username, k.display_name,
           c.reason, c.status, c.opened_at, c.resolution, c.resolved_at
      from public.payment_cases c
      join public.reservations r on r.id = c.reservation_id
      join public.posts p on p.id = r.post_id
      join public.profiles b on b.id = r.buyer_id
      join public.profiles k on k.id = r.cook_id
     where p_status is null or c.status = p_status
     order by c.opened_at desc
     limit 200;
end;
$$;

-- Download (owner only, logged).
create function public.admin_export_ledger()
returns table (id bigint, created_at timestamptz, entry_type text, cash_egp numeric, cook_egp numeric, order_code text,
               cook text, buyer text, reference text, note text, reversed boolean, reverses_id bigint, recorded_by text)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner']);
  perform public.log_admin_action('data_exported', 'ledger', 'all', null);
  return query
    select e.id, e.created_at, e.entry_type, e.cash_egp, e.cook_egp,
           case when e.reservation_id is null then null else upper(left(e.reservation_id::text, 8)) end,
           coalesce('@' || k.username, k.display_name), coalesce('@' || b.username, b.display_name),
           e.reference, e.note,
           exists (select 1 from public.ledger_entries x where x.reverses_id = e.id),
           e.reverses_id, coalesce('@' || s.username, s.display_name)
      from public.ledger_entries e
      left join public.profiles k on k.id = e.cook_id
      left join public.profiles b on b.id = e.buyer_id
      left join public.profiles s on s.id = e.recorded_by
     order by e.id
     limit 100000;
end;
$$;

revoke execute on function
  public.admin_ledger_record_payment(uuid, text, numeric, text), public.admin_ledger_record_refund(uuid, numeric, text, text),
  public.admin_ledger_record_payout(uuid, numeric, text, text), public.admin_ledger_adjust(numeric, numeric, uuid, text),
  public.admin_ledger_reverse(bigint, text), public.admin_ledger_list(int, text, uuid), public.admin_cook_balances(),
  public.admin_finance_summary(int), public.admin_finance_daily(int), public.admin_case_open(uuid, text),
  public.admin_case_resolve(uuid, text), public.admin_cases_list(text), public.admin_export_ledger()
  from public, anon;
grant execute on function
  public.admin_ledger_record_payment(uuid, text, numeric, text), public.admin_ledger_record_refund(uuid, numeric, text, text),
  public.admin_ledger_record_payout(uuid, numeric, text, text), public.admin_ledger_adjust(numeric, numeric, uuid, text),
  public.admin_ledger_reverse(bigint, text), public.admin_ledger_list(int, text, uuid), public.admin_cook_balances(),
  public.admin_finance_summary(int), public.admin_finance_daily(int), public.admin_case_open(uuid, text),
  public.admin_case_resolve(uuid, text), public.admin_cases_list(text), public.admin_export_ledger()
  to authenticated;
