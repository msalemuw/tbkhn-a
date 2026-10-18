-- tabkheen A: cook verification checklist (founder, 2026-10-18).
-- The verified tick means an admin has seen the person's ID and confirmed who they are (0013). This adds a checklist
-- so every cook is checked the same way, a queue of cooks still to check, and a "Complete verification" action that
-- turns the tick on only when every item is ticked. No ID photo is stored here: staff tick that they saw it.
-- Owner and moderator can tick and complete; support can read. The quick Verify / Remove tick buttons from 0013 stay.

create table public.cook_verifications (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  id_seen boolean not null default false,              -- the original ID was shown (photo or in person)
  selfie_matches boolean not null default false,       -- the person on the ID is the person on the account
  phone_confirmed boolean not null default false,      -- reached on the phone number or WhatsApp
  instapay_name_matches boolean not null default false,-- the InstaPay name matches the ID name
  pickup_area_confirmed boolean not null default false,-- the pickup area is real and the cook agreed to the house rules
  note text check (char_length(note) <= 500),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  completed_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz
);
alter table public.cook_verifications enable row level security; -- no policies: read and written only through the functions below
revoke all on public.cook_verifications from public, anon, authenticated;

-- Cooks (members who have posted a "cooking today" dish) with how far their checklist is. p_filter: 'todo' (not verified),
-- 'verified' or 'all'. Most picked-up orders first, so busy cooks are checked first.
create function public.admin_verification_queue(p_filter text default 'todo')
returns table (id uuid, username text, display_name text, area text, governorate text, verified_at timestamptz,
               items_done int, dishes int, picked_up int, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  if p_filter not in ('todo', 'verified', 'all') then raise exception 'unknown filter'; end if;
  return query
    select p.id, p.username, p.display_name, p.area, p.governorate, p.verified_at,
           coalesce(v.id_seen::int + v.selfie_matches::int + v.phone_confirmed::int + v.instapay_name_matches::int + v.pickup_area_confirmed::int, 0),
           (select count(*)::int from public.posts x where x.author_id = p.id and x.kind = 'cooking_today'),
           (select count(*)::int from public.reservations r where r.cook_id = p.id and r.status = 'picked_up'),
           p.created_at
      from public.profiles p
      left join public.cook_verifications v on v.user_id = p.id
     where p.username is not null
       and exists (select 1 from public.posts x where x.author_id = p.id and x.kind = 'cooking_today')
       and (p_filter = 'all' or (p_filter = 'todo' and p.verified_at is null) or (p_filter = 'verified' and p.verified_at is not null))
     order by 8 desc, 7 desc, p.created_at
     limit 100;
end;
$$;

-- One cook's checklist with the details staff compare against the ID.
create function public.admin_verification_get(p_user_id uuid)
returns table (id uuid, username text, display_name text, phone text, email text, instapay_handle text, area text, governorate text,
               verified_at timestamptz, id_seen boolean, selfie_matches boolean, phone_confirmed boolean,
               instapay_name_matches boolean, pickup_area_confirmed boolean, note text,
               updated_by_username text, updated_at timestamptz, completed_by_username text, completed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select p.id, p.username, p.display_name, u.phone::text, u.email::text, p.instapay_handle, p.area, p.governorate, p.verified_at,
           coalesce(v.id_seen, false), coalesce(v.selfie_matches, false), coalesce(v.phone_confirmed, false),
           coalesce(v.instapay_name_matches, false), coalesce(v.pickup_area_confirmed, false), v.note,
           ub.username, v.updated_at, cb.username, v.completed_at
      from public.profiles p
      left join auth.users u on u.id = p.id
      left join public.cook_verifications v on v.user_id = p.id
      left join public.profiles ub on ub.id = v.updated_by
      left join public.profiles cb on cb.id = v.completed_by
     where p.id = p_user_id;
end;
$$;

-- Save the ticks and the note. p_items is an object with any of the five keys; keys left out keep their value.
create function public.admin_verification_save(p_user_id uuid, p_items jsonb, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_keys text[] := array['id_seen', 'selfie_matches', 'phone_confirmed', 'instapay_name_matches', 'pickup_area_confirmed'];
  v_k text;
begin
  perform public.require_staff(array['owner', 'moderator']);
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'member not found'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'object' then raise exception 'send the checklist as an object'; end if;
  for v_k in select jsonb_object_keys(p_items) loop
    if not (v_k = any (v_keys)) then raise exception 'unknown checklist item %', v_k; end if;
    if jsonb_typeof(p_items -> v_k) <> 'boolean' then raise exception 'checklist items are true or false'; end if;
  end loop;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'the note is too long (500 letters at most)'; end if;

  insert into public.cook_verifications (user_id, id_seen, selfie_matches, phone_confirmed, instapay_name_matches, pickup_area_confirmed, note, updated_by)
    values (p_user_id,
            coalesce((p_items ->> 'id_seen')::boolean, false), coalesce((p_items ->> 'selfie_matches')::boolean, false),
            coalesce((p_items ->> 'phone_confirmed')::boolean, false), coalesce((p_items ->> 'instapay_name_matches')::boolean, false),
            coalesce((p_items ->> 'pickup_area_confirmed')::boolean, false), nullif(btrim(p_note), ''), auth.uid())
  on conflict (user_id) do update set
    id_seen = coalesce((p_items ->> 'id_seen')::boolean, cook_verifications.id_seen),
    selfie_matches = coalesce((p_items ->> 'selfie_matches')::boolean, cook_verifications.selfie_matches),
    phone_confirmed = coalesce((p_items ->> 'phone_confirmed')::boolean, cook_verifications.phone_confirmed),
    instapay_name_matches = coalesce((p_items ->> 'instapay_name_matches')::boolean, cook_verifications.instapay_name_matches),
    pickup_area_confirmed = coalesce((p_items ->> 'pickup_area_confirmed')::boolean, cook_verifications.pickup_area_confirmed),
    note = case when p_note is null then cook_verifications.note else nullif(btrim(p_note), '') end,
    updated_by = auth.uid(), updated_at = now();
  perform public.log_admin_action('verification_saved', 'profile', p_user_id::text, null);
end;
$$;

-- Turn the verified tick on. Refused until every item is ticked. Staff can still remove the tick with admin_set_verified.
create function public.admin_verification_complete(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.cook_verifications;
begin
  perform public.require_staff(array['owner', 'moderator']);
  if p_user_id = auth.uid() then raise exception 'you cannot verify yourself'; end if;
  select * into v from public.cook_verifications where user_id = p_user_id for update;
  if v.user_id is null or not (v.id_seen and v.selfie_matches and v.phone_confirmed and v.instapay_name_matches and v.pickup_area_confirmed) then
    raise exception 'tick every item on the checklist first';
  end if;
  update public.profiles set verified_at = coalesce(verified_at, now()) where id = p_user_id;
  update public.cook_verifications set completed_by = auth.uid(), completed_at = now() where user_id = p_user_id;
  perform public.log_admin_action('member_verified', 'profile', p_user_id::text, null, jsonb_build_object('checklist', true));
end;
$$;

revoke execute on function public.admin_verification_queue(text), public.admin_verification_get(uuid),
  public.admin_verification_save(uuid, jsonb, text), public.admin_verification_complete(uuid) from public, anon;
grant execute on function public.admin_verification_queue(text), public.admin_verification_get(uuid),
  public.admin_verification_save(uuid, jsonb, text), public.admin_verification_complete(uuid) to authenticated;
