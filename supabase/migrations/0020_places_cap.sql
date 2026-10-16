-- Daily cap on the paid place search (Google Places), so a bug or a stranger cannot run up the bill.
-- The `places` Edge Function calls places_allow() before each Google request; over the cap it answers 429 and the
-- app falls back to the phone's own lookup. The caps themselves live in the function, so they can change without SQL.

create table if not exists public.places_usage (
  day date not null default (now() at time zone 'utc')::date,
  uid uuid not null,
  kind text not null,
  hits int not null default 0,
  primary key (day, uid, kind)
);

alter table public.places_usage enable row level security; -- no policies: only the service role reads or writes it

create or replace function public.places_allow(p_uid uuid, p_kind text, p_user_cap int, p_total_cap int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'utc')::date;
  mine int;
  everyone int;
begin
  insert into public.places_usage (day, uid, kind, hits) values (today, p_uid, p_kind, 1)
  on conflict (day, uid, kind) do update set hits = public.places_usage.hits + 1
  returning hits into mine;

  select coalesce(sum(hits), 0) into everyone from public.places_usage where day = today and kind = p_kind;

  return mine <= p_user_cap and everyone <= p_total_cap;
end;
$$;

revoke execute on function public.places_allow(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.places_allow(uuid, text, int, int) to service_role;
