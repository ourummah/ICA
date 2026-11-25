-- M1: Row Level Security on every table (SPEC.md sections 5 and 11).
--
-- Who can see a site:
--   * a member with a membership on that site (and their org owns it or has site_access to it)
--   * an org-wide member (site_id null) of the processor org that owns the site
--   * an org-wide member (site_id null) of a contractor org that has site_access to the site
--   * a registered, non-revoked device of that site
-- The site owner (processor) owns all site records; contractors only reach granted sites.

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they can read memberships without recursion)
-- ---------------------------------------------------------------------------
create function app.my_profile_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p where p.auth_user_id = auth.uid()
$$;

create function app.my_device_site_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select d.site_id from public.devices d
  where d.auth_user_id = auth.uid() and d.revoked_at is null
$$;

-- (site_id, role) pairs the current user holds, with org-wide memberships expanded to sites.
create function app.my_site_roles()
returns table (site_id uuid, role public.member_role)
language sql stable security definer set search_path = '' as $$
  -- site-specific memberships, valid only while the member's org owns or has access to the site
  select m.site_id, m.role
  from public.memberships m
  join public.profiles p on p.id = m.profile_id
  join public.sites s on s.id = m.site_id
  where p.auth_user_id = auth.uid()
    and (s.org_id = m.org_id
         or exists (select 1 from public.site_access sa where sa.site_id = s.id and sa.org_id = m.org_id))
  union
  -- org-wide membership in the owning org
  select s.id, m.role
  from public.memberships m
  join public.profiles p on p.id = m.profile_id
  join public.sites s on s.org_id = m.org_id
  where p.auth_user_id = auth.uid() and m.site_id is null
  union
  -- org-wide membership in an org that was granted access
  select sa.site_id, m.role
  from public.memberships m
  join public.profiles p on p.id = m.profile_id
  join public.site_access sa on sa.org_id = m.org_id
  where p.auth_user_id = auth.uid() and m.site_id is null
$$;

create function app.readable_site_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select r.site_id from app.my_site_roles() r
  union
  select app.my_device_site_id() where app.my_device_site_id() is not null
$$;

create function app.can_read_site(p_site_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.readable_site_ids() s where s = p_site_id)
$$;

create function app.has_site_role(p_site_id uuid, p_roles public.member_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.my_site_roles() r where r.site_id = p_site_id and r.role = any (p_roles)
  )
$$;

