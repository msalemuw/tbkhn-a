-- tabkheen A: edit, hide and merge communities (founder, 2026-10-18).
-- 1. Edit: rename an approved community or change its type, governorate or area (a name that already exists is refused).
-- 2. Hide / unhide: a hidden community disappears from the app and the website (lists, search, joining, rankings,
--    announcement audiences) but keeps its members and posts, and can be shown again at any time.
-- 3. Merge: move every member, post and announcement target from one community into another, then
--    retire the old one (its name becomes free again). A merge cannot be undone.
-- All three are for owner and moderator, and every use is written to the activity log.

alter table public.communities add column hidden_at timestamptz;
alter table public.communities add column merged_into uuid references public.communities (id) on delete set null;

-- The app and the website read communities through this policy, so hiding here hides everywhere.
drop policy "approved communities readable" on public.communities;
create policy "approved communities readable" on public.communities for select
  using (hidden_at is null and (status = 'approved' or requested_by = auth.uid()));

drop policy "join approved communities" on public.community_members;
create policy "join approved communities" on public.community_members for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.communities c where c.id = community_id and c.status = 'approved' and c.hidden_at is null));

-- Rankings skip hidden communities.
create or replace function public.community_ranking(p_kind text, p_communities uuid[])
returns table (community_id uuid, community_name text, cook_id uuid, rank int, score numeric, orders int, rating numeric, likes int)
language sql stable security definer set search_path = '' as $$
  with stat as (
    select m.community_id, m.user_id as cook_id,
           coalesce((select count(*)::int from public.reservations r where r.cook_id = m.user_id and r.status = 'picked_up'), 0) as orders,
           (select avg(v.rating)::numeric from public.reviews v where v.cook_id = m.user_id) as rating,
           coalesce((select count(*)::int
                       from public.likes l join public.posts po on po.id = l.post_id
                      where po.author_id = m.user_id and po.kind = 'signature' and l.user_id <> po.author_id), 0) as likes
      from public.community_members m
     where m.community_id = any (p_communities)
  ),
  scored as (
    select s.*, c.name,
           case when p_kind = 'likes' then s.likes::numeric else coalesce(s.rating, 0) * s.orders end as score
      from stat s join public.communities c on c.id = s.community_id and c.status = 'approved' and c.hidden_at is null
  ),
  ranked as (
    select s.*, (row_number() over (partition by s.community_id order by s.score desc, s.orders desc, s.cook_id))::int as rank
      from scored s
     where s.score > 0
  )
  select r.community_id, r.name, r.cook_id, r.rank, round(r.score, 2), r.orders, round(r.rating, 2), r.likes
    from ranked r
   where r.rank <= 3 and p_kind in ('service', 'likes')
   order by r.community_id, r.rank;
$$;

