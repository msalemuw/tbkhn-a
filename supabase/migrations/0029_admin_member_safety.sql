-- tabkheen A: member safety tools for staff (founder, 2026-10-18).
-- 1. Staff notes: private notes on a member, visible to staff only (any staff role can add and read).
-- 2. Warnings: owner or moderator sends a written warning; it is kept on the member's record and shown to them as a notification.
-- 3. Ban: a suspension that also blocks sign-in (auth.users.banned_until). Lifting it restores everything. Owner or moderator.
-- 4. Delete a member's account: owner only, with a reason; the same removal as "delete my account" in the app.
-- Staff, and yourself, can never be banned or deleted from here. Every action is written to the activity log.

alter table public.profiles add column banned_at timestamptz; -- no grant: staff functions only

create table public.member_notes (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index member_notes_member_idx on public.member_notes (member_id, created_at desc);
alter table public.member_notes enable row level security; -- no policies: read and written only through the functions below

create table public.member_warnings (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.profiles (id) on delete cascade,
  issued_by uuid references public.profiles (id) on delete set null,
  message text not null check (char_length(message) between 3 and 500),
  created_at timestamptz not null default now()
);
create index member_warnings_member_idx on public.member_warnings (member_id, created_at desc);
alter table public.member_warnings enable row level security;

revoke all on public.member_notes, public.member_warnings from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Members search also returns banned state and counts of warnings and notes.
-- ---------------------------------------------------------------------------
drop function public.admin_find_members(text);
create function public.admin_find_members(p_query text)
returns table (id uuid, username text, display_name text, phone text, email text, area text, governorate text,
               created_at timestamptz, suspended_at timestamptz, suspended_reason text, staff_role text,
               posts int, orders int, open_reports int, verified_at timestamptz,
               banned_at timestamptz, warnings int, notes int)
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
               and (x.profile_id = p.id or x.post_id in (select y.id from public.posts y where y.author_id = p.id))),
           p.verified_at, p.banned_at,
           (select count(*)::int from public.member_warnings w where w.member_id = p.id),
           (select count(*)::int from public.member_notes n where n.member_id = p.id)
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

-- ---------------------------------------------------------------------------
-- Notes and warnings
-- ---------------------------------------------------------------------------
-- { notes: [{id, body, author, created_at}], warnings: [{id, message, issued_by, created_at}] }, newest first.
create function public.admin_member_history(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return jsonb_build_object(
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'author', a.username, 'created_at', n.created_at) order by n.created_at desc, n.id desc)
                         from public.member_notes n left join public.profiles a on a.id = n.author_id where n.member_id = p_id), '[]'::jsonb),
    'warnings', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'message', w.message, 'issued_by', a.username, 'created_at', w.created_at) order by w.created_at desc, w.id desc)
                            from public.member_warnings w left join public.profiles a on a.id = w.issued_by where w.member_id = p_id), '[]'::jsonb));
end;
$$;