create function app.is_site_device(p_site_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.my_device_site_id() = p_site_id
$$;

create function app.my_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.org_id from public.memberships m
  join public.profiles p on p.id = m.profile_id
  where p.auth_user_id = auth.uid()
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Baseline privileges
-- ---------------------------------------------------------------------------
-- Nothing is readable or writable anonymously; public forms go through server routes.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
-- TRUNCATE bypasses RLS, so app roles never get it.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Enable RLS on every table in public. A table without policies is closed to app roles.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenancy tables
-- ---------------------------------------------------------------------------
create policy organisations_select on public.organisations for select to authenticated
  using (
    id in (select app.my_org_ids())
    or id in (select s.org_id from public.sites s where s.id in (select app.readable_site_ids()))
  );

create policy sites_select on public.sites for select to authenticated
  using (id in (select app.readable_site_ids()));
create policy sites_update on public.sites for update to authenticated
  using (app.has_site_role(id, '{site_admin}'))
  with check (app.has_site_role(id, '{site_admin}'));

create policy site_access_select on public.site_access for select to authenticated
  using (app.can_read_site(site_id) or org_id in (select app.my_org_ids()));
-- Only the owning processor's site admin can grant or revoke contractor access.
create policy site_access_insert on public.site_access for insert to authenticated
  with check (
    app.has_site_role(site_id, '{site_admin}')
    and exists (
      select 1 from public.sites s
      where s.id = site_id and s.org_id in (select app.my_org_ids())
    )
  );
create policy site_access_delete on public.site_access for delete to authenticated
  using (
    app.has_site_role(site_id, '{site_admin}')
    and exists (
      select 1 from public.sites s
      where s.id = site_id and s.org_id in (select app.my_org_ids())
    )
  );

-- Profiles: yourself, plus anyone with a membership at a site you can read or in your org.
create policy profiles_select on public.profiles for select to authenticated
  using (
    auth_user_id = auth.uid()
    or exists (
      select 1 from public.memberships m
      where m.profile_id = profiles.id
        and (
          (m.site_id is not null and app.can_read_site(m.site_id))
          or m.org_id in (select app.my_org_ids())
        )
    )
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (display_name, preferred_language, photo_url, consent_accepted_at) on public.profiles to authenticated;

create policy memberships_select on public.memberships for select to authenticated
  using (
    profile_id = app.my_profile_id()
    or (site_id is not null and app.can_read_site(site_id))
    or (site_id is null and org_id in (select app.my_org_ids()))
  );

-- cleaner_pins: no policies. Only security definer functions and the service role touch it.

create policy devices_select on public.devices for select to authenticated
  using (app.can_read_site(site_id));
create policy devices_update on public.devices for update to authenticated
  using (app.has_site_role(site_id, '{site_admin}'))
  with check (app.has_site_role(site_id, '{site_admin}'));

-- ---------------------------------------------------------------------------
-- Site setup tables: readable by anyone on the site, writable by site admins
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['zones', 'equipment', 'chemicals', 'ssops', 'ssop_steps'] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated using (app.can_read_site(site_id))', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated with check (app.has_site_role(site_id, ''{site_admin}''))', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated using (app.has_site_role(site_id, ''{site_admin}'')) with check (app.has_site_role(site_id, ''{site_admin}''))', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated using (app.has_site_role(site_id, ''{site_admin}''))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shifts and tasks: planners are site admins, supervisors and contractor admins
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['shifts', 'tasks'] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated using (app.can_read_site(site_id))', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated with check (app.has_site_role(site_id, ''{site_admin,supervisor,contractor_admin}''))', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated using (app.has_site_role(site_id, ''{site_admin,supervisor,contractor_admin}'')) with check (app.has_site_role(site_id, ''{site_admin,supervisor,contractor_admin}''))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Records
-- ---------------------------------------------------------------------------
create policy step_records_select on public.step_records for select to authenticated
  using (app.can_read_site(site_id));
-- Written by the site's registered device (cleaner sync) or a supervisor.
create policy step_records_insert on public.step_records for insert to authenticated
  with check (app.is_site_device(site_id) or app.has_site_role(site_id, '{supervisor}'));

create policy note_translations_select on public.note_translations for select to authenticated
  using (app.can_read_site(site_id));
create policy note_translations_insert on public.note_translations for insert to authenticated
  with check (
    source = 'human'
    and created_by = app.my_profile_id()
    and app.has_site_role(site_id, '{supervisor,qa}')
  );

create policy photos_select on public.photos for select to authenticated
  using (app.can_read_site(site_id));
create policy photos_insert on public.photos for insert to authenticated
  with check (app.is_site_device(site_id) or app.has_site_role(site_id, '{supervisor,qa}'));
create policy photos_update on public.photos for update to authenticated
  using (app.has_site_role(site_id, '{supervisor,qa}'))
  with check (app.has_site_role(site_id, '{supervisor,qa}'));
revoke update on public.photos from authenticated;
grant update (ai_flag_reviewed_by, ai_flag_review_result) on public.photos to authenticated;

create policy exceptions_select on public.exceptions for select to authenticated
  using (app.can_read_site(site_id));
create policy exceptions_update on public.exceptions for update to authenticated
  using (app.has_site_role(site_id, '{supervisor,qa,site_admin}'))
  with check (app.has_site_role(site_id, '{supervisor,qa,site_admin}'));
revoke update on public.exceptions from authenticated;
grant update (status, resolution_note, resolved_by, resolved_at) on public.exceptions to authenticated;

create policy preop_inspections_select on public.preop_inspections for select to authenticated
  using (app.can_read_site(site_id));
create policy preop_inspections_insert on public.preop_inspections for insert to authenticated
  with check (
    inspector_profile_id = app.my_profile_id()
    and app.has_site_role(site_id, '{qa,supervisor}')
  );

create policy releases_select on public.releases for select to authenticated
  using (app.can_read_site(site_id));
create policy releases_insert on public.releases for insert to authenticated
  with check (qa_profile_id = app.my_profile_id() and app.has_site_role(site_id, '{qa}'));

create policy audit_events_select on public.audit_events for select to authenticated
  using (app.can_read_site(site_id));

-- demo_requests: no policies. Inserted by the server route with the service role.
