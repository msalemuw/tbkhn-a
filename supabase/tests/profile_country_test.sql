-- Behaviour checks for 0007_profile_country_and_cities.sql. Every check raises on failure.
\set ON_ERROR_STOP on

reset role;
do $$ begin
  assert (select count(*) from public.regions where country_code = 'SA') >= 15, 'Saudi cities listed';
  assert exists (select 1 from public.regions where country_code = 'AE' and name = 'Dubai'), 'Dubai listed';
end $$;

-- a member can save their own country with the rest of the profile, and sees their own pending request
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
update public.profiles set country_code = 'SA', governorate = 'Riyadh' where id = auth.uid();
do $$ begin
  assert (select country_code from public.my_profile()) = 'SA', 'country saved';
  insert into public.communities (name, kind, governorate, status, requested_by, country_code)
    values ('My Own Club', 'club', 'Riyadh', 'pending', auth.uid(), 'SA');
  assert exists (select 1 from public.communities where name = 'My Own Club'), 'own pending request visible';
end $$;
reset role;
select 'profile_country_test ok';
