import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import type { StepRecordPayload } from "@/lib/records/payload";
import type { SyncOutcome } from "@/lib/records/sync-schemas";

import { IcaDb } from "./db";
import { pendingCount, saveStepLocally } from "./outbox";
import { backoffMs, flushOutbox, type SyncTransport } from "./sync";

function payload(n: number, overrides: Partial<StepRecordPayload> = {}): StepRecordPayload {
  return {
    client_record_id: crypto.randomUUID(),
    task_id: "6f1c8e1e-6a0e-4b8e-9a59-0d8f4b6a1c02",
    ssop_step_id: `6f1c8e1e-6a0e-4b8e-9a59-0d8f4b6a1c${String(n).padStart(2, "0")}`,
    profile_id: "6f1c8e1e-6a0e-4b8e-9a59-0d8f4b6a1c04",
    result: "done",
    skip_reason: null,
    note_original: null,
    note_language: null,
    atp_value: null,
    timer_started_at: null,
    timer_ended_at: null,
    device_started_at: "2026-11-25T12:00:00.000Z",
    device_completed_at: "2026-11-25T12:01:00.000Z",
    supersedes_client_record_id: null,
    ...overrides,
  };
}

const photo = (id = crypto.randomUUID()) => ({
  clientPhotoId: id,
  blob: new Blob(["jpeg"]),
  sha256: "a".repeat(64),
  takenAt: "2026-11-25T12:00:30.000Z",
  previewUrl: "",
});

/** A fake server that remembers what it stored, like the real idempotent routes. */
function fakeServer() {
  const records = new Set<string>();
  const photos = new Set<string>();
  let online = true;
  const transport: SyncTransport = {
    async postRecords(batch) {
      if (!online) throw new Error("offline");
      return batch.map(({ payload: p }): SyncOutcome => {
        const id = (p as StepRecordPayload).client_record_id;
        if (records.has(id)) return { client_record_id: id, status: "duplicate" };
        records.add(id);
        return { client_record_id: id, status: "saved" };
      });
    },
    async postPhoto(meta) {
      if (!online) throw new Error("offline");
      if (!records.has(meta.client_record_id)) return "retry";
      if (photos.has(meta.client_photo_id)) return "duplicate";
      photos.add(meta.client_photo_id);
      return "saved";
    },
  };
  return { transport, records, photos, setOnline: (v: boolean) => (online = v) };
}

let db: IcaDb;
beforeEach(async () => {
  db = new IcaDb(`test-${crypto.randomUUID()}`);
  await db.open();
});

describe("outbox", () => {
  it("keeps every step on the device while offline and counts what is waiting", async () => {
    const server = fakeServer();
    server.setOnline(false);
    await saveStepLocally(db, payload(1), photo());
    await saveStepLocally(db, payload(2), null);
    expect(await pendingCount(db)).toBe(3);
    await expect(flushOutbox(db, server.transport)).rejects.toThrow("offline");
    expect(await pendingCount(db)).toBe(3);
  });

  it("syncs records then photos when back online, with no duplicates on retry", async () => {
    const server = fakeServer();
    for (let i = 1; i <= 10; i++) await saveStepLocally(db, payload(i), i % 4 === 1 ? photo() : null);
    const first = await flushOutbox(db, server.transport);
    expect(first).toEqual({ synced: 13, rejected: 0, remaining: 0 });
    expect(server.records.size).toBe(10);
    expect(server.photos.size).toBe(3);

    // Pretend the device never heard back and retries everything: the server ignores repeats.
    await db.records.toCollection().modify({ status: "pending" });
    await flushOutbox(db, server.transport);
    expect(server.records.size).toBe(10);
  });

  it("marks a record the server rejects, and stops counting it as waiting", async () => {
    const transport: SyncTransport = {
      postRecords: async (batch) =>
        batch.map((b) => ({
          client_record_id: (b.payload as StepRecordPayload).client_record_id,
          status: "rejected" as const,
          error: "payload_hash mismatch",
        })),
      postPhoto: async () => "saved",
    };
    const rec = await saveStepLocally(db, payload(1), null);
    expect(await flushOutbox(db, transport)).toEqual({ synced: 0, rejected: 1, remaining: 0 });
    expect((await db.records.get(rec.clientRecordId))?.status).toBe("rejected");
  });

  it("frees photo storage after upload but keeps the record", async () => {
    const server = fakeServer();
    const p = photo();
    await saveStepLocally(db, payload(1), p);
    await flushOutbox(db, server.transport);
    const stored = await db.photos.get(p.clientPhotoId);
    expect(stored?.status).toBe("synced");
    expect(stored?.blob).toBeNull();
    expect(await db.records.count()).toBe(1);
  });
});

describe("backoff", () => {
  it("doubles from 5 seconds and caps at 5 minutes", () => {
    expect([1, 2, 3, 10].map(backoffMs)).toEqual([5_000, 10_000, 20_000, 300_000]);
  });
});
