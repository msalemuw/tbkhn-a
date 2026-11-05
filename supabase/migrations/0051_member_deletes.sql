-- Members can remove things they made, without losing anything staff need for investigations.
--
-- 1. Messages: "delete" is a soft delete. The member-facing row keeps its place in the chat but its text becomes
--    "Message deleted"; the original text is kept in deleted_messages, which only staff (service role) can read.
alter table public.messages add column deleted_at timestamptz;

create table public.deleted_messages (
  message_id uuid primary key references public.messages (id) on delete cascade,
  original_body text not null,
  deleted_at timestamptz not null default now()
);
alter table public.deleted_messages enable row level security;
revoke all on public.deleted_messages from anon, authenticated;

create function public.delete_my_message(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.deleted_messages (message_id, original_body)
    select m.id, m.body from public.messages m
     where m.id = p_id and m.sender_id = auth.uid() and m.kind = 'text' and m.deleted_at is null;
  if not found then
    return;
  end if;
  update public.messages set body = 'Message deleted', deleted_at = now() where id = p_id;
end;
$$;

revoke execute on function public.delete_my_message(uuid) from public, anon;
grant execute on function public.delete_my_message(uuid) to authenticated;

-- 2. Pickup spots: removing one only hides it from the member's list. Dishes that used it keep their pickup point.
alter table public.pickup_points add column archived_at timestamptz;
