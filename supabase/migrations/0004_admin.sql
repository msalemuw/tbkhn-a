-- Admin panel, first build: staff and roles, a log of every admin action, community approvals,
-- the reports queue with post takedown and member suspension, user lookup and announcements.
-- Run after 0003_chat.sql. Staff use the same app; the Admin screens only open for rows in admin_staff.
-- Every admin change goes through the functions below, which check the caller's role and write the log.

-- ---------------------------------------------------------------------------
-- Staff and roles. owner: everything, including adding staff. moderator: communities, reports,
-- takedowns, suspensions, announcements. support: look up members and read the queues.
-- The first owner is added once in the SQL Editor (see README).
-- ---------------------------------------------------------------------------
create table public.admin_staff (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'moderator', 'support')),
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.admin_actions (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text check (char_length(reason) <= 500),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_actions_created_idx on public.admin_actions (created_at desc);

-- No direct access for app users: both tables are read and written only through the functions below.
alter table public.admin_staff enable row level security;
alter table public.admin_actions enable row level security;

-- The caller's staff role, or null.
create function public.staff_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.admin_staff where user_id = auth.uid();
$$;

-- Raises unless the caller holds one of the roles.
create function public.require_staff(p_roles text[]) returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(public.staff_role(), '') <> all (p_roles) then
    raise exception 'not allowed';
  end if;
  return auth.uid();
end;
$$;

create function public.log_admin_action(p_action text, p_type text, p_id text, p_reason text, p_details jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = '' as $$
  insert into public.admin_actions (actor_id, action, target_type, target_id, reason, details)
    values (auth.uid(), p_action, p_type, p_id, nullif(trim(p_reason), ''), p_details);
$$;

-- ---------------------------------------------------------------------------
-- Columns the admin tools need on existing tables.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column suspended_at timestamptz,
  add column suspended_reason text check (char_length(suspended_reason) <= 500);

alter table public.communities
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_note text check (char_length(review_note) <= 500);

alter table public.posts
  add column removed_at timestamptz,
  add column removed_reason text check (char_length(removed_reason) <= 500);

alter table public.reports
  add column status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  add column handled_by uuid references public.profiles (id) on delete set null,
  add column handled_at timestamptz,
  add column resolution text check (char_length(resolution) <= 500);

create index reports_open_idx on public.reports (created_at) where status = 'open';

alter table public.announcements add column created_by uuid references public.profiles (id) on delete set null;

-- A removed post leaves every feed (its expiry is set to the removal time, which the existing read
-- policies already hide) and the author cannot bring it back by editing it.
create function public.posts_guard_removal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.staff_role() in ('owner', 'moderator') then return new; end if;
  if old.removed_at is not null then
    new.removed_at := old.removed_at;
    new.removed_reason := old.removed_reason;
    new.expires_at := old.expires_at;
  else
    new.removed_at := null;
    new.removed_reason := null;
  end if;
  return new;
end;
$$;

create trigger posts_guard_removal before update on public.posts
  for each row execute function public.posts_guard_removal();

-- Suspended members can still sign in and read, but cannot post, comment, like, order, message,
-- join or request communities. tg_argv[0] names the column holding the acting member.
create function public.block_suspended() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles
              where id = (to_jsonb(new) ->> tg_argv[0])::uuid and suspended_at is not null) then
    raise exception 'your account is suspended';
  end if;
  return new;
end;
$$;

create trigger posts_block_suspended before insert on public.posts
  for each row execute function public.block_suspended('author_id');
create trigger comments_block_suspended before insert on public.comments
  for each row execute function public.block_suspended('author_id');
create trigger likes_block_suspended before insert on public.likes
  for each row execute function public.block_suspended('user_id');
create trigger reservations_block_suspended before insert on public.reservations
  for each row execute function public.block_suspended('buyer_id');
create trigger community_members_block_suspended before insert on public.community_members
  for each row execute function public.block_suspended('user_id');
create trigger communities_block_suspended before insert on public.communities
  for each row execute function public.block_suspended('requested_by');
-- Payment lines in chat are written by a trigger on the sender's behalf; only typed messages are blocked.
create function public.block_suspended_messages() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'text' and exists (select 1 from public.profiles where id = new.sender_id and suspended_at is not null) then
    raise exception 'your account is suspended';
  end if;
  return new;
end;
$$;
create trigger messages_block_suspended before insert on public.messages
  for each row execute function public.block_suspended_messages();

-- ---------------------------------------------------------------------------
-- Overview counts for the Admin home screen.
-- ---------------------------------------------------------------------------
create function public.admin_overview()
returns table (pending_communities int, open_reports int, suspended_members int, members int, signups_7d int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query select
    (select count(*)::int from public.communities where status = 'pending'),
    (select count(*)::int from public.reports where status = 'open'),
    (select count(*)::int from public.profiles where suspended_at is not null),
    (select count(*)::int from public.profiles),
    (select count(*)::int from public.profiles where created_at > now() - interval '7 days');
end;
$$;

-- ---------------------------------------------------------------------------
-- Communities: the request queue and the decision. The app promises a review in 1 to 2 days.
-- ---------------------------------------------------------------------------
create function public.admin_community_requests()
returns table (id uuid, name text, kind text, governorate text, area text, created_at timestamptz,
               requested_by uuid, requester_username text, requester_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select c.id, c.name, c.kind, c.governorate, c.area, c.created_at, c.requested_by, p.username, p.display_name
      from public.communities c left join public.profiles p on p.id = c.requested_by
     where c.status = 'pending'
     order by c.created_at;
end;
$$;

create function public.admin_review_community(p_id uuid, p_status text, p_note text default null)
returns public.communities
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.communities;
begin
  perform public.require_staff(array['owner', 'moderator']);
  if p_status not in ('approved', 'rejected') then raise exception 'choose approve or reject'; end if;
  if p_status = 'rejected' and coalesce(trim(p_note), '') = '' then raise exception 'say why it was rejected'; end if;

  update public.communities
     set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), '')
   where id = p_id and status = 'pending'
   returning * into v_row;
  if v_row.id is null then raise exception 'this request was already reviewed'; end if;

  if v_row.requested_by is not null then
    insert into public.notifications (user_id, kind, payload)
      values (v_row.requested_by, 'community_' || p_status,
              jsonb_build_object('community_id', v_row.id, 'name', v_row.name, 'note', v_row.review_note));
  end if;
  perform public.log_admin_action('community_' || p_status, 'community', v_row.id::text, p_note,
                                  jsonb_build_object('name', v_row.name));
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports queue: one row per reported post or member, with how many open reports it has.
-- ---------------------------------------------------------------------------
create function public.admin_open_reports()
returns table (report_ids uuid[], post_id uuid, profile_id uuid, reports int, reasons text[], first_at timestamptz,
               post_kind text, post_dish text, post_caption text, post_removed boolean,
               owner_id uuid, owner_username text, owner_name text, owner_suspended boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select array_agg(r.id order by r.created_at), r.post_id, r.profile_id, count(*)::int,
           array_remove(array_agg(r.reason order by r.created_at), null), min(r.created_at),
           max(po.kind), max(po.dish_name), max(po.caption), bool_or(po.removed_at is not null),
           max(o.id::text)::uuid, max(o.username), max(o.display_name), bool_or(o.suspended_at is not null)
      from public.reports r
      left join public.posts po on po.id = r.post_id
      left join public.profiles o on o.id = coalesce(po.author_id, r.profile_id)
     where r.status = 'open'
     group by r.post_id, r.profile_id
     order by count(*) desc, min(r.created_at);
end;
$$;

-- Closes the open reports on a post or member. Used by the actions below and by "Dismiss".
create function public.close_reports(p_post_id uuid, p_profile_id uuid, p_status text, p_note text)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  update public.reports
     set status = p_status, handled_by = auth.uid(), handled_at = now(), resolution = nullif(trim(p_note), '')
   where status = 'open'
     and ((p_post_id is not null and post_id = p_post_id) or (p_profile_id is not null and profile_id = p_profile_id));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.admin_dismiss_reports(p_post_id uuid, p_profile_id uuid, p_note text default null)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  perform public.require_staff(array['owner', 'moderator']);
  v_count := public.close_reports(p_post_id, p_profile_id, 'dismissed', p_note);
  perform public.log_admin_action('reports_dismissed', case when p_post_id is not null then 'post' else 'profile' end,
                                  coalesce(p_post_id, p_profile_id)::text, p_note, jsonb_build_object('reports', v_count));
  return v_count;
end;
$$;

create function public.admin_remove_post(p_post_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_post public.posts;
begin
  perform public.require_staff(array['owner', 'moderator']);
  if coalesce(trim(p_reason), '') = '' then raise exception 'say why the post is removed'; end if;
  update public.posts
     set removed_at = now(), removed_reason = trim(p_reason), expires_at = least(coalesce(expires_at, now()), now())
   where id = p_post_id and removed_at is null
   returning * into v_post;
  if v_post.id is null then raise exception 'post not found or already removed'; end if;

  perform public.close_reports(p_post_id, null, 'actioned', p_reason);
  insert into public.notifications (user_id, kind, payload)
    values (v_post.author_id, 'post_removed', jsonb_build_object('post_id', v_post.id, 'reason', trim(p_reason)));
  perform public.log_admin_action('post_removed', 'post', p_post_id::text, p_reason,
                                  jsonb_build_object('author_id', v_post.author_id, 'kind', v_post.kind, 'dish', v_post.dish_name));
end;
$$;

-- ---------------------------------------------------------------------------
-- Members: lookup by username, name, phone or email, and suspension.
-- ---------------------------------------------------------------------------
create function public.admin_find_members(p_query text)
returns table (id uuid, username text, display_name text, phone text, email text, area text, governorate text,
               created_at timestamptz, suspended_at timestamptz, suspended_reason text, staff_role text,
               posts int, orders int, open_reports int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := lower(trim(p_query));
  v_digits text := regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g');
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  if char_length(v_q) < 2 then return; end if;
  return query
    select p.id, p.username, p.display_name, u.phone::text, u.email::text, p.area, p.governorate,
           p.created_at, p.suspended_at, p.suspended_reason, s.role,
           (select count(*)::int from public.posts x where x.author_id = p.id),
           (select count(*)::int from public.reservations x where p.id in (x.buyer_id, x.cook_id)),
           (select count(*)::int from public.reports x
             where x.status = 'open'
               and (x.profile_id = p.id or x.post_id in (select y.id from public.posts y where y.author_id = p.id)))
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.admin_staff s on s.user_id = p.id
     where p.username like '%' || v_q || '%'
        or lower(p.display_name) like '%' || v_q || '%'
        or lower(u.email::text) like '%' || v_q || '%'
        or (char_length(v_digits) >= 6 and u.phone::text like '%' || right(v_digits, 10) || '%')
     order by p.created_at desc
     limit 30;
end;
$$;

create function public.admin_set_suspended(p_user_id uuid, p_suspended boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator']);
  if p_user_id = auth.uid() then raise exception 'you cannot suspend yourself'; end if;
  if p_suspended and exists (select 1 from public.admin_staff where user_id = p_user_id) then
    raise exception 'remove their staff role first';
  end if;
  if p_suspended and coalesce(trim(p_reason), '') = '' then raise exception 'say why the account is suspended'; end if;

  update public.profiles
     set suspended_at = case when p_suspended then coalesce(suspended_at, now()) end,
         suspended_reason = case when p_suspended then trim(p_reason) end
   where id = p_user_id;
  if not found then raise exception 'member not found'; end if;

  if p_suspended then perform public.close_reports(null, p_user_id, 'actioned', p_reason); end if;
  perform public.log_admin_action(case when p_suspended then 'member_suspended' else 'member_unsuspended' end,
                                  'profile', p_user_id::text, p_reason);
end;
$$;

-- Owner only: give or take away a staff role (p_role null removes it).
create function public.admin_set_staff_role(p_user_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner']);
  if p_user_id = auth.uid() then raise exception 'you cannot change your own role'; end if;
  if p_role is null then
    delete from public.admin_staff where user_id = p_user_id;
  else
    if p_role not in ('owner', 'moderator', 'support') then raise exception 'unknown role'; end if;
    if exists (select 1 from public.profiles where id = p_user_id and suspended_at is not null) then
      raise exception 'this account is suspended';
    end if;
    insert into public.admin_staff (user_id, role, added_by) values (p_user_id, p_role, auth.uid())
      on conflict (user_id) do update set role = excluded.role, added_by = excluded.added_by;
  end if;
  perform public.log_admin_action('staff_role_set', 'profile', p_user_id::text, null, jsonb_build_object('role', p_role));
end;
$$;

-- ---------------------------------------------------------------------------
-- Announcements to everyone or to chosen communities (shown in Inbox > Notifications).
-- ---------------------------------------------------------------------------
create function public.admin_post_announcement(p_title text, p_body text, p_community_ids uuid[] default null)
returns public.announcements
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.announcements;
begin
  perform public.require_staff(array['owner', 'moderator']);
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 80 then raise exception 'title must be 1 to 80 characters'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 1000 then raise exception 'message must be 1 to 1000 characters'; end if;
  insert into public.announcements (title, body, community_ids, created_by)
    values (trim(p_title), trim(p_body), nullif(p_community_ids, '{}'), auth.uid())
    returning * into v_row;
  perform public.log_admin_action('announcement_posted', 'announcement', v_row.id::text, null,
                                  jsonb_build_object('title', v_row.title, 'communities', v_row.community_ids));
  return v_row;
end;
$$;

-- Approved communities with member counts, for choosing announcement audiences.
create function public.admin_communities()
returns table (id uuid, name text, kind text, governorate text, area text, members int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select c.id, c.name, c.kind, c.governorate, c.area,
           (select count(*)::int from public.community_members m where m.community_id = c.id)
      from public.communities c
     where c.status = 'approved'
     order by c.governorate, c.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- The action log, newest first.
-- ---------------------------------------------------------------------------
create function public.admin_recent_actions(p_limit int default 100)
returns table (id bigint, created_at timestamptz, actor_username text, action text, target_type text, target_id text,
               reason text, details jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select a.id, a.created_at, p.username, a.action, a.target_type, a.target_id, a.reason, a.details
      from public.admin_actions a left join public.profiles p on p.id = a.actor_id
     order by a.created_at desc
     limit least(greatest(p_limit, 1), 500);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: app users reach admin data only through these functions, which check the role.
-- ---------------------------------------------------------------------------
revoke all on public.admin_staff, public.admin_actions from anon, authenticated;
revoke all on sequence public.admin_actions_id_seq from anon, authenticated;

revoke execute on function public.require_staff(text[]), public.log_admin_action(text, text, text, text, jsonb),
  public.close_reports(uuid, uuid, text, text), public.posts_guard_removal(), public.block_suspended(),
  public.block_suspended_messages()
  from public, anon, authenticated;

revoke execute on function public.staff_role(), public.admin_overview(), public.admin_community_requests(),
  public.admin_review_community(uuid, text, text), public.admin_open_reports(),
  public.admin_dismiss_reports(uuid, uuid, text), public.admin_remove_post(uuid, text),
  public.admin_find_members(text), public.admin_set_suspended(uuid, boolean, text),
  public.admin_set_staff_role(uuid, text), public.admin_post_announcement(text, text, uuid[]),
  public.admin_communities(), public.admin_recent_actions(int)
  from public, anon;
grant execute on function public.staff_role(), public.admin_overview(), public.admin_community_requests(),
  public.admin_review_community(uuid, text, text), public.admin_open_reports(),
  public.admin_dismiss_reports(uuid, uuid, text), public.admin_remove_post(uuid, text),
  public.admin_find_members(text), public.admin_set_suspended(uuid, boolean, text),
  public.admin_set_staff_role(uuid, text), public.admin_post_announcement(text, text, uuid[]),
  public.admin_communities(), public.admin_recent_actions(int)
  to authenticated;
