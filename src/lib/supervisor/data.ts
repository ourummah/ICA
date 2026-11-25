import "server-only";

import type { AdminContext } from "@/lib/admin/context";
import type { Database } from "@/lib/database.types";

import type { BoardException } from "./board";

type Supabase = AdminContext["supabase"];
type Enums = Database["public"]["Enums"];

export interface ShiftInfo {
  id: string;
  shiftDate: string;
  startsAt: string;
  endsAt: string;
}

export interface DashboardTask {
  id: string;
  status: Enums["task_status"];
  equipmentId: string;
  equipmentName: string;
  zoneId: string;
  assignedName: string | null;
  recleanOfTaskId: string | null;
  updatedAt: string;
}

export interface DashboardException extends BoardException {
  id: string;
  type: Enums["exception_type"];
  detail: unknown;
  stepRecordId: string | null;
  createdAt: string;
  resolutionNote: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
}

/** Tonight's shift: the earliest one that hasn't been over for more than 12 hours. */
export async function currentShift(supabase: Supabase, siteId: string): Promise<ShiftInfo | null> {
  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("shifts")
    .select("id, shift_date, starts_at, ends_at")
    .eq("site_id", siteId)
    .gt("ends_at", since)
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  return data
    ? { id: data.id, shiftDate: data.shift_date, startsAt: data.starts_at, endsAt: data.ends_at }
    : null;
}

export async function loadShiftTasks(supabase: Supabase, shiftId: string): Promise<DashboardTask[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, status, equipment_id, reclean_of_task_id, updated_at, equipment(name, zone_id), profiles!tasks_assigned_profile_id_fkey(display_name)",
    )
    .eq("shift_id", shiftId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id,
    status: t.status,
    equipmentId: t.equipment_id,
    equipmentName: t.equipment?.name ?? "",
    zoneId: t.equipment?.zone_id ?? "",
    assignedName: t.profiles?.display_name ?? null,
    recleanOfTaskId: t.reclean_of_task_id,
    updatedAt: t.updated_at,
  }));
}

export async function loadExceptions(
  supabase: Supabase,
  filter: { siteId: string; taskIds?: string[]; status?: Enums["exception_status"] },
): Promise<DashboardException[]> {
  let q = supabase
    .from("exceptions")
    .select(
      "id, task_id, step_record_id, type, severity, status, detail, created_at, resolution_note, resolved_at, profiles!exceptions_resolved_by_fkey(display_name)",
    )
    .eq("site_id", filter.siteId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (filter.taskIds)
    q = q.in("task_id", filter.taskIds.length ? filter.taskIds : ["00000000-0000-0000-0000-000000000000"]);
  if (filter.status) q = q.eq("status", filter.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((e) => ({
    id: e.id,
    taskId: e.task_id,
    stepRecordId: e.step_record_id,
    type: e.type,
    severity: e.severity,
    status: e.status,
    detail: e.detail,
    createdAt: e.created_at,
    resolutionNote: e.resolution_note,
    resolvedAt: e.resolved_at,
    resolvedByName: e.profiles?.display_name ?? null,
  }));
}

/** Short-lived signed URLs for photos in the private bucket (SPEC 11). */
export async function signPhotoUrls(supabase: Supabase, paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const { data } = await supabase.storage.from("photos").createSignedUrls(paths, 300);
  for (const row of data ?? []) if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  return out;
}
