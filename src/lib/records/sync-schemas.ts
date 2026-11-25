import { z } from "zod";

import { stepRecordPayloadSchema } from "./payload";

export const stepRecordBatchSchema = z.object({
  records: z
    .array(z.object({ payload: stepRecordPayloadSchema, payload_hash: z.string().regex(/^[0-9a-f]{64}$/) }))
    .min(1)
    .max(100),
  /** The device's clock when it sent the batch, for the clock-skew check. */
  device_time: z.iso.datetime({ offset: true }).optional(),
});

export type SyncOutcome =
  | { client_record_id: string; status: "saved" | "duplicate" }
  | { client_record_id: string; status: "rejected"; error: string };

export const photoMetaSchema = z.object({
  client_photo_id: z.uuid(),
  client_record_id: z.uuid(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  device_taken_at: z.iso.datetime({ offset: true }),
});

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
