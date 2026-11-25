import { z } from "zod";

const isoTime = z.iso.datetime({ offset: true });

/**
 * A step record as the device creates it. The device hashes exactly these fields (canonical
 * JSON, sorted keys) and the server recomputes the hash before accepting it (SPEC 6, rule 3).
 */
export const stepRecordPayloadSchema = z.object({
  client_record_id: z.uuid(),
  task_id: z.uuid(),
  ssop_step_id: z.uuid(),
  profile_id: z.uuid(),
  result: z.enum(["done", "skipped", "failed"]),
  skip_reason: z.string().max(200).nullable(),
  note_original: z.string().max(2000).nullable(),
  note_language: z.enum(["en", "tl", "id"]).nullable(),
  atp_value: z.number().int().min(0).max(1_000_000).nullable(),
  timer_started_at: isoTime.nullable(),
  timer_ended_at: isoTime.nullable(),
  device_started_at: isoTime,
  device_completed_at: isoTime,
  supersedes_client_record_id: z.uuid().nullable(),
});

export type StepRecordPayload = z.infer<typeof stepRecordPayloadSchema>;

/** JSON with object keys sorted at every level, so the same data always gives the same text. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export async function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function payloadHash(payload: StepRecordPayload): Promise<string> {
  return sha256Hex(canonicalJson(payload));
}
