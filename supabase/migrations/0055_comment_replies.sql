-- Replies to comments, one level deep like Instagram. Safe to run before the app update: both columns are optional,
-- so the app that is on phones today keeps working and just shows replies in the normal list.
--   parent_id   = the top-level comment the reply sits under (replies to a reply stay in the same thread)
--   reply_to_id = the exact comment answered; that person gets the "replied to your comment" alert
-- Deleting a comment deletes the replies under it (the audit log keeps every original).

alter table public.comments
  add column if not exists parent_id uuid references public.comments (id) on delete cascade,
  add column if not exists reply_to_id uuid references public.comments (id) on delete set null;

create index if not exists comments_parent_idx on public.comments (parent_id) where parent_id is not null;

-- A reply must sit under a top-level comment of the same post, and answer a comment of that same thread.
create or replace function public.check_comment_reply() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_parent public.comments;
begin
  if new.parent_id is null then
    new.reply_to_id := null;
    return new;
  end if;
  select * into v_parent from public.comments where id = new.parent_id;
  if v_parent.id is null or v_parent.post_id <> new.post_id or v_parent.parent_id is not null then
    raise exception 'You can only reply to a comment on this post.';
  end if;
  if new.reply_to_id is null then new.reply_to_id := new.parent_id; end if;
  if not exists (select 1 from public.comments c
                  where c.id = new.reply_to_id and c.post_id = new.post_id and (c.id = new.parent_id or c.parent_id = new.parent_id)) then
    raise exception 'You can only reply to a comment in this thread.';
  end if;
  return new;
end;
$$;

drop trigger if exists comments_check_reply on public.comments;
create trigger comments_check_reply before insert on public.comments
  for each row execute function public.check_comment_reply();

-- Alerts: the person answered hears about the reply ("comment_replied"); the post's owner still hears about every comment
-- ("post_commented") unless they are the person answered (one alert, not two). Nobody is told about their own comments
-- or by someone they blocked.
create or replace function public.notify_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_post public.posts;
  v_to uuid;
  v_payload jsonb;
begin
  select * into v_post from public.posts where id = new.post_id;
  if v_post.id is null then return new; end if;
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'from', new.author_id, 'ref', new.post_id,
    'post_id', case when v_post.kind = 'cooking_today' then v_post.id end,
    'profile_id', v_post.author_id,
    'dish', coalesce(v_post.dish_name, left(v_post.caption, 60)),
    'text', left(new.body, 140)));
  if new.reply_to_id is not null then
    select c.author_id into v_to from public.comments c where c.id = new.reply_to_id;
    if v_to is not null and v_to <> new.author_id
       and not exists (select 1 from public.blocks b where b.blocker_id = v_to and b.blocked_id = new.author_id) then
      insert into public.notifications (user_id, kind, payload) values (v_to, 'comment_replied', v_payload);
    else
      v_to := null;
    end if;
  end if;
  if v_post.author_id <> new.author_id and v_post.author_id is distinct from v_to
     and not exists (select 1 from public.blocks b where b.blocker_id = v_post.author_id and b.blocked_id = new.author_id) then
    insert into public.notifications (user_id, kind, payload) values (v_post.author_id, 'post_commented', v_payload);
  end if;
  return new;
end;
$$;

revoke execute on function public.check_comment_reply(), public.notify_comment() from public, anon, authenticated;
