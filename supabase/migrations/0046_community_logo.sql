-- tabkheen A: community logo (the tile) next to the cover photo (the place), both editable only by the creator or admin staff (founder, 2026-10-26).
-- Run after 0045_community_cover.sql.

alter table public.communities add column logo_path text;

create or replace function public.set_community_logo(p_community uuid, p_path text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.can_edit_community_cover(p_community), false) then
    raise exception 'only the creator or an admin can change the logo';
  end if;
  update public.communities set logo_path = nullif(p_path, '') where id = p_community;
end $$;

revoke all on function public.set_community_logo(uuid, text) from public, anon;
grant execute on function public.set_community_logo(uuid, text) to authenticated;
