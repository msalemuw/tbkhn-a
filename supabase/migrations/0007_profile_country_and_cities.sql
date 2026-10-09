-- Fixes saving the sign-up profile (members could not write their own country) and adds major cities
-- for Saudi Arabia and the UAE, the way Egypt lists its governorates. Edit these rows in the table editor.
grant update (country_code) on public.profiles to authenticated;

insert into public.regions (country_code, name, name_ar, sort) values
  ('SA', 'Riyadh', 'الرياض', 1), ('SA', 'Jeddah', 'جدة', 2), ('SA', 'Makkah', 'مكة المكرمة', 3),
  ('SA', 'Madinah', 'المدينة المنورة', 4), ('SA', 'Dammam', 'الدمام', 5), ('SA', 'Khobar', 'الخبر', 6),
  ('SA', 'Dhahran', 'الظهران', 7), ('SA', 'Taif', 'الطائف', 8), ('SA', 'Tabuk', 'تبوك', 9),
  ('SA', 'Abha', 'أبها', 10), ('SA', 'Khamis Mushait', 'خميس مشيط', 11), ('SA', 'Buraydah', 'بريدة', 12),
  ('SA', 'Hail', 'حائل', 13), ('SA', 'Jazan', 'جازان', 14), ('SA', 'Najran', 'نجران', 15),
  ('SA', 'Jubail', 'الجبيل', 16), ('SA', 'Yanbu', 'ينبع', 17), ('SA', 'Hofuf', 'الهفوف', 18),
  ('SA', 'Al Kharj', 'الخرج', 19), ('SA', 'Qatif', 'القطيف', 20),
  ('AE', 'Dubai', 'دبي', 1), ('AE', 'Abu Dhabi', 'أبوظبي', 2), ('AE', 'Sharjah', 'الشارقة', 3),
  ('AE', 'Ajman', 'عجمان', 4), ('AE', 'Al Ain', 'العين', 5), ('AE', 'Ras Al Khaimah', 'رأس الخيمة', 6),
  ('AE', 'Fujairah', 'الفجيرة', 7), ('AE', 'Umm Al Quwain', 'أم القيوين', 8)
on conflict (country_code, name) do nothing;
