import { payloadHash, sha256Hex, type StepRecordPayload } from "@/lib/records/payload";
import type { SyncOutcome } from "@/lib/records/sync-schemas";

export interface CapturedPhoto {
  clientPhotoId: string;
  blob: Blob;
  sha256: string;
  takenAt: string;
  previewUrl: string;
}

/** Compresses a camera image to at most 1600px on the long edge, JPEG ~0.7 (SPEC 7). */
export async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not compress photo"))), "image/jpeg", 0.7),
  );
}

export async function capturePhoto(file: File): Promise<CapturedPhoto> {
  const blob = await compressPhoto(file);
  return {
    clientPhotoId: crypto.randomUUID(),
    blob,
    sha256: await sha256Hex(await blob.arrayBuffer()),
    takenAt: new Date().toISOString(),
    previewUrl: URL.createObjectURL(blob),
  };
}

export async function submitStepRecord(payload: StepRecordPayload): Promise<SyncOutcome> {
  const res = await fetch("/api/sync/step-records", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ records: [{ payload, payload_hash: await payloadHash(payload) }] }),
  });
  if (!res.ok) throw new Error(`Sync failed (${res.status})`);
  const body = (await res.json()) as { outcomes: SyncOutcome[] };
  const outcome = body.outcomes[0];
  if (outcome.status === "rejected") throw new Error(outcome.error);
  return outcome;
}

export async function uploadPhoto(photo: CapturedPhoto, clientRecordId: string): Promise<void> {
  const form = new FormData();
  form.set(
    "meta",
    JSON.stringify({
      client_photo_id: photo.clientPhotoId,
      client_record_id: clientRecordId,
      sha256: photo.sha256,
      device_taken_at: photo.takenAt,
    }),
  );
  form.set("file", photo.blob, `${photo.clientPhotoId}.jpg`);
  const res = await fetch("/api/sync/photos", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Photo upload failed (${res.status})`);
}
