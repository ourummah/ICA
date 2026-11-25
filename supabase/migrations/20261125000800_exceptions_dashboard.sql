-- M5: exceptions engine support, supervisor actions, overdue tasks and realtime.
--
-- Step-record exceptions (missed_step, dwell_short, atp_fail, clock_skew) are raised by the sync
-- route right after it saves records (it knows the demo timer scale). This migration adds the
-- database side: no duplicates, supervisor actions as functions, and the shift-end check.

-- One exception of each type per step record, and one "not finished by shift end" per task.
create unique index exceptions_one_per_record on public.exceptions (step_record_id, type)
  where step_record_id is not null;
create unique index exceptions_one_overdue_per_task on public.exceptions (task_id)
  where step_record_id is null and type = 'missed_step';

-- Supervisors change exceptions only through the functions below, so resolved_by is always the
-- person who actually resolved it.
drop policy exceptions_update on public.exceptions;
revoke update on public.exceptions from authenticated;

-- ---------------------------------------------------------------------------
-- Resolve one exception with a note
-- ---------------------------------------------------------------------------
create function public.resolve_exception(p_exception_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ex public.exceptions;
  v_me uuid := app.my_profile_id();
begin
  select * into v_ex from public.exceptions where id = p_exception_id for update;
  if v_ex.id is null or not app.has_site_role(v_ex.site_id, '{supervisor,qa,site_admin}') then
    raise exception 'Not allowed to resolve this exception' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'A resolution note is required' using errcode = 'check_violation';
  end if;
  if v_ex.status = 'resolved' then
    raise exception 'This exception is already resolved' using errcode = 'check_violation';
  end if;
  update public.exceptions
  set status = 'resolved', resolution_note = btrim(p_note), resolved_by = v_me, resolved_at = now(),
      updated_at = now()
  where id = p_exception_id;
end;
$$;
revoke all on function public.resolve_exception(uuid, text) from public, anon;
grant execute on function public.resolve_exception(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Request a re-clean: new task for the same equipment, old task marked reclean_required,
-- and the old task's open exceptions resolved with the supervisor's note.
-- ---------------------------------------------------------------------------
create function public.request_reclean(p_task_id uuid, p_note text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
  v_me uuid := app.my_profile_id();
  v_ssop uuid;
  v_new uuid;
  v_note text := btrim(coalesce(p_note, ''));
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.id is null or not app.has_site_role(v_task.site_id, '{supervisor,site_admin}') then
    raise exception 'Not allowed to request a re-clean here' using errcode = 'insufficient_privilege';
  end if;
  if v_note = '' then
    raise exception 'Say why the re-clean is needed' using errcode = 'check_violation';
  end if;
  if v_task.status = 'reclean_required' then
    raise exception 'A re-clean was already requested for this task' using errcode = 'check_violation';
  end if;

  -- Re-clean with the SSOP that is active now (falls back to the task's own version).
  select id into v_ssop from public.ssops
  where equipment_id = v_task.equipment_id and status = 'active'
  order by version desc limit 1;

  insert into public.tasks (shift_id, site_id, equipment_id, ssop_id, assigned_profile_id, reclean_of_task_id)
  values (v_task.shift_id, v_task.site_id, v_task.equipment_id, coalesce(v_ssop, v_task.ssop_id),
          v_task.assigned_profile_id, v_task.id)
  returning id into v_new;

  update public.tasks set status = 'reclean_required', updated_at = now() where id = v_task.id;

  update public.exceptions
  set status = 'resolved', resolution_note = 'Re-clean requested: ' || v_note, resolved_by = v_me,
      resolved_at = now(), updated_at = now()
  where task_id = v_task.id and status = 'open';

  return v_new;
end;
$$;
revoke all on function public.request_reclean(uuid, text) from public, anon;
grant execute on function public.request_reclean(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Tasks not finished by shift end: one red missed_step each. Idempotent; the dashboard calls it.
-- ---------------------------------------------------------------------------
create function public.flag_overdue_tasks(p_site_id uuid)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  if not app.has_site_role(p_site_id, '{supervisor,qa,site_admin}') then
    raise exception 'Not allowed for this site' using errcode = 'insufficient_privilege';
  end if;
  insert into public.exceptions (site_id, task_id, type, severity, detail)
  select t.site_id, t.id, 'missed_step', 'red',
         jsonb_build_object('reason', 'not_finished_by_shift_end', 'shift_ends_at', s.ends_at)
  from public.tasks t
  join public.shifts s on s.id = t.shift_id
  where t.site_id = p_site_id
    and s.ends_at < now()
    and t.status in ('pending', 'in_progress')
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.flag_overdue_tasks(uuid) from public, anon;
grant execute on function public.flag_overdue_tasks(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: the dashboard listens for these (RLS still applies to what each user receives).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tasks, public.exceptions, public.step_records,
      public.photos;
  end if;
end;
$$;
