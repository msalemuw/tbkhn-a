-- tabkheen A: owner-only read-only data browser (founder, 2026-10-18).
-- Lets the owner look at the rows of the app's tables from the web admin without opening Supabase, with search and
-- paging. It cannot change anything. Only the tables on the list below can be opened: private chat messages and phone
-- push tokens are left out on purpose, and nothing outside the public schema can be reached. The first page of each table
-- the owner opens is written to the action log.

-- The tables that may be opened, kept in one place. Not callable from outside.
create function public.admin_data_tables_list()
returns table (table_name text)
language sql immutable set search_path = '' as $$
  select unnest(array['profiles', 'communities', 'community_members', 'follows', 'blocks', 'pickup_points', 'posts', 'likes',
    'comments', 'reservations', 'reservation_events', 'reviews', 'notifications', 'announcements', 'reports', 'signup_events',
    'support_tickets', 'support_messages', 'member_notes', 'member_warnings', 'cook_verifications', 'admin_staff', 'admin_actions',
    'app_controls', 'countries', 'regions']);
$$;

create function public.admin_data_tables()
returns table (table_name text, row_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_t text;
begin
  perform public.require_staff(array['owner']);
  for v_t in select l.table_name from public.admin_data_tables_list() l loop
    table_name := v_t;
    execute format('select count(*) from public.%I', v_t) into row_count;
    return next;
  end loop;
end;
$$;

-- One page of a table, newest first when it has created_at. p_search matches any text in the row (ignoring case).
-- Returns the rows as JSON objects, with the total number of matching rows on every row.
create function public.admin_data_rows(p_table text, p_search text default '', p_limit int default 50, p_offset int default 0)
returns table (total bigint, row_data jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := lower(btrim(coalesce(p_search, '')));
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.require_staff(array['owner']);
  if p_table is null or not exists (select 1 from public.admin_data_tables_list() l where l.table_name = p_table) then
    raise exception 'that table cannot be opened here';
  end if;
  if v_offset = 0 and v_q = '' then
    perform public.log_admin_action('data_browsed', 'table', p_table, null);
  end if;
  -- Wildcard letters typed in the search are matched literally.
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  return query execute format(
    'select count(*) over (), to_jsonb(t) from public.%I t where $1 = '''' or lower(to_jsonb(t)::text) like ''%%'' || $1 || ''%%'' ' ||
    'order by to_jsonb(t) ->> ''created_at'' desc nulls last limit %s offset %s',
    p_table, v_limit, v_offset) using v_q;
end;
$$;

revoke execute on function public.admin_data_tables(), public.admin_data_rows(text, text, int, int), public.admin_data_tables_list() from public, anon, authenticated;
grant execute on function public.admin_data_tables(), public.admin_data_rows(text, text, int, int) to authenticated;
