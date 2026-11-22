-- "Are you an influencer / creator?" asked in sign-up step 3 and Edit profile (app and website).
-- Self-declared, default false. Never shown as a public tag by itself; it feeds the Creator tag and the admin list.
alter table public.profiles add column if not exists is_creator boolean not null default false;

grant select (is_creator) on public.profiles to anon, authenticated;
grant update (is_creator) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Admin "Creators" tab: everyone who answered Yes, newest first. Staff see the list; the owner's download is logged.
-- ---------------------------------------------------------------------------
create function public.admin_list_creators()
returns table (id uuid, username text, display_name text, email text, instagram_url text, tiktok_url text,
               governorate text, area text, joined_at timestamptz, posts int, followers int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query
    select p.id, p.username, p.display_name, u.email::text, p.instagram_url, p.tiktok_url, p.governorate, p.area, p.created_at,
           (select count(*)::int from public.posts x where x.author_id = p.id),
           (select count(*)::int from public.follows f where f.followee_id = p.id)
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.is_creator
     order by p.created_at desc, p.id
     limit 5000;
end;
$$;

create function public.admin_export_creators()
returns table (id uuid, username text, display_name text, email text, instagram_url text, tiktok_url text,
               governorate text, area text, joined_at timestamptz, posts int, followers int)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner']);
  perform public.log_admin_action('data_exported', 'creators', 'all', null);
  return query select * from public.admin_list_creators();
end;
$$;

revoke execute on function public.admin_list_creators(), public.admin_export_creators() from public, anon;
grant execute on function public.admin_list_creators(), public.admin_export_creators() to authenticated;
