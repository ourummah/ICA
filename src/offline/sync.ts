import type { SyncOutcome } from "@/lib/records/sync-schemas";

import type { IcaDb } from "./db";

export interface SyncTransport {
  postRecords(batch: { payload: unknown; payload_hash: string }[]): Promise<SyncOutcome[]>;
  postPhoto(meta: Record<string, string>, blob: Blob): Promise<"saved" | "duplicate" | "retry" | "rejected">;
}

/** Talks to the sync routes. Throws on network failure so the caller backs off. */
export const httpTransport: SyncTransport = {
  async postRecords(batch) {
    const res = await fetch("/api/sync/step-records", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ records: batch, device_time: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(`step-records ${res.status}`);
    return ((await res.json()) as { outcomes: SyncOutcome[] }).outcomes;
  },
  async postPhoto(meta, blob) {
    const form = new FormData();
    form.set("meta", JSON.stringify(meta));
    form.set("file", blob, `${meta.client_photo_id}.jpg`);
    const res = await fetch("/api/sync/photos", { method: "POST", body: form });
    if (res.status === 409) return "retry";
    if (res.status === 422) return "rejected";
    if (!res.ok) throw new Error(`photos ${res.status}`);
    return ((await res.json()) as { status: "saved" | "duplicate" }).status;
  },
};

export interface FlushResult {
  synced: number;
  rejected: number;
  remaining: number;
}

const BATCH = 50;

/**
 * Sends everything waiting in the outbox, oldest first: records, then the photos of records the
 * server has. Every request is idempotent, so a flush interrupted half-way is safe to repeat.
 */
export async function flushOutbox(db: IcaDb, transport: SyncTransport = httpTransport): Promise<FlushResult> {
  let synced = 0;
  let rejected = 0;

  for (;;) {
    const pending = await db.records.where("status").equals("pending").sortBy("createdAt");
    if (!pending.length) break;
    const batch = pending.slice(0, BATCH);
    const outcomes = await transport.postRecords(
      batch.map((r) => ({ payload: r.payload, payload_hash: r.payloadHash })),
    );
    const byId = new Map(outcomes.map((o) => [o.client_record_id, o]));
    let progressed = false;
    await db.transaction("rw", db.records, async () => {
      for (const r of batch) {
        const o = byId.get(r.clientRecordId);
        if (!o) continue;
        if (o.status === "rejected") {
          // A record that supersedes one not yet synced is retried on the next pass.
          if (o.error.includes("not synced yet")) {
            await db.records.update(r.clientRecordId, { attempts: r.attempts + 1, error: o.error });
            continue;
          }
          await db.records.update(r.clientRecordId, {
            status: "rejected",
            attempts: r.attempts + 1,
            error: o.error,
          });
          rejected++;
        } else {
          await db.records.update(r.clientRecordId, {
            status: "synced",
            attempts: r.attempts + 1,
            error: undefined,
          });
          synced++;
        }
        progressed = true;
      }
    });
    if (!progressed || batch.length < BATCH) break;
  }

  const photos = await db.photos.where("status").equals("pending").sortBy("createdAt");
  for (const p of photos) {
    const parent = await db.records.get(p.clientRecordId);
    if (parent?.status !== "synced" || !p.blob) continue;
    const result = await transport.postPhoto(
      {
        client_photo_id: p.clientPhotoId,
        client_record_id: p.clientRecordId,
        sha256: p.sha256,
        device_taken_at: p.takenAt,
      },
      p.blob,
    );
    if (result === "saved" || result === "duplicate") {
      // The server holds the verified original; free the space on the device.
      await db.photos.update(p.clientPhotoId, { status: "synced", blob: null, attempts: p.attempts + 1 });
      synced++;
    } else if (result === "rejected") {
      await db.photos.update(p.clientPhotoId, {
        status: "rejected",
        attempts: p.attempts + 1,
        error: "sha256 mismatch",
      });
      rejected++;
    } else {
      await db.photos.update(p.clientPhotoId, { attempts: p.attempts + 1 });
    }
  }

  const remaining =
    (await db.records.where("status").equals("pending").count()) +
    (await db.photos.where("status").equals("pending").count());
  return { synced, rejected, remaining };
}

/** Delay before the next retry after `failures` consecutive failed flushes: 5 s doubling to 5 min. */
export function backoffMs(failures: number): number {
  return Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, failures - 1));
}
