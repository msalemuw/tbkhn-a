-- The send-push function runs with the service role. push_tokens was created without table privileges for it
-- (error 42501 "permission denied"), so it could never find a phone to alert. Grant what the function needs.
grant select, delete on public.push_tokens to service_role;
grant select, update on public.notifications to service_role;
grant select on public.profiles to service_role;
