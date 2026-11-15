-- tabkheen A: staff can change a member's area and communities (founder, 2026-11-15).
-- 1. admin_member_communities: the communities a member belongs to (the area is flagged).
-- 2. admin_set_member_place: move a member to another area (profile governorate and area change, the old area community
--    is left and the new one joined, the same as "Edit profile" in the app). Owner or moderator, reason required.
-- 3. admin_set_member_community: add a member to, or remove them from, a community. The member's current area community
--    cannot be removed here (move them instead). Owner or moderator, reason required.
-- Every use is written to the activity log; the audit trail (0052) also records the before and after rows.

create function public.admin_member_communities(p_id uuid)
returns table (community_id uuid, name text, kind text, governorate text, is_area boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select c.id, c.name, c.kind, c.governorate,
           (c.kind = 'area' and c.name = p.area and c.governorate is not distinct from p.governorate)
      from public.community_members m
      join public.communities c on c.id = m.community_id
      join public.profiles p on p.id = m.user_id
     where m.user_id = p_id
     order by (c.kind = 'area') desc, c.kind, c.name;
end;
$$;

create function public.admin_set_member_place(p_id uuid, p_area_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.require_staff(array['owner', 'moderator']);
  v_area public.communities;
  v_old public.profiles;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  select * into v_area from public.communities
   where id = p_area_id and kind = 'area' and status = 'approved' and hidden_at is null;
  if v_area.id is null then raise exception 'choose an approved area'; end if;
  select * into v_old from public.profiles where id = p_id;
  if v_old.id is null then raise exception 'member not found'; end if;

  -- leave the old area's community, join the new one
  delete from public.community_members m
   using public.communities c
   where m.user_id = p_id and m.community_id = c.id and c.kind = 'area'
     and c.name = v_old.area and c.governorate is not distinct from v_old.governorate;
  insert into public.community_members (community_id, user_id) values (v_area.id, p_id) on conflict do nothing;
  update public.profiles
     set governorate = v_area.governorate, area = v_area.name, country_code = v_area.country_code
   where id = p_id;

  perform public.log_admin_action('member_place_changed', 'profile', p_id::text, trim(p_reason),
    jsonb_build_object('from_area', v_old.area, 'from_governorate', v_old.governorate,
                       'to_area', v_area.name, 'to_governorate', v_area.governorate, 'actor', v_actor));
end;
$$;

create function public.admin_set_member_community(p_id uuid, p_community_id uuid, p_member boolean, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.require_staff(array['owner', 'moderator']);
  v_c public.communities;
  v_p public.profiles;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  select * into v_p from public.profiles where id = p_id;
  if v_p.id is null then raise exception 'member not found'; end if;
  select * into v_c from public.communities where id = p_community_id;
  if v_c.id is null then raise exception 'community not found'; end if;
  if p_member then
    if v_c.status <> 'approved' or v_c.hidden_at is not null then raise exception 'choose an approved community'; end if;
    insert into public.community_members (community_id, user_id) values (v_c.id, p_id) on conflict do nothing;
  else
    if v_c.kind = 'area' and v_c.name = v_p.area and v_c.governorate is not distinct from v_p.governorate then
      raise exception 'this is the member''s own area; move them to another area instead';
    end if;
    delete from public.community_members where community_id = v_c.id and user_id = p_id;
  end if;

  perform public.log_admin_action(case when p_member then 'member_community_added' else 'member_community_removed' end,
    'profile', p_id::text, trim(p_reason),
    jsonb_build_object('community', v_c.name, 'kind', v_c.kind, 'community_id', v_c.id, 'actor', v_actor));
end;
$$;

revoke all on function public.admin_member_communities(uuid), public.admin_set_member_place(uuid, uuid, text),
  public.admin_set_member_community(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.admin_member_communities(uuid), public.admin_set_member_place(uuid, uuid, text),
  public.admin_set_member_community(uuid, uuid, boolean, text) to authenticated;
