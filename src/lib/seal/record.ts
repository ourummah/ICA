import { randomBytes } from "node:crypto";

import { jcs, sha256Hex } from "./canonical";

export const RECORD_SCHEMA = "ica.audit.v1";

/** One step record as sealed. Times are UTC ISO strings. */
export interface SealedItem {
  step_record_id: string;
  ssop_step_id: string;
  step_no: number;
  step_type: string;
  profile_id: string;
  device_id: string | null;
  result: "done" | "skipped" | "failed";
  skip_reason: string | null;
  note: string | null;
  note_language: string | null;
  atp_value: number | null;
  atp_pass_max: number | null;
  timer_started_at: string | null;
  timer_ended_at: string | null;
  device_started_at: string | null;
  device_completed_at: string | null;
  server_received_at: string;
  payload_hash: string;
  chain_hash: string | null;
  supersedes_step_record_id: string | null;
  photo_hashes: string[];
}

export interface SealedTask {
  task_id: string;
  shift_id: string;
  shift_date: string;
  zone_id: string | null;
  equipment_id: string;
  ssop_id: string;
  ssop_version: number;
  assigned_profile_id: string | null;
  status: string;
  reclean_of_task_id: string | null;
}

export interface SealedChemical {
  step_no: number;
  chemical_id: string;
  product: string;
  dilution: string | null;
}

/** The part of a record that describes the clean itself (what an amendment can change). */
export interface RecordContent {
  task: SealedTask;
  started_at_device: string | null;
  submitted_at_device: string | null;
  received_at_server: string | null;
  items: SealedItem[];
  chemicals: SealedChemical[];
}

/** The canonical audit record (docs/AUDIT_TRAIL.md). Only ids and hashes identify people. */
export interface CanonicalRecord extends RecordContent {
  schema: typeof RECORD_SCHEMA;
  record_id: string;
  record_type: "audit" | "amendment";
  amends_record_hash: string | null;
  site_id: string;
  prev_site_record_hash: string | null;
  sealed_at_server: string;
  nonce: string;
}

/** Raw rows as read from the database, before normalising. */
export interface TaskSource {
  task: Omit<SealedTask, "shift_date" | "zone_id" | "ssop_version"> & {
    site_id: string;
    shift_date: string;
    zone_id: string | null;
    ssop_version: number;
  };
  steps: {
    id: string;
    step_no: number;
    step_type: string;
    atp_pass_max: number | null;
    chemical_id: string | null;
    chemical_name: string | null;
    dilution: string | null;
  }[];
  records: {
    id: string;
    ssop_step_id: string;
    profile_id: string;
    device_id: string | null;
    result: "done" | "skipped" | "failed";
    skip_reason: string | null;
    note_original: string | null;
    note_language: string | null;
    atp_value: number | null;
    timer_started_at: string | null;
    timer_ended_at: string | null;
    device_started_at: string | null;
    device_completed_at: string | null;
    server_received_at: string;
    payload_hash: string;
    chain_hash: string | null;
    supersedes_id: string | null;
    photo_sha256: string | null;
    photo_hashes: string[];
  }[];
}

export function utcIso(t: string): string;
export function utcIso(t: string | null): string | null;
export function utcIso(t: string | null): string | null {
  return t ? new Date(t).toISOString() : null;
}

function minIso(values: (string | null)[]): string | null {
  const v = values.filter((x): x is string => !!x).sort();
  return v[0] ?? null;
}
function maxIso(values: (string | null)[]): string | null {
  const v = values.filter((x): x is string => !!x).sort();
  return v[v.length - 1] ?? null;
}

/** Builds the deterministic content of a record from database rows. */
export function buildContent(src: TaskSource): RecordContent {
  const stepById = new Map(src.steps.map((s) => [s.id, s]));
  const items: SealedItem[] = src.records.map((r) => {
    const step = stepById.get(r.ssop_step_id);
    return {
      step_record_id: r.id,
      ssop_step_id: r.ssop_step_id,
      step_no: step?.step_no ?? 0,
      step_type: step?.step_type ?? "unknown",
      profile_id: r.profile_id,
      device_id: r.device_id,
      result: r.result,
      skip_reason: r.skip_reason,
      note: r.note_original,
      note_language: r.note_language,
      atp_value: r.atp_value,
      atp_pass_max: step?.atp_pass_max ?? null,
      timer_started_at: utcIso(r.timer_started_at),
      timer_ended_at: utcIso(r.timer_ended_at),
      device_started_at: utcIso(r.device_started_at),
      device_completed_at: utcIso(r.device_completed_at),
      server_received_at: utcIso(r.server_received_at),
      payload_hash: r.payload_hash,
      chain_hash: r.chain_hash,
      supersedes_step_record_id: r.supersedes_id,
      photo_hashes: [...new Set([...(r.photo_sha256 ? [r.photo_sha256] : []), ...r.photo_hashes])].sort(),
    };
  });
  items.sort(
    (a, b) =>
      a.step_no - b.step_no ||
      a.server_received_at.localeCompare(b.server_received_at) ||
      a.step_record_id.localeCompare(b.step_record_id),
  );

  const chemicals = src.steps
    .filter((s) => s.chemical_id)
    .sort((a, b) => a.step_no - b.step_no)
    .map((s) => ({
      step_no: s.step_no,
      chemical_id: s.chemical_id as string,
      product: s.chemical_name ?? "",
      dilution: s.dilution,
    }));

  const { site_id: _site, ...task } = src.task;
  void _site;
  return {
    task,
    started_at_device: minIso(items.map((i) => i.device_started_at)),
    submitted_at_device: maxIso(items.map((i) => i.device_completed_at)),
    received_at_server: maxIso(items.map((i) => i.server_received_at)),
    items,
    chemicals,
  };
}

export function contentHash(content: RecordContent): string {
  return sha256Hex(jcs(content));
}

export function buildRecord(args: {
  content: RecordContent;
  siteId: string;
  recordId: string;
  prevSiteRecordHash: string | null;
  amendsRecordHash: string | null;
  sealedAt: Date;
  nonce?: string;
}): CanonicalRecord {
  return {
    schema: RECORD_SCHEMA,
    record_id: args.recordId,
    record_type: args.amendsRecordHash ? "amendment" : "audit",
    amends_record_hash: args.amendsRecordHash,
    site_id: args.siteId,
    prev_site_record_hash: args.prevSiteRecordHash,
    sealed_at_server: args.sealedAt.toISOString(),
    nonce: args.nonce ?? randomBytes(32).toString("hex"),
    ...args.content,
  };
}

/** record_hash = sha256(utf8(JCS(record))). */
export function recordHash(record: CanonicalRecord | unknown): string {
  return sha256Hex(jcs(record));
}

/** Step results that still stand (not superseded by a later record). */
export function currentItems(items: SealedItem[]): SealedItem[] {
  const superseded = new Set(items.map((i) => i.supersedes_step_record_id).filter(Boolean));
  return items.filter((i) => !superseded.has(i.step_record_id));
}
