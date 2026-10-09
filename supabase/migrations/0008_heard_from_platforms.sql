-- "How did you hear about us?": social media is split into the individual platforms so referral
-- reports show which one brings members. The old 'social_media' answer stays valid for earlier sign-ups.
alter table public.profiles drop constraint if exists profiles_heard_from_check;
alter table public.profiles add constraint profiles_heard_from_check check (heard_from in (
  'friend', 'family', 'community',
  'instagram', 'facebook', 'tiktok', 'whatsapp', 'youtube', 'x', 'snapchat', 'social_other', 'social_media',
  'ad', 'search', 'other'));
