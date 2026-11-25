"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSiteRole } from "@/lib/admin/context";
import { friendlyDbError, type ActionState } from "@/lib/admin/action-result";

const resolveSchema = z.object({
  exceptionId: z.uuid(),
  note: z.string().trim().min(1, "Add a note saying how it was resolved.").max(1000),
});

const recleanSchema = z.object({
  taskId: z.uuid(),
  note: z.string().trim().min(1, "Say why the re-clean is needed.").max(1000),
});

function issues(error: z.ZodError): ActionState {
  return { errors: error.issues.map((i) => i.message) };
}

export async function resolveException(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resolveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return issues(parsed.error);
  const { supabase } = await requireSiteRole(["supervisor", "qa", "site_admin"]);
  const { error } = await supabase.rpc("resolve_exception", {
    p_exception_id: parsed.data.exceptionId,
    p_note: parsed.data.note,
  });
  if (error) return { errors: [friendlyDbError(error)] };
  revalidatePath("/app/supervisor", "layout");
  return { ok: true, message: "Resolved." };
}

export async function requestReclean(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = recleanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return issues(parsed.error);
  const { supabase } = await requireSiteRole(["supervisor", "site_admin"]);
  const { error } = await supabase.rpc("request_reclean", {
    p_task_id: parsed.data.taskId,
    p_note: parsed.data.note,
  });
  if (error) return { errors: [friendlyDbError(error)] };
  revalidatePath("/app/supervisor", "layout");
  return { ok: true, message: "Re-clean requested. It's now on the cleaner's list." };
}

// ---------------------------------------------------------------------------
// Pre-op inspection and QA release (SPEC F6)
// ---------------------------------------------------------------------------
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const preopItemSchema = z.object({
  label: z.string().trim().min(1).max(200),
  pass: z.enum(["pass", "fail"], { error: "Mark every item pass or fail." }),
  note: z.string().trim().max(500).optional().default(""),
});

const preopSchema = z.object({
  zoneId: z.uuid(),
  shiftId: z.uuid(),
  items: z.array(preopItemSchema).min(1, "There are no checklist items to inspect."),
  recleanTaskIds: z.array(z.uuid()),
});

export async function submitPreop(_: ActionState, formData: FormData): Promise<ActionState> {
  const count = Number(formData.get("count") ?? 0);
  const raw = {
    zoneId: formData.get("zoneId"),
    shiftId: formData.get("shiftId"),
    items: Array.from({ length: Math.min(count, 100) }, (_, i) => ({
      label: formData.get(`item_${i}_label`),
      pass: formData.get(`item_${i}_result`) ?? undefined,
      note: formData.get(`item_${i}_note`) ?? "",
    })),
    recleanTaskIds: formData.getAll("reclean"),
  };
  const parsed = preopSchema.safeParse(raw);
  if (!parsed.success) return { errors: [...new Set(parsed.error.issues.map((i) => i.message))] };
  const { zoneId, shiftId, items, recleanTaskIds } = parsed.data;

  const failed = items.filter((i) => i.pass === "fail");
  if (failed.some((i) => !i.note)) return { errors: ["Add a note for each failed item."] };

  const { supabase, site, profileId } = await requireSiteRole(["qa", "supervisor"]);

  // Photos of failures go to the private bucket under the site's folder.
  const stored: { label: string; pass: boolean; note: string | null; photo_path: string | null }[] = [];
  for (const [i, item] of items.entries()) {
    let photoPath: string | null = null;
    const file = formData.get(`item_${i}_photo`);
    if (item.pass === "fail" && file instanceof File && file.size > 0) {
      if (!PHOTO_TYPES.includes(file.type) || file.size > MAX_PHOTO_BYTES)
        return { errors: [`Photo for "${item.label}" must be a JPEG, PNG or WebP under 5 MB.`] };
      photoPath = `${site.id}/preop/${shiftId}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
      const { error } = await supabase.storage
        .from("photos")
        .upload(photoPath, file, { contentType: file.type });
      if (error) return { errors: [`Photo upload failed: ${error.message}`] };
    }
    stored.push({
      label: item.label,
      pass: item.pass === "pass",
      note: item.note || null,
      photo_path: photoPath,
    });
  }

  const { error } = await supabase.from("preop_inspections").insert({
    site_id: site.id,
    zone_id: zoneId,
    shift_id: shiftId,
    inspector_profile_id: profileId,
    result: failed.length ? "fail" : "pass",
    items: stored,
  });
  if (error) return { errors: [friendlyDbError(error)] };

  if (failed.length && recleanTaskIds.length) {
    const reason = `Pre-op fail: ${failed.map((f) => f.label).join("; ")}`;
    for (const taskId of recleanTaskIds) {
      const { error: rcError } = await supabase.rpc("request_reclean", { p_task_id: taskId, p_note: reason });
      if (rcError)
        return { errors: [`Inspection saved, but a re-clean failed: ${friendlyDbError(rcError)}`] };
    }
  }
  revalidatePath("/app/supervisor", "layout");
  redirect(`/app/supervisor/zones/${zoneId}`);
}

const releaseSchema = z
  .object({
    zoneId: z.uuid(),
    shiftId: z.uuid(),
    decision: z.enum(["released", "held"], { error: "Choose Release or Hold." }),
    reason: z.string().trim().max(1000).optional().default(""),
    override: z.literal("on").optional(),
  })
  .refine((d) => d.decision === "released" || d.reason, { message: "Say why the zone is held." })
  .refine((d) => !d.override || d.reason, { message: "An override needs a reason." });

export async function decideRelease(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = releaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const { zoneId, shiftId, decision, reason, override } = parsed.data;
  const { supabase, site, profileId } = await requireSiteRole(["qa"]);
  const { error } = await supabase.from("releases").insert({
    site_id: site.id,
    zone_id: zoneId,
    shift_id: shiftId,
    qa_profile_id: profileId,
    decision,
    reason: reason || null,
    override_open_exceptions: decision === "released" && !!override,
  });
  if (error) {
    if (error.message.includes("blocked while red exceptions"))
      return {
        errors: [
          "Release is blocked while red exceptions are open. Resolve them, or override with a reason.",
        ],
      };
    return { errors: [friendlyDbError(error)] };
  }
  revalidatePath("/app/supervisor", "layout");
  return { ok: true, message: decision === "released" ? "Zone released." : "Zone held." };
}

// ---------------------------------------------------------------------------
// Translation review (SPEC F5/F8)
// ---------------------------------------------------------------------------
const reviewSchema = z.object({
  recordId: z.uuid(),
  text: z.string().trim().min(1, "The English can't be empty.").max(2000),
});

export async function reviewTranslation(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const { supabase, site, profileId } = await requireSiteRole(["supervisor", "qa"]);
  const { error } = await supabase.from("note_translations").insert({
    step_record_id: parsed.data.recordId,
    site_id: site.id,
    text_en: parsed.data.text,
    source: "human",
    created_by: profileId,
  });
  if (error) return { errors: [friendlyDbError(error)] };
  revalidatePath("/app/supervisor", "layout");
  return { ok: true, message: "Saved as supervisor-confirmed." };
}
