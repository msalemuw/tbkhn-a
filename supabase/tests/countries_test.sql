-- Behaviour checks for 0006_countries_regions.sql. Every check raises on failure.
\set ON_ERROR_STOP on

reset role;
do $$
declare c uuid;
begin
  assert (select count(*) from public.regions where country_code = 'EG') = 27, 'Egypt has 27 governorates';
  assert (select count(*) from public.countries where code = 'EG') = 1, 'Egypt exists';

  -- a requested community joins its requester on approval, and only then
  insert into public.communities (name, kind, governorate, status, requested_by, country_code)
    values ('Test Compound', 'compound', 'Cairo', 'pending', '22222222-2222-2222-2222-222222222222', 'EG')
    returning id into c;
  assert not exists (select 1 from public.community_members where community_id = c), 'pending: no member yet';
  update public.communities set status = 'approved' where id = c;
  assert exists (select 1 from public.community_members where community_id = c and user_id = '22222222-2222-2222-2222-222222222222'), 'approved: requester joined';
  update public.communities set review_note = 'ok' where id = c;
  assert (select count(*) from public.community_members where community_id = c) = 1, 'no duplicate member';

  -- rejection does not join
  insert into public.communities (name, kind, governorate, status, requested_by)
    values ('Rejected One', 'club', 'Cairo', 'pending', '22222222-2222-2222-2222-222222222222')
    returning id into c;
  update public.communities set status = 'rejected' where id = c;
  assert not exists (select 1 from public.community_members where community_id = c), 'rejected: no member';
end $$;
select 'countries_test ok';

-- duplicate names are refused, however they are spelled
reset role;
do $$
begin
  insert into public.communities (name, kind, governorate, status) values ('Nile  Club', 'club', 'Giza', 'approved');
  assert (select name from public.communities where name_key = 'nileclub') = 'Nile Club', 'spaces tidied';
  begin
    insert into public.communities (name, kind, governorate, status, requested_by)
      values ('NILE club', 'club', 'giza', 'pending', '22222222-2222-2222-2222-222222222222');
    raise exception 'duplicate was accepted';
  exception when unique_violation then null;
  end;
  -- same name in another kind or country is fine
  insert into public.communities (name, kind, governorate, status) values ('Nile Club', 'work', 'Giza', 'approved');
  -- a rejected request does not block a new one
  update public.communities set status = 'rejected' where name_key = 'nileclub' and kind = 'club';
  insert into public.communities (name, kind, governorate, status) values ('Nile Club', 'club', 'Giza', 'pending');
end $$;
select 'countries_test duplicates ok';
