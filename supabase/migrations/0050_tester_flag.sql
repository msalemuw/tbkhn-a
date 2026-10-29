-- tabkheen A: mark accounts that belong to testers, family and the team, so reports on real members (ads, sign-ups) can leave them out.
-- Run after 0049. The column is private: members cannot read or change it (profiles has column-level grants only).

alter table public.profiles add column if not exists is_tester boolean not null default false;

-- Staff mark or unmark any number of accounts at once; the owner and moderators can do it, every change is written to the action log.
create or replace function public.admin_set_testers(p_ids uuid[], p_value boolean)
returns int
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  perform public.require_staff(array['owner', 'moderator']);
  update public.profiles set is_tester = coalesce(p_value, false) where id = any (p_ids) and is_tester is distinct from coalesce(p_value, false);
  get diagnostics v_count = row_count;
  perform public.log_admin_action(case when coalesce(p_value, false) then 'testers_marked' else 'testers_unmarked' end, 'members',
    'bulk', null, jsonb_build_object('count', v_count, 'ids', to_jsonb(p_ids)));
  return v_count;
end;
$$;

-- The accounts marked as testers, for the Members tab.
create or replace function public.admin_tester_ids()
returns table (id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query select p.id from public.profiles p where p.is_tester;
end;
$$;

revoke execute on function public.admin_set_testers(uuid[], boolean), public.admin_tester_ids() from public, anon;
grant execute on function public.admin_set_testers(uuid[], boolean), public.admin_tester_ids() to authenticated;

-- For reports: real members only. Count sign-ups, sources and funnel events from these, not from public.profiles.
-- Funnel events: where user_ref not in (select id from public.profiles where is_tester).
create or replace view public.real_members with (security_invoker = true) as
  select * from public.profiles where not is_tester;
revoke all on public.real_members from public, anon, authenticated;
