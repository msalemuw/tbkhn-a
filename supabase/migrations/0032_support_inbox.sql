-- tabkheen A: support inbox (founder, 2026-10-18).
-- Members (signed in or not) send a message to support from the app; staff answer from the web admin. A ticket is a thread
-- of messages with a status: open (waiting for staff), pending (waiting for the member), closed. Staff can also keep
-- private internal notes on a ticket. A signed-in member is told about each reply by a notification and can read the thread
-- in the app; someone who was not signed in leaves an email or phone and is answered there.
-- All reads and writes go through the functions below; the tables have no direct access.

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  contact text check (char_length(contact) <= 200),            -- email or phone typed by someone who was not signed in
  subject text not null check (char_length(subject) between 1 and 100),
  status text not null default 'open' check (status in ('open', 'pending', 'closed')),
  source text not null default 'app' check (source in ('app', 'web')),
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or contact is not null)
);
create index support_tickets_status_idx on public.support_tickets (status, updated_at desc);
create index support_tickets_user_idx on public.support_tickets (user_id, updated_at desc);

create table public.support_messages (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  sender text not null check (sender in ('member', 'staff', 'note')),   -- note = internal, never shown to the member
  staff_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at, id);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_tickets, public.support_messages from public, anon, authenticated;
revoke all on sequence public.support_messages_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Member side
-- ---------------------------------------------------------------------------
-- Send a message: p_ticket null starts a new one (p_subject, p_contact for someone not signed in), otherwise it adds to
-- the member's own ticket and reopens it. Limits: 5 new tickets an hour per member, 30 an hour for visitors who are not signed in.
create function public.support_submit(p_subject text, p_body text, p_contact text default null, p_ticket uuid default null, p_source text default 'app')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_contact text := nullif(btrim(coalesce(p_contact, '')), '');
  v_id uuid;
