-- M2: SSOP builder support. Drafts are edited freely; activation creates an immutable version.

-- At most one draft per equipment item at a time.
create unique index ssops_one_draft_per_equipment on public.ssops (equipment_id) where status = 'draft';

-- Starts a new draft for an equipment item, copying the steps of its latest version (if any).
create function public.create_ssop_draft(p_equipment_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_site uuid;
  v_source uuid;
  v_version int;
  v_draft uuid;
begin
  select e.site_id into v_site from public.equipment e where e.id = p_equipment_id;
  if v_site is null or not app.has_site_role(v_site, '{site_admin}') then
    raise exception 'Only a site admin can create SSOP drafts' using errcode = 'insufficient_privilege';
  end if;

  select s.id into v_draft from public.ssops s where s.equipment_id = p_equipment_id and s.status = 'draft';
  if v_draft is not null then
    return v_draft;
  end if;

  select s.id, s.version into v_source, v_version
  from public.ssops s where s.equipment_id = p_equipment_id
  order by s.version desc limit 1;

  insert into public.ssops (equipment_id, site_id, version, status)
  values (p_equipment_id, v_site, coalesce(v_version, 0) + 1, 'draft')
  returning id into v_draft;

  if v_source is not null then
    insert into public.ssop_steps (
      ssop_id, site_id, step_no, step_type, title_en, instructions_en, icon, chemical_id, dilution,
      dwell_minutes, photo_required, atp_required, atp_pass_max
    )
    select v_draft, site_id, step_no, step_type, title_en, instructions_en, icon, chemical_id, dilution,
      dwell_minutes, photo_required, atp_required, atp_pass_max
    from public.ssop_steps where ssop_id = v_source;
  end if;

  return v_draft;
end;
$$;

-- Activates a draft: the previous active version is retired, history kept.
create function public.activate_ssop(p_ssop_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ssop public.ssops;
begin
  select * into v_ssop from public.ssops where id = p_ssop_id for update;
  if v_ssop.id is null or not app.has_site_role(v_ssop.site_id, '{site_admin}') then
    raise exception 'Only a site admin can activate an SSOP' using errcode = 'insufficient_privilege';
  end if;
  if v_ssop.status <> 'draft' then
    raise exception 'Only a draft can be activated' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.ssop_steps where ssop_id = p_ssop_id) then
    raise exception 'An SSOP needs at least one step' using errcode = 'check_violation';
  end if;

  update public.ssops set status = 'retired'
  where equipment_id = v_ssop.equipment_id and status = 'active';

  update public.ssops
  set status = 'active', approved_by = app.my_profile_id(), approved_at = now()
  where id = p_ssop_id;
end;
$$;

-- Moves a draft step up (-1) or down (+1).
create function public.move_ssop_step(p_step_id uuid, p_direction int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_step public.ssop_steps;
  v_other uuid;
begin
  select * into v_step from public.ssop_steps where id = p_step_id;
  if v_step.id is null or not app.has_site_role(v_step.site_id, '{site_admin}') then
    raise exception 'Only a site admin can reorder steps' using errcode = 'insufficient_privilege';
  end if;
  if p_direction not in (-1, 1) then
    raise exception 'Direction must be -1 or 1' using errcode = 'invalid_parameter_value';
  end if;
  select id into v_other from public.ssop_steps
  where ssop_id = v_step.ssop_id and step_no = v_step.step_no + p_direction;
  if v_other is null then
    return;
  end if;
  -- step_no uniqueness is deferred, so the swap can pass through a duplicate.
  update public.ssop_steps set step_no = v_step.step_no + p_direction where id = p_step_id;
  update public.ssop_steps set step_no = v_step.step_no where id = v_other;
end;
$$;

-- Deletes a draft step and closes the gap in numbering.
create function public.delete_ssop_step(p_step_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_step public.ssop_steps;
begin
  select * into v_step from public.ssop_steps where id = p_step_id;
  if v_step.id is null or not app.has_site_role(v_step.site_id, '{site_admin}') then
    raise exception 'Only a site admin can delete steps' using errcode = 'insufficient_privilege';
  end if;
  delete from public.ssop_steps where id = p_step_id;
  update public.ssop_steps set step_no = step_no - 1
  where ssop_id = v_step.ssop_id and step_no > v_step.step_no;
end;
$$;

-- Replaces all steps of a draft in one go (CSV import). p_steps is a JSON array of step objects.
create function public.replace_ssop_steps(p_ssop_id uuid, p_steps jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_ssop public.ssops;
  v_count int;
begin
  select * into v_ssop from public.ssops where id = p_ssop_id;
  if v_ssop.id is null or not app.has_site_role(v_ssop.site_id, '{site_admin}') then
    raise exception 'Only a site admin can import steps' using errcode = 'insufficient_privilege';
  end if;
  if v_ssop.status <> 'draft' then
    raise exception 'Steps can only be imported into a draft' using errcode = 'check_violation';
  end if;

  delete from public.ssop_steps where ssop_id = p_ssop_id;

  insert into public.ssop_steps (
    ssop_id, site_id, step_no, step_type, title_en, instructions_en, icon, chemical_id, dilution,
    dwell_minutes, photo_required, atp_required, atp_pass_max
  )
  select p_ssop_id, v_ssop.site_id, (s.ordinality)::int, (s.value->>'step_type')::public.step_type,
    s.value->>'title_en', coalesce(s.value->>'instructions_en', ''), s.value->>'icon',
    nullif(s.value->>'chemical_id', '')::uuid, nullif(s.value->>'dilution', ''),
    nullif(s.value->>'dwell_minutes', '')::int,
    coalesce((s.value->>'photo_required')::boolean, false),
    coalesce((s.value->>'atp_required')::boolean, false),
    nullif(s.value->>'atp_pass_max', '')::int
  from jsonb_array_elements(p_steps) with ordinality as s(value, ordinality);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Creates (or returns) the shift for a site's local date, 22:00 to 06:00 site time.
create function public.ensure_shift(p_site_id uuid, p_shift_date date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tz text;
  v_id uuid;
begin
  if not app.has_site_role(p_site_id, '{site_admin,supervisor,contractor_admin}') then
    raise exception 'Not allowed to plan shifts for this site' using errcode = 'insufficient_privilege';
  end if;
  select id into v_id from public.shifts where site_id = p_site_id and shift_date = p_shift_date order by starts_at limit 1;
  if v_id is not null then
    return v_id;
  end if;
  select timezone into v_tz from public.sites where id = p_site_id;
  insert into public.shifts (site_id, shift_date, starts_at, ends_at)
  values (
    p_site_id, p_shift_date,
    (p_shift_date + time '22:00') at time zone v_tz,
    (p_shift_date + 1 + time '06:00') at time zone v_tz
  )
  returning id into v_id;
  return v_id;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_ssop_draft(uuid)', 'activate_ssop(uuid)', 'move_ssop_step(uuid, int)',
    'delete_ssop_step(uuid)', 'replace_ssop_steps(uuid, jsonb)', 'ensure_shift(uuid, date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end;
$$;
