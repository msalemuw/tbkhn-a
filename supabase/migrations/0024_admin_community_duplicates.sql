-- tabkheen A: help staff spot duplicate community requests (founder, 2026-10-18).
-- A request that looks like a community that already exists (or another waiting request) is flagged with the
-- look-alikes, and staff can list every approved community. Plain SQL, no extension needed.

-- Name as a comparison key: lower case, generic words and punctuation removed, so "Palm Hills Compound",
-- "palm-hills" and "The Palm Hills Club" all become "palmhills". Arabic generic words are removed too.
create function public.community_key(p_name text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(lower(coalesce(p_name, '')), '\m(the|compound|community|club|group|city|residents?)\M', ' ', 'g'),
             'كمبوند|مجتمع|نادي|جروب|مدينة|سكان', ' ', 'g'),
           '[\s\-_.,&/()''"!]+', '', 'g');
$$;

-- Letter triplets of a key, the way spell checkers compare words.
create function public.name_trigrams(p_key text) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct substr(t.padded, g.i, 3)), '{}'::text[])
    from (select '  ' || p_key || ' ' as padded) t,
         lateral generate_series(1, greatest(length(t.padded) - 2, 0)) as g(i);
$$;

-- 0 (nothing alike) to 1 (same name once generic words are ignored). One name inside the other
-- ("New Giza" and "New Giza Club House") scores 0.85.
create function public.community_name_score(p_a text, p_b text) returns real
language plpgsql immutable set search_path = '' as $$
declare
  ka text := public.community_key(p_a);
  kb text := public.community_key(p_b);
  ta text[];
  tb text[];
  shared int;
  total int;
begin
  if ka = '' or kb = '' then return 0; end if;
  if ka = kb then return 1; end if;
  if least(length(ka), length(kb)) >= 3 and (position(ka in kb) > 0 or position(kb in ka) > 0) then return 0.85; end if;
  ta := public.name_trigrams(ka);
  tb := public.name_trigrams(kb);
  select count(*) into shared from (select unnest(ta) intersect select unnest(tb)) s;
  total := cardinality(ta) + cardinality(tb) - shared;
  return case when total = 0 then 0 else (shared::real / total) end;
end;
$$;

-- Waiting requests, oldest first, each with up to 5 look-alikes among approved communities and other waiting
-- requests (score 0.45 or more, best first): [{id, name, status, kind, governorate, area, members, score, same_governorate}].
create function public.admin_community_requests_checked()
returns table (id uuid, name text, kind text, governorate text, area text, created_at timestamptz,
               requested_by uuid, requester_username text, requester_name text, look_alikes jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select c.id, c.name, c.kind, c.governorate, c.area, c.created_at, c.requested_by, p.username, p.display_name,
           coalesce((select jsonb_agg(jsonb_build_object(
                       'id', m.id, 'name', m.name, 'status', m.status, 'kind', m.kind, 'governorate', m.governorate,
                       'area', m.area, 'members', m.members, 'score', round(m.score::numeric, 2),
                       'same_governorate', m.same_gov) order by m.score desc)
                       from (select o.id, o.name, o.status, o.kind, o.governorate, o.area,
                                    (select count(*)::int from public.community_members cm where cm.community_id = o.id) as members,
                                    public.community_name_score(c.name, o.name) as score,
                                    o.governorate = c.governorate as same_gov
                               from public.communities o
                              where o.id <> c.id and o.status in ('approved', 'pending')
                                and public.community_name_score(c.name, o.name) >= 0.45
                              order by public.community_name_score(c.name, o.name) desc
                              limit 5) m),
                    '[]'::jsonb)
      from public.communities c
      left join public.profiles p on p.id = c.requested_by
     where c.status = 'pending'
     order by c.created_at;
end;
$$;

-- Every approved community with its member count, for the "already exists" list.
create function public.admin_community_directory()
returns table (id uuid, name text, kind text, governorate text, area text, members int, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select c.id, c.name, c.kind, c.governorate, c.area,
           (select count(*)::int from public.community_members m where m.community_id = c.id), c.created_at
      from public.communities c
     where c.status = 'approved'
     order by c.governorate, c.name;
end;
$$;

revoke execute on function public.community_key(text), public.name_trigrams(text), public.community_name_score(text, text),
  public.admin_community_requests_checked(), public.admin_community_directory() from public, anon;
grant execute on function public.admin_community_requests_checked(), public.admin_community_directory() to authenticated;
