-- Phone alerts (push notifications): one row per phone that signed in, so the send-push function knows where to deliver.
-- The app registers its token through register_push_token(); nobody can read tokens directly.
-- notifications.pushed_at lets the function claim each notification once, so a repeated webhook never sends twice.

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users on delete cascade,
  platform text not null default 'ios',
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
-- No policies: only the security-definer functions below and the service role touch this table.

create function public.register_push_token(p_token text, p_platform text default 'ios') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.push_tokens (token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, updated_at = now();
end;
$$;

create function public.unregister_push_token(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
end;
$$;

revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

alter table public.notifications add column pushed_at timestamptz;
