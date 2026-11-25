-- M1: cleaner PINs, devices, photo storage and demo reset.

-- ---------------------------------------------------------------------------
-- Cleaner PINs (bcrypt via pgcrypto)
-- ---------------------------------------------------------------------------
-- Server-only: the admin UI (M2) and the seed script call this with the service role.
create function public.set_cleaner_pin(p_profile_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.cleaner_pins (profile_id, pin_hash)
  values (p_profile_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (profile_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;
revoke all on function public.set_cleaner_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.set_cleaner_pin(uuid, text) to service_role;

-- Checks a cleaner's PIN. Callable by the site's registered device for its own site's cleaners.
create function public.verify_cleaner_pin(p_profile_id uuid, p_pin text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_site uuid := app.my_device_site_id();
  v_hash text;
begin
  if v_site is null then
    raise exception 'Only a registered device can verify cleaner PINs' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.profile_id = p_profile_id and m.role = 'cleaner'
      and (m.site_id = v_site or (m.site_id is null and (
        m.org_id = (select s.org_id from public.sites s where s.id = v_site)
        or exists (select 1 from public.site_access sa where sa.site_id = v_site and sa.org_id = m.org_id))))
  ) then
    return false;
  end if;
  select c.pin_hash into v_hash from public.cleaner_pins c where c.profile_id = p_profile_id;
  return v_hash is not null and v_hash = extensions.crypt(p_pin, v_hash);
end;
$$;
revoke all on function public.verify_cleaner_pin(uuid, text) from public, anon;
grant execute on function public.verify_cleaner_pin(uuid, text) to authenticated, service_role;

-- Cleaners a device can sign in: the tiles on the shared-device sign-in screen.
create function public.device_cleaners()
returns table (profile_id uuid, display_name text, preferred_language public.ui_language, photo_url text, has_consented boolean)
language sql stable security definer set search_path = '' as $$
  select distinct p.id, p.display_name, p.preferred_language, p.photo_url, p.consent_accepted_at is not null
  from public.memberships m
  join public.profiles p on p.id = m.profile_id
  join public.sites s on s.id = app.my_device_site_id()
  where m.role = 'cleaner'
    and (m.site_id = s.id or (m.site_id is null and (
      m.org_id = s.org_id
      or exists (select 1 from public.site_access sa where sa.site_id = s.id and sa.org_id = m.org_id))))
  order by p.display_name
$$;
revoke all on function public.device_cleaners() from public, anon;
grant execute on function public.device_cleaners() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Photo storage: private bucket, files stored under "<site_id>/..."
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy photos_bucket_select on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] in (select s::text from app.readable_site_ids() s)
  );
create policy photos_bucket_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (
      (storage.foldername(name))[1] = app.my_device_site_id()::text
      or exists (
        select 1 from app.my_site_roles() r
        where r.site_id::text = (storage.foldername(name))[1] and r.role in ('supervisor', 'qa')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Demo reset
-- ---------------------------------------------------------------------------
-- Deletes every organisation flagged is_demo and everything under it, including append-only
-- records, then returns the auth user ids (staff and devices) the caller should delete via the
-- Auth admin API. Photo files are removed by the caller through the Storage API, since direct
-- deletes from storage tables are blocked. Service role only.
create function public.reset_demo_data() returns table (auth_user_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_profiles uuid[];
  v_auth_users uuid[];
begin
  perform set_config('app.demo_reset', 'on', true);

  -- Profiles whose memberships are all in demo orgs.
  select coalesce(array_agg(distinct m.profile_id), '{}') into v_profiles
  from public.memberships m
  join public.organisations o on o.id = m.org_id
  where o.is_demo
    and not exists (
      select 1 from public.memberships m2
      join public.organisations o2 on o2.id = m2.org_id
      where m2.profile_id = m.profile_id and not o2.is_demo
    );

  select coalesce(array_agg(u), '{}') into v_auth_users from (
    select p.auth_user_id as u from public.profiles p where p.id = any (v_profiles) and p.auth_user_id is not null
    union
    select d.auth_user_id from public.devices d
    join public.sites s on s.id = d.site_id
    join public.organisations o on o.id = s.org_id
    where o.is_demo and d.auth_user_id is not null
  ) x;

  delete from public.organisations where is_demo;
  delete from public.profiles where id = any (v_profiles);

  perform set_config('app.demo_reset', 'off', true);
  return query select unnest(v_auth_users);
end;
$$;
revoke all on function public.reset_demo_data() from public, anon, authenticated;
grant execute on function public.reset_demo_data() to service_role;
