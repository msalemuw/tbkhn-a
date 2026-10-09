-- Behaviour checks for 0008_heard_from_detail.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
update public.profiles set heard_from = 'social_media', heard_detail = 'Instagram' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set heard_from = 'social_media', heard_detail = ' instagram ' where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set heard_from = 'social_media', heard_detail = 'TikTok' where id = 'a0000000-0000-0000-0000-000000000004';
do $$ begin
  begin
    update public.profiles set heard_from = 'carrier_pigeon' where id = '22222222-2222-2222-2222-222222222222';
    raise exception 'unknown answer was accepted';
  exception when check_violation then null;
  end;
end $$;

set role authenticated;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select signups from public.admin_referral_tally() where heard_from = 'social_media' and lower(heard_detail) = 'instagram') = 2, 'spellings of one platform folded together';
  assert (select signups from public.admin_referral_tally() where heard_from = 'social_media' and heard_detail = 'TikTok') = 1, 'other platform counted apart';
end $$;
reset role;
select 'heard_detail_test ok';
