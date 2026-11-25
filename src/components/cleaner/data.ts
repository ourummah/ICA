import type { Locale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";

import type { Cleaner, CleanerData, RecordSummary, Task } from "./types";

export async function loadCleaners(): Promise<Cleaner[]> {
  const { data, error } = await createClient().rpc("device_cleaners");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    profileId: c.profile_id,
    displayName: c.display_name,
    language: c.preferred_language as Locale,
    hasConsented: c.has_consented,
  }));
}

/** Tonight's shift (the next one that hasn't ended), its tasks with SSOP steps, and records so far. */
export async function loadCleanerData(siteId: string): Promise<CleanerData> {
  const supabase = createClient();
  const { data: shift } = await supabase
    .from("shifts")
    .select("id, starts_at, ends_at")
    .eq("site_id", siteId)
    .gt("ends_at", new Date().toISOString())
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  if (!shift) return { shift: null, tasks: [], records: [] };

  const { data: taskRows, error } = await supabase
    .from("tasks")
    .select(
      `id, status, assigned_profile_id,
       equipment(name, photo_url, zones(name, risk_level, sort_order)),
       ssops(ssop_steps(id, step_no, step_type, title_en, instructions_en, icon, dilution, dwell_minutes,
         photo_required, atp_required, atp_pass_max, chemicals(name)))`,
    )
    .eq("shift_id", shift.id);
  if (error) throw error;

  const tasks: Task[] = (taskRows ?? []).map((t) => ({
    id: t.id,
    status: t.status,
    assignedProfileId: t.assigned_profile_id,
    equipmentName: t.equipment?.name ?? "",
    equipmentPhotoUrl: t.equipment?.photo_url ?? null,
    zoneName: t.equipment?.zones?.name ?? "",
    riskLevel: t.equipment?.zones?.risk_level ?? "medium",
    zoneOrder: t.equipment?.zones?.sort_order ?? 0,
    steps: [...(t.ssops?.ssop_steps ?? [])]
      .sort((a, b) => a.step_no - b.step_no)
      .map((s) => ({
        id: s.id,
        stepNo: s.step_no,
        type: s.step_type,
        title: s.title_en,
        instructions: s.instructions_en,
        icon: s.icon,
        chemicalName: s.chemicals?.name ?? null,
        dilution: s.dilution,
        dwellMinutes: s.dwell_minutes,
        photoRequired: s.photo_required,
        atpRequired: s.atp_required,
        atpPassMax: s.atp_pass_max,
      })),
  }));
  tasks.sort((a, b) => a.zoneOrder - b.zoneOrder || a.equipmentName.localeCompare(b.equipmentName));

  const records: RecordSummary[] = [];
  if (tasks.length) {
    const { data: recs } = await supabase
      .from("step_records")
      .select("client_record_id, task_id, ssop_step_id, result, atp_value")
      .in(
        "task_id",
        tasks.map((t) => t.id),
      );
    for (const r of recs ?? []) {
      records.push({
        clientRecordId: r.client_record_id,
        taskId: r.task_id,
        stepId: r.ssop_step_id,
        result: r.result,
        atpValue: r.atp_value,
      });
    }
  }
  return { shift: { id: shift.id, startsAt: shift.starts_at, endsAt: shift.ends_at }, tasks, records };
}

export async function verifyPin(profileId: string, pin: string): Promise<boolean> {
  const { data, error } = await createClient().rpc("verify_cleaner_pin", {
    p_profile_id: profileId,
    p_pin: pin,
  });
  if (error) throw error;
  return data === true;
}

export async function savePreferences(
  profileId: string,
  language: Locale | null,
  acceptConsent: boolean,
): Promise<void> {
  const { error } = await createClient().rpc("set_cleaner_preferences", {
    p_profile_id: profileId,
    p_language: language ?? undefined,
    p_accept_consent: acceptConsent,
  });
  if (error) throw error;
}
