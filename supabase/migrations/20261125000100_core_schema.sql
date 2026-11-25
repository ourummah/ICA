-- M1: core schema for ICA (SPEC.md section 6).
-- Every site-scoped table carries site_id, and composite foreign keys on (id, site_id)
-- make sure a child row can never point at a parent in a different site.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.org_type as enum ('processor', 'contractor');
create type public.member_role as enum ('cleaner', 'supervisor', 'qa', 'site_admin', 'contractor_admin');
create type public.risk_level as enum ('high', 'medium', 'low');
create type public.chemical_type as enum ('alkaline', 'acid', 'chlorinated', 'sanitiser', 'other');
create type public.ssop_status as enum ('draft', 'active', 'retired');
create type public.step_type as enum (
  'prepare_isolate', 'dry_clean', 'pre_rinse', 'foam', 'dwell', 'scrub',
  'rinse', 'inspect', 'sanitise', 'atp_check', 'reassemble'
);
create type public.task_status as enum ('pending', 'in_progress', 'completed', 'reclean_required', 'verified');
create type public.step_result as enum ('done', 'skipped', 'failed');
create type public.translation_source as enum ('ai', 'human');
create type public.exception_type as enum (
  'missed_step', 'dwell_short', 'atp_fail', 'reclean', 'photo_flag', 'clock_skew', 'late_sync'
);
create type public.exception_severity as enum ('red', 'amber');
create type public.exception_status as enum ('open', 'resolved');
create type public.inspection_result as enum ('pass', 'fail');
create type public.release_decision as enum ('released', 'held');
create type public.ui_language as enum ('en', 'tl', 'id');

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  type public.org_type not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  address text,
  timezone text not null default 'Australia/Sydney',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.sites (org_id);

-- A profile is a person. Staff have an auth user; PIN-only cleaners do not.
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  display_name text not null check (length(trim(display_name)) > 0),
  preferred_language public.ui_language not null default 'en',
  photo_url text,
  consent_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_access (
  site_id uuid not null references public.sites (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (site_id, org_id)
);
create index on public.site_access (org_id);

-- site_id null = the role applies to every site the org owns (processor) or has access to (contractor).
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  site_id uuid references public.sites (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (profile_id, org_id, site_id, role)
);
create index on public.memberships (profile_id);
create index on public.memberships (site_id);

-- Cleaner PIN hashes live apart from profiles so they are never readable through the API.
create table public.cleaner_pins (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

-- A registered shared device signs in as its own auth user, scoped to one site.
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  label text not null,
  registered_by uuid references public.profiles (id) on delete set null,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, site_id)
);
create index on public.devices (site_id);

-- ---------------------------------------------------------------------------
-- Site setup
-- ---------------------------------------------------------------------------
create table public.zones (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  name text not null,
  risk_level public.risk_level not null default 'medium',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, site_id)
);
create index on public.zones (site_id);

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null,
  site_id uuid not null references public.sites (id) on delete cascade,
  name text not null,
  photo_url text,
  teardown_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, site_id),
  foreign key (zone_id, site_id) references public.zones (id, site_id) on delete cascade
);
create index on public.equipment (site_id);
create index on public.equipment (zone_id);

create table public.chemicals (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  name text not null,
  type public.chemical_type not null,
  default_dilution text,
  sds_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, site_id)
);
create index on public.chemicals (site_id);

create table public.ssops (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null,
  site_id uuid not null references public.sites (id) on delete cascade,
  version int not null check (version > 0),
  status public.ssop_status not null default 'draft',
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, site_id),
  unique (equipment_id, version),
  foreign key (equipment_id, site_id) references public.equipment (id, site_id) on delete cascade
);
create unique index ssops_one_active_per_equipment on public.ssops (equipment_id) where status = 'active';
create index on public.ssops (site_id);

create table public.ssop_steps (
  id uuid primary key default gen_random_uuid(),
  ssop_id uuid not null,
  site_id uuid not null references public.sites (id) on delete cascade,
  step_no int not null check (step_no > 0),
  step_type public.step_type not null,
  title_en text not null,
  instructions_en text not null default '',
  icon text,
  chemical_id uuid,
  dilution text,
  dwell_minutes int check (dwell_minutes is null or dwell_minutes > 0),
  photo_required boolean not null default false,
  atp_required boolean not null default false,
  atp_pass_max int check (atp_pass_max is null or atp_pass_max >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, site_id),
  unique (ssop_id, step_no) deferrable initially deferred,
  foreign key (ssop_id, site_id) references public.ssops (id, site_id) on delete cascade,
  foreign key (chemical_id, site_id) references public.chemicals (id, site_id),
  check (not atp_required or atp_pass_max is not null)
);
create index on public.ssop_steps (site_id);

