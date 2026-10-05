-- tabkheen A: admin order viewer and referral tally (admin plan steps 10 and 11).
-- Run after 0004_admin.sql. Read-only for staff: support, moderators and the owner can all look.

-- ---------------------------------------------------------------------------
-- Order history: one row per step of each order, so support can see what happened when.
-- Written by a trigger, never by the app or staff.
-- ---------------------------------------------------------------------------
create table public.reservation_events (
  id bigint generated always as identity primary key,
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  event text not null check (event in ('requested', 'accepted', 'declined', 'ready', 'picked_up', 'cancelled',
                                       'payment_sent', 'payment_received')),
  actor_id uuid references public.profiles (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index reservation_events_idx on public.reservation_events (reservation_id, created_at);

alter table public.reservation_events enable row level security;
revoke all on public.reservation_events from anon, authenticated;
revoke all on sequence public.reservation_events_id_seq from anon, authenticated;

create function public.log_reservation_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.reservation_events (reservation_id, event, actor_id, note)
      values (new.id, 'requested', new.buyer_id, new.note);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.reservation_events (reservation_id, event, actor_id, note)
      values (new.id, new.status, auth.uid(),
              case when new.status in ('cancelled', 'declined') then new.cancel_reason end);
  end if;
  if new.payment_status is distinct from old.payment_status and new.payment_status <> 'none' then
    insert into public.reservation_events (reservation_id, event, actor_id)
      values (new.id, 'payment_' || new.payment_status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger reservations_log_event after insert or update on public.reservations
  for each row execute function public.log_reservation_event();

revoke execute on function public.log_reservation_event() from public, anon, authenticated;

-- Orders made before this migration: the request, then the step they are at now.
insert into public.reservation_events (reservation_id, event, actor_id, note, created_at)
  select id, 'requested', buyer_id, note, created_at from public.reservations;
insert into public.reservation_events (reservation_id, event, actor_id, note, created_at)
  select id, status, case when status = 'cancelled' then buyer_id else cook_id end,
         case when status in ('cancelled', 'declined') then cancel_reason end, updated_at
    from public.reservations where status <> 'pending';
insert into public.reservation_events (reservation_id, event, actor_id, created_at)
  select id, 'payment_' || payment_status, case payment_status when 'sent' then buyer_id else cook_id end, updated_at
    from public.reservations where payment_status <> 'none';

-- ---------------------------------------------------------------------------
-- Order viewer. Finds orders by buyer or cook (username or name), dish, or the order code
-- (first 8 characters of the id). An empty search lists the latest orders.
-- p_state: 'open' (pending, accepted, ready), 'done' (picked up), 'cancelled' (cancelled or declined).
-- ---------------------------------------------------------------------------
create function public.admin_find_orders(p_query text default '', p_state text default null)
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
  if p_state is not null and p_state not in ('open', 'done', 'cancelled') then raise exception 'unknown order state'; end if;
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

-- Every step of one order, oldest first.
create function public.admin_order_timeline(p_id uuid)
returns table (event text, actor_username text, actor_name text, note text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select e.event, a.username, a.display_name, e.note, e.created_at
      from public.reservation_events e
      left join public.profiles a on a.id = e.actor_id
     where e.reservation_id = p_id
     order by e.created_at, e.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Referral tally: finished sign-ups (username set) by their "How did you hear" answer and week,
-- for everyone or the members of one community. Weeks start Monday, Cairo time.
-- heard_from is null when the member skipped the question.
-- ---------------------------------------------------------------------------
create function public.admin_referral_tally(p_community_id uuid default null)
returns table (week_start date, heard_from text, signups int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select date_trunc('week', p.created_at at time zone 'Africa/Cairo')::date, p.heard_from, count(*)::int
      from public.profiles p
     where p.username is not null
       and (p_community_id is null
            or exists (select 1 from public.community_members m where m.community_id = p_community_id and m.user_id = p.id))
     group by 1, 2
     order by 1 desc, 3 desc;
end;
$$;

-- Names typed under "Who invited you?" (friend or family answers), most mentioned first.
-- Spelling differences are folded together by case and spaces; the most common spelling is shown.
create function public.admin_inviter_names(p_community_id uuid default null)
returns table (inviter_name text, signups int, last_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select mode() within group (order by trim(p.inviter_name)), count(*)::int, max(p.created_at)
      from public.profiles p
     where p.username is not null
       and coalesce(trim(p.inviter_name), '') <> ''
       and (p_community_id is null
            or exists (select 1 from public.community_members m where m.community_id = p_community_id and m.user_id = p.id))
     group by lower(regexp_replace(trim(p.inviter_name), '\s+', ' ', 'g'))
     order by 2 desc, 3 desc
     limit 50;
end;
$$;

revoke execute on function public.admin_find_orders(text, text), public.admin_order_timeline(uuid),
  public.admin_referral_tally(uuid), public.admin_inviter_names(uuid)
  from public, anon;
grant execute on function public.admin_find_orders(text, text), public.admin_order_timeline(uuid),
  public.admin_referral_tally(uuid), public.admin_inviter_names(uuid)
  to authenticated;
