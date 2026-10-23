-- Members can change their username, but only once every 30 days. The first time it is set (sign-up) does not count.
alter table public.profiles add column if not exists username_changed_at timestamptz;

create function public.limit_username_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.username is distinct from old.username and old.username is not null and auth.uid() is not null then
    if old.username_changed_at is not null and old.username_changed_at > now() - interval '30 days' then
      raise exception 'username_change_too_soon' using errcode = 'P0001';
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_limit_username_change
  before update on public.profiles
  for each row execute function public.limit_username_change();
