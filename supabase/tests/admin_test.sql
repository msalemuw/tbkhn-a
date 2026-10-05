-- Behaviour checks for 0004_admin.sql (run after the other tests). Every check raises on failure.
\set ON_ERROR_STOP on

create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

-- owner, moderator, support, a member who requests a community and posts, and a reporter
insert into auth.users (id, phone, email) values
  ('a0000000-0000-0000-0000-000000000001', '+201100000001', 'owner@example.com'),
  ('a0000000-0000-0000-0000-000000000002', '+201100000002', 'mod@example.com'),
  ('a0000000-0000-0000-0000-000000000003', '+201100000003', 'support@example.com'),
  ('a0000000-0000-0000-0000-000000000004', '+201100000004', 'nour@example.com'),
  ('a0000000-0000-0000-0000-000000000005', '+201100000005', 'reporter@example.com');
update public.profiles set username = 'nour.sami', display_name = 'Nour Sami' where id = 'a0000000-0000-0000-0000-000000000004';
-- The first owner is added in the SQL Editor, as the README says.
insert into public.admin_staff (user_id, role) values ('a0000000-0000-0000-0000-000000000001', 'owner');

set role authenticated;

-- ---- a member requests a community, posts, and gets reported
select pg_temp.act_as('a0000000-0000-0000-0000-000000000004');
insert into public.communities (id, name, kind, governorate, status, requested_by)
  values ('ad000000-0000-0000-0000-000000000001', 'Rehab City Group 5', 'compound', 'Cairo', 'pending', auth.uid());
insert into public.posts (id, author_id, kind, caption) values ('ad000000-0000-0000-0000-0000000000a1', auth.uid(), 'signature', 'My lentil soup');
do $$ begin
  assert public.staff_role() is null, 'member has no staff role';
  begin
    perform * from public.admin_overview();
    raise exception 'FAIL: member opened admin overview';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform * from public.admin_staff;
    raise exception 'FAIL: member read staff table';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.posts set removed_at = now() where id = 'ad000000-0000-0000-0000-0000000000a1';
    assert (select removed_at from public.posts where id = 'ad000000-0000-0000-0000-0000000000a1') is null, 'member cannot mark removal';
  end;
end $$;

select pg_temp.act_as('a0000000-0000-0000-0000-000000000005');
insert into public.reports (reporter_id, post_id, reason) values (auth.uid(), 'ad000000-0000-0000-0000-0000000000a1', 'not food');
insert into public.reports (reporter_id, profile_id, reason) values (auth.uid(), 'a0000000-0000-0000-0000-000000000004', 'spam');

-- ---- owner adds a moderator and a support member
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select public.admin_set_staff_role('a0000000-0000-0000-0000-000000000002', 'moderator');
select public.admin_set_staff_role('a0000000-0000-0000-0000-000000000003', 'support');
do $$ begin
  assert (select pending_communities from public.admin_overview()) = 1, 'one pending community';
  assert (select open_reports from public.admin_overview()) = 2, 'two open reports';
end $$;

-- ---- support can look but not act
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select count(*) from public.admin_community_requests()) = 1, 'support sees requests';
  assert (select count(*) from public.admin_open_reports()) = 2, 'support sees reports grouped by post and member';
  assert (select username from public.admin_find_members('01100000004')) = 'nour.sami', 'find by phone';
  assert (select username from public.admin_find_members('NOUR@example')) = 'nour.sami', 'find by email';
  assert (select open_reports from public.admin_find_members('nour.')) = 2, 'member lookup counts open reports';
  begin
    perform public.admin_review_community('ad000000-0000-0000-0000-000000000001', 'approved');
    raise exception 'FAIL: support approved a community';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.admin_set_staff_role('a0000000-0000-0000-0000-000000000005', 'owner');
    raise exception 'FAIL: support changed a staff role';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

-- ---- moderator approves the community, removes the post, suspends the member
select pg_temp.act_as('a0000000-0000-0000-0000-000000000002');
do $$ begin
  begin
    perform public.admin_review_community('ad000000-0000-0000-0000-000000000001', 'rejected');
    raise exception 'FAIL: rejected without a reason';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
select public.admin_review_community('ad000000-0000-0000-0000-000000000001', 'approved');
select public.admin_remove_post('ad000000-0000-0000-0000-0000000000a1', 'Not a dish photo');
select public.admin_set_suspended('a0000000-0000-0000-0000-000000000004', true, 'Spam after warning');
do $$ begin
  assert (select status from public.communities where id = 'ad000000-0000-0000-0000-000000000001') = 'approved', 'approved';
  assert (select open_reports from public.admin_overview()) = 0, 'reports closed by the actions';
  assert (select count(*) from public.admin_recent_actions()) = 5, 'every action logged (2 roles + 3)';
end $$;

-- ---- the member: told about the approval and removal, post gone, cannot post while suspended
select pg_temp.act_as('a0000000-0000-0000-0000-000000000004');
do $$ begin
  assert (select count(*) from public.notifications where kind in ('community_approved', 'post_removed')) = 2, 'member notified';
  update public.posts set expires_at = null, removed_at = null where id = 'ad000000-0000-0000-0000-0000000000a1';
  assert (select removed_at from public.posts where id = 'ad000000-0000-0000-0000-0000000000a1') is not null, 'author cannot undo removal';
  begin
    insert into public.posts (author_id, kind, caption) values (auth.uid(), 'story', 'still here');
    raise exception 'FAIL: suspended member posted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000005');
do $$ begin
  assert (select count(*) from public.posts where id = 'ad000000-0000-0000-0000-0000000000a1') = 0, 'removed post hidden from others';
end $$;

-- ---- moderator lifts the suspension and posts an announcement
select pg_temp.act_as('a0000000-0000-0000-0000-000000000002');
select public.admin_set_suspended('a0000000-0000-0000-0000-000000000004', false);
select public.admin_post_announcement('Welcome to Rehab', 'Cooks in Group 5 can post today.', array['ad000000-0000-0000-0000-000000000001']::uuid[]);
do $$ begin
  begin
    perform public.admin_set_staff_role('a0000000-0000-0000-0000-000000000005', 'moderator');
    raise exception 'FAIL: moderator changed a staff role';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000004');
insert into public.posts (author_id, kind, caption) values (auth.uid(), 'story', 'back again');
reset role;
\echo ADMIN CHECKS PASSED
