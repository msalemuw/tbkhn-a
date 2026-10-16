-- Likes, comments and new followers now create a notification (Inbox > Notifications, banner, phone alert).
-- Written by triggers, like every other notification. Nobody is told about their own likes/comments,
-- about people they blocked, or twice about the same like/follow (unlike then like again).
-- payload: from = who did it, ref = the post, post_id = only for menu posts (they open the dish page),
-- profile_id = who to open for everything else, dish = dish name or the start of the caption, text = the comment.

create function public.notify_like() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_post public.posts;
begin
  select * into v_post from public.posts where id = new.post_id;
  if v_post.id is null or v_post.author_id = new.user_id then return new; end if;
  if exists (select 1 from public.blocks b where b.blocker_id = v_post.author_id and b.blocked_id = new.user_id) then return new; end if;
  if exists (select 1 from public.notifications n
              where n.user_id = v_post.author_id and n.kind = 'post_liked'
                and n.payload ->> 'from' = new.user_id::text and n.payload ->> 'ref' = new.post_id::text) then return new; end if;
  insert into public.notifications (user_id, kind, payload)
    values (v_post.author_id, 'post_liked', jsonb_strip_nulls(jsonb_build_object(
      'from', new.user_id, 'ref', new.post_id,
      'post_id', case when v_post.kind = 'cooking_today' then v_post.id end,
      'profile_id', v_post.author_id,
      'dish', coalesce(v_post.dish_name, left(v_post.caption, 60)))));
  return new;
end;
$$;

create trigger likes_notify after insert on public.likes
  for each row execute function public.notify_like();

create function public.notify_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_post public.posts;
begin
  select * into v_post from public.posts where id = new.post_id;
  if v_post.id is null or v_post.author_id = new.author_id then return new; end if;
  if exists (select 1 from public.blocks b where b.blocker_id = v_post.author_id and b.blocked_id = new.author_id) then return new; end if;
  insert into public.notifications (user_id, kind, payload)
    values (v_post.author_id, 'post_commented', jsonb_strip_nulls(jsonb_build_object(
      'from', new.author_id, 'ref', new.post_id,
      'post_id', case when v_post.kind = 'cooking_today' then v_post.id end,
      'profile_id', v_post.author_id,
      'dish', coalesce(v_post.dish_name, left(v_post.caption, 60)),
      'text', left(new.body, 140))));
  return new;
end;
$$;

create trigger comments_notify after insert on public.comments
  for each row execute function public.notify_comment();

create function public.notify_follow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.blocks b where b.blocker_id = new.followee_id and b.blocked_id = new.follower_id) then return new; end if;
  if exists (select 1 from public.notifications n
              where n.user_id = new.followee_id and n.kind = 'new_follower' and n.payload ->> 'from' = new.follower_id::text) then return new; end if;
  insert into public.notifications (user_id, kind, payload)
    values (new.followee_id, 'new_follower', jsonb_build_object('from', new.follower_id, 'profile_id', new.follower_id));
  return new;
end;
$$;

create trigger follows_notify after insert on public.follows
  for each row execute function public.notify_follow();

revoke execute on function public.notify_like(), public.notify_comment(), public.notify_follow() from public, anon, authenticated;
