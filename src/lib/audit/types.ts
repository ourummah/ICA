import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];

export interface PackFilter {
  from: string; // shift_date, YYYY-MM-DD
  to: string;
  zoneIds: string[] | null; // null = all zones
}

export interface PackPhoto {
  path: string;
  sha256: string;
  /** JPEG/PNG bytes for the PDF thumbnail, when loaded. */
  data?: Buffer;
  format?: "jpg" | "png";
}

export interface PackRecord {
  id: string;
  stepNo: number;
  stepTitle: string;
  result: Enums["step_result"];
  skipReason: string | null;
  cleaner: string;
  deviceCompletedAt: string | null;
  serverReceivedAt: string;
  atpValue: number | null;
  atpLimit: number | null;
  timerSeconds: number | null;
  noteOriginal: string | null;
  noteLanguage: string | null;
  noteEn: string | null;
  noteEnSource: Enums["translation_source"] | null;
  photos: PackPhoto[];
  payloadHash: string;
  chainHash: string | null;
  supersedesId: string | null;
}

export interface PackTask {
  id: string;
  shiftId: string;
  shiftDate: string;
  zoneId: string;
  zoneName: string;
  zoneOrder: number;
  equipmentName: string;
  ssopVersion: number | null;
  stepCount: number;
  status: Enums["task_status"];
  assignedName: string | null;
  recleanOfTaskId: string | null;
  records: PackRecord[];
}

export interface PackException {
  id: string;
  taskId: string;
  stepRecordId: string | null;
  type: Enums["exception_type"];
  severity: Enums["exception_severity"];
  status: Enums["exception_status"];
  detail: unknown;
  createdAt: string;
  resolutionNote: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface PackPreop {
  zoneId: string;
  shiftId: string;
  result: Enums["inspection_result"];
  completedAt: string;
  inspector: string;
  items: { label: string; pass: boolean; note: string | null; photo_path: string | null }[];
}

export interface PackRelease {
  zoneId: string;
  shiftId: string;
  decision: Enums["release_decision"];
  reason: string | null;
  override: boolean;
  decidedAt: string;
  by: string;
}

export interface AuditPack {
  site: { id: string; name: string; timezone: string };
  filter: PackFilter;
  zoneNames: string[];
  generatedAt: string;
  generatedBy: string;
  shifts: { id: string; shiftDate: string; startsAt: string; endsAt: string }[];
  zones: { id: string; name: string; sortOrder: number }[];
  tasks: PackTask[];
  exceptions: PackException[];
  preops: PackPreop[];
  releases: PackRelease[];
  chain: { records: number; breaks: number; firstBreakSeq: number | null; verified: boolean };
}
