-- tabkheen A: Menu tab on/off switch (founder, 2026-10-18).
-- While recruiting and running the competition the Menu will be empty, so staff can switch the whole menu off. The app then
-- shows an editable "coming soon" message in the Menu tab, and the database refuses new orders (so older app builds are
-- covered too). Posting, stories, social features and rankings are not touched. The switch is ON by default (nothing changes
-- until staff turn it off). Owner and moderator can change it and its message; every change is logged like the other controls.

alter table public.app_controls drop constraint app_controls_key_check;
alter table public.app_controls add constraint app_controls_key_check
  check (key in ('ordering_enabled', 'posting_enabled', 'maintenance', 'maintenance_message', 'min_app_version', 'menu_enabled', 'menu_message'));

insert into public.app_controls (key, value) values
  ('menu_enabled', 'true'::jsonb),
  ('menu_message', '"Today’s menu is coming soon. We are getting our cooks ready. Stay tuned!"'::jsonb);

-- What the app needs at launch, now with the menu switch and its message.
create or replace function public.app_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'maintenance', coalesce((select (value)::text = 'true' from public.app_controls where key = 'maintenance'), false),
    'maintenance_message', (select value #>> '{}' from public.app_controls where key = 'maintenance_message'),
    'min_app_version', coalesce((select value #>> '{}' from public.app_controls where key = 'min_app_version'), ''),
    'ordering_enabled', public.control_on('ordering_enabled'),
    'posting_enabled', public.control_on('posting_enabled'),
    'menu_enabled', public.control_on('menu_enabled'),
    'menu_message', (select value #>> '{}' from public.app_controls where key = 'menu_message'));
$$;

create or replace function public.admin_set_control(p_key text, p_value jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
begin
  if p_key in ('ordering_enabled', 'posting_enabled', 'menu_enabled') then
    perform public.require_staff(array['owner', 'moderator']);
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'on or off only'; end if;
  elsif p_key = 'menu_message' then
    perform public.require_staff(array['owner', 'moderator']);
    if jsonb_typeof(p_value) <> 'string' or char_length(btrim(p_value #>> '{}')) not between 3 and 300 then raise exception 'write a message of 3 to 300 letters'; end if;
  elsif p_key = 'maintenance' then
    perform public.require_staff(array['owner']);
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'on or off only'; end if;
  elsif p_key = 'maintenance_message' then
    perform public.require_staff(array['owner']);
    if jsonb_typeof(p_value) <> 'string' or char_length(btrim(p_value #>> '{}')) not between 3 and 300 then raise exception 'write a message of 3 to 300 letters'; end if;
  elsif p_key = 'min_app_version' then
    perform public.require_staff(array['owner']);
    if jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') !~ '^([0-9]+(\.[0-9]+){0,2})?$' then raise exception 'use a version like 1.0.2, or leave it empty'; end if;
  else
    raise exception 'unknown control';
  end if;
  select value into v_old from public.app_controls where key = p_key;
  update public.app_controls set value = p_value, updated_by = auth.uid(), updated_at = now() where key = p_key;
  perform public.log_admin_action('control_changed', 'control', p_key, null, jsonb_build_object('from', v_old, 'to', p_value));
end;
$$;

-- New orders are refused while ordering is paused or the menu is switched off.
create or replace function public.block_when_paused() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_argv[0] = 'ordering_enabled' and not public.control_on('menu_enabled') then
    raise exception 'Today’s menu is not open yet. Please check back soon.';
  elsif tg_argv[0] = 'ordering_enabled' and not public.control_on('ordering_enabled') then
    raise exception 'Ordering is paused for a moment. Please try again soon.';
  elsif tg_argv[0] = 'posting_enabled' and not public.control_on('posting_enabled') then
    raise exception 'Posting is paused for a moment. Please try again soon.';
  end if;
  return new;
end;
$$;
