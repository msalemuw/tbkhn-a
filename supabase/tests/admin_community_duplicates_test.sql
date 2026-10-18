-- Behaviour checks for 0024_admin_community_duplicates.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-000000000001', 'dup-owner@example.com'),
  ('f0000000-0000-0000-0000-000000000002', 'dup-member@example.com');
insert into public.admin_staff (user_id, role) values ('f0000000-0000-0000-0000-000000000001', 'owner');
insert into public.communities (id, name, kind, governorate, status) values
  ('f1000000-0000-0000-0000-000000000001', 'Palm Hills Compound', 'compound', 'Giza', 'approved'),
  ('f1000000-0000-0000-0000-000000000002', 'palm-hills', 'compound', 'Giza', 'pending'),
  ('f1000000-0000-0000-0000-000000000003', 'The Palm Hills Club', 'club', 'Giza', 'pending'),
  ('f1000000-0000-0000-0000-000000000004', 'Qwerty Tennis', 'club', 'Cairo', 'pending'),
  ('f1000000-0000-0000-0000-000000000005', 'Newgiza', 'compound', 'Giza', 'approved'),
  ('f1000000-0000-0000-0000-000000000006', 'New Giza Club House', 'club', 'Giza', 'pending'),
  ('f1000000-0000-0000-0000-000000000007', 'بالم هيلز', 'compound', 'Giza', 'approved'),
  ('f1000000-0000-0000-0000-000000000008', 'كمبوند بالم هيلز', 'compound', 'Giza', 'pending'),
  ('f1000000-0000-0000-0000-000000000009', 'Palm Hillz', 'compound', 'Cairo', 'rejected');
insert into public.community_members (community_id, user_id) values ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002');

do $$ begin
  assert public.community_key('The Palm-Hills Compound!') = 'palmhills', 'key ignores generic words and punctuation';
  assert public.community_key('كمبوند بالم هيلز') = 'بالمهيلز', 'key ignores Arabic generic words';
  assert public.community_name_score('Palm Hills Compound', 'palm-hills') = 1, 'same name, different dress';
  assert public.community_name_score('New Giza', 'New Giza Club House') >= 0.85, 'one name inside the other';
  assert public.community_name_score('Palm Hills', 'Palm Hillz') >= 0.45, 'a typo still looks alike';
  assert public.community_name_score('Palm Hills', 'Qwerty Tennis') < 0.45, 'different names stay apart';
  assert public.community_name_score('', 'Palm Hills') = 0, 'empty name matches nothing';
end $$;

set role authenticated;
select pg_temp.act_as('f0000000-0000-0000-0000-000000000002');
do $$ begin
  begin
    perform * from public.admin_community_requests_checked();
    raise exception 'FAIL: member read requests';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform * from public.admin_community_directory();
    raise exception 'FAIL: member read directory';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

select pg_temp.act_as('f0000000-0000-0000-0000-000000000001');
do $$
declare
  v jsonb;
begin
  -- "palm-hills" (pending) is flagged against the approved community and the other waiting request
  select look_alikes into v from public.admin_community_requests_checked() where id = 'f1000000-0000-0000-0000-000000000002';
  assert jsonb_array_length(v) = 2, 'palm-hills has two look-alikes: ' || v::text;
  assert v -> 0 ->> 'name' in ('Palm Hills Compound', 'The Palm Hills Club'), 'best match first';
  assert (select count(*) from jsonb_array_elements(v) e where e ->> 'status' = 'approved' and (e ->> 'members')::int = 1 and (e ->> 'same_governorate')::boolean) = 1, 'approved match shows members and governorate';
  assert (select count(*) from jsonb_array_elements(v) e where e ->> 'name' = 'Palm Hillz') = 0, 'rejected requests are not suggested';
  -- an unrelated request has none
  select look_alikes into v from public.admin_community_requests_checked() where id = 'f1000000-0000-0000-0000-000000000004';
  assert jsonb_array_length(v) = 0, 'Qwerty Tennis is unique';
  -- one name inside another
  select look_alikes into v from public.admin_community_requests_checked() where id = 'f1000000-0000-0000-0000-000000000006';
  assert (v -> 0 ->> 'name') = 'Newgiza', 'New Giza Club House matches Newgiza';
  -- Arabic
  select look_alikes into v from public.admin_community_requests_checked() where id = 'f1000000-0000-0000-0000-000000000008';
  assert (v -> 0 ->> 'name') = 'بالم هيلز', 'Arabic duplicate found';
  -- directory lists approved only, with member counts
  assert (select count(*) from public.admin_community_directory() where name = 'Palm Hills Compound' and members = 1) = 1, 'directory shows approved with members';
  assert (select count(*) from public.admin_community_directory() where name = 'palm-hills') = 0, 'pending not in directory';
end $$;
reset role;
\echo ADMIN COMMUNITY DUPLICATE CHECKS PASSED
