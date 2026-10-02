-- TBKHN A: initial database schema.
-- Run once in the Supabase SQL Editor (or `supabase db push`).
-- Every table has Row Level Security on; access is only what the policies below allow.
-- Times are stored in UTC (timestamptz); distances are never stored (see docs/DYNAMIC-DATA.md).

-- ---------------------------------------------------------------------------
-- Profiles: one row per account. A "cook" is anyone with >= 1 cooking_today post.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[a-z0-9._]{3,20}$'),
  display_name text check (char_length(display_name) between 1 and 60),
  avatar_path text,
  bio text check (char_length(bio) <= 300),
  governorate text,
  area text,
  instapay_handle text check (char_length(instapay_handle) <= 60),
  heard_from text check (heard_from in ('friend', 'family', 'community', 'social_media', 'ad', 'search', 'other')),
  inviter_name text check (char_length(inviter_name) <= 60),
  ad_consent boolean not null default false,
  lang text not null default 'en' check (lang in ('en', 'ar')),
  last_lat double precision,
  last_lng double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reserved handles from the design file.
alter table public.profiles add constraint username_not_reserved
  check (username is null or username not in ('admin', 'support', 'tbkhn', 'tbkhna', 'official', 'help'));

-- Create the profile row when the auth user is created (after phone verification).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Advisory username check for the live field; the unique index is the real guard.
create function public.username_available(candidate text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profiles where username = lower(trim(candidate)))
    and lower(trim(candidate)) not in ('admin', 'support', 'tbkhn', 'tbkhna', 'official', 'help');
$$;

-- Sign-up shows "already registered, log in" and log-in shows "no account, sign up" (docs/SIGNUP-FUNNEL.md).
-- Takes +20 and 10 digits; Supabase Auth stores phones without the "+".
create function public.phone_registered(p_phone text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_phone ~ '^\+201[0-9]{9}$'
     and exists (select 1 from auth.users where phone in (p_phone, substr(p_phone, 2)));
$$;

-- ---------------------------------------------------------------------------
-- Communities: areas, compounds, clubs, Sahel resorts, schools and workplaces (the design's sign-up fields).
-- New ones are requested by members and approved by admin.
-- ---------------------------------------------------------------------------
create table public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  kind text not null check (kind in ('area', 'compound', 'club', 'sahel', 'school', 'work', 'other')),
  governorate text not null,
  area text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

-- ---------------------------------------------------------------------------
-- Pickup points: coordinates only; distance is computed on the device.
-- ---------------------------------------------------------------------------
create table public.pickup_points (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Posts: cooking_today (priced, orderable, auto-story ends at local midnight),
-- story (no price, 24 h), signature (profile dish, not for ordering).
-- ---------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('cooking_today', 'story', 'signature')),
  community_id uuid references public.communities (id) on delete set null, -- null = Nearby
  caption text check (char_length(caption) <= 500),
  media_path text,
  dish_name text check (char_length(dish_name) <= 80),
  cuisine text check (char_length(cuisine) <= 40),
  price_egp numeric(8, 2) check (price_egp >= 0),
  portions_total int check (portions_total between 1 and 200),
  portions_left int,
  ready_at timestamptz,
  pickup_point_id uuid references public.pickup_points (id) on delete set null,
  expires_at timestamptz, -- story: created_at + 24 h; cooking_today: end of the cook's local day (set by the app)
  created_at timestamptz not null default now(),
  check (kind <> 'cooking_today' or (dish_name is not null and price_egp is not null and portions_total is not null
                                     and ready_at is not null and pickup_point_id is not null and expires_at is not null)),
  check (kind = 'cooking_today' or (price_egp is null and portions_total is null)),
  check (portions_left is null or (portions_left >= 0 and portions_left <= portions_total))
);

create index posts_feed_idx on public.posts (community_id, created_at desc);
create index posts_author_idx on public.posts (author_id, created_at desc);

create function public.posts_set_defaults() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'cooking_today' then
    new.portions_left := new.portions_total;
  elsif new.kind = 'story' then
    new.expires_at := new.created_at + interval '24 hours';
  end if;
  return new;
end;
$$;

create trigger posts_before_insert before insert on public.posts
  for each row execute function public.posts_set_defaults();

create table public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reservations. Buyer can cancel freely until the cook accepts; after that, message only.
-- Payment is peer to peer by InstaPay; payment_status is informational.
-- All state changes go through the functions below, never direct updates.
-- ---------------------------------------------------------------------------
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete restrict,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  cook_id uuid not null references public.profiles (id) on delete cascade,
  plates int not null check (plates between 1 and 20),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'ready', 'picked_up', 'cancelled')),
  cancel_reason text check (char_length(cancel_reason) <= 200),
  payment_status text not null default 'none' check (payment_status in ('none', 'sent', 'received')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id <> cook_id)
);

create index reservations_buyer_idx on public.reservations (buyer_id, created_at desc);
create index reservations_cook_idx on public.reservations (cook_id, created_at desc);

