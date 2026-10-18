-- tabkheen A: community tools for staff (founder, 2026-10-18).
-- 1. admin_create_community: staff create an approved community directly (no request needed).
-- 2. admin_resolve_community_request: close a request by putting the requester into any number of existing
--    communities and/or brand new ones, in one step (a member may type two compounds in one request).
-- Replaces admin_join_existing_community (0025), which could only pick one community.

drop function public.admin_join_existing_community(uuid, uuid);

-- ---------------------------------------------------------------------------
-- Create an approved community. A name that already exists in that governorate and type is refused with a plain message.
-- ---------------------------------------------------------------------------
create function public.admin_create_community(p_name text, p_kind text, p_governorate text, p_area text default null)
returns public.communities
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.communities;
begin
  perform public.require_staff(array['owner', 'moderator']);
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'the name needs 2 to 80 letters'; end if;
  if p_kind not in ('area', 'compound', 'club', 'sahel', 'school', 'work', 'other') then raise exception 'choose a type'; end if;
  if btrim(coalesce(p_governorate, '')) = '' then raise exception 'choose a governorate'; end if;
  begin
    insert into public.communities (name, kind, governorate, area, status, reviewed_by, reviewed_at)
      values (p_name, p_kind, p_governorate, nullif(btrim(p_area), ''), 'approved', auth.uid(), now())
      returning * into v_row;
  exception when unique_violation then
    raise exception 'a community with this name already exists in % (same type)', btrim(p_governorate);
  end;
  perform public.log_admin_action('community_created', 'community', v_row.id::text, null,
                                  jsonb_build_object('name', v_row.name, 'kind', v_row.kind, 'governorate', v_row.governorate));
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Close a waiting request by putting its requester into existing communities (p_join: ids) and/or new ones
-- (p_create: [{name, kind, governorate, area}]). At least one of the two. The request is closed as rejected so it
-- leaves the queue; the member's notification names every community they were added to (and opens it when it is one).
-- ---------------------------------------------------------------------------
create function public.admin_resolve_community_request(p_id uuid, p_join uuid[], p_create jsonb default '[]'::jsonb)
returns public.communities
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.communities;
  v_target public.communities;
  v_new public.communities;
  v_item jsonb;
  v_ids uuid[] := '{}';
  v_names text[] := '{}';
  v_join uuid[] := coalesce(p_join, '{}');
  v_create jsonb := coalesce(p_create, '[]'::jsonb);
  v_id uuid;
  v_note text;
begin
  perform public.require_staff(array['owner', 'moderator']);
  if jsonb_typeof(v_create) <> 'array' then raise exception 'new communities must be a list'; end if;
  if cardinality(v_join) + jsonb_array_length(v_create) = 0 then raise exception 'choose at least one community'; end if;
  if cardinality(v_join) + jsonb_array_length(v_create) > 10 then raise exception 'at most 10 communities at a time'; end if;

  select * into v_row from public.communities where id = p_id and status = 'pending' for update;
  if v_row.id is null then raise exception 'this request was already reviewed'; end if;

  -- Close the request first, so a new community may carry the very name that was requested.
  update public.communities set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;

  foreach v_id in array (select array(select distinct unnest(v_join))) loop
    select * into v_target from public.communities where id = v_id and status = 'approved';
    if v_target.id is null or v_id = p_id then raise exception 'choose existing communities only'; end if;
    v_ids := v_ids || v_target.id;
    v_names := v_names || v_target.name;
  end loop;

  for v_item in select * from jsonb_array_elements(v_create) loop
    v_new := public.admin_create_community(v_item ->> 'name', v_item ->> 'kind', v_item ->> 'governorate', v_item ->> 'area');
    v_ids := v_ids || v_new.id;
    v_names := v_names || v_new.name;
  end loop;

  v_note := 'We added you to ' || (select string_agg('“' || n || '”', ', ') from unnest(v_names) n) || '.'
            || case when cardinality(v_ids) = 1 then ' Tap to open it.' else '' end;
  update public.communities set review_note = v_note where id = p_id;

  if v_row.requested_by is not null then
    insert into public.community_members (community_id, user_id)
      select x, v_row.requested_by from unnest(v_ids) x
      on conflict do nothing;
    insert into public.notifications (user_id, kind, payload)
      values (v_row.requested_by, 'community_rejected',
              jsonb_build_object('community_id', v_row.id, 'name', v_row.name, 'note', v_note, 'added', to_jsonb(v_names))
              || case when cardinality(v_ids) = 1 then jsonb_build_object('redirect_id', v_ids[1]) else '{}'::jsonb end);
  end if;
  perform public.log_admin_action('community_resolved', 'community', v_row.id::text, v_note,
                                  jsonb_build_object('name', v_row.name, 'added_to', to_jsonb(v_names),
                                                     'created', jsonb_array_length(v_create), 'member_id', v_row.requested_by));
  select * into v_row from public.communities where id = p_id;
  return v_row;
end;
$$;

revoke execute on function public.admin_create_community(text, text, text, text),
  public.admin_resolve_community_request(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.admin_create_community(text, text, text, text),
  public.admin_resolve_community_request(uuid, uuid[], jsonb) to authenticated;
