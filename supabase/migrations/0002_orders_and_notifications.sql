-- TBKHN A: what the posting and ordering screens need (design flows 3, 5, 9 and 16).
-- Run after 0001_initial_schema.sql.

-- Post composer (s16): main ingredients chips and "Auto-notify followers".
alter table public.posts
  add column main_ingredients text[] not null default '{}',
  add column notify_followers boolean not null default true;

-- Order screen (s57): pickup time and an optional note for the cook.
alter table public.reservations
  add column pickup_at timestamptz,
  add column note text check (char_length(note) <= 200);

-- Reserving now takes the pickup time and note. Pickup defaults to the ready time and must fall
-- between the ready time and the end of the cook's day.
drop function public.reserve_plates(uuid, int);
create function public.reserve_plates(p_post_id uuid, p_plates int, p_pickup_at timestamptz default null, p_note text default null)
returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_post public.posts;
  v_row public.reservations;
  v_pickup timestamptz;
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
  insert into public.reservations (post_id, buyer_id, cook_id, plates, pickup_at, note)
    values (p_post_id, auth.uid(), v_post.author_id, p_plates, v_pickup, nullif(trim(p_note), ''))
    returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.reserve_plates(uuid, int, timestamptz, text) from public, anon;
grant execute on function public.reserve_plates(uuid, int, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications (Inbox > Notifications, s27). Written by triggers, never by the app.
-- payload keeps ids and the dish name; screens build the wording.
-- ---------------------------------------------------------------------------
create function public.notify_reservation() returns trigger
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

  if new.status is distinct from old.status then
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

create trigger reservations_notify after insert or update on public.reservations
  for each row execute function public.notify_reservation();

-- "Mariam is cooking today": followers hear about a new cooking-today post when the cook leaves
-- "Auto-notify followers" on.
create function public.notify_cooking_today() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'cooking_today' and new.notify_followers then
    insert into public.notifications (user_id, kind, payload)
      select f.follower_id, 'cooking_today', jsonb_build_object('post_id', new.id, 'from', new.author_id, 'dish', new.dish_name)
        from public.follows f
       where f.followee_id = new.author_id
         and not exists (select 1 from public.blocks b where b.blocker_id = new.author_id and b.blocked_id = f.follower_id);
  end if;
  return new;
end;
$$;

create trigger posts_notify_followers after insert on public.posts
  for each row execute function public.notify_cooking_today();

revoke execute on function public.notify_reservation(), public.notify_cooking_today() from public, anon, authenticated;

-- Order history keeps the dish after it leaves the feed at midnight.
create policy "posts of my orders readable" on public.posts for select to authenticated
  using (exists (select 1 from public.reservations r where r.post_id = posts.id and auth.uid() in (r.buyer_id, r.cook_id)));
