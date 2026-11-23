-- tabkheen A: member count per approved community, so Search can suggest the biggest communities first (founder, 2026-11-23).
create or replace function public.community_sizes()
returns table (community_id uuid, members bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, count(m.user_id)
  from public.communities c
  left join public.community_members m on m.community_id = c.id
  where c.status = 'approved'
  group by c.id;
$$;

revoke execute on function public.community_sizes() from public, anon;
grant execute on function public.community_sizes() to authenticated;
