"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { friendlyDbError, type ActionState } from "@/lib/admin/action-result";
import { requireSiteAdmin, siteToday } from "@/lib/admin/context";
import {
  assignTaskSchema,
  chemicalSchema,
  cleanerSchema,
  deviceLabelSchema,
  equipmentSchema,
  idSchema,
  pinSchema,
  staffSchema,
  zoneSchema,
} from "@/lib/admin/schemas";
import { parseSsopCsv } from "@/lib/ssop/csv";
import { ssopStepSchema } from "@/lib/ssop/step-schema";
import { STEP_TYPES } from "@/lib/ssop/step-types";
import { createAdminClient } from "@/lib/supabase/admin";

const fields = (fd: FormData) => Object.fromEntries(fd.entries());
const issues = (e: { issues: { message: string }[] }): ActionState => ({
  errors: e.issues.map((i) => i.message),
});

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------
export async function saveZone(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, site } = await requireSiteAdmin();
  const parsed = zoneSchema.safeParse(fields(fd));
  if (!parsed.success) return issues(parsed.error);
  const zoneId = fd.get("id");
  const { error } = zoneId
    ? await supabase.from("zones").update(parsed.data).eq("id", idSchema.parse(zoneId))
    : await supabase.from("zones").insert({ ...parsed.data, site_id: site.id });
  if (error) return { errors: [friendlyDbError(error)] };
  revalidatePath("/app/admin", "layout");
  return { ok: true, message: zoneId ? "Zone saved." : "Zone added." };
}

export async function deleteZone(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireSiteAdmin();
  const { error } = await supabase
    .from("zones")
    .delete()
    .eq("id", idSchema.parse(fd.get("id")));
  if (error) return { errors: [friendlyDbError(error)] };
  revalidatePath("/app/admin", "layout");
  return { ok: true, message: "Zone deleted." };
}

// ---------------------------------------------------------------------------
// Chemicals
// ---------------------------------------------------------------------------
export async function saveChemical(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, site } = await requireSiteAdmin();
  const parsed = chemicalSchema.safeParse(fields(fd));
  if (!parsed.success) return issues(parsed.error);
  const chemicalId = fd.get("id");
  const { error } = chemicalId
    ? await supabase.from("chemicals").update(parsed.data).eq("id", idSchema.parse(chemicalId))
    : await supabase.from("chemicals").insert({ ...parsed.data, site_id: site.id });
  if (error) return { errors: [friendlyDbError(error)] };
  revalidatePath("/app/admin", "layout");
  return { ok: true, message: chemicalId ? "Chemical saved." : "Chemical added." };
}

export async function deleteChemical(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireSiteAdmin();
  const { error } = await supabase
    .from("chemicals")
    .delete()
    .eq("id", idSchema.parse(fd.get("id")));
  if (error) return { errors: [friendlyDbError(error)] };
  revalidatePath("/app/admin", "layout");
  return { ok: true, message: "Chemical deleted." };
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------
export async function saveEquipment(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, site } = await requireSiteAdmin();
  const parsed = equipmentSchema.safeParse(fields(fd));
  if (!parsed.success) return issues(parsed.error);
  const equipmentId = fd.get("id");
  if (equipmentId) {
    const { error } = await supabase
      .from("equipment")
      .update(parsed.data)
      .eq("id", idSchema.parse(equipmentId));
    if (error) return { errors: [friendlyDbError(error)] };
    revalidatePath("/app/admin", "layout");
    return { ok: true, message: "Equipment saved." };
  }
  const { data, error } = await supabase
    .from("equipment")
    .insert({ ...parsed.data, site_id: site.id })
    .select("id")
    .single();
  if (error || !data) return { errors: [friendlyDbError(error)] };
  revalidatePath("/app/admin", "layout");
  redirect(`/app/admin/equipment/${data.id}`);
}

// ---------------------------------------------------------------------------
// SSOP builder
// ---------------------------------------------------------------------------
function revalidateEquipment(equipmentId: string) {
  revalidatePath(`/app/admin/equipment/${equipmentId}`);
  revalidatePath("/app/admin", "layout");
}

export async function createDraft(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireSiteAdmin();
  const equipmentId = idSchema.parse(fd.get("equipment_id"));
  const { error } = await supabase.rpc("create_ssop_draft", { p_equipment_id: equipmentId });
  if (error) return { errors: [friendlyDbError(error)] };
  revalidateEquipment(equipmentId);
  return { ok: true, message: "Draft created." };
}

