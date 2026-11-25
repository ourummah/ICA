import "server-only";

import type { AdminContext } from "@/lib/admin/context";

import type { AuditPack, PackFilter, PackPhoto, PackRecord, PackTask } from "./types";

type Supabase = AdminContext["supabase"];

const CHUNK = 150;
/** Thumbnails embedded in one PDF, to keep generation well under SPEC F7's 15 s. */
export const MAX_PDF_PHOTOS = 200;

async function inChunks<T>(ids: string[], load: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await load(ids.slice(i, i + CHUNK))));
  return out;
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

/**
 * Everything an audit pack shows for a site, date range (shift dates) and zones, read with the
 * caller's own client so RLS applies. Photos are only downloaded when `withPhotos` is set.
 */
export async function loadAuditPack(
  ctx: Pick<AdminContext, "supabase" | "site" | "displayName">,
  filter: PackFilter,
  opts: { withPhotos: boolean },
): Promise<AuditPack> {
  const { supabase, site } = ctx;

  const zones = must(
    await supabase.from("zones").select("id, name, sort_order").eq("site_id", site.id).order("sort_order"),
    "zones",
  ).map((z) => ({ id: z.id, name: z.name, sortOrder: z.sort_order }));
  const zoneSet = new Set(filter.zoneIds ?? zones.map((z) => z.id));
  const shownZones = zones.filter((z) => zoneSet.has(z.id));

  const shifts = must(
    await supabase
      .from("shifts")
      .select("id, shift_date, starts_at, ends_at")
      .eq("site_id", site.id)
      .gte("shift_date", filter.from)
      .lte("shift_date", filter.to)
      .order("starts_at"),
    "shifts",
  ).map((s) => ({ id: s.id, shiftDate: s.shift_date, startsAt: s.starts_at, endsAt: s.ends_at }));
  const shiftIds = shifts.map((s) => s.id);
  const shiftDate = new Map(shifts.map((s) => [s.id, s.shiftDate]));

  const taskRows = await inChunks(shiftIds, async (chunk) =>
    must(
      await supabase
        .from("tasks")
        .select(
          `id, shift_id, status, reclean_of_task_id, created_at,
           equipment(name, zone_id), profiles!tasks_assigned_profile_id_fkey(display_name),
           ssops(version, ssop_steps(id, step_no, title_en, atp_pass_max))`,
        )
        .in("shift_id", chunk)
        .order("created_at"),
      "tasks",
    ),
  );
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const tasks: PackTask[] = taskRows
    .filter((t) => t.equipment && zoneSet.has(t.equipment.zone_id))
    .map((t) => {
      const zone = zoneById.get(t.equipment!.zone_id);
      return {
        id: t.id,
        shiftId: t.shift_id,
        shiftDate: shiftDate.get(t.shift_id) ?? "",
        zoneId: t.equipment!.zone_id,
        zoneName: zone?.name ?? "",
        zoneOrder: zone?.sortOrder ?? 0,
        equipmentName: t.equipment!.name,
        ssopVersion: t.ssops?.version ?? null,
        stepCount: t.ssops?.ssop_steps.length ?? 0,
        status: t.status,
        assignedName: t.profiles?.display_name ?? null,
        recleanOfTaskId: t.reclean_of_task_id,
        records: [],
      };
    })
    .sort(
      (a, b) =>
        a.shiftDate.localeCompare(b.shiftDate) ||
        a.zoneOrder - b.zoneOrder ||
        a.equipmentName.localeCompare(b.equipmentName) ||
        Number(!!a.recleanOfTaskId) - Number(!!b.recleanOfTaskId),
    );
  const taskIds = tasks.map((t) => t.id);
  const stepsByTask = new Map(
    taskRows.map((t) => [t.id, new Map((t.ssops?.ssop_steps ?? []).map((s) => [s.id, s]))]),
  );

  const recordRows = await inChunks(taskIds, async (chunk) =>
    must(
      await supabase
        .from("step_records")
        .select(
          `id, task_id, ssop_step_id, result, skip_reason, note_original, note_language, atp_value,
           timer_started_at, timer_ended_at, device_completed_at, server_received_at, payload_hash,
           chain_hash, supersedes_id, profiles(display_name), photos(storage_path, sha256),
           note_translations(text_en, source, created_at)`,
        )
        .in("task_id", chunk)
        .order("server_received_at"),
      "step records",
    ),
  );
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  for (const r of recordRows) {
    const task = taskById.get(r.task_id);
    if (!task) continue;
    const step = stepsByTask.get(r.task_id)?.get(r.ssop_step_id);
    const latest = [...r.note_translations].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const rec: PackRecord = {
      id: r.id,
      stepNo: step?.step_no ?? 0,
      stepTitle: step?.title_en ?? "",
      result: r.result,
      skipReason: r.skip_reason,
      cleaner: r.profiles?.display_name ?? "",
      deviceCompletedAt: r.device_completed_at,
      serverReceivedAt: r.server_received_at,
      atpValue: r.atp_value,
      atpLimit: step?.atp_pass_max ?? null,
      timerSeconds:
        r.timer_started_at && r.timer_ended_at
          ? Math.max(0, Math.round((Date.parse(r.timer_ended_at) - Date.parse(r.timer_started_at)) / 1000))
          : null,
      noteOriginal: r.note_original,
      noteLanguage: r.note_language,
      noteEn: latest?.text_en ?? null,
      noteEnSource: latest?.source ?? null,
      photos: r.photos.map((p) => ({ path: p.storage_path, sha256: p.sha256 })),
      payloadHash: r.payload_hash,
      chainHash: r.chain_hash,
      supersedesId: r.supersedes_id,
    };
    task.records.push(rec);
  }
  for (const t of tasks)
    t.records.sort((a, b) => a.stepNo - b.stepNo || a.serverReceivedAt.localeCompare(b.serverReceivedAt));

  const exceptions = (
    await inChunks(taskIds, async (chunk) =>
      must(
        await supabase
          .from("exceptions")
          .select(
            "id, task_id, step_record_id, type, severity, status, detail, created_at, resolution_note, resolved_at, profiles!exceptions_resolved_by_fkey(display_name)",
          )
          .in("task_id", chunk)
          .order("created_at"),
        "exceptions",
      ),
    )
  ).map((e) => ({
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
    resolvedBy: e.profiles?.display_name ?? null,
  }));

  const preops = (
    await inChunks(shiftIds, async (chunk) =>
      must(
        await supabase
          .from("preop_inspections")
          .select("zone_id, shift_id, result, completed_at, items, profiles(display_name)")
          .in("shift_id", chunk)
          .order("completed_at"),
        "pre-op inspections",
      ),
    )
  )
    .filter((p) => zoneSet.has(p.zone_id))
    .map((p) => ({
      zoneId: p.zone_id,
      shiftId: p.shift_id,
      result: p.result,
      completedAt: p.completed_at,
      inspector: p.profiles?.display_name ?? "",
      items: Array.isArray(p.items) ? (p.items as AuditPack["preops"][number]["items"]) : [],
    }));

  const releases = (
    await inChunks(shiftIds, async (chunk) =>
      must(
        await supabase
          .from("releases")
          .select(
            "zone_id, shift_id, decision, reason, override_open_exceptions, decided_at, profiles(display_name)",
          )
          .in("shift_id", chunk)
          .order("decided_at"),
        "releases",
      ),
    )
  )
    .filter((r) => zoneSet.has(r.zone_id))
    .map((r) => ({
      zoneId: r.zone_id,
      shiftId: r.shift_id,
      decision: r.decision,
      reason: r.reason,
      override: r.override_open_exceptions,
      decidedAt: r.decided_at,
      by: r.profiles?.display_name ?? "",
    }));

  const [chainRow] = must(await supabase.rpc("verify_chain", { p_site_id: site.id }), "chain verification");
  const chain = {
    records: Number(chainRow?.records ?? 0),
    breaks: Number(chainRow?.breaks ?? 0),
    firstBreakSeq:
      chainRow?.first_break_seq === null || chainRow?.first_break_seq === undefined
        ? null
        : Number(chainRow.first_break_seq),
    verified: !!chainRow?.verified,
  };

  if (opts.withPhotos)
    await loadThumbnails(
      supabase,
      tasks.flatMap((t) => t.records.flatMap((r) => r.photos)),
    );

  return {
    site: { id: site.id, name: site.name, timezone: site.timezone },
    filter,
    zoneNames: shownZones.map((z) => z.name),
    generatedAt: new Date().toISOString(),
    generatedBy: ctx.displayName,
    shifts,
    zones: shownZones,
    tasks,
    exceptions,
    preops,
    releases,
    chain,
  };
}

async function loadThumbnails(supabase: Supabase, photos: PackPhoto[]) {
  const wanted = photos.slice(0, MAX_PDF_PHOTOS);
  // A few downloads at a time from the private bucket.
  for (let i = 0; i < wanted.length; i += 8) {
    await Promise.all(
      wanted.slice(i, i + 8).map(async (p) => {
        const { data } = await supabase.storage.from("photos").download(p.path);
        if (!data) return;
        const format = data.type === "image/png" ? "png" : data.type === "image/jpeg" ? "jpg" : null;
        if (!format) return; // the PDF library can't draw WebP; the hash is still listed
        p.data = Buffer.from(await data.arrayBuffer());
        p.format = format;
      }),
    );
  }
}
