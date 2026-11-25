-- Blockchain-verified audit trail (docs/AUDIT_TRAIL.md).
--
--   * Photo hashes are committed in the step record itself (photo_sha256), so a sealed record
--     names the exact photo bytes even before the upload arrives.
--   * A finished clean (one task) is sealed into sealed_records: canonical JSON (RFC 8785) built
--     by the server, record_hash = sha256 of those exact bytes, computed here in the database.
--   * Sealed records form a per-site chain (prev_site_record_hash), and every seal is also written
--     into the existing audit_events hash chain, so deleting even the latest seal is detectable.
--   * Sealed records can never change, except that batch_id and merkle_proof are set once.
--   * anchor_batches holds the daily Merkle roots and their Base transactions.

-- ---------------------------------------------------------------------------
-- Photo hash committed with the step record
-- ---------------------------------------------------------------------------
alter table public.step_records add column photo_sha256 text
  check (photo_sha256 is null or photo_sha256 ~ '^[0-9a-f]{64}$');

-- Records written before this column existed were chained without it. Leave a null column out of
-- the snapshot so their chained snapshots still match.
create or replace function app.step_record_snapshot(r public.step_records) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when r.photo_sha256 is null then to_jsonb(r) - 'chain_hash' - 'photo_sha256'
    else to_jsonb(r) - 'chain_hash'
  end
$$;