create function public.reserve_plates(p_post_id uuid, p_plates int) returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_post public.posts;
  v_row public.reservations;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into v_post from public.posts where id = p_post_id for update;
  if v_post.id is null or v_post.kind <> 'cooking_today' then raise exception 'not orderable'; end if;
  if v_post.author_id = auth.uid() then raise exception 'cannot reserve your own dish'; end if;
  if v_post.expires_at <= now() then raise exception 'this dish is no longer available today'; end if;
  if exists (select 1 from public.blocks where blocker_id = v_post.author_id and blocked_id = auth.uid()) then
    raise exception 'not orderable';
  end if;
  if p_plates < 1 or p_plates > v_post.portions_left then raise exception 'only % plates left', v_post.portions_left; end if;

  update public.posts set portions_left = portions_left - p_plates where id = p_post_id;
  insert into public.reservations (post_id, buyer_id, cook_id, plates)
    values (p_post_id, auth.uid(), v_post.author_id, p_plates)
    returning * into v_row;
  return v_row;
end;
$$;

-- Moves a reservation to a new status if the caller is allowed to.
create function public.set_reservation_status(p_id uuid, p_status text, p_reason text default null)
returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.reservations;
  v_me uuid := auth.uid();
begin
  select * into v_row from public.reservations where id = p_id for update;
  if v_row.id is null or v_me not in (v_row.buyer_id, v_row.cook_id) then raise exception 'not found'; end if;

  if v_me = v_row.buyer_id and p_status = 'cancelled' and v_row.status = 'pending' then
    null;
  elsif v_me = v_row.cook_id and (
        (v_row.status = 'pending' and p_status in ('accepted', 'declined'))
     or (v_row.status = 'accepted' and p_status = 'ready')
     or (v_row.status = 'ready' and p_status = 'picked_up')) then
    null;
  else
    raise exception 'cannot change from % to %', v_row.status, p_status;
  end if;

  if p_status in ('cancelled', 'declined') then
    update public.posts set portions_left = portions_left + v_row.plates where id = v_row.post_id;
  end if;

  update public.reservations
     set status = p_status, cancel_reason = coalesce(p_reason, cancel_reason), updated_at = now()
   where id = p_id
   returning * into v_row;
  return v_row;
end;
$$;

-- "Payment sent" (buyer) and "Payment received" (cook). Informational only.
create function public.set_payment_status(p_id uuid, p_status text) returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.reservations;
begin
  select * into v_row from public.reservations where id = p_id for update;
  if v_row.id is null then raise exception 'not found'; end if;
  if not ((p_status = 'sent' and auth.uid() = v_row.buyer_id)
       or (p_status = 'received' and auth.uid() = v_row.cook_id)) then
    raise exception 'not allowed';
  end if;
  update public.reservations set payment_status = p_status, updated_at = now() where id = p_id returning * into v_row;
  return v_row;
end;
$$;

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  cook_id uuid not null references public.profiles (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text check (char_length(body) <= 500),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Messages (one-to-one), notifications and admin announcements.
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  reservation_id uuid references public.reservations (id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);

create index messages_pair_idx on public.messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  community_ids uuid[], -- null = everyone
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  check (post_id is not null or profile_id is not null)
);

-- ---------------------------------------------------------------------------
-- Sign-up funnel events (docs/SIGNUP-FUNNEL.md). Insert-only from the app; read by admin.
-- ---------------------------------------------------------------------------
create table public.signup_events (
  id bigint generated always as identity primary key,
  session_id text not null,
  user_ref uuid,
  step text not null,
  props jsonb not null default '{}'::jsonb,
  app_version text,
  os text,
  locale text,
  latency_ms int,
  error_code text,
  ts timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.pickup_points enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.reservations enable row level security;
alter table public.reviews enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;
alter table public.reports enable row level security;
alter table public.signup_events enable row level security;

-- Public profiles are readable by everyone (guests browse view-only). Private columns are hidden by
-- the grants at the end of this file.
create policy "profiles readable" on public.profiles for select using (true);
create policy "own profile editable" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "approved communities readable" on public.communities for select
  using (status = 'approved' or requested_by = auth.uid());
create policy "members request communities" on public.communities for insert to authenticated
  with check (requested_by = auth.uid() and status = 'pending');

create policy "memberships readable" on public.community_members for select using (true);
create policy "join approved communities" on public.community_members for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.communities c where c.id = community_id and c.status = 'approved'));
create policy "leave communities" on public.community_members for delete using (user_id = auth.uid());

create policy "follows readable" on public.follows for select using (true);
create policy "follow" on public.follows for insert to authenticated with check (follower_id = auth.uid());
create policy "unfollow" on public.follows for delete using (follower_id = auth.uid());

