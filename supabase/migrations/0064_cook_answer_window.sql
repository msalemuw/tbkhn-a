-- tabkheen A: a cook has 45 minutes to answer a request (founder, 2026-11-17). Before: 24 hours.
-- A request nobody answered is cancelled when its answer_by time passes, the plates go back on the menu, and both people
-- are told. The check runs every minute. Nothing is deleted: the order timeline shows "Cancelled automatically".
-- To change the window later, change the default below (and nothing else).

alter table public.reservations add column answer_by timestamptz not null default now() + interval '45 minutes';

create function public.expire_unanswered_requests() returns int
language plpgsql security definer set search_path = '' as $$
declare
  r public.reservations;
  v_dish text;
  n int := 0;
begin
  perform set_config('app.system_action', 'on', true);
  for r in select * from public.reservations where status = 'pending' and answer_by < now() for update skip locked loop
    select dish_name into v_dish from public.posts where id = r.post_id;
    update public.posts set portions_left = least(portions_left + r.plates, portions_total) where id = r.post_id;
    update public.reservations set status = 'cancelled', updated_at = now(),
           cancel_reason = 'No answer from the cook in time' where id = r.id;
    insert into public.notifications (user_id, kind, payload)
      select u, 'order_expired', jsonb_build_object('reservation_id', r.id, 'from', case when u = r.buyer_id then r.cook_id else r.buyer_id end, 'dish', v_dish)
        from unnest(array[r.buyer_id, r.cook_id]) u;
    n := n + 1;
  end loop;
  perform set_config('app.system_action', '', true);
  return n;
end;
$$;
revoke execute on function public.expire_unanswered_requests() from public, anon, authenticated;
select cron.schedule('expire-unanswered-requests', '* * * * *', 'select public.expire_unanswered_requests()');
