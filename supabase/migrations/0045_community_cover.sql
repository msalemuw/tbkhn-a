-- tabkheen A: community cover photo, editable only by the community creator or admin staff (founder, 2026-10-26).
-- The photo itself is uploaded to the media bucket under the uploader's own folder; this only records its path.
-- Run after 0044_three_step_signup.sql.

alter table public.communities add column cover_path text;

create or replace function public.set_community_cover(p_community uuid, p_path text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not allowed';
  end if;
  if not (
    public.staff_role() is not null
    or exists (select 1 from public.communities c where c.id = p_community and c.requested_by = auth.uid())
  ) then
    raise exception 'only the creator or an admin can change the cover photo';
  end if;
  update public.communities set cover_path = nullif(p_path, '') where id = p_community;
end $$;

revoke all on function public.set_community_cover(uuid, text) from public, anon;
grant execute on function public.set_community_cover(uuid, text) to authenticated;

-- Whether the caller may edit this community's cover (creator or staff); the app shows the edit button from it.
create or replace function public.can_edit_community_cover(p_community uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    public.staff_role() is not null
    or exists (select 1 from public.communities c where c.id = p_community and c.requested_by = auth.uid())
  );
$$;

revoke all on function public.can_edit_community_cover(uuid) from public, anon;
grant execute on function public.can_edit_community_cover(uuid) to authenticated;