create policy "own blocks" on public.blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy "pickup points readable" on public.pickup_points for select using (true);
create policy "own pickup points" on public.pickup_points for insert to authenticated with check (owner_id = auth.uid());
create policy "edit own pickup points" on public.pickup_points for update using (owner_id = auth.uid());
create policy "delete own pickup points" on public.pickup_points for delete using (owner_id = auth.uid());

create policy "live posts readable" on public.posts for select
  using (expires_at is null or expires_at > now() or author_id = auth.uid());
create policy "create own posts" on public.posts for insert to authenticated
  with check (author_id = auth.uid()
              and (pickup_point_id is null
                   or exists (select 1 from public.pickup_points p where p.id = pickup_point_id and p.owner_id = auth.uid())));
create policy "edit own posts" on public.posts for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "delete own posts" on public.posts for delete using (author_id = auth.uid());

create policy "likes readable" on public.likes for select using (true);
create policy "like" on public.likes for insert to authenticated with check (user_id = auth.uid());
create policy "unlike" on public.likes for delete using (user_id = auth.uid());

create policy "comments readable" on public.comments for select using (true);
create policy "comment" on public.comments for insert to authenticated with check (author_id = auth.uid());
create policy "delete own comments" on public.comments for delete using (author_id = auth.uid());

-- Reservations: only the buyer and the cook see them; changes only through the functions above.
create policy "own reservations" on public.reservations for select using (auth.uid() in (buyer_id, cook_id));

create policy "reviews readable" on public.reviews for select using (true);
create policy "review own picked-up reservation" on public.reviews for insert to authenticated
  with check (reviewer_id = auth.uid()
              and exists (select 1 from public.reservations r
                          where r.id = reservation_id and r.buyer_id = auth.uid()
                            and r.cook_id = reviews.cook_id and r.status = 'picked_up'));

create policy "own messages" on public.messages for select using (auth.uid() in (sender_id, recipient_id));
create policy "send messages" on public.messages for insert to authenticated
  with check (sender_id = auth.uid()
              and not exists (select 1 from public.blocks b where b.blocker_id = recipient_id and b.blocked_id = auth.uid()));
create policy "mark messages read" on public.messages for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create policy "own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "mark notifications read" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "announcements readable" on public.announcements for select to authenticated
  using (community_ids is null
         or exists (select 1 from public.community_members m
                    where m.user_id = auth.uid() and m.community_id = any (community_ids)));

create policy "file reports" on public.reports for insert to authenticated with check (reporter_id = auth.uid());

create policy "log signup events" on public.signup_events for insert to anon, authenticated with check (true);

-- ---------------------------------------------------------------------------
-- Grants. New tables are not exposed automatically in this project, so grant explicitly.
-- Private profile columns (InstaPay handle, referral answers, consent, location) are not
-- readable by other users: they are excluded from the column grant and read through my_profile().
-- ---------------------------------------------------------------------------
-- Start from nothing: Supabase can grant every new table to anon/authenticated by default.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

grant select (id, username, display_name, avatar_path, bio, area, created_at) on public.profiles to anon, authenticated;
grant update (username, display_name, avatar_path, bio, governorate, area, instapay_handle, heard_from, inviter_name,
              ad_consent, lang, last_lat, last_lng) on public.profiles to authenticated;

grant select on public.communities, public.community_members, public.follows, public.pickup_points,
                public.posts, public.likes, public.comments, public.reviews to anon, authenticated;
grant insert on public.communities, public.community_members, public.follows, public.pickup_points,
                public.posts, public.likes, public.comments, public.reviews, public.messages, public.reports
             to authenticated;
grant delete on public.community_members, public.follows, public.pickup_points, public.posts, public.likes,
                public.comments to authenticated;
grant update on public.pickup_points, public.posts to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select on public.reservations, public.messages, public.notifications, public.announcements to authenticated;
grant update (read_at) on public.messages, public.notifications to authenticated;
grant insert on public.signup_events to anon, authenticated;

-- The signed-in user's own full profile, including private columns.
create function public.my_profile() returns public.profiles
language sql stable security definer set search_path = '' as $$
  select * from public.profiles where id = auth.uid();
$$;

-- InstaPay handle of the other side of a reservation, so the buyer can pay the cook.
create function public.reservation_instapay(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select p.instapay_handle
    from public.reservations r join public.profiles p on p.id = r.cook_id
   where r.id = p_id and auth.uid() in (r.buyer_id, r.cook_id);
$$;

revoke execute on function public.reserve_plates(uuid, int), public.set_reservation_status(uuid, text, text),
  public.set_payment_status(uuid, text), public.my_profile(), public.reservation_instapay(uuid) from public, anon;
grant execute on function public.reserve_plates(uuid, int), public.set_reservation_status(uuid, text, text),
  public.set_payment_status(uuid, text), public.my_profile(), public.reservation_instapay(uuid) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.username_available(text), public.phone_registered(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: one public bucket for photos, each user writes only under their own folder (<user id>/...).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;

create policy "media upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
