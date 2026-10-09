-- Automated rankings, top 3 per community. Two kinds:
--   'service': average review rating x number of picked-up orders (cooks with at least one order and one review)
--   'likes':   likes on the cook's signature dishes (their own likes do not count)
-- A cook is ranked in every community they are a member of. Only aggregates leave these functions.
create or replace function public.community_ranking(p_kind text, p_communities uuid[])
returns table (community_id uuid, community_name text, cook_id uuid, rank int, score numeric, orders int, rating numeric, likes int)
language sql stable security definer set search_path = '' as $$
  with stat as (
    select m.community_id, m.user_id as cook_id,
           coalesce((select count(*)::int from public.reservations r where r.cook_id = m.user_id and r.status = 'picked_up'), 0) as orders,
           (select avg(v.rating)::numeric from public.reviews v where v.cook_id = m.user_id) as rating,
           coalesce((select count(*)::int
                       from public.likes l join public.posts po on po.id = l.post_id
                      where po.author_id = m.user_id and po.kind = 'signature' and l.user_id <> po.author_id), 0) as likes
      from public.community_members m
     where m.community_id = any (p_communities)
  ),
  scored as (
    select s.*, c.name,
           case when p_kind = 'likes' then s.likes::numeric else coalesce(s.rating, 0) * s.orders end as score
      from stat s join public.communities c on c.id = s.community_id and c.status = 'approved'
  ),
  ranked as (
    select s.*, (row_number() over (partition by s.community_id order by s.score desc, s.orders desc, s.cook_id))::int as rank
      from scored s
     where s.score > 0
  )
  select r.community_id, r.name, r.cook_id, r.rank, round(r.score, 2), r.orders, round(r.rating, 2), r.likes
    from ranked r
   where r.rank <= 3 and p_kind in ('service', 'likes')
   order by r.community_id, r.rank;
$$;
revoke execute on function public.community_ranking(text, uuid[]) from public;
grant execute on function public.community_ranking(text, uuid[]) to anon, authenticated;
