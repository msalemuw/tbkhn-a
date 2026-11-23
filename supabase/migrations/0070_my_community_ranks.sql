-- tabkheen A: "My rankings". For the signed-in member, their place in EVERY community they belong to, for both rankings
-- (service = rating x picked-up orders, likes = most-liked signature post), not only the top 3.
-- Same rules as community_ranking (0047): staff exclusions apply, a score of 0 is unranked, ties break on orders then id.
-- Run after 0069.

create function public.my_community_ranks()
returns table (community_id uuid, community_name text, kind text,
               service_rank int, service_total int, likes_rank int, likes_total int,
               orders int, rating numeric, likes int)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select m.community_id from public.community_members m where m.user_id = auth.uid()
  ),
  stat as (
    select m.community_id, m.user_id as cook_id,
           coalesce((select count(*)::int from public.reservations r where r.cook_id = m.user_id and r.status = 'picked_up'), 0) as orders,
           (select avg(v.rating)::numeric from public.reviews v where v.cook_id = m.user_id) as rating,
           coalesce((select max(pc.n)::int
                       from (select count(*) as n
                               from public.likes l join public.posts po on po.id = l.post_id
                              where po.author_id = m.user_id and po.kind = 'signature' and l.user_id <> po.author_id
                              group by po.id) pc), 0) as likes
      from public.community_members m
     where m.community_id in (select community_id from mine)
       and not exists (select 1 from public.ranking_exclusions x where x.user_id = m.user_id)
  ),
  scored as (
    select s.*, c.name, c.kind as ckind,
           coalesce(s.rating, 0) * s.orders as service_score, s.likes::numeric as likes_score
      from stat s join public.communities c on c.id = s.community_id and c.status = 'approved' and c.hidden_at is null
  ),
  ranked as (
    select s.*,
           case when s.service_score > 0 then (row_number() over (partition by s.community_id order by (s.service_score > 0) desc, s.service_score desc, s.orders desc, s.cook_id))::int end as srank,
           case when s.likes_score > 0 then (row_number() over (partition by s.community_id order by (s.likes_score > 0) desc, s.likes_score desc, s.orders desc, s.cook_id))::int end as lrank,
           (count(*) filter (where s.service_score > 0) over (partition by s.community_id))::int as stotal,
           (count(*) filter (where s.likes_score > 0) over (partition by s.community_id))::int as ltotal
      from scored s
  )
  select r.community_id, r.name, r.ckind, r.srank, r.stotal, r.lrank, r.ltotal, r.orders, round(r.rating, 2), r.likes
    from ranked r
   where r.cook_id = auth.uid()
   order by r.name;
$$;
revoke execute on function public.my_community_ranks() from public, anon;
grant execute on function public.my_community_ranks() to authenticated;
