import type { Locale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { getDb, kvGet, kvSet, KV, type CachedCleaner } from "@/offline/db";
import { checkPinOffline, isPinCacheFresh } from "@/offline/pin";

import type { CleanerData, RecordSummary, Task } from "./types";

/** Gives up on a slow network after `ms` so the cached copy is used (weak signal in steel rooms). */
function withTimeout<T>(promise: PromiseLike<T>, ms = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** What the device already has, for an instant first render with or without signal. */
export async function cachedCleanerState(): Promise<{
  cleaners: CachedCleaner[] | null;
  data: CleanerData | null;
}> {
  const db = getDb();
  const [cleaners, data] = await Promise.all([
    kvGet<CachedCleaner[]>(db, KV.cleaners),
    kvGet<CleanerData>(db, KV.cleanerData),
  ]);
  return { cleaners: cleaners?.value ?? null, data: data?.value ?? null };
}

/**
 * Cleaners for the sign-in screen, with PIN hashes for offline sign-in. Online, fetches and caches
 * them; offline (or on error), returns the cached copy.
 */
export async function loadCleaners(): Promise<CachedCleaner[]> {
  const db = getDb();
  try {
    const supabase = createClient();
    const [{ data, error }, { data: hashes, error: hashErr }] = await withTimeout(
      Promise.all([supabase.rpc("device_cleaners"), supabase.rpc("device_cleaner_pin_hashes")]),
    );
    if (error || hashErr) throw error ?? hashErr;
    const byId = new Map((hashes ?? []).map((h) => [h.profile_id, h.pin_hash]));
    const cleaners: CachedCleaner[] = (data ?? []).map((c) => ({
      profileId: c.profile_id,
      displayName: c.display_name,
      language: c.preferred_language as Locale,
      hasConsented: c.has_consented,
      pinHash: byId.get(c.profile_id) ?? null,
    }));
    await kvSet(db, KV.cleaners, cleaners);
    return cleaners;
  } catch (e) {
    const cached = await kvGet<CachedCleaner[]>(db, KV.cleaners);
    if (cached) return cached.value;
    throw e;
  }
}

/**
 * Checks a PIN. Uses the cached hash when it was synced within the last day (works with no
 * signal), otherwise asks the server.
 */
export async function verifyPin(profileId: string, pin: string): Promise<boolean> {
  const cached = await kvGet<CachedCleaner[]>(getDb(), KV.cleaners);
  const hash = cached?.value.find((c) => c.profileId === profileId)?.pinHash;
  if (hash && cached && isPinCacheFresh(cached.updatedAt)) return checkPinOffline(pin, hash);
  const { data, error } = await createClient().rpc("verify_cleaner_pin", {
    p_profile_id: profileId,
    p_pin: pin,
  });
  if (error) throw error;
  return data === true;
}

async function fetchCleanerData(siteId: string): Promise<CleanerData> {
  const supabase = createClient();
  const { data: shift, error: shiftErr } = await supabase
    .from("shifts")
    .select("id, starts_at, ends_at")
    .eq("site_id", siteId)
    .gt("ends_at", new Date().toISOString())
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  if (shiftErr) throw shiftErr;
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
    const { data: recs, error: recErr } = await supabase
      .from("step_records")
      .select("client_record_id, task_id, ssop_step_id, result, atp_value")
      .in(
        "task_id",
        tasks.map((t) => t.id),
      );
    if (recErr) throw recErr;
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

/** Tonight's tasks and SSOPs: from the server when online (and cached), from the device when not. */
export async function loadCleanerData(siteId: string): Promise<{ data: CleanerData; fromCache: boolean }> {
  const db = getDb();
  try {
    const data = await withTimeout(fetchCleanerData(siteId), 10_000);
    await kvSet(db, KV.cleanerData, data);
    return { data, fromCache: false };
  } catch (e) {
    const cached = await kvGet<CleanerData>(db, KV.cleanerData);
    if (cached) return { data: cached.value, fromCache: true };
    throw e;
  }
}

/** Saves language/consent; queued silently if offline (the local copy already has it). */
export async function savePreferences(
  profileId: string,
  language: Locale | null,
  acceptConsent: boolean,
): Promise<void> {
  const db = getDb();
  // Read-modify-write inside one transaction so a language change and a consent can't race.
  await db.transaction("rw", db.kv, async () => {
    const cached = await kvGet<CachedCleaner[]>(db, KV.cleaners);
    if (!cached) return;
    await db.kv.put({
      key: KV.cleaners,
      updatedAt: cached.updatedAt,
      value: cached.value.map((c) =>
        c.profileId === profileId
          ? { ...c, language: language ?? c.language, hasConsented: c.hasConsented || acceptConsent }
          : c,
      ),
    });
  });
  const { error } = await createClient().rpc("set_cleaner_preferences", {
    p_profile_id: profileId,
    p_language: language ?? undefined,
    p_accept_consent: acceptConsent,
  });
  if (error) throw error;
}
