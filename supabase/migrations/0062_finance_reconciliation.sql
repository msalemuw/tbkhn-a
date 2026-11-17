-- tabkheen A: finance reconciliation and alerts (operations system, phase 3; founder 2026-11-17).
-- 1. Balance check: the owner types the balance shown in the InstaPay app; the ledger says what it should be; the gap is stored forever.
-- 2. Alerts: one call that tells the owner what needs attention (slow payments, reused references, old refunds, old cases, last balance check).
-- Nothing here moves money or changes an order. Rows are permanent like the ledger.

create table public.ledger_checks (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  bank_balance numeric(12, 2) not null,
  ledger_cash numeric(12, 2) not null,
  difference numeric(12, 2) generated always as (bank_balance - ledger_cash) stored,
  note text check (char_length(note) <= 500),
  recorded_by uuid not null
);
create index ledger_checks_day_idx on public.ledger_checks (checked_at desc);
alter table public.ledger_checks enable row level security;
revoke all on public.ledger_checks from anon, authenticated;
revoke all on sequence public.ledger_checks_id_seq from anon, authenticated;
create trigger ledger_checks_immutable before update or delete on public.ledger_checks
  for each row execute function public.ledger_no_change();
create trigger ledger_checks_no_truncate before truncate on public.ledger_checks
  for each statement execute function public.ledger_no_change();

-- Record the balance the owner sees in InstaPay right now. Returns what the ledger expected and the gap.
create function public.admin_record_balance_check(p_bank_balance numeric, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cash numeric(12, 2);
  v_bank numeric(12, 2);
  v_id bigint;
begin
  perform public.require_staff(array['owner']);
  if p_bank_balance is null or p_bank_balance < 0 or p_bank_balance >= 1000000000 then raise exception 'enter the balance shown in InstaPay'; end if;
  v_bank := round(p_bank_balance, 2);
  perform pg_advisory_xact_lock(hashtext('ledger'));
  select coalesce(sum(cash_egp), 0) into v_cash from public.ledger_entries;
  insert into public.ledger_checks (bank_balance, ledger_cash, note, recorded_by)
    values (v_bank, v_cash, nullif(btrim(coalesce(p_note, '')), ''), auth.uid()) returning id into v_id;
  perform public.log_admin_action('balance_checked', 'finance', v_id::text, null,
    jsonb_build_object('bank_balance', v_bank, 'ledger_cash', v_cash, 'difference', v_bank - v_cash));
  return jsonb_build_object('id', v_id, 'bank_balance', v_bank, 'ledger_cash', v_cash, 'difference', v_bank - v_cash);
end;
$$;

create function public.admin_balance_checks(p_limit int default 12)
returns table (id bigint, checked_at timestamptz, bank_balance numeric, ledger_cash numeric, difference numeric, note text, recorded_by_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner']);
  return query
    select c.id, c.checked_at, c.bank_balance, c.ledger_cash, c.difference, c.note, coalesce(p.display_name, p.username)
      from public.ledger_checks c left join public.profiles p on p.id = c.recorded_by
     order by c.checked_at desc, c.id desc
     limit greatest(1, least(coalesce(p_limit, 12), 100));
end;
$$;

-- What needs the owner's attention. Counts and lists only; nothing is changed.
create function public.admin_finance_alerts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_waiting_old int;
  v_waiting_oldest timestamptz;
  v_dups jsonb;
  v_refunds_old int;
  v_cases_old int;
  v_last public.ledger_checks;
begin
  perform public.require_staff(array['owner']);
  select count(*), min(r.payment_sent_at) into v_waiting_old, v_waiting_oldest
    from public.reservations r
   where r.pay_through_app and r.payment_status = 'sent' and r.payment_sent_at < now() - interval '30 minutes';
  -- The same InstaPay reference on two orders: either a mistake or someone reusing an old transfer.
  select coalesce(jsonb_agg(x.d order by x.first_at), '[]'::jsonb) into v_dups from (
    select lower(btrim(r.payment_reference)) as ref, min(r.payment_sent_at) as first_at,
           jsonb_build_object('reference', min(btrim(r.payment_reference)), 'first_at', min(r.payment_sent_at),
             'orders', jsonb_agg(jsonb_build_object('id', r.id, 'order_code', upper(left(r.id::text, 8)), 'status', r.status,
                                                    'payment_status', r.payment_status) order by r.payment_sent_at)) as d
      from public.reservations r
     where r.pay_through_app and r.payment_reference is not null and btrim(r.payment_reference) <> ''
     group by lower(btrim(r.payment_reference)) having count(*) > 1) x;
  select count(*) into v_refunds_old from (
    select e.reservation_id as rid from public.ledger_entries e
     where e.reservation_id is not null and e.entry_type in ('payment_received', 'refund', 'reversal')
     group by e.reservation_id having sum(e.cash_egp) > 0) n
    join public.reservations r on r.id = n.rid
   where r.status in ('cancelled', 'declined') and r.updated_at < now() - interval '24 hours';
  select count(*) into v_cases_old from public.payment_cases c where c.status = 'open' and c.opened_at < now() - interval '3 days';
  select * into v_last from public.ledger_checks order by checked_at desc, id desc limit 1;
  return jsonb_build_object(
    'waiting_old', v_waiting_old, 'waiting_oldest_at', v_waiting_oldest,
    'duplicate_refs', v_dups,
    'refunds_old', v_refunds_old, 'cases_old', v_cases_old,
    'last_check_at', v_last.checked_at, 'last_difference', v_last.difference);
end;
$$;

revoke execute on function public.admin_record_balance_check(numeric, text), public.admin_balance_checks(int), public.admin_finance_alerts() from public, anon;
grant execute on function public.admin_record_balance_check(numeric, text), public.admin_balance_checks(int), public.admin_finance_alerts() to authenticated;