-- ---------------------------------------------------------------------------
-- Shifts and tasks
-- ---------------------------------------------------------------------------
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  shift_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, site_id)
);
create index on public.shifts (site_id, shift_date);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null,
  site_id uuid not null references public.sites (id) on delete cascade,
  equipment_id uuid not null,
  ssop_id uuid not null,
  assigned_profile_id uuid references public.profiles (id) on delete set null,
  status public.task_status not null default 'pending',
  reclean_of_task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, site_id),
  foreign key (shift_id, site_id) references public.shifts (id, site_id) on delete cascade,
  foreign key (equipment_id, site_id) references public.equipment (id, site_id) on delete cascade,
  foreign key (ssop_id, site_id) references public.ssops (id, site_id)
);
create index on public.tasks (site_id, shift_id);
create index on public.tasks (assigned_profile_id);

-- ---------------------------------------------------------------------------
-- Records (append-only; see integrity migration)
-- ---------------------------------------------------------------------------
create table public.step_records (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  ssop_step_id uuid not null,
  site_id uuid not null references public.sites (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  device_id uuid,
  client_record_id uuid not null unique,
  device_started_at timestamptz,
  device_completed_at timestamptz,
  server_received_at timestamptz not null default now(),
  result public.step_result not null,
  skip_reason text,
  note_original text,
  note_language text,
  atp_value int check (atp_value is null or atp_value >= 0),
  timer_started_at timestamptz,
  timer_ended_at timestamptz,
  payload_hash text not null,
  chain_hash text,
  supersedes_id uuid references public.step_records (id),
  created_at timestamptz not null default now(),
  unique (id, site_id),
  foreign key (task_id, site_id) references public.tasks (id, site_id) on delete cascade,
  foreign key (ssop_step_id, site_id) references public.ssop_steps (id, site_id),
  foreign key (device_id, site_id) references public.devices (id, site_id)
);
create index on public.step_records (site_id, task_id);

-- English translations of cleaner notes. Append-only: the newest row wins, the original note
-- on step_records is never touched. A supervisor correction is a new row with source 'human'.
create table public.note_translations (
  id uuid primary key default gen_random_uuid(),
  step_record_id uuid not null,
  site_id uuid not null references public.sites (id) on delete cascade,
  text_en text not null,
  source public.translation_source not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (step_record_id, site_id) references public.step_records (id, site_id) on delete cascade
);
create index on public.note_translations (step_record_id, created_at desc);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  step_record_id uuid not null,
  site_id uuid not null references public.sites (id) on delete cascade,
  client_photo_id uuid not null unique,
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  device_taken_at timestamptz,
  server_received_at timestamptz not null default now(),
  ai_flag jsonb,
  ai_flag_reviewed_by uuid references public.profiles (id),
  ai_flag_review_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (step_record_id, site_id) references public.step_records (id, site_id) on delete cascade
);
create index on public.photos (step_record_id);

create table public.exceptions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  task_id uuid not null,
  step_record_id uuid,
  type public.exception_type not null,
  severity public.exception_severity not null,
  status public.exception_status not null default 'open',
  detail jsonb not null default '{}',
  resolution_note text,
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (task_id, site_id) references public.tasks (id, site_id) on delete cascade,
  foreign key (step_record_id, site_id) references public.step_records (id, site_id) on delete cascade,
  check (status = 'open' or (resolved_by is not null and resolved_at is not null))
);
create index on public.exceptions (site_id, status);

create table public.preop_inspections (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  zone_id uuid not null,
  shift_id uuid not null,
  inspector_profile_id uuid not null references public.profiles (id),
  result public.inspection_result not null,
  items jsonb not null default '[]',
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (zone_id, site_id) references public.zones (id, site_id) on delete cascade,
  foreign key (shift_id, site_id) references public.shifts (id, site_id) on delete cascade
);
create index on public.preop_inspections (site_id, shift_id);

create table public.releases (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  zone_id uuid not null,
  shift_id uuid not null,
  qa_profile_id uuid not null references public.profiles (id),
  decision public.release_decision not null,
  reason text,
  override_open_exceptions boolean not null default false,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (zone_id, site_id) references public.zones (id, site_id) on delete cascade,
  foreign key (shift_id, site_id) references public.shifts (id, site_id) on delete cascade,
  check (decision = 'released' or reason is not null),
  check (not override_open_exceptions or reason is not null)
);
create index on public.releases (site_id, shift_id);

create table public.audit_events (
  seq bigint primary key,
  id uuid not null unique default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  actor_profile_id uuid references public.profiles (id),
  entity text not null,
  entity_id uuid,
  action text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  prev_hash text not null,
  hash text not null
);
create sequence public.audit_events_seq owned by public.audit_events.seq;
create index on public.audit_events (site_id, seq);
create index on public.audit_events (entity, entity_id);

create table public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  email text not null,
  phone text,
  message text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'organisations', 'sites', 'profiles', 'memberships', 'devices', 'zones', 'equipment',
    'chemicals', 'ssops', 'ssop_steps', 'shifts', 'tasks', 'photos', 'exceptions'
  ] loop
    execute format(
      'create trigger touch_updated_at before update on public.%I for each row execute function app.touch_updated_at()',
      t
    );
  end loop;
end;
$$;
