-- Behaviour checks for 0056_admin_member_places.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('f5000000-0000-0000-0000-000000000001', 'places-owner@example.com'),
  ('f5000000-0000-0000-0000-000000000002', 'places-support@example.com'),
  ('f5000000-0000-0000-0000-000000000003', 'places-member@example.com'),
  ('f5000000-0000-0000-0000-000000000004', 'places-other@example.com');
insert into public.admin_staff (user_id, role) values
  ('f5000000-0000-0000-0000-000000000001', 'owner'),
  ('f5000000-0000-0000-0000-000000000002', 'support');
insert into public.communities (id, name, kind, governorate, area, status) values
  ('f6000000-0000-0000-0000-000000000001', 'Six October', 'area', 'Giza', 'Six October', 'approved'),
  ('f6000000-0000-0000-0000-000000000002', 'Newgiza', 'area', 'Giza', 'Newgiza', 'approved'),
  ('f6000000-0000-0000-0000-000000000003', 'Newgiza Club', 'club', 'Giza', 'Newgiza', 'approved'),
  ('f6000000-0000-0000-0000-000000000004', 'Pending Area', 'area', 'Giza', 'Pending Area', 'pending');
update public.profiles set governorate = 'Giza', area = 'Six October' where id = 'f5000000-0000-0000-0000-000000000003';
insert into public.community_members (community_id, user_id) values ('f6000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000003');

set role authenticated;

-- support can read a member's communities but not change anything
select pg_temp.act_as('f5000000-0000-0000-0000-000000000002');
do $$ begin
  assert (select count(*) from public.admin_member_communities('f5000000-0000-0000-0000-000000000003')) = 1, 'support reads communities';
  assert (select is_area from public.admin_member_communities('f5000000-0000-0000-0000-000000000003')), 'area flagged';
  begin perform public.admin_set_member_place('f5000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000002', 'Wrong place'); raise exception 'FAIL: support moved';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- a plain member cannot use any of it
select pg_temp.act_as('f5000000-0000-0000-0000-000000000004');
do $$ begin
  begin perform * from public.admin_member_communities('f5000000-0000-0000-0000-000000000003'); raise exception 'FAIL: member read';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- owner: needs a reason, an approved area; moves the member and swaps the area community
select pg_temp.act_as('f5000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.admin_set_member_place('f5000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000002', ''); raise exception 'FAIL: no reason';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_set_member_place('f5000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000004', 'Pending area'); raise exception 'FAIL: pending area';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_set_member_place('f5000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000003', 'A club is not an area'); raise exception 'FAIL: club as area';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;

  perform public.admin_set_member_place('f5000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000002', 'He lives in New Giza');
  assert (select area from public.profiles where id = 'f5000000-0000-0000-0000-000000000003') = 'Newgiza', 'profile area moved';
  assert (select count(*) from public.community_members where user_id = 'f5000000-0000-0000-0000-000000000003') = 1, 'one membership left';
  assert exists (select 1 from public.community_members where user_id = 'f5000000-0000-0000-0000-000000000003' and community_id = 'f6000000-0000-0000-0000-000000000002'), 'joined new area';
end $$;

-- add and remove another community; the member's own area cannot be removed
do $$ begin
  perform public.admin_set_member_community('f5000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000003', true, 'Member asked by message');
  assert (select count(*) from public.community_members where user_id = 'f5000000-0000-0000-0000-000000000003') = 2, 'club added';
  begin perform public.admin_set_member_community('f5000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000002', false, 'Remove area'); raise exception 'FAIL: removed own area';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_set_member_community('f5000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000004', true, 'Pending one'); raise exception 'FAIL: joined pending';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.admin_set_member_community('f5000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000003', false, 'Member left the club');
  assert (select count(*) from public.community_members where user_id = 'f5000000-0000-0000-0000-000000000003') = 1, 'club removed';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.admin_actions where action in ('member_place_changed', 'member_community_added', 'member_community_removed')) = 3, 'three actions logged';
  assert (select details ->> 'to_area' from public.admin_actions where action = 'member_place_changed') = 'Newgiza', 'place log has the new area';
end $$;
select 'ok: admin member places';