begin
  if char_length(v_body) not between 1 and 2000 then raise exception 'write your message (up to 2000 letters)'; end if;
  if p_source not in ('app', 'web') then raise exception 'unknown source'; end if;

  if p_ticket is not null then
    if v_me is null then raise exception 'sign in to reply'; end if;
    select id into v_id from public.support_tickets where id = p_ticket and user_id = v_me for update;
    if v_id is null then raise exception 'conversation not found'; end if;
    if (select count(*) from public.support_messages where ticket_id = v_id and sender = 'member' and created_at > now() - interval '1 hour') >= 10 then
      raise exception 'please wait a little before sending more';
    end if;
    insert into public.support_messages (ticket_id, sender, body) values (v_id, 'member', v_body);
    update public.support_tickets set status = 'open', updated_at = now() where id = v_id;
    return v_id;
  end if;

  if char_length(btrim(coalesce(p_subject, ''))) not between 1 and 100 then raise exception 'add a short subject (up to 100 letters)'; end if;
  if v_me is null then
    if v_contact is null or char_length(v_contact) < 5 then raise exception 'leave an email or phone number so we can answer'; end if;
    if (select count(*) from public.support_tickets where user_id is null and created_at > now() - interval '1 hour') >= 30 then
      raise exception 'support is busy: please try again in a little while';
    end if;
  elsif (select count(*) from public.support_tickets where user_id = v_me and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'please wait a little before opening another conversation';
  end if;

  insert into public.support_tickets (user_id, contact, subject, source)
    values (v_me, case when v_me is null then v_contact end, btrim(p_subject), p_source) returning id into v_id;
  insert into public.support_messages (ticket_id, sender, body) values (v_id, 'member', v_body);
  return v_id;
end;
$$;

-- My conversations, newest activity first, with the last message that is not an internal note.
create function public.support_my_tickets()
returns table (id uuid, subject text, status text, updated_at timestamptz, last_body text, last_sender text)
language sql stable security definer set search_path = '' as $$
  select t.id, t.subject, t.status, t.updated_at, m.body, m.sender
    from public.support_tickets t
    left join lateral (select x.body, x.sender from public.support_messages x where x.ticket_id = t.id and x.sender <> 'note' order by x.created_at desc, x.id desc limit 1) m on true
   where t.user_id = auth.uid()
   order by t.updated_at desc
   limit 50;
$$;

-- One of my conversations, oldest first, without internal notes.
create function public.support_ticket_thread(p_id uuid)
returns table (sender text, body text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.sender, m.body, m.created_at
    from public.support_messages m join public.support_tickets t on t.id = m.ticket_id
   where t.id = p_id and t.user_id = auth.uid() and m.sender <> 'note'
   order by m.created_at, m.id;
$$;

-- ---------------------------------------------------------------------------
-- Staff side (all staff roles can read, reply, note and close)
-- ---------------------------------------------------------------------------
create function public.admin_support_open_count() returns int
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return (select count(*)::int from public.support_tickets where status = 'open');
end;
$$;

-- p_status: 'open', 'pending', 'closed' or null for all. Newest activity first.
create function public.admin_support_tickets(p_status text default 'open')
returns table (id uuid, subject text, status text, source text, created_at timestamptz, updated_at timestamptz,
               member_id uuid, member_username text, member_name text, member_email text, contact text,
               messages int, last_body text, last_sender text, assigned_username text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  if p_status is not null and p_status not in ('open', 'pending', 'closed') then raise exception 'unknown status'; end if;
  return query
    select t.id, t.subject, t.status, t.source, t.created_at, t.updated_at,
           t.user_id, p.username, p.display_name, u.email::text, t.contact,
           (select count(*)::int from public.support_messages x where x.ticket_id = t.id and x.sender <> 'note'),
           m.body, m.sender, a.username
      from public.support_tickets t
      left join public.profiles p on p.id = t.user_id
      left join auth.users u on u.id = t.user_id
      left join public.profiles a on a.id = t.assigned_to
      left join lateral (select x.body, x.sender from public.support_messages x where x.ticket_id = t.id and x.sender <> 'note' order by x.created_at desc, x.id desc limit 1) m on true
     where p_status is null or t.status = p_status
     order by t.updated_at desc
     limit 100;
end;
$$;

-- Every message of a ticket including internal notes, oldest first.
create function public.admin_support_thread(p_id uuid)
returns table (sender text, body text, staff_username text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select m.sender, m.body, s.username, m.created_at
      from public.support_messages m left join public.profiles s on s.id = m.staff_id
     where m.ticket_id = p_id
     order by m.created_at, m.id;
end;
$$;

-- Answer the member. The ticket becomes 'pending' (or 'closed' with p_close). A signed-in member gets a notification.
create function public.admin_support_reply(p_id uuid, p_body text, p_close boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_t public.support_tickets;
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  if char_length(v_body) not between 1 and 2000 then raise exception 'write a reply (up to 2000 letters)'; end if;
  select * into v_t from public.support_tickets where id = p_id for update;
  if v_t.id is null then raise exception 'conversation not found'; end if;
  insert into public.support_messages (ticket_id, sender, staff_id, body) values (p_id, 'staff', auth.uid(), v_body);
  update public.support_tickets
     set status = case when p_close then 'closed' else 'pending' end, updated_at = now(), assigned_to = coalesce(assigned_to, auth.uid())
   where id = p_id;
  if v_t.user_id is not null then
    insert into public.notifications (user_id, kind, payload)
      values (v_t.user_id, 'support_reply', jsonb_build_object('ticket_id', p_id, 'subject', v_t.subject, 'preview', left(v_body, 140)));
  end if;
  perform public.log_admin_action('support_replied', 'ticket', p_id::text, null, jsonb_build_object('closed', p_close));
end;
$$;

create function public.admin_support_note(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  if char_length(v_body) not between 1 and 2000 then raise exception 'write a note (up to 2000 letters)'; end if;
  if not exists (select 1 from public.support_tickets where id = p_id) then raise exception 'conversation not found'; end if;
  insert into public.support_messages (ticket_id, sender, staff_id, body) values (p_id, 'note', auth.uid(), v_body);
  perform public.log_admin_action('support_note_added', 'ticket', p_id::text, null);
end;
$$;

create function public.admin_support_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  if p_status not in ('open', 'pending', 'closed') then raise exception 'unknown status'; end if;
  update public.support_tickets set status = p_status, updated_at = now() where id = p_id;
  if not found then raise exception 'conversation not found'; end if;
  perform public.log_admin_action('support_status_set', 'ticket', p_id::text, null, jsonb_build_object('status', p_status));
end;
$$;

revoke execute on function public.support_submit(text, text, text, uuid, text), public.support_my_tickets(), public.support_ticket_thread(uuid),
  public.admin_support_open_count(), public.admin_support_tickets(text), public.admin_support_thread(uuid),
  public.admin_support_reply(uuid, text, boolean), public.admin_support_note(uuid, text), public.admin_support_set_status(uuid, text)
  from public, anon;
grant execute on function public.support_submit(text, text, text, uuid, text) to anon, authenticated;
grant execute on function public.support_my_tickets(), public.support_ticket_thread(uuid),
  public.admin_support_open_count(), public.admin_support_tickets(text), public.admin_support_thread(uuid),
  public.admin_support_reply(uuid, text, boolean), public.admin_support_note(uuid, text), public.admin_support_set_status(uuid, text)
  to authenticated;
