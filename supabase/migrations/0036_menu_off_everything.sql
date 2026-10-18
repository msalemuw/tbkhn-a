-- tabkheen A: when the Menu switch is off, everything menu-related is off (founder, 2026-10-18).
-- On top of 0035 (the Menu tab and new orders): (1) a cook cannot post a new "Today's menu" dish while the menu is off, so no
-- dish cards, cooking-today badges, menu stories or follower alerts appear; (2) switching the menu off ends the dishes that are
-- still open (orders already placed are not touched). Stories, signature posts, rankings and the rest of the social side
-- stay on. Posting a "Today's menu" dish works again as soon as staff switch the menu back on.

create or replace function public.admin_set_control(p_key text, p_value jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_ended int := 0;
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
  -- Switching the menu off also ends today's dishes that are still open (orders already placed are not touched).
  if p_key = 'menu_enabled' and p_value = 'false'::jsonb then
    update public.posts set expires_at = now() where kind = 'cooking_today' and expires_at > now();
    get diagnostics v_ended = row_count;
  end if;
  perform public.log_admin_action('control_changed', 'control', p_key, null, jsonb_build_object('from', v_old, 'to', p_value, 'dishes_ended', v_ended));
end;
$$;


-- New orders and new menu dishes are refused while the menu is off.
create or replace function public.block_when_paused() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_argv[0] = 'ordering_enabled' then
    if not public.control_on('menu_enabled') then
      raise exception 'Today’s menu is not open yet. Please check back soon.';
    elsif not public.control_on('ordering_enabled') then
      raise exception 'Ordering is paused for a moment. Please try again soon.';
    end if;
  elsif tg_argv[0] = 'posting_enabled' then
    if to_jsonb(new) ->> 'kind' = 'cooking_today' and not public.control_on('menu_enabled') then
      raise exception 'Today’s menu is not open yet. Please check back soon.';
    elsif not public.control_on('posting_enabled') then
      raise exception 'Posting is paused for a moment. Please try again soon.';
    end if;
  end if;
  return new;
end;
$$;
