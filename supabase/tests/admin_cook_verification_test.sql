-- Behaviour checks for 0033_admin_cook_verification.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('d6000000-0000-0000-0000-000000000001', 'ver-owner@example.com'),
  ('d6000000-0000-0000-0000-000000000002', 'ver-support@example.com'),
  ('d6000000-0000-0000-0000-000000000003', 'ver-cook@example.com'),
  ('d6000000-0000-0000-0000-000000000004', 'ver-nodish@example.com'),
  ('d6000000-0000-0000-0000-000000000005', 'ver-buyer@example.com');
insert into public.admin_staff (user_id, role) values
  ('d6000000-0000-0000-0000-000000000001', 'owner'),
  ('d6000000-0000-0000-0000-000000000002', 'support');
update public.profiles set username = 'ver_cook' where id = 'd6000000-0000-0000-0000-000000000003';
update public.profiles set username = 'ver_nodish' where id = 'd6000000-0000-0000-0000-000000000004';
update public.profiles set username = 'ver_owner' where id = 'd6000000-0000-0000-0000-000000000001';
insert into public.pickup_points (id, owner_id, label, lat, lng) values ('d6100000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000003', 'Gate', 30.0, 31.0);
insert into public.posts (id, author_id, kind, dish_name, price_egp, portions_total, portions_left, ready_at, pickup_point_id, expires_at)
  values ('d6200000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000003', 'cooking_today', 'Koshari', 40, 5, 5, now() + interval '2 hours', 'd6100000-0000-0000-0000-000000000001', now() + interval '8 hours');

set role authenticated;
-- support can read but not change
select pg_temp.act_as('d6000000-0000-0000-0000-000000000002');
do $$ begin
  assert (select count(*) from public.admin_verification_queue('todo') where username = 'ver_cook') = 1, 'cook in the queue';
  assert (select count(*) from public.admin_verification_queue('all') where username = 'ver_nodish') = 0, 'a member who never cooked is not a cook';
  assert (select items_done from public.admin_verification_queue('todo') where username = 'ver_cook') = 0, 'nothing ticked yet';
  begin perform public.admin_verification_save('d6000000-0000-0000-0000-000000000003', '{"id_seen": true}'); raise exception 'FAIL: support saved';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_verification_complete('d6000000-0000-0000-0000-000000000003'); raise exception 'FAIL: support completed';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform * from public.cook_verifications; raise exception 'FAIL: read table directly';
  exception when insufficient_privilege then null; end;
end $$;

-- a plain member is refused everything
select pg_temp.act_as('d6000000-0000-0000-0000-000000000005');
do $$ begin
  begin perform public.admin_verification_queue('todo'); raise exception 'FAIL: member read queue'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- owner: partial ticks, then complete is refused, then all ticks, then complete works
select pg_temp.act_as('d6000000-0000-0000-0000-000000000001');
do $$ begin
  perform public.admin_verification_save('d6000000-0000-0000-0000-000000000003', '{"id_seen": true, "selfie_matches": true}', '  Met at the club  ');
  assert (select items_done from public.admin_verification_queue('todo') where username = 'ver_cook') = 2, 'two ticks counted';
  assert (select note from public.admin_verification_get('d6000000-0000-0000-0000-000000000003')) = 'Met at the club', 'note trimmed and saved';
  begin perform public.admin_verification_complete('d6000000-0000-0000-0000-000000000003'); raise exception 'FAIL: completed with 2 of 5';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; assert sqlerrm like '%every item%', sqlerrm; end;
  begin perform public.admin_verification_save('d6000000-0000-0000-0000-000000000003', '{"made_up": true}'); raise exception 'FAIL: unknown key';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_verification_save('d6000000-0000-0000-0000-000000000003', '{"id_seen": "yes"}'); raise exception 'FAIL: non boolean';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  -- keys left out keep their value
  perform public.admin_verification_save('d6000000-0000-0000-0000-000000000003', '{"phone_confirmed": true, "instapay_name_matches": true, "pickup_area_confirmed": true}');
  assert (select id_seen and selfie_matches and phone_confirmed and instapay_name_matches and pickup_area_confirmed from public.admin_verification_get('d6000000-0000-0000-0000-000000000003')), 'all ticked';
  assert (select note from public.admin_verification_get('d6000000-0000-0000-0000-000000000003')) = 'Met at the club', 'note kept when not sent';
  begin perform public.admin_verification_complete('d6000000-0000-0000-0000-000000000001'); raise exception 'FAIL: verified self';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.admin_verification_complete('d6000000-0000-0000-0000-000000000003');
  assert (select verified_at is not null from public.admin_verification_get('d6000000-0000-0000-0000-000000000003')), 'verified';
  assert (select completed_by_username from public.admin_verification_get('d6000000-0000-0000-0000-000000000003')) = 'ver_owner', 'completed by recorded';
  assert (select count(*) from public.admin_verification_queue('todo') where username = 'ver_cook') = 0, 'left the todo list';
  assert (select count(*) from public.admin_verification_queue('verified') where username = 'ver_cook') = 1, 'in the verified list';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.admin_actions where action in ('verification_saved', 'member_verified')) = 3, 'logged';
end $$;
\echo COOK VERIFICATION CHECKS PASSED
