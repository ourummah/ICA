import type { Database } from "@/lib/database.types";
import type { Locale } from "@/lib/i18n";

type Enums = Database["public"]["Enums"];

export interface DeviceInfo {
  id: string;
  siteId: string;
  label: string;
  siteName: string;
  timezone: string;
}

export interface Cleaner {
  profileId: string;
  displayName: string;
  language: Locale;
  hasConsented: boolean;
}

export interface Step {
  id: string;
  stepNo: number;
  type: Enums["step_type"];
  title: string;
  instructions: string;
  icon: string | null;
  chemicalName: string | null;
  dilution: string | null;
  dwellMinutes: number | null;
  photoRequired: boolean;
  atpRequired: boolean;
  atpPassMax: number | null;
}

export interface Task {
  id: string;
  status: Enums["task_status"];
  assignedProfileId: string | null;
  equipmentName: string;
  equipmentPhotoUrl: string | null;
  zoneName: string;
  riskLevel: Enums["risk_level"];
  zoneOrder: number;
  steps: Step[];
}

export interface RecordSummary {
  clientRecordId: string;
  taskId: string;
  stepId: string;
  result: Enums["step_result"];
  atpValue: number | null;
}

export interface CleanerData {
  shift: { id: string; startsAt: string; endsAt: string } | null;
  tasks: Task[];
  records: RecordSummary[];
}
