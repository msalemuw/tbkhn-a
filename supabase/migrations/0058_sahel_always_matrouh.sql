-- tabkheen A: a Sahel community (North Coast compound or resort) is always in Matrouh (founder, 2026-11-15).
-- 1. Every existing Sahel community moves to Matrouh (some had the governorate of whoever requested them).
-- 2. A trigger keeps it that way for new requests and edits, from the app, the website or the admin site.

update public.communities set governorate = 'Matrouh', area = null
 where kind = 'sahel' and (governorate is distinct from 'Matrouh' or area is not null);

create function public.communities_sahel_matrouh()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.kind = 'sahel' then
    new.governorate := 'Matrouh';
    new.area := null;
  end if;
  return new;
end;
$$;

create trigger communities_sahel_matrouh
  before insert or update of kind, governorate, area on public.communities
  for each row execute function public.communities_sahel_matrouh();
