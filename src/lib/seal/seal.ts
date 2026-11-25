import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

import { jcs } from "./canonical";
import { buildContent, buildRecord, contentHash, type TaskSource } from "./record";

type Db = SupabaseClient<Database>;

/** Loads everything a task's sealed record contains. Service-role client. */
export async function loadTaskSource(db: Db, taskId: string): Promise<TaskSource | null> {
  const { data: task, error } = await db
    .from("tasks")
    .select(
      `id, site_id, shift_id, status, equipment_id, ssop_id, assigned_profile_id, reclean_of_task_id,
       shifts(shift_date), equipment(zone_id),
       ssops(version, ssop_steps(id, step_no, step_type, atp_pass_max, chemical_id, dilution, chemicals(name)))`,
    )
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw new Error(`load task ${taskId}: ${error.message}`);
  if (!task) return null;

  const { data: records, error: recErr } = await db
    .from("step_records")
    .select(
      `id, ssop_step_id, profile_id, device_id, result, skip_reason, note_original, note_language, atp_value,
       timer_started_at, timer_ended_at, device_started_at, device_completed_at, server_received_at,
       payload_hash, chain_hash, supersedes_id, photo_sha256, photos(sha256)`,
    )
    .eq("task_id", taskId);
  if (recErr) throw new Error(`load records ${taskId}: ${recErr.message}`);

  return {
    task: {
      task_id: task.id,
      site_id: task.site_id,
      shift_id: task.shift_id,
      shift_date: task.shifts?.shift_date ?? "",
      zone_id: task.equipment?.zone_id ?? null,
      equipment_id: task.equipment_id,
      ssop_id: task.ssop_id,
      ssop_version: task.ssops?.version ?? 0,
      assigned_profile_id: task.assigned_profile_id,
      status: task.status,
      reclean_of_task_id: task.reclean_of_task_id,
    },
    steps: (task.ssops?.ssop_steps ?? []).map((s) => ({
      id: s.id,
      step_no: s.step_no,
      step_type: s.step_type,
      atp_pass_max: s.atp_pass_max,
      chemical_id: s.chemical_id,
      chemical_name: s.chemicals?.name ?? null,
      dilution: s.dilution,
    })),
    records: (records ?? []).map((r) => ({ ...r, photo_hashes: r.photos.map((p) => p.sha256) })),
  };
}

export type SealOutcome = "sealed" | "amended" | "unchanged" | "skipped";

/**
 * Seals one task: an original record if it has none, otherwise an amendment when its content has
 * changed since the latest seal. The database checks the site chain and computes the hash; when
 * another seal for the site got in first, this rebuilds against the new head and tries again.
 */
export async function sealTask(db: Db, taskId: string, now = () => new Date()): Promise<SealOutcome> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const src = await loadTaskSource(db, taskId);
    if (!src || !src.records.length) return "skipped";
    const siteId = src.task.site_id;
    const content = buildContent(src);
    const cHash = contentHash(content);

    const [{ data: head }, { data: latest }] = await Promise.all([
      db
        .from("sealed_records")
        .select("record_hash")
        .eq("site_id", siteId)
        .order("site_seq", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("sealed_records")
        .select("record_hash, content_hash")
        .eq("task_id", taskId)
        .order("site_seq", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (latest && latest.content_hash === cHash) return "unchanged";

    const record = buildRecord({
      content,
      siteId,
      recordId: randomUUID(),
      prevSiteRecordHash: head?.record_hash ?? null,
      amendsRecordHash: latest?.record_hash ?? null,
      sealedAt: now(),
    });
    const { error } = await db.rpc("seal_record", { p_canonical: jcs(record), p_content_hash: cHash });
    if (!error) return latest ? "amended" : "sealed";
    // 40001: the chain head moved; 23505: someone else sealed this task first. Rebuild and retry.
    if (error.code !== "40001" && error.code !== "23505") throw new Error(`seal ${taskId}: ${error.message}`);
  }
  throw new Error(`seal ${taskId}: gave up after repeated chain conflicts`);
}

/** Seals every finished clean that needs it (optionally for one site). Never throws per task. */
export async function sealPendingRecords(
  db: Db,
  opts: { siteId?: string; limit?: number } = {},
): Promise<{ sealed: number; amended: number; failed: number }> {
  const { data, error } = await db.rpc("tasks_needing_seal", {
    p_site_id: opts.siteId,
    p_limit: opts.limit ?? 200,
  });
  if (error) throw new Error(`tasks_needing_seal: ${error.message}`);
  const out = { sealed: 0, amended: 0, failed: 0 };
  for (const t of data ?? []) {
    try {
      const r = await sealTask(db, t.task_id);
      if (r === "sealed") out.sealed++;
      if (r === "amended") out.amended++;
    } catch (e) {
      out.failed++;
      console.error("sealing failed", t.task_id, e instanceof Error ? e.message : e);
    }
  }
  return out;
}
