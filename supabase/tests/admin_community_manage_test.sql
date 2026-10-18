-- Behaviour checks for 0028_admin_community_manage.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('f8000000-0000-0000-0000-000000000001', 'manage-owner@example.com'),
  ('f8000000-0000-0000-0000-000000000002', 'manage-a@example.com'),
  ('f8000000-0000-0000-0000-000000000003', 'manage-support@example.com'),
  ('f8000000-0000-0000-0000-000000000004', 'manage-both@example.com'),
  ('f8000000-0000-0000-0000-000000000005', 'manage-c@example.com');
insert into public.admin_staff (user_id, role) values
  ('f8000000-0000-0000-0000-000000000001', 'owner'),
  ('f8000000-0000-0000-0000-000000000003', 'support');
insert into public.communities (id, name, kind, governorate, status) values
  ('f9000000-0000-0000-0000-000000000001', 'Manage Old Name', 'compound', 'Giza', 'approved'),
  ('f9000000-0000-0000-0000-000000000002', 'Manage Target', 'compound', 'Giza', 'approved'),
  ('f9000000-0000-0000-0000-000000000003', 'Manage Source', 'compound', 'Giza', 'approved'),
  ('f9000000-0000-0000-0000-000000000004', 'Manage Hideme', 'club', 'Cairo', 'approved'),
  ('f9000000-0000-0000-0000-000000000005', 'Manage Waiting', 'club', 'Cairo', 'pending');
-- a: only in source; both: in source and target; c: only in target
insert into public.community_members (community_id, user_id) values
  ('f9000000-0000-0000-0000-000000000003', 'f8000000-0000-0000-0000-000000000002'),
  ('f9000000-0000-0000-0000-000000000003', 'f8000000-0000-0000-0000-000000000004'),
  ('f9000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000004'),
  ('f9000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000005'),
  ('f9000000-0000-0000-0000-000000000004', 'f8000000-0000-0000-0000-000000000002');
insert into public.posts (id, author_id, kind, community_ids) values
  ('fa000000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000002', 'story', array['f9000000-0000-0000-0000-000000000003']::uuid[]),
  ('fa000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000002', 'story',
     array['f9000000-0000-0000-0000-000000000003', 'f9000000-0000-0000-0000-000000000002']::uuid[]);
insert into public.announcements (id, title, body, community_ids) values
  ('fb000000-0000-0000-0000-000000000001', 'Manage news', 'Hello', array['f9000000-0000-0000-0000-000000000003', 'f9000000-0000-0000-0000-000000000002']::uuid[]);

-- support cannot edit, hide or merge
set role authenticated;
select pg_temp.act_as('f8000000-0000-0000-0000-000000000003');
do $$ begin
  begin perform public.admin_update_community('f9000000-0000-0000-0000-000000000001', 'Nope', 'club', 'Giza'); raise exception 'FAIL: support edited';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_set_community_hidden('f9000000-0000-0000-0000-000000000004', true); raise exception 'FAIL: support hid';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_merge_communities('f9000000-0000-0000-0000-000000000003', 'f9000000-0000-0000-0000-000000000002'); raise exception 'FAIL: support merged';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

select pg_temp.act_as('f8000000-0000-0000-0000-000000000001');
do $$
declare c public.communities; r jsonb;
begin
  -- edit
  c := public.admin_update_community('f9000000-0000-0000-0000-000000000001', '  Manage   New Name ', 'club', 'Cairo', 'Zamalek');
  assert c.name = 'Manage New Name' and c.kind = 'club' and c.governorate = 'Cairo' and c.area = 'Zamalek', 'edited and tidied';
  -- editing into another community's name is refused plainly (Manage Hideme is a club in Cairo)
  begin perform public.admin_update_community('f9000000-0000-0000-0000-000000000001', 'manage-hideme', 'club', 'Cairo'); raise exception 'FAIL: duplicate edit';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; assert sqlerrm like '%already exists%', 'plain message: ' || sqlerrm; end;
  begin perform public.admin_update_community('f9000000-0000-0000-0000-000000000005', 'Pending edit', 'club', 'Cairo'); raise exception 'FAIL: edited a pending request';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_update_community('f9000000-0000-0000-0000-000000000001', 'X', 'club', 'Cairo'); raise exception 'FAIL: short name';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;

  -- hide
  c := public.admin_set_community_hidden('f9000000-0000-0000-0000-000000000004', true, 'duplicate wording');
  assert c.hidden_at is not null, 'hidden';
  assert (select hidden_at from public.admin_community_directory() where id = 'f9000000-0000-0000-0000-000000000004') is not null, 'directory flags hidden';
  assert (select count(*) from public.admin_communities() where id = 'f9000000-0000-0000-0000-000000000004') = 0, 'not an announcement audience';
  begin perform public.admin_merge_communities('f9000000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-000000000004'); raise exception 'FAIL: merged into hidden';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; assert sqlerrm like '%hidden%', sqlerrm; end;
  begin perform public.admin_merge_communities('f9000000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-000000000002'); raise exception 'FAIL: merged into itself';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- a member no longer sees the hidden community or can join it; staff still do
