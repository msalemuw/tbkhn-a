-- Admin ranking controls (website only).
--   1. Keep a member out of the rankings (with a reason) and let them back in. Reversible, logged.
--   2. A read-only review list of cooks whose likes look suspicious (many likes from brand-new accounts,
--      or a burst of likes in one hour), plus the list of who liked a cook.
-- Likes still count exactly as before: nothing here filters likes automatically. Staff decide.
-- Run after 0036 (or 0035). Safe to run once.

create table public.ranking_exclusions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  excluded_by uuid references auth.users (id) on delete set null,
  excluded_at timestamptz not null default now()
);
alter table public.ranking_exclusions enable row level security;
revoke all on public.ranking_exclusions from public, anon, authenticated;

-- Same ranking as 0028, minus members staff have excluded.
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
       and not exists (select 1 from public.ranking_exclusions x where x.user_id = m.user_id)
  ),
  scored as (
    select s.*, c.name,
           case when p_kind = 'likes' then s.likes::numeric else coalesce(s.rating, 0) * s.orders end as score
      from stat s join public.communities c on c.id = s.community_id and c.status = 'approved' and c.hidden_at is null
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

-- ---------------------------------------------------------------------------
-- Current top 3 of every community, for staff, with who each cook is.
-- ---------------------------------------------------------------------------
create function public.admin_ranking_standings(p_kind text)
returns table (community_id uuid, community_name text, rank int, cook_id uuid, username text, display_name text,
               score numeric, orders int, rating numeric, likes int, verified_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  if p_kind not in ('service', 'likes') then raise exception 'unknown ranking'; end if;
  return query
    select r.community_id, r.community_name, r.rank, r.cook_id, p.username, p.display_name,
           r.score, r.orders, r.rating, r.likes, p.verified_at
      from public.community_ranking(p_kind, (select coalesce(array_agg(c.id), '{}') from public.communities c
                                              where c.status = 'approved' and c.hidden_at is null)) r
      join public.profiles p on p.id = r.cook_id
     order by r.community_name, r.rank;
end;
$$;

-- ---------------------------------------------------------------------------
-- Keep a member out of the rankings / let them back in (owner and moderator).
-- ---------------------------------------------------------------------------
create function public.admin_ranking_exclude(p_user_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator']);
  if coalesce(char_length(trim(p_reason)), 0) < 3 then raise exception 'say why this member is kept out of the rankings'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'member not found'; end if;
  insert into public.ranking_exclusions (user_id, reason, excluded_by)
    values (p_user_id, trim(p_reason), auth.uid())
    on conflict (user_id) do update set reason = excluded.reason, excluded_by = excluded.excluded_by, excluded_at = now();
  perform public.log_admin_action('ranking_excluded', 'profile', p_user_id::text, p_reason);
end;
$$;

create function public.admin_ranking_restore(p_user_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator']);
  delete from public.ranking_exclusions where user_id = p_user_id;
  if not found then raise exception 'this member is not excluded from the rankings'; end if;
  perform public.log_admin_action('ranking_restored', 'profile', p_user_id::text, p_reason);
end;
$$;

create function public.admin_ranking_exclusions()
returns table (user_id uuid, username text, display_name text, reason text, excluded_by_username text, excluded_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select x.user_id, p.username, p.display_name, x.reason, a.username, x.excluded_at
      from public.ranking_exclusions x
      join public.profiles p on p.id = x.user_id
      left join public.profiles a on a.id = x.excluded_by
     order by x.excluded_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Suspicious likes: read-only review list. A cook shows up when, among the likes on their signature posts
-- (their own like excluded, as in the ranking), either
--   * at least 5 likes and half or more came from accounts less than a day old when they liked, or
--   * 10 or more likes landed within one hour.
-- It only points staff at cooks to look at: nothing changes until staff exclude someone.
-- ---------------------------------------------------------------------------
create function public.admin_ranking_suspicious_likes()
returns table (cook_id uuid, username text, display_name text, likes int, likers int, new_account_likes int,
               peak_hour_likes int, reasons text[], excluded boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    with lk as (
      select po.author_id as cook, l.user_id as liker, l.created_at,
             (l.created_at - lp.created_at < interval '1 day') as fresh,
             (count(*) over (partition by po.author_id order by extract(epoch from l.created_at)
                              range between current row and 3600 following))::int as in_next_hour
        from public.likes l
        join public.posts po on po.id = l.post_id and po.kind = 'signature'
        join public.profiles lp on lp.id = l.user_id
       where l.user_id <> po.author_id
    ),
    agg as (
      select k.cook, count(*)::int as likes, count(distinct k.liker)::int as likers,
             (count(*) filter (where k.fresh))::int as fresh_likes, max(k.in_next_hour)::int as peak
        from lk k group by k.cook
    )
    select a.cook, p.username, p.display_name, a.likes, a.likers, a.fresh_likes, a.peak,
           array_remove(array[
             case when a.likes >= 5 and a.fresh_likes * 2 >= a.likes then 'new_accounts' end,
             case when a.peak >= 10 then 'burst' end], null),
           exists (select 1 from public.ranking_exclusions x where x.user_id = a.cook)
      from agg a join public.profiles p on p.id = a.cook
     where (a.likes >= 5 and a.fresh_likes * 2 >= a.likes) or a.peak >= 10
     order by a.likes desc, a.cook
     limit 100;
end;
$$;

-- Who liked a cook's signature posts (newest first, 200 at most), with how old each account was.
create function public.admin_ranking_likers(p_cook_id uuid)
returns table (user_id uuid, username text, display_name text, joined_at timestamptz, liked_at timestamptz,
               account_age_hours int, posts int, orders int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select l.user_id, p.username, p.display_name, p.created_at, l.created_at,
           greatest(0, (extract(epoch from l.created_at - p.created_at) / 3600)::int),
           (select count(*)::int from public.posts x where x.author_id = l.user_id),
           (select count(*)::int from public.reservations x where x.buyer_id = l.user_id)
      from public.likes l
      join public.posts po on po.id = l.post_id and po.kind = 'signature' and po.author_id = p_cook_id
      join public.profiles p on p.id = l.user_id
     where l.user_id <> p_cook_id
     order by l.created_at desc
     limit 200;
end;
$$;

revoke execute on function public.admin_ranking_standings(text), public.admin_ranking_exclude(uuid, text),
  public.admin_ranking_restore(uuid, text), public.admin_ranking_exclusions(),
  public.admin_ranking_suspicious_likes(), public.admin_ranking_likers(uuid) from public, anon;
grant execute on function public.admin_ranking_standings(text), public.admin_ranking_exclude(uuid, text),
  public.admin_ranking_restore(uuid, text), public.admin_ranking_exclusions(),
  public.admin_ranking_suspicious_likes(), public.admin_ranking_likers(uuid) to authenticated;
