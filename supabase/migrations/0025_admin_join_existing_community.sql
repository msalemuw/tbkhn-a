-- tabkheen A: a duplicate community request closes by putting the requester into the community that already
-- exists (founder, 2026-10-18: "the admin makes the user join the existing community, the user doesn't do anything").
-- The request is closed as rejected (so it leaves the queue and is not counted twice), the requester is added to the
-- existing community, and their notification says so and opens it. The notification kind stays community_rejected,
-- so alerts need no new wording.

create function public.admin_join_existing_community(p_id uuid, p_target_id uuid)
returns public.communities
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.communities;
  v_target public.communities;
  v_note text;
begin
  perform public.require_staff(array['owner', 'moderator']);
  select * into v_target from public.communities where id = p_target_id and status = 'approved';
  if v_target.id is null or p_target_id = p_id then raise exception 'choose an existing community'; end if;

  v_note := 'A community called “' || v_target.name || '” already exists, so we added you to it. Tap to open it.';
  update public.communities
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
   where id = p_id and status = 'pending'
   returning * into v_row;
  if v_row.id is null then raise exception 'this request was already reviewed'; end if;

  if v_row.requested_by is not null then
    insert into public.community_members (community_id, user_id) values (v_target.id, v_row.requested_by)
      on conflict do nothing;
    insert into public.notifications (user_id, kind, payload)
      values (v_row.requested_by, 'community_rejected',
              jsonb_build_object('community_id', v_row.id, 'name', v_row.name, 'note', v_note,
                                 'redirect_id', v_target.id));
  end if;
  perform public.log_admin_action('community_joined_existing', 'community', v_row.id::text, v_note,
                                  jsonb_build_object('name', v_row.name, 'joined', v_target.name, 'joined_id', v_target.id,
                                                     'member_id', v_row.requested_by));
  return v_row;
end;
$$;

revoke execute on function public.admin_join_existing_community(uuid, uuid) from public, anon;
grant execute on function public.admin_join_existing_community(uuid, uuid) to authenticated;
