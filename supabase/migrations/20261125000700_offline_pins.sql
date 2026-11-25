-- M4: PIN hashes for offline sign-in on a registered device (SPEC F2: works offline after the
-- device has synced once that day). Only the device's own site's cleaners are returned.
create function public.device_cleaner_pin_hashes()
returns table (profile_id uuid, pin_hash text)
language sql stable security definer set search_path = '' as $$
  select c.profile_id, p.pin_hash
  from public.device_cleaners() c
  join public.cleaner_pins p on p.profile_id = c.profile_id
$$;
revoke all on function public.device_cleaner_pin_hashes() from public, anon;
grant execute on function public.device_cleaner_pin_hashes() to authenticated, service_role;
