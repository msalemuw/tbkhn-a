-- Behaviour checks for 0008_heard_from_platforms.sql. Every check raises on failure.
\set ON_ERROR_STOP on
reset role;
do $$ begin
  update public.profiles set heard_from = 'instagram' where id = '22222222-2222-2222-2222-222222222222';
  update public.profiles set heard_from = 'social_media' where id = '22222222-2222-2222-2222-222222222222';
  begin
    update public.profiles set heard_from = 'carrier_pigeon' where id = '22222222-2222-2222-2222-222222222222';
    raise exception 'unknown answer was accepted';
  exception when check_violation then null;
  end;
end $$;
select 'heard_from_test ok';