export async function saveStep(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, site } = await requireSiteAdmin();
  const equipmentId = idSchema.parse(fd.get("equipment_id"));
  const ssopId = idSchema.parse(fd.get("ssop_id"));
  const parsed = ssopStepSchema.safeParse(fields(fd));
  if (!parsed.success) return issues(parsed.error);
  const row = { ...parsed.data, icon: STEP_TYPES[parsed.data.step_type].icon };

  const stepId = fd.get("id");
  if (stepId) {
    const { error } = await supabase.from("ssop_steps").update(row).eq("id", idSchema.parse(stepId));
    if (error) return { errors: [friendlyDbError(error)] };
  } else {
    const { count } = await supabase
      .from("ssop_steps")
      .select("id", { count: "exact", head: true })
      .eq("ssop_id", ssopId);
    const { error } = await supabase
      .from("ssop_steps")
      .insert({ ...row, ssop_id: ssopId, site_id: site.id, step_no: (count ?? 0) + 1 });
    if (error) return { errors: [friendlyDbError(error)] };
  }
  revalidateEquipment(equipmentId);
  return { ok: true, message: stepId ? "Step saved." : "Step added." };
}

export async function moveStep(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireSiteAdmin();
  const equipmentId = idSchema.parse(fd.get("equipment_id"));
  const direction = fd.get("direction") === "up" ? -1 : 1;
  const { error } = await supabase.rpc("move_ssop_step", {
    p_step_id: idSchema.parse(fd.get("id")),
    p_direction: direction,
  });
  if (error) return { errors: [friendlyDbError(error)] };
  revalidateEquipment(equipmentId);
  return { ok: true };
}

export async function deleteStep(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireSiteAdmin();
  const equipmentId = idSchema.parse(fd.get("equipment_id"));
  const { error } = await supabase.rpc("delete_ssop_step", { p_step_id: idSchema.parse(fd.get("id")) });
  if (error) return { errors: [friendlyDbError(error)] };
  revalidateEquipment(equipmentId);
  return { ok: true, message: "Step deleted." };
}

export async function importStepsCsv(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, site } = await requireSiteAdmin();
  const equipmentId = idSchema.parse(fd.get("equipment_id"));
  const ssopId = idSchema.parse(fd.get("ssop_id"));
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { errors: ["Choose a CSV file to import."] };
  if (file.size > 200_000) return { errors: ["That file is too large for an SSOP (max 200 KB)."] };

  const { data: chemicals } = await supabase.from("chemicals").select("id, name").eq("site_id", site.id);
  const { steps, errors } = parseSsopCsv(await file.text(), chemicals ?? []);
  if (errors.length) return { errors };

  const { error } = await supabase.rpc("replace_ssop_steps", { p_ssop_id: ssopId, p_steps: steps });
  if (error) return { errors: [friendlyDbError(error)] };
  revalidateEquipment(equipmentId);
  return { ok: true, message: `Imported ${steps.length} steps. Check them, then activate.` };
}

export async function activateDraft(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireSiteAdmin();
  const equipmentId = idSchema.parse(fd.get("equipment_id"));
  const { error } = await supabase.rpc("activate_ssop", { p_ssop_id: idSchema.parse(fd.get("ssop_id")) });
  if (error) return { errors: [friendlyDbError(error)] };
  revalidateEquipment(equipmentId);
  return { ok: true, message: "SSOP activated. Earlier version retired and kept in history." };
}

// ---------------------------------------------------------------------------
// People (service role, after the site-admin check above)
// ---------------------------------------------------------------------------
export async function addCleaner(_: ActionState, fd: FormData): Promise<ActionState> {
  const { site } = await requireSiteAdmin();
  const parsed = cleanerSchema.safeParse(fields(fd));
  if (!parsed.success) return issues(parsed.error);
  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .insert({ display_name: parsed.data.display_name, preferred_language: parsed.data.preferred_language })
    .select("id")
    .single();
  if (error || !profile) return { errors: [friendlyDbError(error)] };
  const m = await admin
    .from("memberships")
    .insert({ profile_id: profile.id, org_id: site.orgId, site_id: site.id, role: "cleaner" });
  if (m.error) return { errors: [friendlyDbError(m.error)] };
  const pin = await admin.rpc("set_cleaner_pin", { p_profile_id: profile.id, p_pin: parsed.data.pin });
  if (pin.error) return { errors: [friendlyDbError(pin.error)] };
  revalidatePath("/app/admin/people");
  return { ok: true, message: `${parsed.data.display_name} added.` };
}

/** True if the profile is a cleaner at the admin's site (guards service-role writes). */
async function isCleanerAtSite(profileId: string, siteId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("memberships")
    .select("id")
    .eq("profile_id", profileId)
    .eq("site_id", siteId)
    .eq("role", "cleaner")
    .limit(1);
  return !!data?.length;
}