create function public.admin_add_member_note(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then raise exception 'write a note of up to 1000 letters'; end if;
  if not exists (select 1 from public.profiles where id = p_id) then raise exception 'member not found'; end if;
  insert into public.member_notes (member_id, author_id, body) values (p_id, auth.uid(), btrim(p_body));
  perform public.log_admin_action('member_note_added', 'profile', p_id::text, null);
end;
$$;

create function public.admin_warn_member(p_id uuid, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_msg text := btrim(coalesce(p_message, ''));
begin
  perform public.require_staff(array['owner', 'moderator']);
  if p_id = auth.uid() then raise exception 'you cannot warn yourself'; end if;
  if char_length(v_msg) not between 3 and 500 then raise exception 'write a warning of 3 to 500 letters'; end if;
  if not exists (select 1 from public.profiles where id = p_id) then raise exception 'member not found'; end if;
  insert into public.member_warnings (member_id, issued_by, message) values (p_id, auth.uid(), v_msg);
  insert into public.notifications (user_id, kind, payload) values (p_id, 'staff_warning', jsonb_build_object('message', v_msg));
  perform public.log_admin_action('member_warned', 'profile', p_id::text, v_msg);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ban / lift ban. A ban is a suspension plus no sign-in; a banned member's suspension can only be lifted by lifting the ban.
-- ---------------------------------------------------------------------------
create function public.admin_set_banned(p_id uuid, p_banned boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator']);
  if p_id = auth.uid() then raise exception 'you cannot ban yourself'; end if;
  if p_banned and exists (select 1 from public.admin_staff where user_id = p_id) then raise exception 'remove their staff role first'; end if;
  if p_banned and char_length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'say why the account is banned'; end if;
  if not exists (select 1 from public.profiles where id = p_id) then raise exception 'member not found'; end if;

  if p_banned then
    update public.profiles
       set banned_at = coalesce(banned_at, now()), suspended_at = coalesce(suspended_at, now()), suspended_reason = btrim(p_reason)
     where id = p_id;
    update auth.users set banned_until = 'infinity' where id = p_id;
    delete from public.push_tokens where user_id = p_id;
    perform public.close_reports(null, p_id, 'actioned', p_reason);
  else
    update public.profiles set banned_at = null, suspended_at = null, suspended_reason = null where id = p_id;
    update auth.users set banned_until = null where id = p_id;
  end if;
  perform public.log_admin_action(case when p_banned then 'member_banned' else 'member_unbanned' end, 'profile', p_id::text, p_reason);
end;
$$;

-- Lifting a suspension on a banned member is refused: lift the ban instead.
create or replace function public.admin_set_suspended(p_user_id uuid, p_suspended boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator']);
  if p_user_id = auth.uid() then raise exception 'you cannot suspend yourself'; end if;
  if p_suspended and exists (select 1 from public.admin_staff where user_id = p_user_id) then
    raise exception 'remove their staff role first';
  end if;
  if p_suspended and coalesce(trim(p_reason), '') = '' then raise exception 'say why the account is suspended'; end if;
  if not p_suspended and exists (select 1 from public.profiles where id = p_user_id and banned_at is not null) then
    raise exception 'this member is banned: lift the ban instead';
  end if;

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

-- ---------------------------------------------------------------------------
-- Delete a member's account for good (owner only). Same removal as "delete my account" in the app:
-- sign-in, profile, posts, comments, likes, follows, messages, notifications, memberships and orders go.
-- Refused while the member still has an open order (ban them instead). Their photos stay in storage.
-- ---------------------------------------------------------------------------
create function public.admin_delete_member(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_who jsonb;
begin
  perform public.require_staff(array['owner']);
  if p_id = auth.uid() then raise exception 'you cannot delete yourself here'; end if;
  if exists (select 1 from public.admin_staff where user_id = p_id) then raise exception 'remove their staff role first'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'say why the account is deleted'; end if;
  select jsonb_build_object('username', p.username, 'display_name', p.display_name, 'email', u.email::text)
    into v_who from public.profiles p join auth.users u on u.id = p.id where p.id = p_id;
  if v_who is null then raise exception 'member not found'; end if;
  if exists (select 1 from public.reservations r where (r.buyer_id = p_id or r.cook_id = p_id) and r.status in ('pending', 'accepted', 'ready')) then
    raise exception 'this member has an open order: ban them instead, or wait until it is finished';
  end if;

  perform public.log_admin_action('member_deleted', 'profile', p_id::text, p_reason, v_who);
  delete from public.reservations where buyer_id = p_id or cook_id = p_id;
  update public.signup_events set user_ref = null where user_ref = p_id;
  delete from auth.users where id = p_id;
end;
$$;

revoke execute on function public.admin_find_members(text), public.admin_member_history(uuid), public.admin_add_member_note(uuid, text),
  public.admin_warn_member(uuid, text), public.admin_set_banned(uuid, boolean, text),
  public.admin_set_suspended(uuid, boolean, text), public.admin_delete_member(uuid, text) from public, anon;
grant execute on function public.admin_find_members(text), public.admin_member_history(uuid), public.admin_add_member_note(uuid, text),
  public.admin_warn_member(uuid, text), public.admin_set_banned(uuid, boolean, text),
  public.admin_set_suspended(uuid, boolean, text), public.admin_delete_member(uuid, text) to authenticated;
