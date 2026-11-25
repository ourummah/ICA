-- M3: cleaner app support. Device-side preferences, task status derived from step records,
-- and device last-seen tracking.

-- A registered device saves a cleaner's language and consent (cleaners have no login of their own).
create function public.set_cleaner_preferences(
  p_profile_id uuid, p_language public.ui_language default null, p_accept_consent boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.device_cleaners() c where c.profile_id = p_profile_id) then
    raise exception 'Not a cleaner on this device''s site' using errcode = 'insufficient_privilege';
  end if;
  update public.profiles
  set preferred_language = coalesce(p_language, preferred_language),
      consent_accepted_at = case when p_accept_consent and consent_accepted_at is null then now() else consent_accepted_at end
  where id = p_profile_id;
end;
$$;
revoke all on function public.set_cleaner_preferences(uuid, public.ui_language, boolean) from public, anon;
grant execute on function public.set_cleaner_preferences(uuid, public.ui_language, boolean) to authenticated, service_role;

-- The calling device's own row (id, site, label), for the cleaner app.
create function public.my_device()
returns table (device_id uuid, site_id uuid, label text, site_name text, site_timezone text)
language sql stable security definer set search_path = '' as $$
  select d.id, d.site_id, d.label, s.name, s.timezone
  from public.devices d join public.sites s on s.id = d.site_id
  where d.auth_user_id = auth.uid() and d.revoked_at is null
$$;
revoke all on function public.my_device() from public, anon;
grant execute on function public.my_device() to authenticated, service_role;

-- Task status follows the step records: any record -> in_progress; a current (not superseded)
-- record for every step -> completed. Re-clean and verified states are set by supervisors.
create function app.derive_task_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
  v_total int;
  v_done int;
begin
  select * into v_task from public.tasks where id = new.task_id for update;
  if v_task.status in ('reclean_required', 'verified') then
    return null;
  end if;
  select count(*) into v_total from public.ssop_steps where ssop_id = v_task.ssop_id;
  select count(distinct r.ssop_step_id) into v_done
  from public.step_records r
  where r.task_id = new.task_id
    and not exists (select 1 from public.step_records s where s.supersedes_id = r.id);
  update public.tasks
  set status = case when v_done >= v_total then 'completed'::public.task_status else 'in_progress'::public.task_status end
  where id = new.task_id and status is distinct from
    case when v_done >= v_total then 'completed'::public.task_status else 'in_progress'::public.task_status end;

  update public.devices set last_seen_at = now() where id = new.device_id;
  return null;
end;
$$;
revoke all on function app.derive_task_status() from public, authenticated, anon;

create trigger derive_task_status after insert on public.step_records
  for each row execute function app.derive_task_status();
