-- Pre-launch waitlist (founder, 2026-10-10): ads send people to a web page where they leave their
-- name, WhatsApp number and area before the app is in the stores. On launch day everyone on the list
-- is told to install. Visitors are not signed in, so the page only calls join_waitlist(); nobody but
-- staff can read the list.

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  phone text not null unique check (phone ~ '^\+[1-9][0-9]{7,14}$'), -- E.164, e.g. +201001234567
  role text not null check (role in ('eat', 'cook', 'both')),
  country_code text not null default 'EG' references public.countries (code),
  governorate text not null check (char_length(governorate) between 2 and 80),
  community_id uuid references public.communities (id) on delete set null,
  area text check (char_length(area) <= 80), -- typed when the community is not in the list
  lang text not null default 'ar' check (lang in ('ar', 'en')),
  contact_consent boolean not null check (contact_consent),
  ref_code text not null unique default substr(md5(gen_random_uuid()::text), 1, 8),
  referred_by text check (char_length(referred_by) <= 16), -- the ref_code of the invite link they came from
  utm jsonb not null default '{}'::jsonb, -- utm_source, utm_campaign, fbclid … from the ad link
  created_at timestamptz not null default now()
);

create index waitlist_referred_by_idx on public.waitlist (referred_by);

alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;

-- Join the list. Returns the member's invite code and whether they were already on it.
-- The phone must already be normalized by the page (+20 and 10 digits for Egypt).
create function public.join_waitlist(
  p_name text, p_phone text, p_role text, p_governorate text, p_community_id uuid, p_area text,
  p_lang text, p_consent boolean, p_referred_by text, p_utm jsonb
) returns table (ref_code text, already boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_code text;
begin
  if p_consent is not true then
    raise exception 'consent required';
  end if;
  select w.ref_code into v_code from public.waitlist w where w.phone = p_phone;
  if found then
    return query select v_code, true;
    return;
  end if;
  insert into public.waitlist (name, phone, role, governorate, community_id, area, lang, contact_consent, referred_by, utm)
  values (btrim(p_name), p_phone, p_role, btrim(p_governorate),
          (select c.id from public.communities c where c.id = p_community_id and c.status = 'approved'),
          nullif(btrim(coalesce(p_area, '')), ''), coalesce(p_lang, 'ar'), p_consent,
          nullif(btrim(coalesce(p_referred_by, '')), ''),
          -- Keep only short text values, so the page cannot be used to store anything else.
          coalesce((select jsonb_object_agg(k, left(v, 200)) from jsonb_each_text(coalesce(p_utm, '{}'::jsonb)) as e(k, v)
                    where k in ('utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid')), '{}'::jsonb))
  on conflict (phone) do nothing
  returning public.waitlist.ref_code into v_code;
  if v_code is null then -- joined a moment ago from another tab
    select w.ref_code into v_code from public.waitlist w where w.phone = p_phone;
    return query select v_code, true;
    return;
  end if;
  return query select v_code, false;
end;
$$;

revoke execute on function public.join_waitlist(text, text, text, text, uuid, text, text, boolean, text, jsonb) from public;
grant execute on function public.join_waitlist(text, text, text, text, uuid, text, text, boolean, text, jsonb) to anon, authenticated;

-- Staff: sign-ups per governorate and role, with how many each source brought in.
create function public.admin_waitlist_summary()
returns table (governorate text, role text, source text, signups bigint, invited bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select w.governorate, w.role, coalesce(w.utm ->> 'utm_source', case when w.referred_by is not null then 'invite' else 'direct' end),
           count(*), count(*) filter (where w.referred_by is not null)
    from public.waitlist w
    group by 1, 2, 3
    order by 4 desc;
end;
$$;

revoke execute on function public.admin_waitlist_summary() from public, anon;
grant execute on function public.admin_waitlist_summary() to authenticated;