-- Staff lists: the directory now also shows hidden communities (flagged); announcement audiences skip them.
drop function public.admin_community_directory();
create function public.admin_community_directory()
returns table (id uuid, name text, kind text, governorate text, area text, members int, created_at timestamptz, hidden_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select c.id, c.name, c.kind, c.governorate, c.area,
           (select count(*)::int from public.community_members m where m.community_id = c.id), c.created_at, c.hidden_at
      from public.communities c
     where c.status = 'approved'
     order by c.governorate, c.name;
end;
$$;

create or replace function public.admin_communities()
returns table (id uuid, name text, kind text, governorate text, area text, members int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select c.id, c.name, c.kind, c.governorate, c.area,
           (select count(*)::int from public.community_members m where m.community_id = c.id)
      from public.communities c
     where c.status = 'approved' and c.hidden_at is null
     order by c.governorate, c.name;
end;
$$;

-- A request cannot be resolved into a hidden community: show it again first.
create or replace function public.admin_resolve_community_request(p_id uuid, p_join uuid[], p_create jsonb default '[]'::jsonb)
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
    if v_target.hidden_at is not null then raise exception '“%” is hidden: show it again first', v_target.name; end if;
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

-- ---------------------------------------------------------------------------
-- Edit
-- ---------------------------------------------------------------------------
create function public.admin_update_community(p_id uuid, p_name text, p_kind text, p_governorate text, p_area text default null)
returns public.communities
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.communities;
  v_row public.communities;
begin
  perform public.require_staff(array['owner', 'moderator']);
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'the name needs 2 to 80 letters'; end if;
  if p_kind not in ('area', 'compound', 'club', 'sahel', 'school', 'work', 'other') then raise exception 'choose a type'; end if;
  if btrim(coalesce(p_governorate, '')) = '' then raise exception 'choose a governorate'; end if;
  select * into v_old from public.communities where id = p_id and status = 'approved' for update;
  if v_old.id is null then raise exception 'this community was not found'; end if;
  begin
    update public.communities
       set name = p_name, kind = p_kind, governorate = btrim(p_governorate), area = nullif(btrim(p_area), '')
     where id = p_id
     returning * into v_row;
  exception when unique_violation then
    raise exception 'a community with this name already exists in % (same type)', btrim(p_governorate);
  end;
  perform public.log_admin_action('community_edited', 'community', p_id::text, null,
    jsonb_build_object('from', jsonb_build_object('name', v_old.name, 'kind', v_old.kind, 'governorate', v_old.governorate, 'area', v_old.area),
                       'to',   jsonb_build_object('name', v_row.name, 'kind', v_row.kind, 'governorate', v_row.governorate, 'area', v_row.area)));
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hide / show
-- ---------------------------------------------------------------------------
create function public.admin_set_community_hidden(p_id uuid, p_hidden boolean, p_reason text default null)
returns public.communities
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.communities;
begin
  perform public.require_staff(array['owner', 'moderator']);
  update public.communities
     set hidden_at = case when p_hidden then coalesce(hidden_at, now()) else null end
   where id = p_id and status = 'approved'
   returning * into v_row;
  if v_row.id is null then raise exception 'this community was not found'; end if;
  perform public.log_admin_action(case when p_hidden then 'community_hidden' else 'community_shown' end,
                                  'community', p_id::text, nullif(btrim(p_reason), ''),
                                  jsonb_build_object('name', v_row.name));
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Merge p_source into p_target. Returns how many members and posts moved.
-- ---------------------------------------------------------------------------
create function public.admin_merge_communities(p_source uuid, p_target uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_src public.communities;
  v_tgt public.communities;
  v_members int;
  v_posts int;
begin
  perform public.require_staff(array['owner', 'moderator']);
  if p_source = p_target then raise exception 'choose two different communities'; end if;
  -- Lock in a fixed order so two merges at once cannot deadlock.
  perform 1 from public.communities where id in (p_source, p_target) order by id for update;
  select * into v_src from public.communities where id = p_source and status = 'approved';
  select * into v_tgt from public.communities where id = p_target and status = 'approved';
  if v_src.id is null or v_tgt.id is null then raise exception 'both communities must be approved communities'; end if;
  if v_tgt.hidden_at is not null then raise exception '“%” is hidden: show it again before merging into it', v_tgt.name; end if;

  insert into public.community_members (community_id, user_id)
    select p_target, user_id from public.community_members where community_id = p_source
    on conflict do nothing;
  select count(*)::int into v_members from public.community_members where community_id = p_source;
  delete from public.community_members where community_id = p_source;

  -- posts_sync_communities removes duplicates and keeps community_id as the first one.
  update public.posts set community_ids = array_replace(community_ids, p_source, p_target) where community_ids @> array[p_source];
  get diagnostics v_posts = row_count;
  update public.posts set community_id = p_target where community_id = p_source;

  update public.announcements
     set community_ids = array(select distinct unnest(array_replace(community_ids, p_source, p_target)))
   where community_ids @> array[p_source];

  -- Retire the old one: rejected frees its name, merged_into keeps the trail.
  update public.communities
     set status = 'rejected', merged_into = p_target, hidden_at = null, reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = 'Merged into “' || v_tgt.name || '”'
   where id = p_source;

  perform public.log_admin_action('community_merged', 'community', p_source::text, null,
    jsonb_build_object('name', v_src.name, 'into_id', p_target, 'into_name', v_tgt.name, 'members', v_members, 'posts', v_posts));
  return jsonb_build_object('members', v_members, 'posts', v_posts, 'into_name', v_tgt.name);
end;
$$;

revoke execute on function public.admin_communities(), public.admin_community_directory(),
  public.admin_resolve_community_request(uuid, uuid[], jsonb), public.community_ranking(text, uuid[]),
  public.admin_update_community(uuid, text, text, text, text), public.admin_set_community_hidden(uuid, boolean, text),
  public.admin_merge_communities(uuid, uuid) from public, anon;
grant execute on function public.admin_communities(), public.admin_community_directory(),
  public.admin_resolve_community_request(uuid, uuid[], jsonb), public.admin_update_community(uuid, text, text, text, text),
  public.admin_set_community_hidden(uuid, boolean, text), public.admin_merge_communities(uuid, uuid) to authenticated;
grant execute on function public.community_ranking(text, uuid[]) to anon, authenticated;