-- Security events (for example a photo whose bytes don't match its hash) go into the site's
-- audit chain. Server routes call this with the service role after checking the device.
create function public.log_security_event(p_site_id uuid, p_kind text, p_detail jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.write_audit_event(p_site_id, null, 'security', null, p_kind, coalesce(p_detail, '{}'));
end;
$$;
revoke all on function public.log_security_event(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_security_event(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Anchor batches (one per daily run, across all sites)
-- ---------------------------------------------------------------------------
create table public.anchor_batches (
  id bigserial primary key,
  merkle_root text not null check (merkle_root ~ '^[0-9a-f]{64}$'),
  record_count int not null check (record_count > 0),
  chain text not null,
  contract_address text,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'anchored', 'failed')),
  attempts int not null default 0,
  nonce bigint,
  max_fee_per_gas numeric,
  max_priority_fee_per_gas numeric,
  tx_hash text,
  tx_hashes text[] not null default '{}',
  raw_tx text,
  submitted_at timestamptz,
  block_number bigint,
  block_timestamp timestamptz,
  anchored_at timestamptz,
  last_error text,
  alerted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'anchored' or (tx_hash is not null and block_number is not null and block_timestamp is not null))
);
create index on public.anchor_batches (status);

create trigger touch_updated_at before update on public.anchor_batches
  for each row execute function app.touch_updated_at();

-- The root and record count never change, an anchored batch never changes, and batches are never
-- deleted (their roots are on a public chain).
create function app.guard_anchor_batch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'anchor_batches are permanent' using errcode = 'insufficient_privilege';
  end if;
  if new.merkle_root <> old.merkle_root or new.record_count <> old.record_count or new.id <> old.id then
    raise exception 'A batch''s Merkle root and record count cannot change' using errcode = 'insufficient_privilege';
  end if;
  if old.status = 'anchored' then
    raise exception 'An anchored batch cannot change' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger guard_anchor_batch before update or delete on public.anchor_batches
  for each row execute function app.guard_anchor_batch();
create trigger guard_anchor_batch_truncate before truncate on public.anchor_batches
  for each statement execute function app.prevent_mutation();

-- ---------------------------------------------------------------------------
-- Sealed records
-- ---------------------------------------------------------------------------
create table public.sealed_records (
  id uuid primary key,
  site_id uuid not null references public.sites (id) on delete cascade,
  task_id uuid not null,
  record_type text not null check (record_type in ('audit', 'amendment')),
  amends_record_id uuid references public.sealed_records (id),
  site_seq int not null check (site_seq > 0),
  prev_site_record_hash text check (prev_site_record_hash is null or prev_site_record_hash ~ '^[0-9a-f]{64}$'),
  record_hash text not null unique check (record_hash ~ '^[0-9a-f]{64}$'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  canonical_text text not null,
  audit_event_hash text not null,
  sealed_at timestamptz not null default now(),
  batch_id bigint references public.anchor_batches (id),
  merkle_proof jsonb,
  created_at timestamptz not null default now(),
  unique (site_id, site_seq),
  foreign key (task_id, site_id) references public.tasks (id, site_id) on delete cascade,
  check ((batch_id is null) = (merkle_proof is null))
);
create index on public.sealed_records (site_id, task_id);
create index on public.sealed_records (batch_id);
create index sealed_records_unbatched on public.sealed_records (record_hash) where batch_id is null;
-- One original seal per task; corrections are amendments.
create unique index sealed_records_one_audit_per_task on public.sealed_records (task_id) where record_type = 'audit';

-- Nothing may change a sealed record except setting its batch and proof once, from null.
create function app.guard_sealed_record() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('app.demo_reset', true) = 'on' and tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE'
     and old.batch_id is null and new.batch_id is not null and new.merkle_proof is not null
     and (to_jsonb(new) - 'batch_id' - 'merkle_proof') = (to_jsonb(old) - 'batch_id' - 'merkle_proof') then
    return new;
  end if;
  raise exception 'sealed_records are immutable: % is not allowed', tg_op
    using errcode = 'insufficient_privilege',
          hint = 'Seal an amendment that references the record instead.';
end;
$$;
create trigger guard_sealed_record before update or delete on public.sealed_records
  for each row execute function app.guard_sealed_record();
create trigger guard_sealed_record_truncate before truncate on public.sealed_records
  for each statement execute function app.prevent_mutation();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.sealed_records enable row level security;
alter table public.anchor_batches enable row level security;
revoke all on public.sealed_records, public.anchor_batches from anon;
revoke insert, update, delete, truncate on public.sealed_records, public.anchor_batches from authenticated;
revoke all on sequence public.anchor_batches_id_seq from anon, authenticated;

create policy sealed_records_select on public.sealed_records for select to authenticated
  using (app.can_read_site(site_id));

-- A batch is visible to anyone who can see at least one record in it. Batches hold only hashes.
create policy anchor_batches_select on public.anchor_batches for select to authenticated
  using (exists (select 1 from public.sealed_records r where r.batch_id = anchor_batches.id));

-- ---------------------------------------------------------------------------
-- Sealing
-- ---------------------------------------------------------------------------
-- Takes canonical JSON built by the server (RFC 8785), checks it against the site chain, and
-- stores it with record_hash = sha256 of its exact UTF-8 bytes. Raises serialization_failure if
-- another seal for the site got in first; the caller rebuilds with the new chain head and retries.
create function public.seal_record(p_canonical text, p_content_hash text)
returns public.sealed_records
language plpgsql security definer set search_path = '' as $$
declare
  v_doc jsonb := p_canonical::jsonb;
  v_site uuid := (v_doc ->> 'site_id')::uuid;
  v_task uuid := (v_doc #>> '{task,task_id}')::uuid;
  v_type text := v_doc ->> 'record_type';
  v_head public.sealed_records;
  v_latest public.sealed_records;
  v_row public.sealed_records;
  v_hash text;
  v_seq int;
  v_id uuid;
  v_event text;
begin
  if v_doc ->> 'schema' is distinct from 'ica.audit.v1' then
    raise exception 'Unknown record schema' using errcode = 'invalid_parameter_value';
  end if;
  if v_type not in ('audit', 'amendment') then
    raise exception 'Unknown record type' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.tasks t where t.id = v_task and t.site_id = v_site) then
    raise exception 'Task is not on this site' using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('seal_chain:' || v_site::text, 0));

  select * into v_head from public.sealed_records r where r.site_id = v_site order by r.site_seq desc limit 1;
  if (v_doc ->> 'prev_site_record_hash') is distinct from v_head.record_hash then
    raise exception 'Site chain head moved; rebuild the record' using errcode = 'serialization_failure';
  end if;

  select * into v_latest from public.sealed_records r where r.task_id = v_task order by r.site_seq desc limit 1;
  if v_type = 'audit' and v_latest.id is not null then
    raise exception 'Task already sealed; seal an amendment' using errcode = 'unique_violation';
  end if;
  if v_type = 'amendment' and (v_latest.id is null or (v_doc ->> 'amends_record_hash') is distinct from v_latest.record_hash) then
    raise exception 'An amendment must reference the latest seal of its task' using errcode = 'serialization_failure';
  end if;
  if v_type = 'audit' and (v_doc ->> 'amends_record_hash') is not null then
    raise exception 'An original record cannot amend another' using errcode = 'invalid_parameter_value';
  end if;

  v_hash := encode(extensions.digest(convert_to(p_canonical, 'UTF8'), 'sha256'), 'hex');
  v_seq := coalesce(v_head.site_seq, 0) + 1;
  v_id := (v_doc ->> 'record_id')::uuid;

  -- Into the existing site audit chain as well, so a deleted seal is detectable.
  v_event := app.write_audit_event(
    v_site, null, 'sealed_records', v_id, 'seal',
    jsonb_build_object('record_hash', v_hash, 'site_seq', v_seq, 'task_id', v_task)
  );

  insert into public.sealed_records (
    id, site_id, task_id, record_type, amends_record_id, site_seq, prev_site_record_hash,
    record_hash, content_hash, canonical_text, audit_event_hash
  ) values (
    v_id, v_site, v_task, v_type, case when v_type = 'amendment' then v_latest.id end,
    v_seq, v_head.record_hash, v_hash, p_content_hash, p_canonical, v_event
  ) returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.seal_record(text, text) from public, anon, authenticated;
grant execute on function public.seal_record(text, text) to service_role;

-- Tasks with a finished clean that has no seal yet, or with a step record or photo that its
-- latest seal doesn't contain (a late sync or a correction: needs an amendment). A task counts as
-- finished when completed, sent back for re-clean or verified, or when its shift ended over an
-- hour ago with at least one record.
create function public.tasks_needing_seal(p_site_id uuid default null, p_limit int default 200)
returns table (task_id uuid, site_id uuid, latest_record_id uuid, latest_record_hash text)
language sql stable security definer set search_path = '' as $$
  with latest as (
    select distinct on (r.task_id) r.task_id, r.id, r.record_hash, r.canonical_text
    from public.sealed_records r
    where p_site_id is null or r.site_id = p_site_id
    order by r.task_id, r.site_seq desc
  )
  select t.id, t.site_id, l.id, l.record_hash
  from public.tasks t
  join public.shifts sh on sh.id = t.shift_id
  left join latest l on l.task_id = t.id
  where (p_site_id is null or t.site_id = p_site_id)
    and exists (select 1 from public.step_records x where x.task_id = t.id)
    and (
      (l.task_id is null and (t.status in ('completed', 'reclean_required', 'verified') or sh.ends_at < now() - interval '1 hour'))
      or (l.task_id is not null and (
        exists (
          select 1 from public.step_records x
          where x.task_id = t.id and strpos(l.canonical_text, x.id::text) = 0
        )
        or exists (
          select 1 from public.photos p join public.step_records x on x.id = p.step_record_id
          where x.task_id = t.id and strpos(l.canonical_text, p.sha256) = 0
        )
      ))
    )
  order by t.site_id, t.id
  limit p_limit
$$;
revoke all on function public.tasks_needing_seal(uuid, int) from public, anon, authenticated;
grant execute on function public.tasks_needing_seal(uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- Seal chain verification (site dashboard indicator)
-- ---------------------------------------------------------------------------
-- Walks a site's seals in order: contiguous positions, each linked to the previous hash, each
-- hash recomputed from the stored bytes, and every seal written to the audit chain still present.
-- Runs with the caller's rights, so RLS limits it to sites the caller can read.
create function public.verify_seal_chain(p_site_id uuid)
returns table (records bigint, breaks bigint, first_break_seq int, verified boolean)
language plpgsql stable set search_path = '' as $$
declare
  r public.sealed_records;
  v_prev text;
  v_expected int := 1;
  v_records bigint := 0;
  v_breaks bigint := 0;
  v_first int;
  v_bad boolean;
  v_doc jsonb;
begin
  for r in select * from public.sealed_records s where s.site_id = p_site_id order by s.site_seq loop
    v_doc := r.canonical_text::jsonb;
    v_bad := r.site_seq <> v_expected
      or r.prev_site_record_hash is distinct from v_prev
      or (v_doc ->> 'prev_site_record_hash') is distinct from r.prev_site_record_hash
      or (v_doc ->> 'record_id') is distinct from r.id::text
      or r.record_hash <> encode(extensions.digest(convert_to(r.canonical_text, 'UTF8'), 'sha256'), 'hex');
    v_records := v_records + 1;
    if v_bad then
      v_breaks := v_breaks + 1;
      v_first := coalesce(v_first, v_expected);
    end if;
    v_prev := r.record_hash;
    v_expected := r.site_seq + 1;
  end loop;

  -- A seal recorded in the audit chain whose row is gone (for example the latest one deleted).
  select v_breaks + count(*) into v_breaks
  from public.audit_events a
  where a.site_id = p_site_id and a.entity = 'sealed_records' and a.action = 'seal'
    and not exists (
      select 1 from public.sealed_records s
      where s.id = a.entity_id and s.record_hash = a.data ->> 'record_hash'
    );
  if v_first is null and v_breaks > 0 then
    v_first := (
      select min((a.data ->> 'site_seq')::int) from public.audit_events a
      where a.site_id = p_site_id and a.entity = 'sealed_records' and a.action = 'seal'
        and not exists (select 1 from public.sealed_records s where s.id = a.entity_id)
    );
  end if;

  return query select v_records, v_breaks, v_first, v_breaks = 0;
end;
$$;
revoke all on function public.verify_seal_chain(uuid) from public, anon;
grant execute on function public.verify_seal_chain(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Batching
-- ---------------------------------------------------------------------------
-- Creates a batch from records the server put in a Merkle tree, and stores each record's proof.
-- Every record must still be unbatched, so no record is ever counted in two batches.
create function public.create_anchor_batch(p_root text, p_chain text, p_items jsonb, p_contract text default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[] := array(select (i ->> 'record_id')::uuid from jsonb_array_elements(p_items) i);
  v_locked int;
  v_batch bigint;
begin
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'A batch needs at least one record' using errcode = 'invalid_parameter_value';
  end if;
  select count(*) into v_locked from (
    select 1 from public.sealed_records r where r.id = any (v_ids) and r.batch_id is null for update
  ) x;
  if v_locked <> array_length(v_ids, 1) then
    raise exception 'Some records are missing or already batched' using errcode = 'serialization_failure';
  end if;

  insert into public.anchor_batches (merkle_root, record_count, chain, contract_address)
  values (p_root, array_length(v_ids, 1), p_chain, p_contract)
  returning id into v_batch;

  update public.sealed_records r
  set batch_id = v_batch, merkle_proof = i -> 'proof'
  from jsonb_array_elements(p_items) i
  where r.id = (i ->> 'record_id')::uuid;
  return v_batch;
end;
$$;
revoke all on function public.create_anchor_batch(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_anchor_batch(text, text, jsonb, text) to service_role;

-- A failed batch can be retried from the admin screen: back to pending with a fresh attempt count.
-- Earlier transactions stay in tx_hashes and are checked first, so a late one is never lost.
create function public.retry_anchor_batch(p_batch_id bigint) returns void
language sql security definer set search_path = '' as $$
  update public.anchor_batches set status = 'pending', attempts = 0, last_error = null, alerted_at = null
  where id = p_batch_id and status = 'failed'
$$;
revoke all on function public.retry_anchor_batch(bigint) from public, anon, authenticated;
grant execute on function public.retry_anchor_batch(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- One anchoring job at a time (cron and "anchor now" can overlap)
-- ---------------------------------------------------------------------------
create table public.anchor_job_lease (
  id int primary key default 1 check (id = 1),
  holder text,
  locked_until timestamptz not null default '-infinity'
);
insert into public.anchor_job_lease (id) values (1);
alter table public.anchor_job_lease enable row level security;
revoke all on public.anchor_job_lease from anon, authenticated;

create function public.acquire_anchor_lease(p_holder text, p_seconds int) returns boolean
language sql security definer set search_path = '' as $$
  with taken as (
    update public.anchor_job_lease
    set holder = p_holder, locked_until = now() + make_interval(secs => p_seconds)
    where id = 1 and (locked_until < now() or holder = p_holder)
    returning 1
  )
  select exists (select 1 from taken)
$$;
create function public.release_anchor_lease(p_holder text) returns void
language sql security definer set search_path = '' as $$
  update public.anchor_job_lease set locked_until = '-infinity' where id = 1 and holder = p_holder
$$;
revoke all on function public.acquire_anchor_lease(text, int), public.release_anchor_lease(text)
  from public, anon, authenticated;
grant execute on function public.acquire_anchor_lease(text, int), public.release_anchor_lease(text) to service_role;

revoke all on function app.guard_sealed_record(), app.guard_anchor_batch() from public, anon, authenticated;
