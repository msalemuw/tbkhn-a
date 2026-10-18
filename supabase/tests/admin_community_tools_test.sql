-- Behaviour checks for 0026_admin_community_tools.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('f4000000-0000-0000-0000-000000000001', 'tools-owner@example.com'),
  ('f4000000-0000-0000-0000-000000000002', 'tools-asker@example.com'),
  ('f4000000-0000-0000-0000-000000000003', 'tools-support@example.com'),
  ('f4000000-0000-0000-0000-000000000004', 'tools-asker2@example.com');
insert into public.admin_staff (user_id, role) values
  ('f4000000-0000-0000-0000-000000000001', 'owner'),
  ('f4000000-0000-0000-0000-000000000003', 'support');
insert into public.communities (id, name, kind, governorate, status, requested_by) values
  ('f5000000-0000-0000-0000-000000000001', 'Tools Alpha', 'compound', 'Giza', 'approved', null),
  ('f5000000-0000-0000-0000-000000000002', 'Tools Beta', 'compound', 'Giza', 'approved', null),
  ('f5000000-0000-0000-0000-000000000003', 'Tools Alpha and Gamma', 'compound', 'Giza', 'pending', 'f4000000-0000-0000-0000-000000000002'),
  ('f5000000-0000-0000-0000-000000000004', 'Tools Pending', 'club', 'Giza', 'pending', null),
  ('f5000000-0000-0000-0000-000000000005', 'Tools Solo', 'compound', 'Giza', 'pending', 'f4000000-0000-0000-0000-000000000004');

set role authenticated;
select pg_temp.act_as('f4000000-0000-0000-0000-000000000003');
do $$ begin
  begin
    perform public.admin_create_community('Tools Support', 'club', 'Giza');
    raise exception 'FAIL: support created a community';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.admin_resolve_community_request('f5000000-0000-0000-0000-000000000003', array['f5000000-0000-0000-0000-000000000001']::uuid[]);
    raise exception 'FAIL: support resolved a request';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

select pg_temp.act_as('f4000000-0000-0000-0000-000000000001');
do $$
declare c public.communities;
begin
  -- create
  c := public.admin_create_community('  Tools   Created ', 'club', 'Cairo', 'Zamalek');
  assert c.status = 'approved' and c.name = 'Tools Created' and c.area = 'Zamalek', 'created approved, name tidied';
  assert (select count(*) from public.admin_community_directory() where name = 'Tools Created') = 1, 'listed in the directory';
  begin
    perform public.admin_create_community('tools-created', 'club', 'Cairo');
    raise exception 'FAIL: duplicate created';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; assert sqlerrm like '%already exists%', 'plain duplicate message: ' || sqlerrm;
  end;
  begin
    perform public.admin_create_community('X', 'club', 'Cairo');
    raise exception 'FAIL: short name';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.admin_create_community('Tools Bad Type', 'planet', 'Cairo');
    raise exception 'FAIL: bad type';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- resolve: nothing chosen, a pending target and the request itself are refused
  begin
    perform public.admin_resolve_community_request('f5000000-0000-0000-0000-000000000003', '{}'::uuid[]);
    raise exception 'FAIL: nothing chosen';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.admin_resolve_community_request('f5000000-0000-0000-0000-000000000003', array['f5000000-0000-0000-0000-000000000004']::uuid[]);
    raise exception 'FAIL: pending target';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- two existing plus one new that carries the requested name, in one go
  perform public.admin_resolve_community_request('f5000000-0000-0000-0000-000000000003',
    array['f5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000002', 'f5000000-0000-0000-0000-000000000001']::uuid[],
    '[{"name":"Tools Alpha and Gamma","kind":"compound","governorate":"Giza"}]'::jsonb);
end $$;

reset role;
do $$
declare n jsonb;
begin
  assert (select status from public.communities where id = 'f5000000-0000-0000-0000-000000000003') = 'rejected', 'request closed';
  assert (select count(*) from public.community_members
           where user_id = 'f4000000-0000-0000-0000-000000000002'
             and community_id in ('f5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000002')) = 2, 'joined both existing';
  assert (select count(*) from public.community_members m join public.communities c on c.id = m.community_id
           where m.user_id = 'f4000000-0000-0000-0000-000000000002' and c.name = 'Tools Alpha and Gamma' and c.status = 'approved') = 1, 'joined the new one';
  select payload into n from public.notifications where user_id = 'f4000000-0000-0000-0000-000000000002' and kind = 'community_rejected';
  assert jsonb_array_length(n -> 'added') = 3, 'notification names three communities';
  assert not (n ? 'redirect_id'), 'no single target for several';
  assert (select count(*) from public.admin_actions where action = 'community_resolved' and target_id = 'f5000000-0000-0000-0000-000000000003') = 1, 'logged';
end $$;

set role authenticated;
select pg_temp.act_as('f4000000-0000-0000-0000-000000000001');
do $$ begin
  -- a single community opens from the notification
  perform public.admin_resolve_community_request('f5000000-0000-0000-0000-000000000005', array['f5000000-0000-0000-0000-000000000002']::uuid[]);
  begin
    perform public.admin_resolve_community_request('f5000000-0000-0000-0000-000000000005', array['f5000000-0000-0000-0000-000000000002']::uuid[]);
    raise exception 'FAIL: resolved twice';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  assert (select payload ->> 'redirect_id' from public.notifications where user_id = 'f4000000-0000-0000-0000-000000000004' and kind = 'community_rejected') = 'f5000000-0000-0000-0000-000000000002', 'single community is the tap target';
end $$;
\echo ADMIN COMMUNITY TOOLS CHECKS PASSED
