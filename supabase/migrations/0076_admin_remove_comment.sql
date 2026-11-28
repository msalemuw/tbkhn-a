-- An owner or moderator can remove any comment from the app, from their own account. The comment's text and author are
-- kept in the admin log (before the removal), so nothing is lost for review. Posts, stories and menu dishes already use
-- admin_remove_post (a story and a menu dish are posts).
create or replace function public.admin_remove_comment(p_comment_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.comments;
begin
  perform public.require_staff(array['owner', 'moderator']);
  if coalesce(trim(p_reason), '') = '' then raise exception 'say why the comment is removed'; end if;
  delete from public.comments where id = p_comment_id returning * into v;
  if v.id is null then raise exception 'comment not found'; end if;
  perform public.log_admin_action('comment_removed', 'comment', p_comment_id::text, p_reason,
                                  jsonb_build_object('post_id', v.post_id, 'author_id', v.author_id, 'body', v.body));
end;
$$;

revoke all on function public.admin_remove_comment(uuid, text) from public, anon;
grant execute on function public.admin_remove_comment(uuid, text) to authenticated;
