-- Behaviour checks for 0031_admin_signup_funnel.sql. Every check raises on failure.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

reset role;
insert into auth.users (id, email) values
  ('d1000000-0000-0000-0000-000000000001', 'fun-support@example.com'),
  ('d1000000-0000-0000-0000-000000000002', 'fun-member@example.com'),
  ('d1000000-0000-0000-0000-000000000003', 'fun-unfinished@example.com'),
  ('d1000000-0000-0000-0000-000000000004', 'fun-recent@example.com');
insert into public.admin_staff (user_id, role) values ('d1000000-0000-0000-0000-000000000001', 'support');
update public.profiles set username = 'funmember' where id = 'd1000000-0000-0000-0000-000000000002';
update public.profiles set created_at = now() - interval '3 hours', signup_source = '{"via":"web","utm_source":"instagram","utm_campaign":"launch1"}'::jsonb where id = 'd1000000-0000-0000-0000-000000000003';
update public.profiles set created_at = now() - interval '5 minutes' where id = 'd1000000-0000-0000-0000-000000000004';

delete from public.signup_events;
insert into public.signup_events (session_id, user_ref, step, props, ts) values
  -- web visit A: sees welcome, picks google, ends up completing
  ('webA', null, 'welcome_viewed', '{"via":"web","utm_campaign":"launch1","placement":"Instagram_Reels"}', now() - interval '1 hour'),
  ('webA', null, 'signup_method_chosen', '{"via":"web","utm_campaign":"launch1","placement":"Instagram_Reels","method":"google","result":"ok"}', now() - interval '59 minutes'),
  ('webA2', 'd1000000-0000-0000-0000-000000000002', 'profile_started', '{"via":"web","utm_campaign":"launch1","placement":"Instagram_Reels"}', now() - interval '58 minutes'),
  ('webA2', 'd1000000-0000-0000-0000-000000000002', 'signup_completed', '{"via":"web","utm_campaign":"launch1","placement":"Instagram_Reels"}', now() - interval '50 minutes'),
  -- web visit B: welcome, google fails, asks for help
  ('webB', null, 'welcome_viewed', '{"via":"web"}', now() - interval '2 hours'),
  ('webB', null, 'signup_method_chosen', '{"via":"web","method":"google","result":"error"}', now() - interval '2 hours'),
  ('webB', null, 'help_opened', '{"via":"web","from":"signup"}', now() - interval '2 hours'),
  ('webB', null, 'inapp_browser_shown', '{"via":"web","app":"instagram"}', now() - interval '2 hours'),
  -- app visit C: welcome, profile errors
  ('appC', 'd1000000-0000-0000-0000-000000000003', 'welcome_viewed', '{}', now() - interval '3 hours'),
  ('appC', 'd1000000-0000-0000-0000-000000000003', 'profile_started', '{}', now() - interval '3 hours' + interval '1 minute'),
  ('appC', 'd1000000-0000-0000-0000-000000000003', 'profile_field_error', '{"field":"username_taken"}', now() - interval '3 hours' + interval '2 minutes'),
  ('appC', null, 'code_sent', '{}', now() - interval '3 hours'),
  -- an old event outside a 7-day window
  ('old1', null, 'welcome_viewed', '{"via":"web"}', now() - interval '20 days');
update public.signup_events set error_code = 'wa_failed' where step = 'code_sent';

set role authenticated;
select pg_temp.act_as('d1000000-0000-0000-0000-000000000001');
do $$
declare r record; n int;
begin
  -- all visits
  assert (select visits from public.admin_signup_funnel(7, null) where step = 'welcome_viewed') = 3, 'welcome visits, old one excluded';
  assert (select visits from public.admin_signup_funnel(30, null) where step = 'welcome_viewed') = 4, 'a longer window includes it';
  assert (select visits from public.admin_signup_funnel(7, 'web') where step = 'welcome_viewed') = 2, 'web only';
  assert (select visits from public.admin_signup_funnel(7, 'app') where step = 'welcome_viewed') = 1, 'app only';
  assert (select visits from public.admin_signup_funnel(7, null) where step = 'signup_completed') = 1, 'completed';
  begin perform public.admin_signup_funnel(0, null); raise exception 'FAIL: zero days'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_signup_funnel(7, 'mars'); raise exception 'FAIL: bad source'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;

  -- daily: today has 3 starts and 1 completion, and the window is exactly p_days long
  select count(*) into n from public.admin_signup_daily(7, null);
  assert n = 7, 'seven days listed: ' || n;
  assert (select sum(started) from public.admin_signup_daily(7, null)) = 3 and (select sum(completed) from public.admin_signup_daily(7, null)) = 1, 'daily totals';

  -- problems
  assert (select visits from public.admin_signup_problems(7, null) where kind = 'Field error' and detail = 'username_taken') = 1, 'field error counted';
  assert (select visits from public.admin_signup_problems(7, null) where kind = 'Asked for help' and detail = 'signup') = 1, 'help counted';
  assert (select visits from public.admin_signup_problems(7, null) where kind = 'Sign-in error' and detail = 'google') = 1, 'sign-in error counted';
  assert (select visits from public.admin_signup_problems(7, null) where kind = 'In-app browser') = 1, 'in-app browser counted';
  assert (select visits from public.admin_signup_problems(7, null) where kind = 'Error code' and detail = 'code_sent · wa_failed') = 1, 'error code counted';
  assert not exists (select 1 from public.admin_signup_problems(7, 'web') where kind = 'Field error'), 'app-only problem hidden on web';

  -- by source
  assert (select visits from public.admin_signup_by_source(7) where campaign = 'launch1' and placement = 'Instagram_Reels' and step = 'signup_completed') = 1, 'campaign completion';
  assert (select sum(visits) from public.admin_signup_by_source(7) where campaign = '(website, no ad tag)' and step = 'welcome_viewed') = 1, 'untagged web visit';
  assert (select sum(visits) from public.admin_signup_by_source(7) where campaign = '(app)' and step = 'welcome_viewed') = 1, 'app visit';

  -- unfinished: the 3-hour-old one with its last step, not the finished member and not the 5-minute-old one
  select * into r from public.admin_unfinished_signups() where id = 'd1000000-0000-0000-0000-000000000003';
  assert r.email = 'fun-unfinished@example.com' and r.source = 'instagram' and r.campaign = 'launch1' and r.last_step = 'profile_field_error', 'unfinished sign-up with its last step';
  assert not exists (select 1 from public.admin_unfinished_signups() where id in ('d1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000004')), 'finished and brand-new excluded';
end $$;

-- a plain member cannot read any of it
select pg_temp.act_as('d1000000-0000-0000-0000-000000000002');
do $$ begin
  begin perform public.admin_signup_funnel(7, null); raise exception 'FAIL: member read the funnel'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_unfinished_signups(); raise exception 'FAIL: member read unfinished sign-ups'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
delete from public.signup_events;
\echo ADMIN SIGNUP FUNNEL CHECKS PASSED