select pg_temp.act_as('f8000000-0000-0000-0000-000000000002');
do $$ begin
  assert (select count(*) from public.communities where id = 'f9000000-0000-0000-0000-000000000004') = 0, 'hidden from members';
  assert (select count(*) from public.communities where id = 'f9000000-0000-0000-0000-000000000002') = 1, 'others still visible';
  begin
    insert into public.community_members (community_id, user_id) values ('f9000000-0000-0000-0000-000000000004', 'f8000000-0000-0000-0000-000000000005');
    raise exception 'FAIL: joined hidden';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- show again
select pg_temp.act_as('f8000000-0000-0000-0000-000000000001');
do $$ begin
  assert (public.admin_set_community_hidden('f9000000-0000-0000-0000-000000000004', false)).hidden_at is null, 'shown again';
end $$;
select pg_temp.act_as('f8000000-0000-0000-0000-000000000002');
do $$ begin
  assert (select count(*) from public.communities where id = 'f9000000-0000-0000-0000-000000000004') = 1, 'visible again';
end $$;

-- merge
select pg_temp.act_as('f8000000-0000-0000-0000-000000000001');
do $$
declare r jsonb;
begin
  r := public.admin_merge_communities('f9000000-0000-0000-0000-000000000003', 'f9000000-0000-0000-0000-000000000002');
  assert (r ->> 'members')::int = 2 and (r ->> 'posts')::int = 2 and r ->> 'into_name' = 'Manage Target', 'counts: ' || r::text;
end $$;

reset role;
do $$ begin
  assert (select count(*) from public.community_members where community_id = 'f9000000-0000-0000-0000-000000000003') = 0, 'source emptied';
  assert (select count(*) from public.community_members where community_id = 'f9000000-0000-0000-0000-000000000002') = 3, 'target has a, both, c once each';
  assert (select community_ids from public.posts where id = 'fa000000-0000-0000-0000-000000000001') = array['f9000000-0000-0000-0000-000000000002']::uuid[], 'post moved';
  assert (select community_id from public.posts where id = 'fa000000-0000-0000-0000-000000000001') = 'f9000000-0000-0000-0000-000000000002', 'post first community moved';
  assert (select community_ids from public.posts where id = 'fa000000-0000-0000-0000-000000000002') = array['f9000000-0000-0000-0000-000000000002']::uuid[], 'two-community post de-duplicated';
  assert (select community_ids from public.announcements where id = 'fb000000-0000-0000-0000-000000000001') = array['f9000000-0000-0000-0000-000000000002']::uuid[], 'announcement target moved and de-duplicated';
  assert (select status from public.communities where id = 'f9000000-0000-0000-0000-000000000003') = 'rejected', 'source retired';
  assert (select merged_into from public.communities where id = 'f9000000-0000-0000-0000-000000000003') = 'f9000000-0000-0000-0000-000000000002', 'trail kept';
  -- the old name is free again
  insert into public.communities (name, kind, governorate, status) values ('Manage Source', 'compound', 'Giza', 'pending');
  assert (select count(*) from public.admin_actions where action in ('community_edited', 'community_hidden', 'community_shown', 'community_merged')) >= 4, 'all logged';
end $$;
\echo ADMIN COMMUNITY MANAGE CHECKS PASSED
