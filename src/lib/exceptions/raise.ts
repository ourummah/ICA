import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import type { StepRecordPayload } from "@/lib/records/payload";
import { createAdminClient } from "@/lib/supabase/admin";

import { clockSkew, evaluateStepRecord } from "./engine";

export interface SavedRecord {
  id: string;
  siteId: string;
  payload: StepRecordPayload;
}

/**
 * Runs the SPEC F4 rules over records the sync route just saved and inserts the exceptions.
 * Steps are read with the device's own client (so RLS applies); exceptions are written with the
 * service role because no app user may create them directly. A unique index keeps it to one
 * exception of each type per step record.
 */
export async function raiseExceptions(
  supabase: SupabaseClient<Database>,
  saved: SavedRecord[],
  opts: { deviceTime?: string; serverTime: Date; secondsPerDwellMinute: number },
): Promise<number> {
  const stepIds = [...new Set(saved.map((r) => r.payload.ssop_step_id))];
  const { data: steps, error } = await supabase
    .from("ssop_steps")
    .select("id, step_type, dwell_minutes, atp_required, atp_pass_max")
    .in("id", stepIds);
  if (error) throw error;
  const byId = new Map((steps ?? []).map((s) => [s.id, s]));

  const rows: Database["public"]["Tables"]["exceptions"]["Insert"][] = [];
  for (const r of saved) {
    const step = byId.get(r.payload.ssop_step_id);
    if (!step) continue;
    for (const d of evaluateStepRecord(step, r.payload, opts.secondsPerDwellMinute)) {
      rows.push({ site_id: r.siteId, task_id: r.payload.task_id, step_record_id: r.id, ...d });
    }
  }

  // Clock skew is a property of the device, not of each step: one per task in the batch.
  const skew = clockSkew(opts.deviceTime, opts.serverTime);
  if (skew) {
    const firstPerTask = new Map<string, SavedRecord>();
    for (const r of saved) if (!firstPerTask.has(r.payload.task_id)) firstPerTask.set(r.payload.task_id, r);
    for (const r of firstPerTask.values())
      rows.push({ site_id: r.siteId, task_id: r.payload.task_id, step_record_id: r.id, ...skew });
  }

  if (!rows.length) return 0;
  const { error: insertError } = await createAdminClient().from("exceptions").insert(rows);
  if (insertError) throw insertError;
  return rows.length;
}
