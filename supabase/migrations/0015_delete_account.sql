-- Delete my account (required by Apple and Google for any app that lets people create one).
-- The app calls delete_my_account(); it removes the sign-in and, through the foreign keys, the profile,
-- posts, stories, comments, likes, follows, messages, notifications and memberships.
-- Refused while an order is still open (pending, accepted or ready), so nobody is left waiting for food or a buyer,
-- and for the last owner, so the admin panel is never left without one.
-- Orders are removed with the account, on both sides. The funnel rows are kept but no longer point at the person.

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if exists (
    select 1 from public.reservations r
     where (r.buyer_id = v_uid or r.cook_id = v_uid) and r.status in ('pending', 'accepted', 'ready')
  ) then
    raise exception 'open orders';
  end if;
  if exists (select 1 from public.admin_staff where user_id = v_uid and role = 'owner')
     and not exists (select 1 from public.admin_staff where user_id <> v_uid and role = 'owner') then
    raise exception 'last owner';
  end if;

  -- Orders first: reservations.post_id restricts deleting a post, and every order on this member's posts has them as cook.
  delete from public.reservations where buyer_id = v_uid or cook_id = v_uid;
  update public.signup_events set user_ref = null where user_ref = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
