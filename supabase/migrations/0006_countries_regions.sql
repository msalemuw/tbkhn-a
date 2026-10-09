-- Countries and regions for sign-up and community requests.
-- Egypt is the launch country, with its 27 governorates; the other countries start with no regions
-- (members type their region when they request a community). Edit these tables in the Supabase table
-- editor or the admin panel; the app reads them live, nothing is hard-coded in the app.
create table public.countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  name_ar text,
  sort int not null default 100,
  enabled boolean not null default true
);

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries (code) on delete cascade,
  name text not null,
  name_ar text,
  sort int not null default 100,
  enabled boolean not null default true,
  unique (country_code, name)
);

alter table public.countries enable row level security;
alter table public.regions enable row level security;
create policy "countries readable" on public.countries for select using (true);
create policy "regions readable" on public.regions for select using (true);
grant select on public.countries, public.regions to anon, authenticated;

insert into public.countries (code, name, name_ar, sort) values
  ('EG', 'Egypt', 'مصر', 1),
  ('SA', 'Saudi Arabia', 'السعودية', 10), ('AE', 'United Arab Emirates', 'الإمارات', 11),
  ('KW', 'Kuwait', 'الكويت', 12), ('QA', 'Qatar', 'قطر', 13), ('BH', 'Bahrain', 'البحرين', 14),
  ('OM', 'Oman', 'عُمان', 15), ('JO', 'Jordan', 'الأردن', 16), ('LB', 'Lebanon', 'لبنان', 17),
  ('IQ', 'Iraq', 'العراق', 18), ('SY', 'Syria', 'سوريا', 19), ('PS', 'Palestine', 'فلسطين', 20),
  ('YE', 'Yemen', 'اليمن', 21), ('LY', 'Libya', 'ليبيا', 22), ('TN', 'Tunisia', 'تونس', 23),
  ('DZ', 'Algeria', 'الجزائر', 24), ('MA', 'Morocco', 'المغرب', 25), ('SD', 'Sudan', 'السودان', 26),
  ('TR', 'Turkey', 'تركيا', 30), ('GB', 'United Kingdom', 'المملكة المتحدة', 40),
  ('US', 'United States', 'الولايات المتحدة', 41), ('CA', 'Canada', 'كندا', 42),
  ('DE', 'Germany', 'ألمانيا', 43), ('FR', 'France', 'فرنسا', 44), ('IT', 'Italy', 'إيطاليا', 45),
  ('ES', 'Spain', 'إسبانيا', 46), ('NL', 'Netherlands', 'هولندا', 47), ('SE', 'Sweden', 'السويد', 48),
  ('CH', 'Switzerland', 'سويسرا', 49), ('AU', 'Australia', 'أستراليا', 50), ('IE', 'Ireland', 'أيرلندا', 51),
  ('CY', 'Cyprus', 'قبرص', 52), ('GR', 'Greece', 'اليونان', 53), ('MY', 'Malaysia', 'ماليزيا', 54);

insert into public.regions (country_code, name, name_ar, sort) values
  ('EG', 'Cairo', 'القاهرة', 1), ('EG', 'Giza', 'الجيزة', 2), ('EG', 'Alexandria', 'الإسكندرية', 3),
  ('EG', 'Qalyubia', 'القليوبية', 4), ('EG', 'Sharqia', 'الشرقية', 5), ('EG', 'Dakahlia', 'الدقهلية', 6),
  ('EG', 'Gharbia', 'الغربية', 7), ('EG', 'Monufia', 'المنوفية', 8), ('EG', 'Beheira', 'البحيرة', 9),
  ('EG', 'Kafr El Sheikh', 'كفر الشيخ', 10), ('EG', 'Damietta', 'دمياط', 11), ('EG', 'Port Said', 'بورسعيد', 12),
  ('EG', 'Ismailia', 'الإسماعيلية', 13), ('EG', 'Suez', 'السويس', 14), ('EG', 'North Sinai', 'شمال سيناء', 15),
  ('EG', 'South Sinai', 'جنوب سيناء', 16), ('EG', 'Red Sea', 'البحر الأحمر', 17), ('EG', 'Matrouh', 'مطروح', 18),
  ('EG', 'Faiyum', 'الفيوم', 19), ('EG', 'Beni Suef', 'بني سويف', 20), ('EG', 'Minya', 'المنيا', 21),
  ('EG', 'Asyut', 'أسيوط', 22), ('EG', 'Sohag', 'سوهاج', 23), ('EG', 'Qena', 'قنا', 24),
  ('EG', 'Luxor', 'الأقصر', 25), ('EG', 'Aswan', 'أسوان', 26), ('EG', 'New Valley', 'الوادي الجديد', 27);

-- Existing communities and members are in Egypt.
alter table public.communities add column country_code text not null default 'EG' references public.countries (code);
alter table public.profiles add column country_code text not null default 'EG' references public.countries (code);

-- A member who requested a community joins it as soon as an admin approves it.
create function public.join_requester_on_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' and new.requested_by is not null then
    insert into public.community_members (community_id, user_id) values (new.id, new.requested_by)
      on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger communities_join_requester after update on public.communities
  for each row execute function public.join_requester_on_approval();

-- Clean community data: tidy spacing, and refuse a second community whose name only differs by case,
-- spaces, punctuation or Arabic letter variants (so "Shooting  Club" and "shooting club" are one community).
create function public.normalize_community_name() returns trigger
language plpgsql as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.governorate := btrim(regexp_replace(new.governorate, '\s+', ' ', 'g'));
  return new;
end;
$$;
create trigger communities_normalize before insert or update of name, governorate on public.communities
  for each row execute function public.normalize_community_name();
update public.communities set name = name;

alter table public.communities add column name_key text generated always as (
  lower(translate(regexp_replace(name, '[^[:alnum:]]', '', 'g'), 'أإآةى', 'اااهي'))
) stored;
create unique index communities_one_per_name on public.communities (country_code, kind, lower(governorate), name_key)
  where status in ('pending', 'approved');
