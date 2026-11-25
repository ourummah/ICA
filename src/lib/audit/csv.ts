import type { AuditPack } from "./types";

/** RFC 4180 field: quoted when needed, quotes doubled. Leading =+-@ are prefixed to stop spreadsheet formulas. */
export function csvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export const CSV_COLUMNS = [
  "shift_date",
  "zone",
  "equipment",
  "task_id",
  "reclean_of_task_id",
  "ssop_version",
  "step_no",
  "step_title",
  "result",
  "skip_reason",
  "cleaner",
  "device_completed_at_utc",
  "server_received_at_utc",
  "atp_value",
  "atp_limit",
  "timer_seconds",
  "note_original",
  "note_language",
  "note_en",
  "note_en_source",
  "photo_sha256",
  "record_id",
  "supersedes_record_id",
  "payload_hash",
  "chain_hash",
] as const;

/** Every step record in the pack, one row each (SPEC F7). Times are UTC ISO 8601. */
export function packToCsv(pack: AuditPack): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const t of pack.tasks) {
    for (const r of t.records) {
      const row: (string | number | null)[] = [
        t.shiftDate,
        t.zoneName,
        t.equipmentName,
        t.id,
        t.recleanOfTaskId,
        t.ssopVersion,
        r.stepNo,
        r.stepTitle,
        r.result,
        r.skipReason,
        r.cleaner,
        r.deviceCompletedAt,
        r.serverReceivedAt,
        r.atpValue,
        r.atpLimit,
        r.timerSeconds,
        r.noteOriginal,
        r.noteLanguage,
        r.noteEn,
        r.noteEnSource,
        r.photos.map((p) => p.sha256).join(" "),
        r.id,
        r.supersedesId,
        r.payloadHash,
        r.chainHash,
      ];
      lines.push(row.map(csvField).join(","));
    }
  }
  return lines.join("\r\n") + "\r\n";
}
