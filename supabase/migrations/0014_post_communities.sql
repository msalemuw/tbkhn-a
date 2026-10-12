-- A today's-menu post can serve several communities at once (founder, 2026-10-12): community_ids holds all of
-- them; community_id stays the first one so older app versions keep working. No community = public (Nearby).
alter table public.posts add column if not exists community_ids uuid[] not null default '{}';
update public.posts set community_ids = array[community_id] where community_id is not null and community_ids = '{}';
create index if not exists posts_community_ids_idx on public.posts using gin (community_ids);

create or replace function public.posts_sync_communities() returns trigger
language plpgsql set search_path = '' as $$
begin
  if cardinality(new.community_ids) > 0 then
    new.community_ids := array(select distinct unnest(new.community_ids));
    new.community_id := new.community_ids[1];
  elsif new.community_id is not null then
    new.community_ids := array[new.community_id];
  end if;
  return new;
end;
$$;

drop trigger if exists posts_sync_communities on public.posts;
create trigger posts_sync_communities before insert or update of community_id, community_ids on public.posts
  for each row execute function public.posts_sync_communities();
