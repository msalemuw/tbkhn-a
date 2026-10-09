-- "How did you hear about us?" becomes two steps: a category (heard_from), then a detail
-- (heard_detail): the platform, ad, store or the name of the community, event or outlet.
alter table public.profiles drop constraint if exists profiles_heard_from_check;
alter table public.profiles add constraint profiles_heard_from_check check (heard_from in (
  'friend', 'family', 'social_media', 'ad', 'search', 'community', 'event', 'media', 'other'));
alter table public.profiles add column if not exists heard_detail text check (char_length(heard_detail) <= 80);
grant update (heard_detail) on public.profiles to authenticated;

-- Referral tally, now with the detail: finished sign-ups by answer, detail and week.
-- Details typed in different spellings or cases are folded together; the most common spelling is shown.
drop function if exists public.admin_referral_tally(uuid);
create or replace function public.admin_referral_tally(p_community_id uuid default null)
returns table (week_start date, heard_from text, heard_detail text, signups int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select date_trunc('week', p.created_at at time zone 'Africa/Cairo')::date,
           p.heard_from,
           (mode() within group (order by trim(p.heard_detail)))::text,
           count(*)::int
      from public.profiles p
     where p.username is not null
       and (p_community_id is null
            or exists (select 1 from public.community_members m where m.community_id = p_community_id and m.user_id = p.id))
     group by 1, 2, lower(regexp_replace(trim(coalesce(p.heard_detail, '')), '\s+', ' ', 'g'))
     order by 1 desc, 4 desc;
end;
$$;
revoke execute on function public.admin_referral_tally(uuid) from public, anon;
grant execute on function public.admin_referral_tally(uuid) to authenticated;
