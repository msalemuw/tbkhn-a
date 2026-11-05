-- Audit log: every change to member-made data is recorded (who, when, what it was before and after), so staff can rebuild
-- the sequence of events in an investigation, even after a member deletes something.
-- The log is append-only and unreadable to members; staff read it through admin_audit_trail().
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,             -- the signed-in member who made the change (null for system or staff-side changes)
  table_name text not null,
  row_id text,               -- the row's id when it has one
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb
);
create index audit_log_row_idx on public.audit_log (table_name, row_id, at);
create index audit_log_actor_idx on public.audit_log (actor_id, at);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
revoke all on sequence public.audit_log_id_seq from anon, authenticated;

create function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
begin
  -- A member's phone location refreshes constantly: not worth recording.
  if tg_table_name = 'profiles' and tg_op = 'UPDATE'
     and (v_old - 'last_lat' - 'last_lng') = (v_new - 'last_lat' - 'last_lng') then
    return null;
  end if;
  insert into public.audit_log (actor_id, table_name, row_id, action, old_data, new_data)
  values (auth.uid(), tg_table_name, coalesce(v_new, v_old) ->> 'id', tg_op, v_old, v_new);
  return null;
end;
$$;
revoke execute on function public.audit_row() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'posts', 'comments', 'messages', 'deleted_messages', 'pickup_points', 'reservations',
                           'reviews', 'likes', 'follows', 'blocks', 'community_members', 'communities', 'reports']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- Staff view: newest first, narrowed by table, row id or member.
create function public.admin_audit_trail(p_table text default null, p_row text default null, p_actor uuid default null, p_limit int default 200)
returns table (id bigint, at timestamptz, actor_id uuid, actor_username text, table_name text, row_id text, action text, old_data jsonb, new_data jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator']);
  return query
    select a.id, a.at, a.actor_id, p.username, a.table_name, a.row_id, a.action, a.old_data, a.new_data
      from public.audit_log a left join public.profiles p on p.id = a.actor_id
     where (p_table is null or a.table_name = p_table)
       and (p_row is null or a.row_id = p_row)
       and (p_actor is null or a.actor_id = p_actor)
     order by a.at desc, a.id desc
     limit least(greatest(p_limit, 1), 1000);
end;
$$;
revoke execute on function public.admin_audit_trail(text, text, uuid, int) from public, anon;
grant execute on function public.admin_audit_trail(text, text, uuid, int) to authenticated;
