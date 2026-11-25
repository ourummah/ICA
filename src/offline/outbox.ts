import { payloadHash, type StepRecordPayload } from "@/lib/records/payload";

import type { CapturedPhoto } from "@/components/cleaner/photo";

import type { IcaDb, LocalRecord } from "./db";

/**
 * Saves a completed step to the device first (SPEC 7). The record and its photo are written in
 * one IndexedDB transaction, so a refresh or app close can never leave half a step behind.
 */
export async function saveStepLocally(
  db: IcaDb,
  payload: StepRecordPayload,
  photo: CapturedPhoto | null,
): Promise<LocalRecord> {
  const record: LocalRecord = {
    clientRecordId: payload.client_record_id,
    createdAt: Date.now(),
    taskId: payload.task_id,
    stepId: payload.ssop_step_id,
    payload,
    payloadHash: await payloadHash(payload),
    status: "pending",
    attempts: 0,
  };
  await db.transaction("rw", db.records, db.photos, async () => {
    await db.records.put(record);
    if (photo) {
      await db.photos.put({
        clientPhotoId: photo.clientPhotoId,
        clientRecordId: payload.client_record_id,
        createdAt: Date.now(),
        blob: photo.blob,
        sha256: photo.sha256,
        takenAt: photo.takenAt,
        status: "pending",
        attempts: 0,
      });
    }
  });
  return record;
}

export async function pendingCount(db: IcaDb): Promise<number> {
  const [records, photos] = await Promise.all([
    db.records.where("status").equals("pending").count(),
    db.photos.where("status").equals("pending").count(),
  ]);
  return records + photos;
}
