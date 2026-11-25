-- M6: pre-op inspection checklist items, QA release rules, realtime for the dashboard.

-- ---------------------------------------------------------------------------
-- Configurable pre-op checklist items per site (SPEC F6)
-- ---------------------------------------------------------------------------
create table public.preop_items (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 200),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, site_id)
);
create index on public.preop_items (site_id, sort_order);

alter table public.preop_items enable row level security;
revoke truncate on public.preop_items from authenticated, anon;
revoke all on public.preop_items from anon;

create policy preop_items_select on public.preop_items for select to authenticated
  using (app.can_read_site(site_id));
create policy preop_items_insert on public.preop_items for insert to authenticated
  with check (app.has_site_role(site_id, '{site_admin,qa}'));
create policy preop_items_update on public.preop_items for update to authenticated
  using (app.has_site_role(site_id, '{site_admin,qa}'))
  with check (app.has_site_role(site_id, '{site_admin,qa}'));
create policy preop_items_delete on public.preop_items for delete to authenticated
  using (app.has_site_role(site_id, '{site_admin,qa}'));

create trigger audit_row_change after insert or update on public.preop_items
  for each row execute function app.audit_row_change();

-- ---------------------------------------------------------------------------
-- Release is blocked while red exceptions are open in the zone this shift, unless QA overrides
-- with a reason (the table's check constraint already requires the reason). Server time only.
-- ---------------------------------------------------------------------------
create function app.guard_release() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.decided_at := now();
  new.created_at := now();
  if new.decision = 'released' and not new.override_open_exceptions and exists (
    select 1
    from public.exceptions x
    join public.tasks t on t.id = x.task_id
    join public.equipment e on e.id = t.equipment_id
    where t.shift_id = new.shift_id and e.zone_id = new.zone_id
      and x.status = 'open' and x.severity = 'red'
  ) then
    raise exception 'Release is blocked while red exceptions are open in this zone'
      using errcode = 'check_violation';
  end if;
  if new.reason is not null and btrim(new.reason) = '' then
    new.reason := null;
  end if;
  return new;
end;
$$;
revoke all on function app.guard_release() from public, authenticated, anon;

create trigger guard_release before insert on public.releases
  for each row execute function app.guard_release();

-- A held or overridden release needs a real reason, not blanks.
alter table public.releases
  add constraint releases_reason_not_blank check (reason is null or length(btrim(reason)) > 0);

-- ---------------------------------------------------------------------------
-- QA can trigger a re-clean from a failed pre-op (SPEC F6), as well as supervisors.
-- ---------------------------------------------------------------------------
create or replace function public.request_reclean(p_task_id uuid, p_note text)
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
  if v_task.id is null or not app.has_site_role(v_task.site_id, '{supervisor,qa,site_admin}') then
    raise exception 'Not allowed to request a re-clean here' using errcode = 'insufficient_privilege';
  end if;
  if v_note = '' then
    raise exception 'Say why the re-clean is needed' using errcode = 'check_violation';
  end if;
  if v_task.status = 'reclean_required' then
    raise exception 'A re-clean was already requested for this task' using errcode = 'check_violation';
  end if;

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

-- ---------------------------------------------------------------------------
-- Realtime for the dashboard's release line and pre-op status
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.releases, public.preop_inspections;
  end if;
end;
$$;
