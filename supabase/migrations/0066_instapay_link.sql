-- tabkheen A, 2026-11-17: a tappable InstaPay payment link (founder idea). The eater taps "Pay in InstaPay" and the InstaPay app opens
-- with tabkheen A's address filled in, instead of copying the address by hand. The link is made in the founder's InstaPay app (Share my
-- QR / payment link) and saved in the admin Controls. Only https://ipn.eg/ links are accepted. Empty = the button is hidden.
-- Nothing else changes: the address and the Copy button stay.

alter table public.app_controls drop constraint app_controls_key_check;
alter table public.app_controls add constraint app_controls_key_check check (key in
  ('ordering_enabled', 'posting_enabled', 'maintenance', 'maintenance_message', 'min_app_version', 'menu_enabled', 'menu_message',
   'pay_through_app', 'app_instapay', 'app_instapay_link'));
insert into public.app_controls (key, value) values ('app_instapay_link', '""'::jsonb) on conflict (key) do nothing;

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
  elsif p_key = 'pay_through_app' then
    perform public.require_staff(array['owner']);
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'on or off only'; end if;
    if p_value = 'true'::jsonb and char_length(btrim(coalesce((select value #>> '{}' from public.app_controls where key = 'app_instapay'), ''))) < 3 then
      raise exception 'add tabkheen A''s InstaPay address first';
    end if;
  elsif p_key = 'app_instapay' then
    perform public.require_staff(array['owner']);
    if jsonb_typeof(p_value) <> 'string' or char_length(btrim(p_value #>> '{}')) > 60
       or (char_length(btrim(p_value #>> '{}')) between 1 and 2) then
      raise exception 'write the InstaPay address (3 to 60 letters), or leave it empty';
    end if;
    p_value := to_jsonb(btrim(p_value #>> '{}'));
  elsif p_key = 'app_instapay_link' then
    perform public.require_staff(array['owner']);
    if jsonb_typeof(p_value) <> 'string' or char_length(btrim(p_value #>> '{}')) > 200
       or (btrim(p_value #>> '{}') <> '' and btrim(p_value #>> '{}') !~ '^https://ipn\.eg/[A-Za-z0-9._/-]+$') then
      raise exception 'paste the InstaPay payment link (it starts with https://ipn.eg/), or leave it empty';
    end if;
    p_value := to_jsonb(btrim(p_value #>> '{}'));
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

-- The pay screen also gets the link.
create or replace function public.order_payment_info(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_r public.reservations;
begin
  select * into v_r from public.reservations where id = p_id;
  if v_r.id is null or v_r.buyer_id <> auth.uid() or not v_r.pay_through_app then return null; end if;
  return jsonb_build_object(
    'instapay', (select value #>> '{}' from public.app_controls where key = 'app_instapay'),
    'instapay_link', nullif((select value #>> '{}' from public.app_controls where key = 'app_instapay_link'), ''),
    'pay_by', v_r.pay_by,
    'pickup_code', case when v_r.payment_status = 'received'
                        then (select c.code from public.reservation_codes c where c.reservation_id = v_r.id) end);
end;
$$;
