-- tabkheen A: staff management on the website, plus kill switches and a minimum app version (founder, 2026-10-18).
-- 1. admin_list_staff: owner sees who is staff. admin_set_staff_role now refuses to change another owner.
-- 2. app_controls: ordering on/off, posting on/off, maintenance mode with a message, minimum app version.
--    Ordering and posting are enforced in the database, so even an old app build cannot bypass a pause.
--    The app reads app_status() on launch (no sign-in needed) to show a maintenance or "please update" screen.

-- ---------------------------------------------------------------------------
-- Staff list (owner only)
-- ---------------------------------------------------------------------------
create function public.admin_list_staff()
returns table (user_id uuid, username text, display_name text, email text, role text, added_by_username text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner']);
  return query
    select s.user_id, p.username, p.display_name, u.email::text, s.role, b.username, s.created_at
      from public.admin_staff s
      join public.profiles p on p.id = s.user_id
      join auth.users u on u.id = s.user_id
      left join public.profiles b on b.id = s.added_by
     order by (s.role = 'owner') desc, s.created_at;
end;
$$;

-- An owner cannot be demoted or removed by another owner (change it in the Supabase SQL Editor instead), so the
-- founder's access cannot be taken away from the website.
create or replace function public.admin_set_staff_role(p_user_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner']);
  if p_user_id = auth.uid() then raise exception 'you cannot change your own role'; end if;
  if exists (select 1 from public.admin_staff where user_id = p_user_id and role = 'owner') then
    raise exception 'an owner can only be changed in the Supabase SQL Editor';
  end if;
  if p_role is null then
    delete from public.admin_staff where user_id = p_user_id;
  else
    if p_role not in ('owner', 'moderator', 'support') then raise exception 'unknown role'; end if;
    if exists (select 1 from public.profiles where id = p_user_id and suspended_at is not null) then
      raise exception 'this account is suspended';
    end if;
    insert into public.admin_staff (user_id, role, added_by) values (p_user_id, p_role, auth.uid())
      on conflict (user_id) do update set role = excluded.role, added_by = excluded.added_by;
  end if;
  perform public.log_admin_action('staff_role_set', 'profile', p_user_id::text, null, jsonb_build_object('role', p_role));
end;
$$;

-- ---------------------------------------------------------------------------
-- Kill switches and minimum version
-- ---------------------------------------------------------------------------
create table public.app_controls (
  key text primary key check (key in ('ordering_enabled', 'posting_enabled', 'maintenance', 'maintenance_message', 'min_app_version')),
  value jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.app_controls enable row level security; -- no policies: read and written only through the functions below

insert into public.app_controls (key, value) values
  ('ordering_enabled', 'true'::jsonb),
  ('posting_enabled', 'true'::jsonb),
  ('maintenance', 'false'::jsonb),
  ('maintenance_message', '"tabkheen A is being updated. Please try again in a little while."'::jsonb),
  ('min_app_version', '""'::jsonb);

-- True unless the switch has been turned off.
create function public.control_on(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value)::text = 'true' from public.app_controls where key = p_key), true);
$$;

-- What the app needs at launch. Open to everyone, including signed-out visitors.
create function public.app_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'maintenance', coalesce((select (value)::text = 'true' from public.app_controls where key = 'maintenance'), false),
    'maintenance_message', (select value #>> '{}' from public.app_controls where key = 'maintenance_message'),
    'min_app_version', coalesce((select value #>> '{}' from public.app_controls where key = 'min_app_version'), ''),
    'ordering_enabled', public.control_on('ordering_enabled'),
    'posting_enabled', public.control_on('posting_enabled'));
$$;

-- Staff read the current values.
create function public.admin_get_controls()
returns table (key text, value jsonb, updated_by_username text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select c.key, c.value, p.username, c.updated_at
      from public.app_controls c left join public.profiles p on p.id = c.updated_by
     order by c.key;
end;
$$;

-- Change one value. Pausing ordering or posting: owner or moderator (fast response to a problem).
-- Maintenance mode, its message and the minimum version: owner only. Every change is logged.
create function public.admin_set_control(p_key text, p_value jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
begin
  if p_key in ('ordering_enabled', 'posting_enabled') then
    perform public.require_staff(array['owner', 'moderator']);
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'on or off only'; end if;
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

-- Enforce the pauses in the database, so an old app build cannot get around them.
create function public.block_when_paused() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_argv[0] = 'ordering_enabled' and not public.control_on('ordering_enabled') then
    raise exception 'Ordering is paused for a moment. Please try again soon.';
  elsif tg_argv[0] = 'posting_enabled' and not public.control_on('posting_enabled') then
    raise exception 'Posting is paused for a moment. Please try again soon.';
  end if;
  return new;
end;
$$;
create trigger reservations_paused before insert on public.reservations
  for each row execute function public.block_when_paused('ordering_enabled');
create trigger posts_paused before insert on public.posts
  for each row execute function public.block_when_paused('posting_enabled');

revoke execute on function public.admin_list_staff(), public.admin_set_staff_role(uuid, text), public.control_on(text),
  public.app_status(), public.admin_get_controls(), public.admin_set_control(text, jsonb), public.block_when_paused() from public, anon;
grant execute on function public.admin_list_staff(), public.admin_set_staff_role(uuid, text), public.admin_get_controls(),
  public.admin_set_control(text, jsonb) to authenticated;
grant execute on function public.app_status() to anon, authenticated;
