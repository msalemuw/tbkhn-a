-- Starter communities, taken from the sign-up pickers in docs/design/TBKHN-A-Prototype.html.
-- The launch list is decided by market research; edit or extend this in the admin panel.
-- Safe to run more than once.
insert into public.communities (name, kind, governorate, area, status)
select v.name, v.kind, v.governorate, v.area, 'approved'
from (values
  ('Mohandeseen', 'area', 'Giza', 'Mohandeseen'),
  ('Dokki', 'area', 'Giza', 'Dokki'),
  ('Agouza', 'area', 'Giza', 'Agouza'),
  ('Sheikh Zayed', 'area', 'Giza', 'Sheikh Zayed'),
  ('6th of October', 'area', 'Giza', '6th of October'),
  ('Heliopolis', 'area', 'Cairo', 'Heliopolis'),
  ('Nasr City', 'area', 'Cairo', 'Nasr City'),
  ('New Cairo', 'area', 'Cairo', 'New Cairo'),
  ('Maadi', 'area', 'Cairo', 'Maadi'),
  ('Zamalek', 'area', 'Cairo', 'Zamalek'),
  ('Smouha', 'area', 'Alexandria', 'Smouha'),
  ('Sidi Gaber', 'area', 'Alexandria', 'Sidi Gaber'),
  ('Montaza', 'area', 'Alexandria', 'Montaza'),
  ('Stanley', 'area', 'Alexandria', 'Stanley'),
  ('Shooting Club', 'club', 'Giza', 'Dokki'),
  ('Gezira Club', 'club', 'Cairo', 'Zamalek'),
  ('Heliopolis Sporting Club', 'club', 'Cairo', 'Heliopolis'),
  ('Hacienda', 'sahel', 'Matrouh', null),
  ('Marassi', 'sahel', 'Matrouh', null),
  ('Almaza Bay', 'sahel', 'Matrouh', null),
  ('Al Alsson', 'school', 'Giza', '6th of October'),
  ('Smart Village', 'work', 'Giza', '6th of October')
) as v (name, kind, governorate, area)
where not exists (select 1 from public.communities c where c.name = v.name and c.kind = v.kind);
