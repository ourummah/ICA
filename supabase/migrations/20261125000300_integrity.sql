-- M1: record integrity (SPEC.md section 6, "Record integrity rules").
--   * step_records, audit_events and note_translations are append-only.
--   * audit_events form a per-site hash chain computed here, server-side.
--   * every step record is written into the chain, and its chain_hash points at that link.
--   * verify_chain() re-walks the chain and checks step records against their snapshots.

-- ---------------------------------------------------------------------------
-- Append-only guard
-- ---------------------------------------------------------------------------
-- The only way past it is reset_demo_data(), which sets app.demo_reset for its own transaction.
-- App roles have no UPDATE/DELETE privilege on these tables in the first place.
create function app.prevent_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('app.demo_reset', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return null;
  end if;
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op
    using errcode = 'insufficient_privilege',
          hint = 'Insert a new row that supersedes the old one instead.';
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['step_records', 'audit_events', 'note_translations'] loop
    execute format('revoke update, delete, truncate on public.%I from authenticated, anon', t);
    execute format(
      'create trigger append_only before update or delete on public.%I for each row execute function app.prevent_mutation()', t);
    execute format(
      'create trigger append_only_truncate before truncate on public.%I for each statement execute function app.prevent_mutation()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hash chain
-- ---------------------------------------------------------------------------
create function app.utc_iso(ts timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;

-- Canonical form of an event. jsonb renders keys in a fixed order, so this text is stable.
create function app.audit_event_canonical(e public.audit_events) returns text
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'seq', e.seq,
    'id', e.id,
    'site_id', e.site_id,
    'actor_profile_id', e.actor_profile_id,
    'entity', e.entity,
    'entity_id', e.entity_id,
    'action', e.action,
    'data', e.data,
    'created_at', app.utc_iso(e.created_at)
  )::text
$$;

create function app.audit_event_hash(prev_hash text, e public.audit_events) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(prev_hash || app.audit_event_canonical(e), 'sha256'), 'hex')
$$;

create function app.chain_audit_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_prev text;
begin
  -- One writer per site at a time, so links are assigned in commit order.
  perform pg_advisory_xact_lock(hashtextextended('audit_chain:' || new.site_id::text, 0));

  select a.hash into v_prev
  from public.audit_events a
  where a.site_id = new.site_id
  order by a.seq desc
  limit 1;

  new.seq := nextval('public.audit_events_seq');
  new.created_at := clock_timestamp();
  new.prev_hash := coalesce(v_prev, repeat('0', 64));
  new.hash := app.audit_event_hash(new.prev_hash, new);
  return new;
end;
$$;

create trigger chain_audit_event before insert on public.audit_events
  for each row execute function app.chain_audit_event();

-- Inserts one audit event and returns its hash. Used by the triggers below.
create function app.write_audit_event(
  p_site_id uuid, p_actor uuid, p_entity text, p_entity_id uuid, p_action text, p_data jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
begin
  insert into public.audit_events (seq, site_id, actor_profile_id, entity, entity_id, action, data, prev_hash, hash)
  values (0, p_site_id, p_actor, p_entity, p_entity_id, p_action, coalesce(p_data, '{}'), '', '')
  returning hash into v_hash;
  return v_hash;
end;
$$;

-- ---------------------------------------------------------------------------
-- Step records go into the chain on insert
-- ---------------------------------------------------------------------------
create function app.step_record_snapshot(r public.step_records) returns jsonb
language sql immutable set search_path = '' as $$
  select to_jsonb(r) - 'chain_hash'
$$;

create function app.chain_step_record() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.server_received_at := now();
  new.created_at := now();
  new.chain_hash := app.write_audit_event(
    new.site_id, new.profile_id, 'step_records', new.id, 'insert', app.step_record_snapshot(new)
  );
  return new;
end;
$$;

create trigger chain_step_record before insert on public.step_records
  for each row execute function app.chain_step_record();

-- ---------------------------------------------------------------------------
-- Audit trail for other site-scoped changes
-- ---------------------------------------------------------------------------
create function app.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_data jsonb;
begin
  if tg_op = 'INSERT' then
    v_data := jsonb_build_object('new', to_jsonb(new));
  else
    v_data := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  end if;
  perform app.write_audit_event(
    new.site_id, app.my_profile_id(), tg_table_name, new.id, lower(tg_op), v_data
  );
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'devices', 'zones', 'equipment', 'chemicals', 'ssops', 'ssop_steps', 'shifts', 'tasks',
    'note_translations', 'photos', 'exceptions', 'preop_inspections', 'releases'
  ] loop
    execute format(
      'create trigger audit_row_change after insert or update on public.%I for each row execute function app.audit_row_change()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- SSOP versions are immutable once activated
-- ---------------------------------------------------------------------------
create function app.guard_ssop_steps() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_status public.ssop_status;
begin
  if current_setting('app.demo_reset', true) = 'on' then
    return coalesce(new, old);
  end if;
  select s.status into v_status from public.ssops s where s.id = coalesce(new.ssop_id, old.ssop_id);
  if v_status is distinct from 'draft' then
    raise exception 'SSOP steps can only change while the SSOP is a draft'
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger guard_ssop_steps before insert or update or delete on public.ssop_steps
  for each row execute function app.guard_ssop_steps();

create function app.guard_ssop_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'retired' and new.status <> 'retired' then
    raise exception 'A retired SSOP cannot be reactivated; create a new version'
      using errcode = 'insufficient_privilege';
  end if;
  if old.status = 'active' and new.status = 'draft' then
    raise exception 'An active SSOP cannot go back to draft; create a new version'
      using errcode = 'insufficient_privilege';
  end if;
  if old.status <> 'draft' and (new.equipment_id, new.version) is distinct from (old.equipment_id, old.version) then
    raise exception 'An activated SSOP version is immutable' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger guard_ssop_status before update on public.ssops
  for each row execute function app.guard_ssop_status();

-- ---------------------------------------------------------------------------
-- Chain verification
-- ---------------------------------------------------------------------------
-- Walks the whole chain for a site in order. Counts events in [p_from, p_to] and reports any
-- broken link, recomputed hash mismatch, or step record that no longer matches its snapshot.
-- Runs with the caller's rights, so RLS limits it to sites the caller can read.
create function public.verify_chain(p_site_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (records bigint, breaks bigint, first_break_seq bigint, verified boolean)
language plpgsql stable set search_path = '' as $$
declare
  e public.audit_events;
  v_prev text := repeat('0', 64);
  v_records bigint := 0;
  v_breaks bigint := 0;
  v_first bigint;
  v_bad boolean;
begin
  for e in select * from public.audit_events a where a.site_id = p_site_id order by a.seq loop
    v_bad := e.prev_hash <> v_prev or e.hash <> app.audit_event_hash(e.prev_hash, e);

    if not v_bad and e.entity = 'step_records' and e.action = 'insert' then
      v_bad := not exists (
        select 1 from public.step_records r
        where r.id = e.entity_id
          and r.chain_hash = e.hash
          and app.step_record_snapshot(r) = e.data
      );
    end if;

    if (p_from is null or e.created_at >= p_from) and (p_to is null or e.created_at <= p_to) then
      v_records := v_records + 1;
    end if;
    if v_bad then
      v_breaks := v_breaks + 1;
      v_first := coalesce(v_first, e.seq);
    end if;
    v_prev := e.hash;
  end loop;

  -- A step record with no matching chain link was inserted around the trigger.
  select v_breaks + count(*) into v_breaks
  from public.step_records r
  where r.site_id = p_site_id
    and not exists (
      select 1 from public.audit_events a
      where a.site_id = p_site_id and a.entity = 'step_records' and a.entity_id = r.id and a.hash = r.chain_hash
    );

  return query select v_records, v_breaks, v_first, v_breaks = 0;
end;
$$;

revoke all on function public.verify_chain(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.verify_chain(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- Only the read helpers from the RLS migration are callable by app roles. Writing to the chain
-- happens exclusively inside these triggers.
revoke all on function app.write_audit_event(uuid, uuid, text, uuid, text, jsonb) from public, authenticated, anon;
revoke all on function app.chain_audit_event() from public, authenticated, anon;
revoke all on function app.chain_step_record() from public, authenticated, anon;
revoke all on function app.audit_row_change() from public, authenticated, anon;
grant execute on function app.utc_iso(timestamptz), app.audit_event_canonical(public.audit_events),
  app.audit_event_hash(text, public.audit_events), app.step_record_snapshot(public.step_records)
  to authenticated, service_role;
