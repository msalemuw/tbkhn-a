-- Critics (founder, 2026-11-21): food bloggers who taste and rate cooks. Staff switch the Critic status on or off for a
-- member; nobody can set it for themselves. Like the verified tick, the app loads the small set of critic ids once.
alter table public.profiles add column if not exists critic_at timestamptz;
grant select (critic_at) on public.profiles to anon, authenticated;

create function public.admin_set_critic(p_user_id uuid, p_critic boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator']);
  update public.profiles
     set critic_at = case when p_critic then coalesce(critic_at, now()) end
   where id = p_user_id;
  if not found then raise exception 'member not found'; end if;
  perform public.log_admin_action(case when p_critic then 'member_critic_on' else 'member_critic_off' end,
                                  'profile', p_user_id::text, null);
end;
$$;
revoke execute on function public.admin_set_critic(uuid, boolean) from public, anon;
grant execute on function public.admin_set_critic(uuid, boolean) to authenticated;

-- The admin Members list marks who is a critic.
create function public.admin_critic_ids()
returns setof uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff(array['owner', 'moderator', 'support']);
  return query select id from public.profiles where critic_at is not null;
end;
$$;
revoke execute on function public.admin_critic_ids() from public, anon;
grant execute on function public.admin_critic_ids() to authenticated;
