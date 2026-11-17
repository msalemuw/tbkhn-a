-- tabkheen A: cooks must not miss a request (founder, 2026-11-17).
-- 1. A request nobody answered rings the cook again after 2, 5 and 10 minutes (checked every minute).
-- 2. send_test_alert(): a cook taps "Test my alerts" and gets the order ring on their own phone.
-- 3. admin_waiting_requests(): staff see requests waiting more than 5 minutes, with the cook's name, so they can call.
-- Nothing is deleted: each repeat is in the order timeline.

alter table public.reservations add column nudges int not null default 0;

create function public.nudge_waiting_cooks() returns int
language plpgsql security definer set search_path = '' as $$
declare
  r public.reservations;
  v_dish text;
  v_minutes int[] := array[2, 5, 10];
  n int := 0;
begin
  for r in select * from public.reservations
            where status = 'pending' and nudges < 3
              and created_at <= now() - (v_minutes[nudges + 1] * interval '1 minute')
              for update skip locked loop
    select dish_name into v_dish from public.posts where id = r.post_id;
    -- Repeats are born "read": the cook already has the unread request, so the bell does not count it again.
    insert into public.notifications (user_id, kind, payload, read_at)
      values (r.cook_id, 'order_reminder',
              jsonb_build_object('reservation_id', r.id, 'from', r.buyer_id, 'dish', v_dish, 'status', 'pending', 'nudge', r.nudges + 1), now());
    update public.reservations set nudges = nudges + 1 where id = r.id;
    insert into public.reservation_events (reservation_id, event, note)
      values (r.id, 'reminded', 'Alert repeated to the cook (' || (r.nudges + 1) || ' of 3)');
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.nudge_waiting_cooks() from public, anon, authenticated;
select cron.schedule('nudge-waiting-cooks', '* * * * *', 'select public.nudge_waiting_cooks()');

-- "Test my alerts": one test alert to the person's own phone, at most one every 20 seconds.
create function public.send_test_alert() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.notifications where user_id = v_me and kind = 'test_alert' and created_at > now() - interval '20 seconds') then
    raise exception 'wait a moment before testing again';
  end if;
  insert into public.notifications (user_id, kind, payload, read_at) values (v_me, 'test_alert', '{}'::jsonb, now());
end;
$$;
revoke execute on function public.send_test_alert() from public, anon;
grant execute on function public.send_test_alert() to authenticated;

-- Staff: requests the cook has not answered for more than 5 minutes, oldest first.
create function public.admin_waiting_requests()
returns table (id uuid, created_at timestamptz, minutes int, nudges int, dish_name text, plates int,
               cook_id uuid, cook_username text, cook_name text, buyer_username text, buyer_name text,
               cook_has_phone boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select r.id, r.created_at, (extract(epoch from now() - r.created_at) / 60)::int, r.nudges, p.dish_name, r.plates,
           k.id, k.username, k.display_name, b.username, b.display_name,
           exists (select 1 from public.push_tokens t where t.user_id = r.cook_id)
      from public.reservations r
      join public.posts p on p.id = r.post_id
      join public.profiles k on k.id = r.cook_id
      join public.profiles b on b.id = r.buyer_id
     where r.status = 'pending' and r.created_at < now() - interval '5 minutes'
     order by r.created_at;
end;
$$;
revoke execute on function public.admin_waiting_requests() from public, anon;
grant execute on function public.admin_waiting_requests() to authenticated;