export async function setPin(_: ActionState, fd: FormData): Promise<ActionState> {
  const { site } = await requireSiteAdmin();
  const profileId = idSchema.parse(fd.get("profile_id"));
  const pin = pinSchema.safeParse(fd.get("pin"));
  if (!pin.success) return issues(pin.error);
  if (!(await isCleanerAtSite(profileId, site.id))) return { errors: ["That cleaner isn't at your site."] };
  const { error } = await createAdminClient().rpc("set_cleaner_pin", {
    p_profile_id: profileId,
    p_pin: pin.data,
  });
  if (error) return { errors: [friendlyDbError(error)] };
  return { ok: true, message: "PIN updated." };
}

export async function removeCleaner(_: ActionState, fd: FormData): Promise<ActionState> {
  const { site } = await requireSiteAdmin();
  const profileId = idSchema.parse(fd.get("profile_id"));
  // Records keep pointing at the profile; only the site membership is removed.
  const { error } = await createAdminClient()
    .from("memberships")
    .delete()
    .eq("profile_id", profileId)
    .eq("site_id", site.id)
    .eq("role", "cleaner");
  if (error) return { errors: [friendlyDbError(error)] };
  revalidatePath("/app/admin/people");
  return { ok: true, message: "Cleaner removed from this site. Their records are kept." };
}

export async function addStaff(_: ActionState, fd: FormData): Promise<ActionState> {
  const { site } = await requireSiteAdmin();
  const parsed = staffSchema.safeParse(fields(fd));
  if (!parsed.success) return issues(parsed.error);
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    return {
      errors: [
        /already/i.test(error?.message ?? "")
          ? "Someone with that email already exists."
          : friendlyDbError(error),
      ],
    };
  }
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .insert({ auth_user_id: data.user.id, display_name: parsed.data.display_name })
    .select("id")
    .single();
  if (pErr || !profile) return { errors: [friendlyDbError(pErr)] };
  const m = await admin
    .from("memberships")
    .insert({ profile_id: profile.id, org_id: site.orgId, site_id: site.id, role: parsed.data.role });
  if (m.error) return { errors: [friendlyDbError(m.error)] };
  revalidatePath("/app/admin/people");
  return { ok: true, message: `${parsed.data.display_name} can now sign in with ${parsed.data.email}.` };
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------
export async function renameDevice(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireSiteAdmin();
  const parsed = deviceLabelSchema.safeParse(fields(fd));
  if (!parsed.success) return issues(parsed.error);
  const { error } = await supabase
    .from("devices")
    .update(parsed.data)
    .eq("id", idSchema.parse(fd.get("id")));
  if (error) return { errors: [friendlyDbError(error)] };
  revalidatePath("/app/admin/devices");
  return { ok: true, message: "Device renamed." };
}

export async function revokeDevice(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireSiteAdmin();
  const { error } = await supabase
    .from("devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", idSchema.parse(fd.get("id")));
  if (error) return { errors: [friendlyDbError(error)] };
  revalidatePath("/app/admin/devices");
  return { ok: true, message: "Device revoked. It can no longer sync." };
}

// ---------------------------------------------------------------------------
// Tonight's tasks
// ---------------------------------------------------------------------------
export async function assignTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, site } = await requireSiteAdmin();
  const parsed = assignTaskSchema.safeParse(fields(fd));
  if (!parsed.success) return issues(parsed.error);

  const { data: ssop } = await supabase
    .from("ssops")
    .select("id")
    .eq("equipment_id", parsed.data.equipment_id)
    .eq("status", "active")
    .maybeSingle();
  if (!ssop) return { errors: ["Activate an SSOP for this equipment before assigning it."] };

  const { data: shiftId, error: shiftErr } = await supabase.rpc("ensure_shift", {
    p_site_id: site.id,
    p_shift_date: siteToday(site.timezone),
  });
  if (shiftErr || !shiftId) return { errors: [friendlyDbError(shiftErr)] };

  const { data: existing } = await supabase
    .from("tasks")
    .select("id, status")
    .eq("shift_id", shiftId)
    .eq("equipment_id", parsed.data.equipment_id)
    .neq("status", "reclean_required")
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("tasks")
        .update({ assigned_profile_id: parsed.data.assigned_profile_id })
        .eq("id", existing.id)
    : await supabase.from("tasks").insert({
        site_id: site.id,
        shift_id: shiftId,
        equipment_id: parsed.data.equipment_id,
        ssop_id: ssop.id,
        assigned_profile_id: parsed.data.assigned_profile_id,
      });
  if (error) return { errors: [friendlyDbError(error)] };
  revalidatePath("/app/admin/tasks");
  return { ok: true, message: existing ? "Assignment updated." : "Added to tonight's shift." };
}
