import { NextResponse } from "next/server";

import { getDevice } from "@/lib/device/server";
import { payloadHash } from "@/lib/records/payload";
import { stepRecordBatchSchema, type SyncOutcome } from "@/lib/records/sync-schemas";

/**
 * Accepts step records from a registered device. Safe to retry: records are keyed by
 * client_record_id, and one that already exists is reported as a duplicate, not inserted again.
 */
export async function POST(request: Request) {
  const ctx = await getDevice();
  if (!ctx) return NextResponse.json({ error: "Not a registered device" }, { status: 401 });
  const { supabase, device } = ctx;

  const parsed = stepRecordBatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid batch", issues: parsed.error.issues }, { status: 400 });

  const outcomes: SyncOutcome[] = [];
  for (const { payload, payload_hash } of parsed.data.records) {
    const id = payload.client_record_id;
    if ((await payloadHash(payload)) !== payload_hash) {
      outcomes.push({ client_record_id: id, status: "rejected", error: "payload_hash mismatch" });
      continue;
    }

    const { data: existing } = await supabase
      .from("step_records")
      .select("id")
      .eq("client_record_id", id)
      .maybeSingle();
    if (existing) {
      outcomes.push({ client_record_id: id, status: "duplicate" });
      continue;
    }

    let supersedesId: string | null = null;
    if (payload.supersedes_client_record_id) {
      const { data: prior } = await supabase
        .from("step_records")
        .select("id")
        .eq("client_record_id", payload.supersedes_client_record_id)
        .maybeSingle();
      if (!prior) {
        outcomes.push({
          client_record_id: id,
          status: "rejected",
          error: "superseded record not synced yet",
        });
        continue;
      }
      supersedesId = prior.id;
    }

    const { error } = await supabase.from("step_records").insert({
      client_record_id: id,
      task_id: payload.task_id,
      ssop_step_id: payload.ssop_step_id,
      profile_id: payload.profile_id,
      site_id: device.siteId,
      device_id: device.id,
      result: payload.result,
      skip_reason: payload.skip_reason,
      note_original: payload.note_original,
      note_language: payload.note_language,
      atp_value: payload.atp_value,
      timer_started_at: payload.timer_started_at,
      timer_ended_at: payload.timer_ended_at,
      device_started_at: payload.device_started_at,
      device_completed_at: payload.device_completed_at,
      payload_hash,
      supersedes_id: supersedesId,
    });
    if (!error) outcomes.push({ client_record_id: id, status: "saved" });
    else if (error.code === "23505") outcomes.push({ client_record_id: id, status: "duplicate" });
    else outcomes.push({ client_record_id: id, status: "rejected", error: error.message });
  }

  return NextResponse.json({ outcomes, server_time: new Date().toISOString() });
}
