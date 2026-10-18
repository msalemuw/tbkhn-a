-- Behaviour checks for 0025_admin_join_existing_community.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('f2000000-0000-0000-0000-000000000001', 'redir-owner@example.com'),
  ('f2000000-0000-0000-0000-000000000002', 'redir-asker@example.com'),
  ('f2000000-0000-0000-0000-000000000003', 'redir-support@example.com');
insert into public.admin_staff (user_id, role) values
  ('f2000000-0000-0000-0000-000000000001', 'owner'),
  ('f2000000-0000-0000-0000-000000000003', 'support');
insert into public.communities (id, name, kind, governorate, status, requested_by) values
  ('f3000000-0000-0000-0000-000000000001', 'Redir Existing', 'compound', 'Giza', 'approved', null),
  ('f3000000-0000-0000-0000-000000000002', 'Redir Existing Compound', 'compound', 'Giza', 'pending', 'f2000000-0000-0000-0000-000000000002'),
  ('f3000000-0000-0000-0000-000000000003', 'Redir Other Pending', 'club', 'Giza', 'pending', null);

set role authenticated;
select pg_temp.act_as('f2000000-0000-0000-0000-000000000003');
do $$ begin
  begin
    perform public.admin_join_existing_community('f3000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: support redirected';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

select pg_temp.act_as('f2000000-0000-0000-0000-000000000001');
do $$
declare n jsonb;
begin
  -- the target must be an approved community, and not the request itself
  begin
    perform public.admin_join_existing_community('f3000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000003');
    raise exception 'FAIL: redirected to a pending request';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  perform public.admin_join_existing_community('f3000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000001');
end $$;
-- read back as the table owner (members and staff cannot read rejected rows directly)
reset role;
do $$
declare n jsonb;
begin
  assert (select status from public.communities where id = 'f3000000-0000-0000-0000-000000000002') = 'rejected', 'request rejected';
  assert (select review_note from public.communities where id = 'f3000000-0000-0000-0000-000000000002') like '%Redir Existing%already exists%', 'note names the community';
  select payload into n from public.notifications where user_id = 'f2000000-0000-0000-0000-000000000002' and kind = 'community_rejected';
  assert n ->> 'redirect_id' = 'f3000000-0000-0000-0000-000000000001', 'notification points at the existing community';
  assert n ->> 'name' = 'Redir Existing Compound', 'notification names the request';
  assert exists (select 1 from public.community_members where community_id = 'f3000000-0000-0000-0000-000000000001' and user_id = 'f2000000-0000-0000-0000-000000000002'), 'requester joined the existing community';
  assert (select count(*) from public.community_members where community_id = 'f3000000-0000-0000-0000-000000000002') = 0, 'not added to the rejected request';
  assert (select count(*) from public.admin_actions where action = 'community_joined_existing' and target_id = 'f3000000-0000-0000-0000-000000000002') = 1, 'logged';
end $$;
set role authenticated;
select pg_temp.act_as('f2000000-0000-0000-0000-000000000001');
do $$ begin
  -- cannot be reviewed twice
  begin
    perform public.admin_join_existing_community('f3000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: redirected twice';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;
\echo ADMIN JOIN EXISTING COMMUNITY CHECKS PASSED
